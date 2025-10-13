import {
  unitCostPerGram,
  unitCostPerKilogram,
  unitCostForDisplay,
} from '@/utils/financial';

describe('unit cost conversion helpers', () => {
  test('converts stored R$/kg to R$/g correctly', () => {
    const stock = { productId: 'p1', averageUnitCostInBRL: 50 }; // R$ 50 / kg
    expect(unitCostPerKilogram(stock)).toBe(50);
    expect(unitCostPerGram(stock)).toBeCloseTo(0.05); // 50 / 1000
  });

  test('unitCostForDisplay returns per-unit for UNITS and per-kg otherwise', () => {
    const stockUnit = { productId: 'p2', averageUnitCostInBRL: 3 }; // R$ 3 per unit
    const stockKg = { productId: 'p3', averageUnitCostInBRL: 40 }; // R$ 40 / kg

    expect(unitCostForDisplay(stockUnit, 'UNITS')).toBe(3);
    expect(unitCostForDisplay(stockKg, 'GRAMS')).toBe(40);
    expect(unitCostForDisplay(stockKg, 'KILOGRAMS')).toBe(40);
  });
});
