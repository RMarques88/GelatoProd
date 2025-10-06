import {
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  type QueryConstraint,
} from 'firebase/firestore';

import { listProductionDivergences } from '@/services/firestore/productionDivergencesService';
import {
  PRODUCTION_PLANS_COLLECTION,
  mapProductionPlan,
} from '@/services/firestore/productionService';
import { listStockMovements } from '@/services/firestore/stockService';
import { getCollection, getDb } from '@/services/firestore/utils';
import type {
  ProductionDivergence,
  ProductionDivergenceSeverity,
  ProductionPlan,
  StockMovement,
} from '@/domain';

export type PeriodGranularity = 'day' | 'week' | 'month';

export type ReportingQueryOptions = {
  from: Date;
  to: Date;
  granularity: PeriodGranularity;
  limitPeriods?: number;
};

export type PeriodSummary<T> = {
  periodKey: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  totals: T;
};

export type RecipeProductionBreakdown = {
  recipeId: string;
  recipeName: string;
  planCount: number;
  plannedQuantityInUnits: number;
  actualQuantityInUnits: number;
  estimatedCostInBRL: number;
  actualCostInBRL: number;
};

export type RecipeProductionTotals = {
  totalPlans: number;
  totalPlannedQuantityInUnits: number;
  totalActualQuantityInUnits: number;
  totalEstimatedCostInBRL: number;
  totalActualCostInBRL: number;
  recipes: RecipeProductionBreakdown[];
};

export type RecipeProductionPeriodSummary = PeriodSummary<RecipeProductionTotals>;

export type IngredientConsumptionBreakdown = {
  productId: string;
  quantityInGrams: number;
  movementCount: number;
};

export type IngredientConsumptionTotals = {
  totalMovements: number;
  totalConsumedInGrams: number;
  products: IngredientConsumptionBreakdown[];
};

export type IngredientConsumptionPeriodSummary =
  PeriodSummary<IngredientConsumptionTotals>;

export type DivergenceSeverityBreakdown = {
  severity: ProductionDivergenceSeverity;
  count: number;
  totalShortageInUnits: number;
};

export type DivergenceUsageTotals = {
  totalDivergences: number;
  totalShortageInUnits: number;
  severity: DivergenceSeverityBreakdown[];
};

export type DivergenceUsagePeriodSummary = PeriodSummary<DivergenceUsageTotals>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * MS_PER_DAY);
}

function startOfWeek(date: Date): Date {
  const result = startOfDay(date);
  const day = result.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(result, offset);
}

function startOfMonth(date: Date): Date {
  const result = startOfDay(date);
  result.setDate(1);
  return result;
}

function endOfWeek(start: Date): Date {
  return endOfDay(addDays(start, 6));
}

function endOfMonth(start: Date): Date {
  const result = startOfDay(start);
  result.setMonth(result.getMonth() + 1, 0);
  return endOfDay(result);
}

function getISOWeek(date: Date): number {
  const temp = startOfDay(date);
  const day = temp.getDay() || 7;
  temp.setDate(temp.getDate() + 4 - day);
  const yearStart = new Date(temp.getFullYear(), 0, 1);
  const diff = temp.getTime() - yearStart.getTime();
  return Math.ceil((diff / MS_PER_DAY + 1) / 7);
}

function formatDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString('pt-BR', options);
}

function formatRangeLabel(start: Date, end: Date): string {
  const startLabel = formatDate(start, { day: '2-digit', month: 'short' });
  const endLabel = formatDate(end, { day: '2-digit', month: 'short' });
  return `${startLabel} – ${endLabel}`;
}

function resolvePeriod(date: Date, granularity: PeriodGranularity) {
  if (granularity === 'week') {
    const start = startOfWeek(date);
    const end = endOfWeek(start);
    const week = getISOWeek(date);
    const label = `Semana ${week} (${formatRangeLabel(start, end)})`;
    return { start, end, label, key: `week_${start.toISOString()}` };
  }

  if (granularity === 'month') {
    const start = startOfMonth(date);
    const end = endOfMonth(start);
    const label = formatDate(start, { month: 'long', year: 'numeric' });
    return {
      start,
      end,
      label,
      key: `month_${start.getFullYear()}-${start.getMonth() + 1}`,
    };
  }

  const start = startOfDay(date);
  const end = endOfDay(start);
  const label = formatDate(start, { day: '2-digit', month: 'short' });
  return { start, end, label, key: `day_${start.toISOString()}` };
}

function sortSummariesByPeriod<T extends PeriodSummary<unknown>>(summaries: T[]): T[] {
  return summaries.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());
}

async function fetchCompletedProductionPlans(
  from: Date,
  to: Date,
): Promise<ProductionPlan[]> {
  const db = getDb();
  const colRef = getCollection(db, PRODUCTION_PLANS_COLLECTION);

  const constraints: QueryConstraint[] = [];

  constraints.push(where('status', '==', 'completed'));
  constraints.push(where('completedAt', '>=', Timestamp.fromDate(startOfDay(from))));
  constraints.push(where('completedAt', '<=', Timestamp.fromDate(endOfDay(to))));
  constraints.push(orderBy('completedAt', 'desc'));

  const completedQuery = query(colRef, ...constraints);
  const snapshot = await getDocs(completedQuery);

  return snapshot.docs.map(doc =>
    mapProductionPlan(doc as Parameters<typeof mapProductionPlan>[0]),
  );
}

function aggregateProductionPlans(
  plans: ProductionPlan[],
  granularity: PeriodGranularity,
  limitPeriods?: number,
): RecipeProductionPeriodSummary[] {
  const periodMap = new Map<
    string,
    {
      periodStart: Date;
      periodEnd: Date;
      periodLabel: string;
      recipes: Map<string, RecipeProductionBreakdown>;
      totals: RecipeProductionTotals;
    }
  >();

  plans.forEach(plan => {
    const referenceDate = plan.completedAt ?? plan.scheduledFor;
    if (!referenceDate) {
      return;
    }

    const { key, start, end, label } = resolvePeriod(referenceDate, granularity);
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        periodStart: start,
        periodEnd: end,
        periodLabel: label,
        recipes: new Map(),
        totals: {
          totalPlans: 0,
          totalPlannedQuantityInUnits: 0,
          totalActualQuantityInUnits: 0,
          totalEstimatedCostInBRL: 0,
          totalActualCostInBRL: 0,
          recipes: [],
        },
      });
    }

    const periodEntry = periodMap.get(key)!;
    const recipeEntry = periodEntry.recipes.get(plan.recipeId) ?? {
      recipeId: plan.recipeId,
      recipeName: plan.recipeName,
      planCount: 0,
      plannedQuantityInUnits: 0,
      actualQuantityInUnits: 0,
      estimatedCostInBRL: 0,
      actualCostInBRL: 0,
    };

    recipeEntry.planCount += 1;
    recipeEntry.plannedQuantityInUnits += plan.quantityInUnits;
    recipeEntry.actualQuantityInUnits += plan.actualQuantityInUnits ?? 0;
    recipeEntry.estimatedCostInBRL += plan.estimatedProductionCostInBRL ?? 0;
    recipeEntry.actualCostInBRL += plan.actualProductionCostInBRL ?? 0;

    periodEntry.recipes.set(plan.recipeId, recipeEntry);

    periodEntry.totals.totalPlans += 1;
    periodEntry.totals.totalPlannedQuantityInUnits += plan.quantityInUnits;
    periodEntry.totals.totalActualQuantityInUnits += plan.actualQuantityInUnits ?? 0;
    periodEntry.totals.totalEstimatedCostInBRL += plan.estimatedProductionCostInBRL ?? 0;
    periodEntry.totals.totalActualCostInBRL += plan.actualProductionCostInBRL ?? 0;
  });

  const summaries: RecipeProductionPeriodSummary[] = Array.from(periodMap.values()).map(
    entry => {
      const recipes = Array.from(entry.recipes.values()).sort(
        (a, b) => b.planCount - a.planCount,
      );

      return {
        periodKey: `production_${entry.periodLabel}`,
        periodLabel: entry.periodLabel,
        periodStart: entry.periodStart,
        periodEnd: entry.periodEnd,
        totals: {
          totalPlans: entry.totals.totalPlans,
          totalPlannedQuantityInUnits: entry.totals.totalPlannedQuantityInUnits,
          totalActualQuantityInUnits: entry.totals.totalActualQuantityInUnits,
          totalEstimatedCostInBRL: entry.totals.totalEstimatedCostInBRL,
          totalActualCostInBRL: entry.totals.totalActualCostInBRL,
          recipes,
        },
      };
    },
  );

  const sorted = sortSummariesByPeriod(summaries);
  return limitPeriods ? sorted.slice(0, limitPeriods) : sorted;
}

function aggregateIngredientConsumption(
  movements: StockMovement[],
  granularity: PeriodGranularity,
  limitPeriods?: number,
): IngredientConsumptionPeriodSummary[] {
  const periodMap = new Map<
    string,
    {
      periodStart: Date;
      periodEnd: Date;
      periodLabel: string;
      products: Map<string, IngredientConsumptionBreakdown>;
      totals: IngredientConsumptionTotals;
    }
  >();

  movements.forEach(movement => {
    const date = movement.performedAt;
    if (!date) {
      return;
    }

    const { key, start, end, label } = resolvePeriod(date, granularity);
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        periodStart: start,
        periodEnd: end,
        periodLabel: label,
        products: new Map(),
        totals: {
          totalMovements: 0,
          totalConsumedInGrams: 0,
          products: [],
        },
      });
    }

    const periodEntry = periodMap.get(key)!;
    const productEntry = periodEntry.products.get(movement.productId) ?? {
      productId: movement.productId,
      quantityInGrams: 0,
      movementCount: 0,
    };

    productEntry.quantityInGrams += movement.quantityInGrams;
    productEntry.movementCount += 1;
    periodEntry.products.set(movement.productId, productEntry);

    periodEntry.totals.totalMovements += 1;
    periodEntry.totals.totalConsumedInGrams += movement.quantityInGrams;
  });

  const summaries: IngredientConsumptionPeriodSummary[] = Array.from(
    periodMap.values(),
  ).map(entry => {
    const products = Array.from(entry.products.values()).sort(
      (a, b) => b.quantityInGrams - a.quantityInGrams,
    );

    return {
      periodKey: `consumption_${entry.periodLabel}`,
      periodLabel: entry.periodLabel,
      periodStart: entry.periodStart,
      periodEnd: entry.periodEnd,
      totals: {
        totalMovements: entry.totals.totalMovements,
        totalConsumedInGrams: entry.totals.totalConsumedInGrams,
        products,
      },
    };
  });

  const sorted = sortSummariesByPeriod(summaries);
  return limitPeriods ? sorted.slice(0, limitPeriods) : sorted;
}

function calculateDivergenceShortage(divergence: ProductionDivergence): number {
  const expected = divergence.expectedQuantityInUnits ?? 0;
  const actual = divergence.actualQuantityInUnits ?? 0;
  return Math.max(0, expected - actual);
}

function aggregateDivergenceUsage(
  divergences: ProductionDivergence[],
  granularity: PeriodGranularity,
  limitPeriods?: number,
): DivergenceUsagePeriodSummary[] {
  const periodMap = new Map<
    string,
    {
      periodStart: Date;
      periodEnd: Date;
      periodLabel: string;
      totals: DivergenceUsageTotals;
      severity: Map<ProductionDivergenceSeverity, DivergenceSeverityBreakdown>;
    }
  >();

  divergences.forEach(divergence => {
    const date = divergence.createdAt;
    if (!date) {
      return;
    }

    const { key, start, end, label } = resolvePeriod(date, granularity);
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        periodStart: start,
        periodEnd: end,
        periodLabel: label,
        totals: {
          totalDivergences: 0,
          totalShortageInUnits: 0,
          severity: [],
        },
        severity: new Map(),
      });
    }

    const periodEntry = periodMap.get(key)!;
    const shortage = calculateDivergenceShortage(divergence);
    const severityEntry = periodEntry.severity.get(divergence.severity) ?? {
      severity: divergence.severity,
      count: 0,
      totalShortageInUnits: 0,
    };

    severityEntry.count += 1;
    severityEntry.totalShortageInUnits += shortage;
    periodEntry.severity.set(divergence.severity, severityEntry);

    periodEntry.totals.totalDivergences += 1;
    periodEntry.totals.totalShortageInUnits += shortage;
  });

  const summaries: DivergenceUsagePeriodSummary[] = Array.from(periodMap.values()).map(
    entry => {
      const severity = Array.from(entry.severity.values()).sort((a, b) => {
        const severityOrder: Record<ProductionDivergenceSeverity, number> = {
          high: 0,
          medium: 1,
          low: 2,
        };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });

      return {
        periodKey: `divergence_${entry.periodLabel}`,
        periodLabel: entry.periodLabel,
        periodStart: entry.periodStart,
        periodEnd: entry.periodEnd,
        totals: {
          totalDivergences: entry.totals.totalDivergences,
          totalShortageInUnits: entry.totals.totalShortageInUnits,
          severity,
        },
      };
    },
  );

  const sorted = sortSummariesByPeriod(summaries);
  return limitPeriods ? sorted.slice(0, limitPeriods) : sorted;
}

function resolveLimitByGranularity(
  granularity: PeriodGranularity,
  explicit?: number,
): number | undefined {
  if (explicit !== undefined) {
    return explicit;
  }

  switch (granularity) {
    case 'day':
      return 7;
    case 'week':
      return 8;
    case 'month':
      return 6;
    default:
      return undefined;
  }
}

export async function getRecipeProductionSummary(
  options: ReportingQueryOptions,
): Promise<RecipeProductionPeriodSummary[]> {
  const { from, to, granularity } = options;
  const plans = await fetchCompletedProductionPlans(from, to);
  return aggregateProductionPlans(
    plans,
    granularity,
    resolveLimitByGranularity(granularity, options.limitPeriods),
  );
}

export async function getIngredientConsumptionSummary(
  options: ReportingQueryOptions,
): Promise<IngredientConsumptionPeriodSummary[]> {
  const { from, to, granularity } = options;
  const movements = await listStockMovements({
    types: ['decrement'],
    from,
    to,
  });
  return aggregateIngredientConsumption(
    movements,
    granularity,
    resolveLimitByGranularity(granularity, options.limitPeriods),
  );
}

export async function getDivergenceUsageSummary(
  options: ReportingQueryOptions,
): Promise<DivergenceUsagePeriodSummary[]> {
  const { from, to, granularity } = options;
  const divergences = await listProductionDivergences({
    types: ['ingredient_shortage'],
    from,
    to,
  });
  return aggregateDivergenceUsage(
    divergences,
    granularity,
    resolveLimitByGranularity(granularity, options.limitPeriods),
  );
}

export type ReportingSummaryBundle = {
  recipeProduction: RecipeProductionPeriodSummary[];
  ingredientConsumption: IngredientConsumptionPeriodSummary[];
  divergenceUsage: DivergenceUsagePeriodSummary[];
};

export async function getReportingSummaryBundle(
  options: ReportingQueryOptions,
): Promise<ReportingSummaryBundle> {
  const [recipeProduction, ingredientConsumption, divergenceUsage] = await Promise.all([
    getRecipeProductionSummary(options),
    getIngredientConsumptionSummary(options),
    getDivergenceUsageSummary(options),
  ]);

  return {
    recipeProduction,
    ingredientConsumption,
    divergenceUsage,
  };
}

export const __private__ = {
  startOfDay,
  endOfDay,
  startOfWeek,
  startOfMonth,
  resolvePeriod,
  aggregateProductionPlans,
  aggregateIngredientConsumption,
  aggregateDivergenceUsage,
  calculateDivergenceShortage,
};
