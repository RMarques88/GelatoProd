import type { UnitOfMeasure } from '@/domain';

// Minimal shapes extracted for calculation (kept generic for reuse in tests)
export interface FinancialProductLike {
  id: string;
  unitOfMeasure?: UnitOfMeasure; // default GRAMS for weight/volume, UNITS for count
}

export interface FinancialStockItemLike {
  productId: string;
  averageUnitCostInBRL?: number | null;
  highestUnitCostInBRL?: number | null;
}

export interface FinancialPlanLike {
  recipeId: string;
  unitOfMeasure: UnitOfMeasure; // we only meaningfully handle 'GRAMS' for revenue here
  quantityInUnits: number; // planned quantity
  actualQuantityInUnits?: number | null; // realized quantity (fallback to planned)
  actualProductionCostInBRL?: number | null; // realized cost
  completedAt?: Date | null;
  scheduledFor?: Date | null; // used if completedAt missing
}

export interface AccessoriesItemLike {
  productId: string;
  defaultQtyPerPortion: number; // per 100g
}

export interface PricingSettingsLike {
  sellingPricePer100gInBRL?: number;
  extraCostPer100gInBRL?: number; // legacy extra cost per 100g
  accessories?: {
    items?: AccessoriesItemLike[];
    overridesByRecipeId?: Record<string, AccessoriesItemLike[] | undefined>;
  };
}

export interface FinancialSummaryResult {
  revenue: number;
  cost: number;
  margin: number;
}

function qtyToGrams(unit: UnitOfMeasure | undefined, qty: number): number {
  switch (unit) {
    case 'GRAMS':
      return qty;
    case 'KILOGRAMS':
      return qty * 1000;
    case 'MILLILITERS':
      return qty; // heuristic 1ml ≈ 1g
    case 'LITERS':
      return qty * 1000;
    default:
      return qty; // UNITS shouldn't reach here (guarded before usage)
  }
}

export function computeFinancialSummary(
  plans: FinancialPlanLike[],
  products: FinancialProductLike[],
  stockItems: FinancialStockItemLike[],
  settings: PricingSettingsLike | undefined,
  from: Date,
  to: Date,
): FinancialSummaryResult {
  if (!plans.length) return { revenue: 0, cost: 0, margin: 0 };

  const productsById = new Map(products.map(p => [p.id, p] as const));
  const stockByProductId = new Map(stockItems.map(s => [s.productId, s] as const));
  const accessoriesSettings = settings?.accessories;
  const pricePer100g = settings?.sellingPricePer100gInBRL ?? 0;
  const extraPer100g = settings?.extraCostPer100gInBRL ?? 0;

  const filtered = plans.filter(plan => {
    const ref = plan.completedAt ?? plan.scheduledFor;
    if (!ref) return false;
    return ref >= from && ref <= to;
  });

  return filtered.reduce<FinancialSummaryResult>(
    (acc, plan) => {
      const qty = plan.actualQuantityInUnits ?? plan.quantityInUnits;
      const revenue = plan.unitOfMeasure === 'GRAMS' ? (qty / 100) * pricePer100g : 0;
      const extraCostLegacy =
        plan.unitOfMeasure === 'GRAMS' ? (qty / 100) * extraPer100g : 0;

      // Accessories cost (override precedence)
      let accessoriesCost = 0;
      if (plan.unitOfMeasure === 'GRAMS' && accessoriesSettings) {
        const recipeSpecific = accessoriesSettings.overridesByRecipeId?.[plan.recipeId];
        const sourceItems =
          recipeSpecific && recipeSpecific.length > 0
            ? recipeSpecific
            : (accessoriesSettings.items ?? []);
        if (sourceItems.length) {
          const portions = qty / 100; // 100g base
          for (const item of sourceItems) {
            const product = productsById.get(item.productId);
            if (!product) continue;
            const stock = stockByProductId.get(item.productId);
            const unitCost =
              stock?.averageUnitCostInBRL ?? stock?.highestUnitCostInBRL ?? 0;
            if (!Number.isFinite(unitCost) || unitCost <= 0) continue;
            if ((product.unitOfMeasure ?? 'UNITS') === 'UNITS') {
              accessoriesCost += item.defaultQtyPerPortion * unitCost * portions;
            } else {
              const grams = qtyToGrams(
                product.unitOfMeasure ?? 'GRAMS',
                item.defaultQtyPerPortion,
              );
              accessoriesCost += grams * unitCost * portions;
            }
          }
        }
      }

      const productionCost = plan.actualProductionCostInBRL ?? 0;
      const marginRaw = revenue - productionCost - extraCostLegacy - accessoriesCost;

      acc.revenue += Number.isFinite(revenue) ? revenue : 0;
      acc.cost += Number.isFinite(productionCost) ? productionCost : 0;
      acc.margin += marginRaw > 0 ? marginRaw : 0;
      return acc;
    },
    { revenue: 0, cost: 0, margin: 0 },
  );
}

// Helper specifically for testing accessory precedence
export function computeAccessoriesCostForPlan(
  plan: Pick<
    FinancialPlanLike,
    'recipeId' | 'unitOfMeasure' | 'quantityInUnits' | 'actualQuantityInUnits'
  >,
  products: FinancialProductLike[],
  stockItems: FinancialStockItemLike[],
  settings: PricingSettingsLike | undefined,
): number {
  const productsById = new Map(products.map(p => [p.id, p] as const));
  const stockByProductId = new Map(stockItems.map(s => [s.productId, s] as const));
  const accessoriesSettings = settings?.accessories;
  if (!accessoriesSettings) return 0;
  if (plan.unitOfMeasure !== 'GRAMS') return 0;
  const qty = plan.actualQuantityInUnits ?? plan.quantityInUnits;
  const recipeSpecific = accessoriesSettings.overridesByRecipeId?.[plan.recipeId];
  const sourceItems =
    recipeSpecific && recipeSpecific.length > 0
      ? recipeSpecific
      : (accessoriesSettings.items ?? []);
  if (!sourceItems.length) return 0;
  const portions = qty / 100;
  let total = 0;
  for (const item of sourceItems) {
    const product = productsById.get(item.productId);
    if (!product) continue;
    const stock = stockByProductId.get(item.productId);
    const unitCost = stock?.averageUnitCostInBRL ?? stock?.highestUnitCostInBRL ?? 0;
    if (!Number.isFinite(unitCost) || unitCost <= 0) continue;
    if ((product.unitOfMeasure ?? 'UNITS') === 'UNITS') {
      total += item.defaultQtyPerPortion * unitCost * portions;
    } else {
      const grams = qtyToGrams(
        product.unitOfMeasure ?? 'GRAMS',
        item.defaultQtyPerPortion,
      );
      total += grams * unitCost * portions;
    }
  }
  return total;
}
