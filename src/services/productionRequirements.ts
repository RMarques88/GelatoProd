import { getRecipeById } from '@/services/firestore/recipesService';
import type { Recipe, UnitOfMeasure } from '@/domain';

export type ProductRequirementMap = Map<string, number>;

export type ProductRequirement = {
  productId: string;
  requiredQuantityInGrams: number;
};

type RecipeCache = Map<string, Recipe>;

type RecipeLoader = (recipeId: string) => Promise<Recipe>;

type AccumulateOptions = {
  recipe: Recipe;
  batchFactor: number;
  cache: RecipeCache;
  requirements: ProductRequirementMap;
  traversalStack: Set<string>;
  loadRecipe: RecipeLoader;
};

function calculateBatchFactor(
  quantityInUnits: number,
  unitOfMeasure: UnitOfMeasure,
  recipeYieldInGrams: number,
): number {
  if (unitOfMeasure === 'GRAMS') {
    if (!Number.isFinite(recipeYieldInGrams) || recipeYieldInGrams <= 0) {
      return 0;
    }

    return quantityInUnits / recipeYieldInGrams;
  }

  return quantityInUnits;
}

async function getRecipeFromCache(
  recipeId: string,
  cache: RecipeCache,
  loadRecipe: RecipeLoader,
): Promise<Recipe> {
  const cached = cache.get(recipeId);
  if (cached) {
    return cached;
  }

  const loaded = await loadRecipe(recipeId);
  cache.set(recipeId, loaded);
  return loaded;
}

async function accumulateProductRequirements(options: AccumulateOptions): Promise<void> {
  const { recipe, batchFactor, cache, requirements, traversalStack, loadRecipe } =
    options;

  if (!Number.isFinite(batchFactor) || batchFactor <= 0) {
    console.log(
      `↩️  [productionRequirements] Ignorando receita ${recipe.id} (batchFactor inválido: ${batchFactor})`,
    );
    return;
  }

  if (traversalStack.has(recipe.id)) {
    const cyclePath = [...traversalStack, recipe.id].join(' -> ');
    throw new Error(`Ciclo detectado nas receitas: ${cyclePath}`);
  }

  traversalStack.add(recipe.id);

  try {
    for (const ingredient of recipe.ingredients) {
      const requiredQuantity = ingredient.quantityInGrams * batchFactor;

      if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) {
        console.log(
          `⏭️  [productionRequirements] Ignorando ingrediente ${ingredient.referenceId} (quantidade requerida: ${requiredQuantity})`,
        );
        continue;
      }

      if (ingredient.type === 'product') {
        const current = requirements.get(ingredient.referenceId) ?? 0;
        const updated = current + requiredQuantity;
        requirements.set(ingredient.referenceId, updated);
        console.log(
          `✅ [productionRequirements] Produto ${ingredient.referenceId}: +${requiredQuantity}g (total acumulado: ${updated}g)`,
        );
        continue;
      }

      if (ingredient.type === 'recipe') {
        const childRecipe = await getRecipeFromCache(
          ingredient.referenceId,
          cache,
          loadRecipe,
        );

        if (!Number.isFinite(childRecipe.yieldInGrams) || childRecipe.yieldInGrams <= 0) {
          console.warn(
            `⚠️  [productionRequirements] Receita encadeada ${childRecipe.id} sem rendimento válido (${childRecipe.yieldInGrams}). Ignorando ingredientes dependentes.`,
          );
          continue;
        }

        const childBatchFactor = requiredQuantity / childRecipe.yieldInGrams;

        await accumulateProductRequirements({
          recipe: childRecipe,
          batchFactor: childBatchFactor,
          cache,
          requirements,
          traversalStack,
          loadRecipe,
        });
      }
    }
  } finally {
    traversalStack.delete(recipe.id);
  }
}

export async function resolveProductRequirements(options: {
  quantityInUnits: number;
  unitOfMeasure: UnitOfMeasure;
  recipe: Recipe;
  loadRecipe?: RecipeLoader;
}): Promise<ProductRequirementMap> {
  const { quantityInUnits, unitOfMeasure, recipe, loadRecipe = getRecipeById } = options;

  const cache: RecipeCache = new Map([[recipe.id, recipe]]);
  const requirements: ProductRequirementMap = new Map();
  const batchFactor = calculateBatchFactor(
    quantityInUnits,
    unitOfMeasure,
    recipe.yieldInGrams,
  );

  await accumulateProductRequirements({
    recipe,
    batchFactor,
    cache,
    requirements,
    traversalStack: new Set(),
    loadRecipe,
  });

  return requirements;
}
