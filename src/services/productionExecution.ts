import {
  ProductionDivergence,
  ProductionDivergenceSeverity,
  ProductionPlan,
  StockMovement,
} from '@/domain';
import {
  adjustStockLevel,
  listStockItems,
} from '@/services/firestore/stockService';
import { listProductionStages, updateProductionStage } from '@/services/firestore/productionStagesService';
import {
  getProductionPlanById,
  updateProductionPlan,
} from '@/services/firestore/productionService';
import { getRecipeById } from '@/services/firestore/recipesService';
import { createProductionDivergence } from '@/services/firestore/productionDivergencesService';
import { logError } from '@/utils/logger';

function calculateRequiredQuantity(
  plan: ProductionPlan,
  recipeYieldInGrams: number,
  ingredientQuantityInGrams: number,
) {
  if (plan.unitOfMeasure === 'GRAMS') {
    if (recipeYieldInGrams <= 0) {
      return ingredientQuantityInGrams;
    }

    const gramsFactor = plan.quantityInUnits / recipeYieldInGrams;
    return ingredientQuantityInGrams * gramsFactor;
  }

  return ingredientQuantityInGrams * plan.quantityInUnits;
}

function resolveSeverity(missing: number, required: number): ProductionDivergenceSeverity {
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

export async function startProductionPlanExecution(planId: string): Promise<ProductionPlan> {
  const now = new Date();
  const plan = await updateProductionPlan(planId, {
    status: 'in_progress',
    startedAt: now,
  });

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

  const plan = await getProductionPlanById(planId);
  const recipe = await getRecipeById(plan.recipeId);
  const stages = await listProductionStages({ planId });

  const adjustments: StockMovement[] = [];
  const divergences: ProductionDivergence[] = [];

  let worstMissingRatio = 0;
  const now = new Date();

  for (const ingredient of recipe.ingredients) {
    if (ingredient.type !== 'product') {
      continue;
    }

    const requiredQuantity = calculateRequiredQuantity(
      plan,
      recipe.yieldInGrams,
      ingredient.quantityInGrams,
    );

    if (requiredQuantity <= 0) {
      continue;
    }

    const stockItems = await listStockItems({ productId: ingredient.referenceId });
    const stockItem = stockItems[0];

    const available = stockItem?.currentQuantityInGrams ?? 0;
    const consumed = Math.min(requiredQuantity, available);
    const missing = Math.max(0, requiredQuantity - available);

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
      } catch (adjustError) {
        logError(adjustError, 'production.complete.adjust');
      }
    }

    if (missing > 0 || !stockItem) {
      const severity = resolveSeverity(missing > 0 ? missing : requiredQuantity, requiredQuantity);
      const divergence = await createProductionDivergence({
        planId: plan.id,
        stageId: undefined,
        reportedBy: performedBy,
        severity,
        type: 'ingredient_shortage',
        description: stockItem
          ? `Consumo parcial do ingrediente ${ingredient.referenceId}.` 
          : `Sem estoque cadastrado para o ingrediente ${ingredient.referenceId}.`,
        expectedQuantityInUnits: requiredQuantity,
        actualQuantityInUnits: consumed,
      });
      divergences.push(divergence);

      if (requiredQuantity > 0) {
        const ratio = missing / requiredQuantity;
        worstMissingRatio = Math.max(worstMissingRatio, ratio);
      }
    }
  }

  const actualQuantity = Math.max(0, plan.quantityInUnits * (1 - worstMissingRatio));

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

  const completedPlan = await updateProductionPlan(planId, {
    status: 'completed',
    completedAt: now,
    actualQuantityInUnits: actualQuantity,
    ...(plan.startedAt ? null : { startedAt: now }),
  });

  return {
    plan: completedPlan,
    adjustments,
    divergences,
  };
}
