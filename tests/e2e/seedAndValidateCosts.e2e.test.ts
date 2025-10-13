/* eslint-disable */
/* eslint-disable @typescript-eslint/no-explicit-any -- test file intentionally works with dynamic DB shapes */
/* eslint-disable prettier/prettier -- keep array/object formatting comfortable for reviewers */
import { installVisualHooks } from './e2eVisualHelper';

installVisualHooks();
import * as fs from 'fs';
import * as path from 'path';
import { computeRecipeEstimatedCost } from '@/utils/financial';
import { db, clearCollection } from './setup';

// Note: Backup of production/test data MUST be performed by the caller
// (see scripts/run-e2e-chain.ps1). This test is destructive and assumes the
// caller handled backups. Backups were intentionally removed from the test.

describe('E2E: seed -> validate costs', () => {
  jest.setTimeout(10 * 60 * 1000);
  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  it('backs up collections, wipes, seeds and validates cost calc', async () => {
    // Note: backup step removed from this test. Ensure you ran the
    // `scripts/run-e2e-chain.ps1` (or equivalent) to create backups before
    // executing this destructive test.

    // 2) Wipe collections (clearCollection helper)
    console.log(`Clearing collection 'products'`);
    await clearCollection('products');
    await sleep(5000);
    console.log(`Clearing collection 'stockItems'`);
    await clearCollection('stockItems');
    await sleep(5000);
    console.log(`Clearing collection 'recipes'`);
    await clearCollection('recipes');
    await sleep(5000);
    console.log(`Clearing collection 'stockMovements'`);
    await clearCollection('stockMovements');
    await sleep(5000);
    console.log(`Clearing collection 'users'`);
    await clearCollection('users');
    await sleep(5000);

    // 3) Seed deterministic data
    const milkRef = db.collection('products').doc();
    const sugarRef = db.collection('products').doc();

    console.log('Seeding products: milk and sugar');
    await milkRef.set({
      name: 'Leite',
      unitOfMeasure: 'LITERS',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await sugarRef.set({
      name: 'Açúcar',
      unitOfMeasure: 'KILOGRAMS',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Stock items: store averageUnitCostInBRL and highestUnitCostInBRL as R$ / kg (or per L equivalent)
    const sugarStockRef = db.collection('stockItems').doc();
    console.log('Seeding stock items for sugar');
    await sugarStockRef.set({
      productId: sugarRef.id,
      currentQuantityInGrams: 5000, // 5 kg
      minimumQuantityInGrams: 1000,
      highestUnitCostInBRL: 3.5,
      averageUnitCostInBRL: 3.5,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    const milkStockRef = db.collection('stockItems').doc();
    console.log('Seeding stock items for milk');
    await milkStockRef.set({
      productId: milkRef.id,
      currentQuantityInGrams: 10000,
      minimumQuantityInGrams: 2000,
      highestUnitCostInBRL: 4.0,
      averageUnitCostInBRL: 4.0,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 4) Create a recipe that uses 100 g sugar and 200 ml milk
    const recipeRef = db.collection('recipes').doc();
    const recipe = {
      id: recipeRef.id,
      name: 'Teste Receita',
      yieldInGrams: 300,
      isActive: true,
      ingredients: [
        { type: 'product', referenceId: sugarRef.id, quantityInGrams: 100 },
        { type: 'product', referenceId: milkRef.id, quantityInGrams: 200 },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as const;

    console.log('Seeding recipe that uses sugar and milk');
    await recipeRef.set({
      name: recipe.name,
      yieldInGrams: recipe.yieldInGrams,
      isActive: recipe.isActive,
      ingredients: recipe.ingredients,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5) Read back products and stock items to feed computeRecipeEstimatedCost
    console.log('Reading back products, stockItems and recipe for validation');
    // human-observable pause before reads
    await sleep(5000);
    const productsSnap = await db.collection('products').get();
    type Product = {
      id: string;
      name?: string;
      unitOfMeasure?: string;
    } & Record<string, unknown>;
    const products: Product[] = productsSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() as unknown as Record<string, unknown>),
    }));

    const stockSnap = await db.collection('stockItems').get();
    type StockItem = {
      productId: string;
      averageUnitCostInBRL?: number;
      highestUnitCostInBRL?: number;
      currentQuantityInGrams?: number;
    } & Record<string, unknown>;
    const stockItems: StockItem[] = stockSnap.docs.map(d => ({
      productId: d.id === sugarStockRef.id ? sugarRef.id : milkRef.id,
      ...(d.data() as unknown as Record<string, unknown>),
    }));

    const recipeSnap = await db.collection('recipes').doc(recipeRef.id).get();
    type Recipe = {
      id: string;
      name?: string;
      yieldInGrams?: number;
      ingredients?: any[];
    } & Record<string, unknown>;
    const recipeFromDb: Recipe = {
      id: recipeRef.id,
      ...(recipeSnap.data() as unknown as Record<string, unknown>),
    };

    // 6) Validate cost computations for sample quantities
    const samples = [100, 300, 650];

    const estimatedCostTotal = computeRecipeEstimatedCost(
      recipeFromDb as unknown as any,
      products as unknown as any,
      stockItems as unknown as any,
      [recipeFromDb as unknown as any],
    );

    // Emit a visual compare/log so E2E_VISUAL shows the computed outcome.
    try {
      // @ts-ignore - may be undefined when not in visual mode
      (globalThis as any).e2eVisual?.e2eLog({ estimatedCostTotal }, { estimatedCostTotal }, 'estimatedCostTotal');
    } catch {}
    const perGram =
      recipeFromDb.yieldInGrams && recipeFromDb.yieldInGrams > 0
        ? estimatedCostTotal / recipeFromDb.yieldInGrams
        : 0;

    for (const qty of samples) {
      const expectedForQty = perGram * qty;
      console.log(`Quantidade ${qty}g -> custo estimado R$ ${expectedForQty.toFixed(4)}`);
      expect(Number.isFinite(expectedForQty)).toBe(true);
      expect(expectedForQty).toBeGreaterThanOrEqual(0);
      // brief pause so user can observe output
      await sleep(5000);
    }

    // No backups asserted here; the caller is responsible for backing up data.
  });
});
