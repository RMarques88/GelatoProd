import { createProductionPlanAvailabilityRecord } from '@/services/firestore/productionAvailabilityService';
import {
  createProductionPlan,
  listProductionPlans,
} from '@/services/firestore/productionService';
import { getRecipeById } from '@/services/firestore/recipesService';
import { listStockItems } from '@/services/firestore/stockService';
import { unitCostPerGram, FinancialStockItemLike } from '@/utils/financial';
import { resolveProductRequirements } from './productionRequirements';
import type {
  IngredientAvailability,
  ProductionPlan,
  ProductionPlanAvailabilityRecord,
  ProductionPlanCreateInput,
  Recipe,
  UnitOfMeasure,
} from '@/domain';

type PlanAvailabilityStatus = 'sufficient' | 'insufficient';

export type PlanAvailabilityResult = {
  status: PlanAvailabilityStatus;
  items: IngredientAvailability[];
  shortages: IngredientAvailability[];
  totalRequiredInGrams: number;
  totalAvailableInGrams: number;
  totalShortageInGrams: number;
  totalEstimatedCostInBRL: number;
};

async function loadRecipe(recipeId: string, override?: Recipe): Promise<Recipe> {
  if (override && override.id === recipeId) {
    return override;
  }

  return getRecipeById(recipeId);
}

/**
 * Calcula quantidades reservadas por produções agendadas/em andamento
 *
 * Retorna um Map com: productId => quantidadeReservadaEmGramas
 */
async function calculateReservedQuantities(options: {
  excludePlanId?: string;
}): Promise<Map<string, number>> {
  const { excludePlanId } = options;

  console.log('📊 [Reservas] Calculando quantidades reservadas...');

  // Buscar todos os planos agendados e em progresso
  const activePlans = await listProductionPlans({
    includeArchived: false,
    status: ['scheduled', 'in_progress'],
  });

  console.log(`📋 [Reservas] ${activePlans.length} planos ativos encontrados`);

  const reservedByProduct = new Map<string, number>();

  for (const plan of activePlans) {
    // Pular o plano que está sendo verificado (se for edição)
    if (excludePlanId && plan.id === excludePlanId) {
      continue;
    }

    try {
      // Buscar receita do plano
      const recipe = await getRecipeById(plan.recipeId);

      // Calcular requisitos do plano
      const requirements = await resolveProductRequirements({
        quantityInUnits: plan.quantityInUnits,
        unitOfMeasure: plan.unitOfMeasure,
        recipe,
      });

      // Somar as quantidades reservadas
      for (const [productId, quantity] of requirements.entries()) {
        const current = reservedByProduct.get(productId) || 0;
        reservedByProduct.set(productId, current + quantity);
        console.log(
          `  📦 [Reservas] ${productId.slice(0, 8)}... reservado: +${quantity}g (total: ${current + quantity}g)`,
        );
      }
    } catch (error) {
      console.warn(`⚠️ [Reservas] Erro ao processar plano ${plan.code}:`, error);
    }
  }

  console.log(`✅ [Reservas] Total de produtos com reservas: ${reservedByProduct.size}`);

  return reservedByProduct;
}

async function resolveAvailabilityItems(options: {
  productRequirements: Map<string, number>;
  reservedQuantities: Map<string, number>;
}): Promise<{
  items: IngredientAvailability[];
  totals: {
    required: number;
    available: number;
    shortage: number;
    estimatedCostInBRL: number;
  };
}> {
  const { productRequirements, reservedQuantities } = options;
  const items: IngredientAvailability[] = [];

  let totalRequiredInGrams = 0;
  let totalAvailableInGrams = 0;
  let totalShortageInGrams = 0;
  let totalEstimatedCostInBRL = 0;

  for (const [productId, requiredQuantity] of productRequirements.entries()) {
    const stockItems = await listStockItems({ productId });

    // Quantidade física no estoque
    const physicalQuantity = stockItems.reduce(
      (sum, item) => sum + (item.currentQuantityInGrams ?? 0),
      0,
    );

    // Quantidade já reservada por outros planos
    const reservedQuantity = reservedQuantities.get(productId) || 0;

    // Quantidade realmente disponível = física - reservada
    const availableQuantity = Math.max(0, physicalQuantity - reservedQuantity);

    const shortage = Math.max(0, requiredQuantity - availableQuantity);

    console.log(`📦 [Disponibilidade] ${productId.slice(0, 8)}...`, {
      física: physicalQuantity,
      reservada: reservedQuantity,
      disponível: availableQuantity,
      necessária: requiredQuantity,
      falta: shortage,
    });

    const minimumQuantity = stockItems[0]?.minimumQuantityInGrams;

    const aggregatedCost = stockItems.reduce(
      (acc, item) => {
        const quantity = item.currentQuantityInGrams ?? 0;
        // Convert stored R$ per kg to R$ per gram using helper
        const perGram = unitCostPerGram(item as FinancialStockItemLike);
        return {
          totalQuantity: acc.totalQuantity + quantity,
          totalCost: acc.totalCost + quantity * perGram,
        };
      },
      { totalQuantity: 0, totalCost: 0 },
    );

    let averageUnitCostInBRL: number | null = null;

    if (aggregatedCost.totalQuantity > 0 && aggregatedCost.totalCost > 0) {
      averageUnitCostInBRL = aggregatedCost.totalCost / aggregatedCost.totalQuantity;
    } else {
      const fallbackItem = stockItems[0];
      averageUnitCostInBRL =
        fallbackItem?.averageUnitCostInBRL ?? fallbackItem?.highestUnitCostInBRL ?? null;
    }

    const estimatedCostInBRL = averageUnitCostInBRL
      ? unitCostPerGram({
          productId,
          averageUnitCostInBRL,
        } as unknown as FinancialStockItemLike) * requiredQuantity
      : null;

    totalRequiredInGrams += requiredQuantity;
    totalAvailableInGrams += availableQuantity;
    totalShortageInGrams += shortage;
    if (estimatedCostInBRL) {
      totalEstimatedCostInBRL += estimatedCostInBRL;
    }

    items.push({
      productId,
      requiredQuantityInGrams: requiredQuantity,
      availableQuantityInGrams: availableQuantity,
      shortageInGrams: shortage,
      minimumQuantityInGrams: minimumQuantity,
      averageUnitCostInBRL,
      estimatedCostInBRL,
    });
  }

  return {
    items,
    totals: {
      required: totalRequiredInGrams,
      available: totalAvailableInGrams,
      shortage: totalShortageInGrams,
      estimatedCostInBRL: totalEstimatedCostInBRL,
    },
  };
}

export async function checkProductionPlanAvailability(options: {
  recipeId: string;
  quantityInUnits: number;
  unitOfMeasure: UnitOfMeasure;
  recipeOverride?: Recipe;
  excludePlanId?: string; // Para ignorar o próprio plano ao editar
}): Promise<PlanAvailabilityResult> {
  console.log('');
  console.log('═'.repeat(80));
  console.log('🔍 [DISPONIBILIDADE] Verificando disponibilidade de ingredientes');
  console.log('═'.repeat(80));
  console.log('📋 Receita:', options.recipeId);
  console.log('📏 Quantidade:', options.quantityInUnits, options.unitOfMeasure);
  if (options.excludePlanId) {
    console.log('⚠️  Ignorando plano:', options.excludePlanId);
  }
  console.log('');

  const recipe = await loadRecipe(options.recipeId, options.recipeOverride);

  const productRequirements = await resolveProductRequirements({
    quantityInUnits: options.quantityInUnits,
    unitOfMeasure: options.unitOfMeasure,
    recipe,
  });

  if (productRequirements.size === 0) {
    console.log('✅ [DISPONIBILIDADE] Nenhum ingrediente necessário');
    console.log('═'.repeat(80));
    console.log('');
    return {
      status: 'sufficient',
      items: [],
      shortages: [],
      totalRequiredInGrams: 0,
      totalAvailableInGrams: 0,
      totalShortageInGrams: 0,
      totalEstimatedCostInBRL: 0,
    };
  }

  // CRÍTICO: Calcular quantidades já reservadas por outros planos
  const reservedQuantities = await calculateReservedQuantities({
    excludePlanId: options.excludePlanId,
  });

  const { items, totals } = await resolveAvailabilityItems({
    productRequirements,
    reservedQuantities,
  });

  const shortages = items.filter(item => item.shortageInGrams > 0);

  const status = shortages.length > 0 ? 'insufficient' : 'sufficient';

  console.log('');
  console.log(
    `${status === 'sufficient' ? '✅' : '⚠️'} [DISPONIBILIDADE] Status: ${status}`,
  );
  if (shortages.length > 0) {
    console.log(`❌ Faltas detectadas: ${shortages.length} produto(s)`);
    shortages.forEach(s => {
      console.log(`   - ${s.productId.slice(0, 8)}...: falta ${s.shortageInGrams}g`);
    });
  }
  console.log('═'.repeat(80));
  console.log('');

  return {
    status,
    items,
    shortages,
    totalRequiredInGrams: totals.required,
    totalAvailableInGrams: totals.available,
    totalShortageInGrams: totals.shortage,
    totalEstimatedCostInBRL: totals.estimatedCostInBRL ?? 0,
  };
}

export async function scheduleProductionPlan(options: {
  input: ProductionPlanCreateInput;
  availability: PlanAvailabilityResult;
  confirmedBy?: string | null;
}): Promise<{
  plan: ProductionPlan;
  availabilityRecord?: ProductionPlanAvailabilityRecord | null;
}> {
  const { input, availability, confirmedBy } = options;

  const plan = await createProductionPlan({
    ...input,
    estimatedProductionCostInBRL: availability.totalEstimatedCostInBRL || null,
  });

  let availabilityRecord: ProductionPlanAvailabilityRecord | null = null;

  if (availability.status === 'insufficient') {
    const confirmedAt = new Date();

    availabilityRecord = await createProductionPlanAvailabilityRecord({
      planId: plan.id,
      planCode: plan.code,
      recipeId: plan.recipeId,
      recipeName: plan.recipeName,
      scheduledFor: plan.scheduledFor,
      quantityInUnits: plan.quantityInUnits,
      unitOfMeasure: plan.unitOfMeasure,
      status: 'insufficient',
      confirmedBy: confirmedBy ?? null,
      confirmedAt,
      shortages: availability.shortages,
      totalRequiredInGrams: availability.totalRequiredInGrams,
      totalAvailableInGrams: availability.totalAvailableInGrams,
      totalShortageInGrams: availability.totalShortageInGrams,
      estimatedCostInBRL: availability.totalEstimatedCostInBRL || null,
    });
  }

  return { plan, availabilityRecord };
}
