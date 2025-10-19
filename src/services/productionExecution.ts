import {
  IngredientAvailability,
  ProductionDivergence,
  ProductionDivergenceSeverity,
  ProductionPlan,
  ProductionPlanAvailabilityRecord,
  StockMovement,
} from '@/domain';
import { createNotification } from '@/services/firestore/notificationsService';
import {
  findProductionPlanAvailabilityRecordByPlanId,
  updateProductionPlanAvailabilityRecord,
} from '@/services/firestore/productionAvailabilityService';
import { createProductionDivergence } from '@/services/firestore/productionDivergencesService';
import {
  getProductionPlanById,
  updateProductionPlan,
} from '@/services/firestore/productionService';
import {
  listProductionStages,
  updateProductionStage,
} from '@/services/firestore/productionStagesService';
import { listProducts } from '@/services/firestore/productsService';
import { getRecipeById } from '@/services/firestore/recipesService';
import { adjustStockLevel, listStockItems } from '@/services/firestore/stockService';
import {
  resolveProductRequirements,
  type ProductRequirementMap,
} from '@/services/productionRequirements';
import { logError } from '@/utils/logger';

function formatGrams(value: number | null | undefined) {
  if (value === null || value === undefined) return '0 g';
  const formatted = Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} g`;
}

function resolveSeverity(
  missing: number,
  required: number,
): ProductionDivergenceSeverity {
  if (required <= 0) {
    return 'low';
  }

  const ratio = missing / required;

  if (ratio >= 0.5) {
    return 'high';
  }

  if (ratio >= 0.2) {
    return 'medium';
  }

  return 'low';
}

export async function startProductionPlanExecution(
  planId: string,
): Promise<ProductionPlan> {
  const now = new Date();
  const plan = await updateProductionPlan(planId, {
    status: 'in_progress',
    startedAt: now,
  });

  try {
    await createNotification({
      title: `Produção iniciada: ${plan.recipeName}`,
      message: `O plano agendado para ${plan.scheduledFor.toLocaleDateString('pt-BR')} entrou em execução.`,
      category: 'production',
      type: 'production_started',
      referenceId: plan.id,
    });
  } catch (notificationError) {
    logError(notificationError, 'production.execution.startNotification');
  }

  try {
    const availabilityRecord = await findProductionPlanAvailabilityRecordByPlanId(planId);

    if (availabilityRecord && !availabilityRecord.executionStartedAt) {
      await updateProductionPlanAvailabilityRecord(availabilityRecord.id, {
        executionStartedAt: now,
      });
    }
  } catch (availabilityError) {
    logError(availabilityError, 'production.execution.markAvailabilityStart');
  }

  return plan;
}

export async function completeProductionPlanWithConsumption(options: {
  planId: string;
  performedBy: string;
}): Promise<{
  plan: ProductionPlan;
  adjustments: StockMovement[];
  divergences: ProductionDivergence[];
}> {
  const { planId, performedBy } = options;

  console.log('═'.repeat(80));
  console.log('🏭 [PRODUÇÃO] INICIANDO CONCLUSÃO');
  console.log(`📋 Plano: ${planId}`);
  console.log(`👤 Usuário: ${performedBy}`);
  console.log('═'.repeat(80));

  const plan = await getProductionPlanById(planId);
  // Idempotency guard: if the plan is already completed, bail out to avoid
  // duplicate stock movements and divergences when the completion flow is
  // triggered multiple times due to client retries or race conditions.
  if (plan.status === 'completed') {
    console.warn(
      `Production ${planId} is already completed — skipping duplicate completion.`,
    );
    return { plan, adjustments: [], divergences: [] };
  }
  console.log(
    `✅ Plano: ${plan.code} - ${plan.recipeName} (${formatGrams(plan.quantityInUnits)})`,
  );

  const recipe = await getRecipeById(plan.recipeId);
  console.log(`✅ Receita: ${recipe.name} (${recipe.ingredients.length} ingredientes)`);

  const stages = await listProductionStages({ planId });

  let availabilityRecord: ProductionPlanAvailabilityRecord | null = null;

  try {
    availabilityRecord = await findProductionPlanAvailabilityRecordByPlanId(planId);
  } catch (availabilityError) {
    logError(availabilityError, 'production.complete.fetchAvailabilityRecord');
  }

  const predictedShortages = new Map<string, IngredientAvailability>();

  if (availabilityRecord?.shortages?.length) {
    for (const shortage of availabilityRecord.shortages) {
      predictedShortages.set(shortage.productId, shortage);
    }
  }

  const adjustments: StockMovement[] = [];
  const divergences: ProductionDivergence[] = [];
  const notificationTasks: Array<Promise<unknown>> = [];

  // Build product name lookup to show human-friendly names in notifications
  // and divergence descriptions. Include inactive products so names remain
  // available for legacy/archived items.
  let productNamesMap = new Map<string, string>();
  try {
    const allProducts = await listProducts({ includeInactive: true }).catch(() => []);
    productNamesMap = new Map(allProducts.map(p => [p.id, p.name]));
  } catch {
    // If product lookups fail, we'll fallback to productId later.
    productNamesMap = new Map();
  }

  let worstMissingRatio = 0;
  let totalConsumedInGrams = 0;
  let totalMissingInGrams = 0;
  let totalCostInBRL = 0;
  const now = new Date();

  console.log(`\n🔥 CONSUMINDO ESTOQUE (${recipe.ingredients.length} ingredientes)`);

  let productRequirements: ProductRequirementMap;

  try {
    productRequirements = await resolveProductRequirements({
      quantityInUnits: plan.quantityInUnits,
      unitOfMeasure: plan.unitOfMeasure,
      recipe,
    });
  } catch (error) {
    logError(error, 'production.complete.resolveRequirements');
    throw error;
  }

  if (productRequirements.size === 0) {
    console.warn(
      `⚠️  [Production] Nenhum produto requerido foi identificado para o plano ${planId}. Verifique a ficha técnica da receita ${recipe.id}.`,
    );
  }

  for (const [productId, requiredQuantity] of productRequirements.entries()) {
    const stockItems = await listStockItems({ productId });
    const stockItem = stockItems[0];

    const available = stockItem?.currentQuantityInGrams ?? 0;
    const consumed = stockItem ? Math.min(requiredQuantity, available) : 0;
    const missing = Math.max(0, requiredQuantity - consumed);

    console.log(
      `  📦 Produto: necessário ${formatGrams(requiredQuantity)} | disponível ${formatGrams(available)} | consumindo ${formatGrams(consumed)}`,
    );

    totalConsumedInGrams += consumed;
    totalMissingInGrams += missing;

    const predictedShortage = predictedShortages.get(productId);
    const shortageNote = predictedShortage
      ? ' Falta prevista e aprovada na checagem de disponibilidade.'
      : '';

    if (consumed > 0 && stockItem) {
      try {
        const adjustment = await adjustStockLevel({
          stockItemId: stockItem.id,
          quantityInGrams: consumed,
          type: 'decrement',
          performedBy,
          note: `Consumo da produção ${plan.recipeName}`,
        });
        adjustments.push(adjustment);
        if (adjustment.totalCostInBRL && Number.isFinite(adjustment.totalCostInBRL)) {
          totalCostInBRL += adjustment.totalCostInBRL;
        }
        console.log(
          `  ✅ Consumido! Novo estoque: ${formatGrams(adjustment.resultingQuantityInGrams)} | Custo: R$ ${adjustment.totalCostInBRL?.toFixed(2) || '0.00'}`,
        );
      } catch (adjustError) {
        console.error(`  ❌ ERRO ao consumir estoque:`, adjustError);
        logError(adjustError, 'production.complete.adjust');
      }
    } else if (!stockItem) {
      console.log(`  ⚠️  Item de estoque NÃO ENCONTRADO`);
    } else {
      console.log(`  ⚠️  Estoque INSUFICIENTE (${formatGrams(available)} disponível)`);
    }

    if (missing > 0 || !stockItem) {
      const missingReference = missing > 0 ? missing : requiredQuantity;
      const severity = resolveSeverity(missingReference, requiredQuantity);
      const formattedRequired = requiredQuantity.toLocaleString('pt-BR', {
        maximumFractionDigits: 2,
      });
      const formattedConsumed = consumed.toLocaleString('pt-BR', {
        maximumFractionDigits: 2,
      });
      const formattedMissing = (requiredQuantity - consumed).toLocaleString('pt-BR', {
        maximumFractionDigits: 2,
      });

      // Resolve product name via a cached map (built once per completion) to
      // avoid many Firestore reads. fallback to id if not found.
      // (productNamesMap is built below before the loop)
      const productName = productNamesMap.get(productId) ?? productId;

      const divergence = await createProductionDivergence({
        planId: plan.id,
        stageId: undefined,
        reportedBy: performedBy,
        severity,
        type: 'ingredient_shortage',
        description: stockItem
          ? `Consumo parcial do produto ${productName}. Requerido: ${formattedRequired}g, consumido: ${formattedConsumed}g, faltante: ${formattedMissing}g.${shortageNote}`
          : `Sem estoque cadastrado para o produto ${productName}. Requerido: ${formattedRequired}g.${shortageNote}`,
        expectedQuantityInUnits: requiredQuantity,
        actualQuantityInUnits: consumed,
      });
      divergences.push(divergence);

      const notificationMessageBase = stockItem
        ? `Consumo parcial do produto ${productName} na produção ${plan.recipeName}.`
        : `Sem estoque para o produto ${productName} na produção ${plan.recipeName}.`;

      const notificationMessage = predictedShortage
        ? `${notificationMessageBase} (falta prevista e aprovada na checagem de disponibilidade)`
        : notificationMessageBase;

      notificationTasks.push(
        createNotification({
          title: `Divergência de produção (${divergenceSeverityLabel(severity)})`,
          message: notificationMessage,
          category: 'production',
          type: 'production_divergence',
          referenceId: divergence.id,
        }).catch(error => logError(error, 'production.execution.divergenceNotification')),
      );

      if (requiredQuantity > 0) {
        const ratio = missing / requiredQuantity;
        worstMissingRatio = Math.max(worstMissingRatio, ratio);
      }
    }
  }

  const actualQuantity = Math.max(0, plan.quantityInUnits * (1 - worstMissingRatio));

  console.log(`\n📊 RESUMO:`);
  console.log(`  • Consumido: ${formatGrams(totalConsumedInGrams)}`);
  console.log(`  • Falta: ${formatGrams(totalMissingInGrams)}`);
  console.log(`  • Custo total: R$ ${totalCostInBRL.toFixed(2)}`);
  console.log(`  • Movimentos: ${adjustments.length}`);
  console.log(`  • Divergências: ${divergences.length}`);

  await Promise.all(
    stages.map(stage => {
      if (stage.status === 'completed') {
        return Promise.resolve(stage);
      }

      return updateProductionStage(stage.id, {
        status: 'completed',
        completedAt: now,
      });
    }),
  ).catch(error => logError(error, 'production.complete.updateStages'));

  console.log(`\n💾 SALVANDO PLANO...`);

  const completedPlan = await updateProductionPlan(planId, {
    status: 'completed',
    completedAt: now,
    actualQuantityInUnits: actualQuantity,
    actualProductionCostInBRL: totalCostInBRL || null,
    ...(plan.startedAt ? null : { startedAt: now }),
  });

  console.log(`✅ PLANO CONCLUÍDO: ${completedPlan.code}`);

  if (availabilityRecord) {
    try {
      const executionStartedAt =
        availabilityRecord.executionStartedAt ??
        plan.startedAt ??
        completedPlan.startedAt ??
        now;

      await updateProductionPlanAvailabilityRecord(availabilityRecord.id, {
        status: totalMissingInGrams > 0 ? 'reconciled' : 'fulfilled',
        executionStartedAt,
        executionCompletedAt: now,
        actualConsumedInGrams: totalConsumedInGrams,
        actualShortageInGrams: totalMissingInGrams,
        actualCostInBRL: totalCostInBRL || null,
      });
    } catch (availabilityUpdateError) {
      logError(availabilityUpdateError, 'production.execution.updateAvailabilityRecord');
    }
  }

  notificationTasks.push(
    createNotification({
      title: `Produção concluída: ${plan.recipeName}`,
      message:
        divergences.length > 0
          ? `${divergences.length} divergência(s) registrada(s). Estoque atualizado automaticamente.`
          : 'Estoque atualizado automaticamente sem divergências.',
      category: 'production',
      type: 'production_completed',
      referenceId: completedPlan.id,
    }).catch(error => logError(error, 'production.execution.completeNotification')),
  );

  await Promise.allSettled(notificationTasks);

  return {
    plan: completedPlan,
    adjustments,
    divergences,
  };
}

function divergenceSeverityLabel(severity: ProductionDivergenceSeverity) {
  switch (severity) {
    case 'high':
      return 'alta';
    case 'medium':
      return 'média';
    case 'low':
    default:
      return 'baixa';
  }
}
