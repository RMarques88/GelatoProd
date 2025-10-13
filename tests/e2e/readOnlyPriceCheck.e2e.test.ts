/*
 * Read-only E2E-style verification
 *
 * - Reads products and stock items from Firestore (no writes).
 * - For each product that has a stock item, computes expected costs for sample
 *   quantities [100g, 300g, 650g] using the convention that stored unit costs
 *   are R$ per kilogram (R$/kg) and therefore need to be divided by 1000 to
 *   get per-gram (or per-ml) values. Products with unitOfMeasure === 'UNITS'
 *   are treated as per-unit (no division).
 * - Prints a short report and fails the test if any obvious mismatch is found
 *   (for example negative or NaN values). This is strictly read-only.
 */

import { listProducts } from '../../src/services/firestore/productsService';
import { listStockItems } from '../../src/services/firestore/stockService';

// Sample quantities to validate (in grams or ml). For UNITS these are treated
// as "units" (so 1 unit -> 1).
const SAMPLE_QUANTITIES = [100, 300, 650];

function perGramFromKg(kgValue: number | null | undefined) {
  if (kgValue == null || !Number.isFinite(kgValue)) return null;
  return kgValue / 1000; // R$ per gram or per-ml
}

describe('Read-only price interpretation check', () => {
  it('computes expected costs from stored stock prices (read-only)', async () => {
    // Use the service functions where possible to normalize fields (these are
    // simple reads that don't mutate anything).

    let products: Awaited<ReturnType<typeof listProducts>>;
    let stockItems: Awaited<ReturnType<typeof listStockItems>>;
    try {
      products = await listProducts({ includeInactive: true });
      stockItems = await listStockItems({ includeArchived: true });
    } catch (err: unknown) {
      // If Firestore permissions are insufficient, treat this read-only check as
      // skip-able: environments running tests without a service account should
      // not fail the whole E2E run for this diagnostic. Log a clear message
      // so CI or local devs know why the test was skipped.
      const code = (err as any)?.code ?? (err as Error)?.message ?? String(err);
      console.log('Failed to read Firestore during read-only price check:', err);
      if (typeof code === 'string' && code.includes('permission-denied')) {
        console.warn(
          'Skipping read-only price check: Firestore permission-denied. Provide a service account with read access to enable this diagnostic.',
        );
        // Mark the test as intentionally skipped by returning early (no throw).
        return;
      }

      // Re-throw other unexpected errors so they fail the test run.
      throw new Error(
        'Unable to read Firestore. Ensure firebase-service-account.json is present, the service account has Firestore read permissions, and you have network access from this environment.',
      );
    }

    // Map stock items by productId for quick lookup
    const stockByProduct = new Map(stockItems.map(item => [item.productId, item]));

    type UnitCheck =
      | { quantity: number; expectedPerDisplayedUnit: number; expectedTotal: number }
      | { quantity: number; perGram: number | null; expectedTotal: number | null }
      | { note: 'no-stock'; message: string };

    const report: Array<{
      productId: string;
      productName?: string;
      unit?: string;
      checks: UnitCheck[];
    }> = [];

    for (const p of products) {
      const stock = stockByProduct.get(p.id);
      const checks: UnitCheck[] = [];

      if (!stock) {
        checks.push({ note: 'no-stock', message: 'No stock item for product — skip' });
        report.push({
          productId: p.id,
          productName: p.name,
          unit: p.unitOfMeasure,
          checks,
        });
        continue;
      }

      const avgKg = stock.averageUnitCostInBRL ?? 0; // stored as R$ / kg (or per-unit for UNITS)

      for (const qty of SAMPLE_QUANTITIES) {
        if (p.unitOfMeasure === 'UNITS') {
          // For units, assume stored average is per unit price
          const perUnit = avgKg; // R$ per unit
          const expected = perUnit * (qty === 0 ? 0 : qty); // if qty large this is expected per-qty
          checks.push({
            quantity: qty,
            expectedPerDisplayedUnit: perUnit,
            expectedTotal: expected,
          });
        } else {
          const perGram = perGramFromKg(avgKg);
          const expected = perGram != null ? perGram * qty : null;
          checks.push({ quantity: qty, perGram, expectedTotal: expected });
        }
      }

      report.push({
        productId: p.id,
        productName: p.name,
        unit: p.unitOfMeasure,
        checks,
      });
    }

    // Print a compact report — developers can inspect the output when running
    // the test locally. Keep assertions minimal: ensure computations produced
    // finite non-negative numbers where applicable.
    let failures = 0;

    for (const item of report) {
      // Log product header

      console.log(`Product ${item.productId} - ${item.productName} (${item.unit})`);
      for (const c of item.checks) {
        console.log('  ', c);
        if ('expectedTotal' in c && c.expectedTotal != null) {
          if (!Number.isFinite(c.expectedTotal) || c.expectedTotal < 0) {
            failures++;
          }
        }
      }
    }

    expect(failures).toBe(0);
  }, 30000);
});
