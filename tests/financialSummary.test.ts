import {
  computeFinancialSummary,
  computeAccessoriesCostForPlan,
  type PricingSettingsLike,
} from '@/utils/financial';
import type { UnitOfMeasure } from '@/domain';

describe('financial summary & accessories overrides', () => {
  const baseProducts = [
    { id: 'cup', unitOfMeasure: 'UNITS' as UnitOfMeasure },
    { id: 'topping', unitOfMeasure: 'GRAMS' as UnitOfMeasure },
  ];
  const baseStock = [
    { productId: 'cup', averageUnitCostInBRL: 0.5 },
    // topping: 0.02 per gram -> store as 20.0 R$/kg
    { productId: 'topping', averageUnitCostInBRL: 20.0 },
  ];
  const basePlan = (d: Date) => ({
    recipeId: 'gelato1',
    unitOfMeasure: 'GRAMS' as UnitOfMeasure,
    quantityInUnits: 1000, // 1000g produced
    completedAt: d,
  });
  const date = new Date();
  const rangeFrom = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  const rangeTo = new Date(date.getTime() + 24 * 60 * 60 * 1000);

  it('uses global accessories when no override', () => {
    const settings: PricingSettingsLike = {
      sellingPricePer100gInBRL: 10, // 0.1 per g revenue baseline
      extraCostPer100gInBRL: 0,
      accessories: {
        items: [
          { productId: 'cup', defaultQtyPerPortion: 1 }, // 1 unit per 100g
          { productId: 'topping', defaultQtyPerPortion: 5 }, // 5g per 100g
        ],
      },
    };

    const plan = basePlan(date);
    const accessoriesCost = computeAccessoriesCostForPlan(
      plan,
      baseProducts,
      baseStock,
      settings,
    );
    // portions = 1000/100 = 10
    // cup: 1 * 0.5 * 10 = 5
    // topping: 5g * 0.02 * 10 = 1
    expect(accessoriesCost).toBeCloseTo(6);

    const summary = computeFinancialSummary(
      [plan],
      baseProducts,
      baseStock,
      settings,
      rangeFrom,
      rangeTo,
    );
    // revenue: (1000/100) * 10 = 100
    // cost: production cost not provided -> 0
    // margin: 100 - accessories(6) = 94
    expect(summary.revenue).toBeCloseTo(100);
    expect(summary.cost).toBe(0);
    expect(summary.margin).toBeCloseTo(94);
  });

  it('prefers recipe override when present', () => {
    const settings: PricingSettingsLike = {
      sellingPricePer100gInBRL: 10,
      accessories: {
        items: [
          { productId: 'cup', defaultQtyPerPortion: 1 },
          { productId: 'topping', defaultQtyPerPortion: 5 },
        ],
        overridesByRecipeId: {
          gelato1: [
            { productId: 'cup', defaultQtyPerPortion: 2 }, // double cup cost per 100g
          ],
        },
      },
    };

    const plan = basePlan(date);
    const accessoriesCost = computeAccessoriesCostForPlan(
      plan,
      baseProducts,
      baseStock,
      settings,
    );
    // portions = 10
    // override only includes cup: 2 * 0.5 * 10 = 10 (no topping)
    expect(accessoriesCost).toBeCloseTo(10);

    const summary = computeFinancialSummary(
      [plan],
      baseProducts,
      baseStock,
      settings,
      rangeFrom,
      rangeTo,
    );
    // revenue: 100 (same)
    // margin: 100 - 10 = 90
    expect(summary.margin).toBeCloseTo(90);
  });

  it('returns zero when outside date range', () => {
    const settings: PricingSettingsLike = { sellingPricePer100gInBRL: 10 };
    const pastFrom = new Date(date.getTime() + 2 * 24 * 60 * 60 * 1000); // future window
    const pastTo = new Date(date.getTime() + 3 * 24 * 60 * 60 * 1000);
    const futurePlan = basePlan(date); // date outside future window
    const summary = computeFinancialSummary(
      [futurePlan],
      baseProducts,
      baseStock,
      settings,
      pastFrom,
      pastTo,
    );
    expect(summary.revenue).toBe(0);
    expect(summary.margin).toBe(0);
  });
});
