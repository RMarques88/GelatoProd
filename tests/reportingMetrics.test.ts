import { __private__, PeriodGranularity } from '@/services/reportingMetrics';
import type { ProductionDivergence, ProductionPlan, StockMovement } from '@/domain';

const {
  aggregateProductionPlans,
  aggregateIngredientConsumption,
  aggregateDivergenceUsage,
} = __private__;

describe('reportingMetrics aggregations', () => {
  describe('aggregateProductionPlans', () => {
    const basePlan: ProductionPlan = {
      id: 'plan-0',
      recipeId: 'recipe-a',
      recipeName: 'Sorvete de Baunilha',
      sequenceNumber: 1,
      code: 'KG-001',
      scheduledFor: new Date('2025-09-30T08:00:00.000Z'),
      quantityInUnits: 100,
      unitOfMeasure: 'UNITS',
      status: 'completed',
      requestedBy: 'user-1',
      createdAt: new Date('2025-09-28T10:00:00.000Z'),
      updatedAt: new Date('2025-10-01T10:00:00.000Z'),
      completedAt: new Date('2025-10-01T14:00:00.000Z'),
      startedAt: new Date('2025-10-01T11:00:00.000Z'),
      actualQuantityInUnits: 95,
    } as ProductionPlan;

    it.each<PeriodGranularity>(['day', 'week', 'month'])(
      'groups plans by %s',
      granularity => {
        const summaries = aggregateProductionPlans(
          [
            basePlan,
            {
              ...basePlan,
              id: 'plan-1',
              recipeId: 'recipe-b',
              recipeName: 'Gelato de Pistache',
              quantityInUnits: 80,
              actualQuantityInUnits: 80,
              completedAt: new Date('2025-10-02T09:30:00.000Z'),
            },
            {
              ...basePlan,
              id: 'plan-2',
              recipeId: 'recipe-a',
              completedAt: new Date('2025-09-25T11:00:00.000Z'),
            },
          ],
          granularity,
        );

        const [first] = summaries;
        expect(first.periodLabel).toBeDefined();
        expect(first.totals.totalPlans).toBeGreaterThan(0);
        const recipeIds = summaries.flatMap(summary =>
          summary.totals.recipes.map(recipe => recipe.recipeId),
        );
        expect(recipeIds).toEqual(expect.arrayContaining(['recipe-a', 'recipe-b']));
      },
    );
  });

  describe('aggregateIngredientConsumption', () => {
    const baseMovement: StockMovement = {
      id: 'move-1',
      productId: 'prod-milk',
      stockItemId: 'stock-1',
      type: 'decrement',
      quantityInGrams: 500,
      previousQuantityInGrams: 1000,
      resultingQuantityInGrams: 500,
      performedBy: 'user-1',
      performedAt: new Date('2025-10-03T12:00:00.000Z'),
      createdAt: new Date('2025-10-03T12:00:00.000Z'),
      updatedAt: new Date('2025-10-03T12:00:00.000Z'),
    } as unknown as StockMovement;

    it('sums movements per period and product', () => {
      const summaries = aggregateIngredientConsumption(
        [
          baseMovement,
          {
            ...baseMovement,
            id: 'move-2',
            productId: 'prod-sugar',
            quantityInGrams: 200,
            performedAt: new Date('2025-10-03T14:00:00.000Z'),
          },
          {
            ...baseMovement,
            id: 'move-3',
            quantityInGrams: 400,
            performedAt: new Date('2025-09-28T14:00:00.000Z'),
          },
        ],
        'day',
      );

      expect(summaries).toHaveLength(2);
      const primary = summaries[0];
      expect(primary.totals.totalMovements).toBeGreaterThan(0);
      const milkEntry = primary.totals.products.find(
        product => product.productId === 'prod-milk',
      );
      expect(milkEntry?.quantityInGrams).toBeGreaterThan(0);
    });
  });

  describe('aggregateDivergenceUsage', () => {
    const baseDivergence: ProductionDivergence = {
      id: 'div-1',
      planId: 'plan-1',
      reportedBy: 'user-1',
      status: 'open',
      severity: 'high',
      type: 'ingredient_shortage',
      description: 'Falta de insumo',
      expectedQuantityInUnits: 100,
      actualQuantityInUnits: 60,
      createdAt: new Date('2025-10-02T08:00:00.000Z'),
      updatedAt: new Date('2025-10-02T08:00:00.000Z'),
    } as ProductionDivergence;

    it('aggregates shortages by severity within period', () => {
      const summaries = aggregateDivergenceUsage(
        [
          baseDivergence,
          {
            ...baseDivergence,
            id: 'div-2',
            severity: 'medium',
            expectedQuantityInUnits: 50,
            actualQuantityInUnits: 40,
          },
        ],
        'week',
      );

      expect(summaries).toHaveLength(1);
      const [summary] = summaries;
      expect(summary.totals.totalDivergences).toBe(2);
      expect(summary.totals.totalShortageInUnits).toBe(50);
      expect(summary.totals.severity).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ severity: 'high', count: 1 }),
          expect.objectContaining({ severity: 'medium', count: 1 }),
        ]),
      );
    });
  });
});
