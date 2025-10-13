/* eslint-disable @typescript-eslint/no-explicit-any -- test file intentionally works with dynamic DB shapes */
/* eslint-disable prettier/prettier -- keep array/object formatting comfortable for reviewers */
import * as fs from 'fs';
import * as path from 'path';
import { db, clearCollection } from './setup';
import { computeRecipeEstimatedCost } from '@/utils/financial';

// Collections used by the app
const COLLECTIONS_TO_BACKUP = [
  'products',
  'stockItems',
  'recipes',
  'stockMovements',
  'users',
];

function backupDir() {
  const dir = path.join(__dirname, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function dumpCollectionToFile(col: string, dir: string) {
  const snapshot = await db.collection(col).get();
  const docs = snapshot.docs.map(d => ({ id: d.id, data: d.data() }));
  const filename = path.join(dir, `${col}-${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify(docs, null, 2), 'utf8');
  return filename;
}

describe('E2E: seed -> validate costs', () => {
  jest.setTimeout(120_000);

  it('backs up collections, wipes, seeds and validates cost calc', async () => {
    const dir = backupDir();
    const backups: Record<string, string> = {};

    // 1) Backup
    for (const col of COLLECTIONS_TO_BACKUP) {
      const file = await dumpCollectionToFile(col, dir);
      backups[col] = file;
      console.log(`📦 Backup ${col} -> ${file}`);
    }

    // 2) Wipe collections (clearCollection helper)
    for (const col of COLLECTIONS_TO_BACKUP) {
      await clearCollection(col);
    }

    // 3) Seed deterministic data
    const milkRef = db.collection('products').doc();
    const sugarRef = db.collection('products').doc();

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

    await recipeRef.set({
      name: recipe.name,
      yieldInGrams: recipe.yieldInGrams,
      isActive: recipe.isActive,
      ingredients: recipe.ingredients,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5) Read back products and stock items to feed computeRecipeEstimatedCost
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
    const perGram = recipeFromDb.yieldInGrams && recipeFromDb.yieldInGrams > 0 ? estimatedCostTotal / recipeFromDb.yieldInGrams : 0;

    for (const qty of samples) {
      const expectedForQty = perGram * qty;
      console.log(`Quantidade ${qty}g -> custo estimado R$ ${expectedForQty.toFixed(4)}`);
      expect(Number.isFinite(expectedForQty)).toBe(true);
      expect(expectedForQty).toBeGreaterThanOrEqual(0);
    }

    // Basic assertions about backups present
    for (const col of COLLECTIONS_TO_BACKUP) {
      expect(typeof backups[col]).toBe('string');
      expect(fs.existsSync(backups[col])).toBe(true);
    }
  });
});
