import { computeRecipeEstimatedCost } from '@/utils/financial';
import type { Product, StockItem, Recipe } from '@/domain';

describe('computeRecipeEstimatedCost', () => {
  test('nata 100g at 3.5 R$/kg -> R$0.35', () => {
    const products: Product[] = [
      {
        id: 'nata',
        name: 'Nata',
        isActive: true,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        unitOfMeasure: 'GRAMS',
      } as Product,
    ];

    const stock: StockItem[] = [
      {
        id: 's-nata',
        productId: 'nata',
        currentQuantityInGrams: 1000,
        minimumQuantityInGrams: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        highestUnitCostInBRL: 3.5,
        averageUnitCostInBRL: 3.5,
      } as StockItem,
    ];

    const recipe: Recipe = {
      id: 'r1',
      name: 'Teste',
      ingredients: [{ type: 'product', referenceId: 'nata', quantityInGrams: 100 }],
      yieldInGrams: 100,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Recipe;

    const cost = computeRecipeEstimatedCost(recipe, products, stock, []);
    expect(cost).toBeCloseTo(0.35, 3);
  });

  test('milk 650ml at 4.7 R$/L -> ~3.055', () => {
    const products: Product[] = [
      {
        id: 'milk',
        name: 'Leite',
        isActive: true,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        unitOfMeasure: 'MILLILITERS',
      } as Product,
    ];

    const stock: StockItem[] = [
      {
        id: 's-milk',
        productId: 'milk',
        currentQuantityInGrams: 2000,
        minimumQuantityInGrams: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        highestUnitCostInBRL: 4.7,
        averageUnitCostInBRL: 4.7,
      } as StockItem,
    ];

    const recipe: Recipe = {
      id: 'r2',
      name: 'Teste Milk',
      ingredients: [{ type: 'product', referenceId: 'milk', quantityInGrams: 650 }],
      yieldInGrams: 650,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Recipe;

    const cost = computeRecipeEstimatedCost(recipe, products, stock, []);
    expect(cost).toBeCloseTo((4.7 / 1000) * 650, 6);
  });
});
