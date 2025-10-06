import type { ProductionPlanAvailabilityRecord } from '@/domain';

export type ProductionAvailabilityMetrics = {
  checkedCount: number;
  shortageCount: number;
  shortageRate: number;
  executedCount: number;
  fulfilledCount: number;
  reconciledCount: number;
  totalRequiredInGrams: number;
  totalPredictedShortageInGrams: number;
  totalActualShortageInGrams: number;
  lastCheckAt: Date | null;
};

const ZERO_METRICS: ProductionAvailabilityMetrics = {
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
};

export function calculateAvailabilityMetrics(
  records: ProductionPlanAvailabilityRecord[],
): ProductionAvailabilityMetrics {
  if (records.length === 0) {
    return ZERO_METRICS;
  }

  let shortageCount = 0;
  let executedCount = 0;
  let fulfilledCount = 0;
  let reconciledCount = 0;
  let totalRequiredInGrams = 0;
  let totalPredictedShortageInGrams = 0;
  let totalActualShortageInGrams = 0;
  let latestCheck = ZERO_METRICS.lastCheckAt;

  for (const record of records) {
    const predictedShortage = record.totalShortageInGrams ?? 0;
    const actualShortage = record.actualShortageInGrams ?? 0;

    if (predictedShortage > 0) {
      shortageCount += 1;
    }

    if (record.status === 'fulfilled') {
      fulfilledCount += 1;
      executedCount += 1;
    } else if (record.status === 'reconciled') {
      reconciledCount += 1;
      executedCount += 1;
    }

    totalRequiredInGrams += record.totalRequiredInGrams ?? 0;
    totalPredictedShortageInGrams += predictedShortage;
    totalActualShortageInGrams += actualShortage;

    const candidateDate = record.confirmedAt ?? record.createdAt ?? record.scheduledFor;
    if (!latestCheck || (candidateDate && candidateDate > latestCheck)) {
      latestCheck = candidateDate ?? latestCheck;
    }
  }

  const shortageRate = records.length > 0 ? shortageCount / records.length : 0;

  return {
    checkedCount: records.length,
    shortageCount,
    shortageRate,
    executedCount,
    fulfilledCount,
    reconciledCount,
    totalRequiredInGrams,
    totalPredictedShortageInGrams,
    totalActualShortageInGrams,
    lastCheckAt: latestCheck,
  };
}
