import { calculateAvailabilityMetrics } from '@/services/productionAvailabilityAnalytics';
import type { ProductionPlanAvailabilityRecord } from '@/domain';

describe('calculateAvailabilityMetrics', () => {
  function buildRecord(
    overrides: Partial<ProductionPlanAvailabilityRecord> = {},
  ): ProductionPlanAvailabilityRecord {
    const now = new Date('2024-01-01T00:00:00.000Z');

    return {
      id: overrides.id ?? 'record-id',
      planId: overrides.planId ?? 'plan-id',
      planCode: overrides.planCode ?? 'KG-001',
      recipeId: overrides.recipeId ?? 'recipe-id',
      recipeName: overrides.recipeName ?? 'Gelato de Pistache',
      scheduledFor: overrides.scheduledFor ?? now,
      quantityInUnits: overrides.quantityInUnits ?? 100,
      unitOfMeasure: overrides.unitOfMeasure ?? 'UNITS',
      status: overrides.status ?? 'sufficient',
      confirmedBy: overrides.confirmedBy ?? null,
      confirmedAt: overrides.confirmedAt ?? null,
      shortages: overrides.shortages ?? [],
      totalRequiredInGrams: overrides.totalRequiredInGrams ?? 0,
      totalAvailableInGrams: overrides.totalAvailableInGrams ?? 0,
      totalShortageInGrams: overrides.totalShortageInGrams ?? 0,
      notes: overrides.notes ?? null,
      executionStartedAt: overrides.executionStartedAt ?? null,
      executionCompletedAt: overrides.executionCompletedAt ?? null,
      actualConsumedInGrams: overrides.actualConsumedInGrams ?? null,
      actualShortageInGrams: overrides.actualShortageInGrams ?? null,
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
      archivedAt: overrides.archivedAt ?? null,
    };
  }

  it('returns zeroed metrics when there are no records', () => {
    const metrics = calculateAvailabilityMetrics([]);

    expect(metrics).toEqual({
      checkedCount: 0,
      shortageCount: 0,
      shortageRate: 0,
      executedCount: 0,
      fulfilledCount: 0,
      reconciledCount: 0,
      totalRequiredInGrams: 0,
      totalPredictedShortageInGrams: 0,
      totalActualShortageInGrams: 0,
      lastCheckAt: null,
    });
  });

  it('aggregates counts and volumes across records', () => {
    const records: ProductionPlanAvailabilityRecord[] = [
      buildRecord({
        id: 'a',
        status: 'sufficient',
        totalRequiredInGrams: 1000,
        totalShortageInGrams: 0,
        createdAt: new Date('2024-01-01T10:00:00.000Z'),
      }),
      buildRecord({
        id: 'b',
        status: 'insufficient',
        totalRequiredInGrams: 800,
        totalShortageInGrams: 200,
        createdAt: new Date('2024-02-01T10:00:00.000Z'),
      }),
      buildRecord({
        id: 'c',
        status: 'fulfilled',
        totalRequiredInGrams: 1200,
        totalShortageInGrams: 100,
        actualShortageInGrams: 50,
        actualConsumedInGrams: 1150,
        createdAt: new Date('2024-03-01T10:00:00.000Z'),
      }),
      buildRecord({
        id: 'd',
        status: 'reconciled',
        totalRequiredInGrams: 1500,
        totalShortageInGrams: 300,
        actualShortageInGrams: 300,
        createdAt: new Date('2024-04-01T10:00:00.000Z'),
      }),
    ];

    const metrics = calculateAvailabilityMetrics(records);

    expect(metrics.checkedCount).toBe(4);
    expect(metrics.shortageCount).toBe(3);
    expect(metrics.shortageRate).toBeCloseTo(0.75);
    expect(metrics.executedCount).toBe(2);
    expect(metrics.fulfilledCount).toBe(1);
    expect(metrics.reconciledCount).toBe(1);
    expect(metrics.totalRequiredInGrams).toBe(4500);
    expect(metrics.totalPredictedShortageInGrams).toBe(600);
    expect(metrics.totalActualShortageInGrams).toBe(350);
    expect(metrics.lastCheckAt).toEqual(new Date('2024-04-01T10:00:00.000Z'));
  });

  it('prefers confirmedAt when determining the last check timestamp', () => {
    const records: ProductionPlanAvailabilityRecord[] = [
      buildRecord({
        id: 'older',
        createdAt: new Date('2024-06-01T10:00:00.000Z'),
      }),
      buildRecord({
        id: 'with-confirmation',
        createdAt: new Date('2024-05-01T10:00:00.000Z'),
        confirmedAt: new Date('2024-07-15T12:30:00.000Z'),
      }),
    ];

    const metrics = calculateAvailabilityMetrics(records);

    expect(metrics.lastCheckAt).toEqual(new Date('2024-07-15T12:30:00.000Z'));
  });
});
