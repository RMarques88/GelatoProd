/**
 * Teste E2E: Overrides de Acessórios em Margem Financeira
 *
 * Objetivo:
 *  - Garantir que custos de acessórios globais sejam aplicados quando não há override
 *  - Garantir que overrides por receita substituem totalmente a lista global
 *  - Verificar impacto direto na margem calculada
 *  - Verificar que remover (reverter) overrides restaura cálculo global
 *
 * Estratégia:
 *  1. Criar produtos base (copo UNITS, cobertura GRAMS) com custos médios
 *  2. Definir pricingSettings com acessórios globais (1 copo + 5g cobertura / 100g)
 *  3. Criar receita e plano de produção concluído (1000g) dentro da janela da simulação
 *  4. Calcular margem (sem override) => revenue - accessoriesCost
 *  5. Gravar override da receita (2 copos apenas, removendo cobertura)
 *  6. Recalcular margem e validar diferença
 *  7. Remover override (delete da chave) e verificar retorno ao valor inicial
 */

import { db, clearCollection, createTestUser, deleteTestUser } from './setup';

interface PricingSettingsDoc {
  sellingPricePer100gInBRL?: number;
  extraCostPer100gInBRL?: number;
  accessories?: {
    items?: Array<{ productId: string; defaultQtyPerPortion: number }>;
    overridesByRecipeId?: Record<
      string,
      Array<{ productId: string; defaultQtyPerPortion: number }>
    >;
  };
  updatedAt?: Date;
}

describe('E2E: Accessories Overrides -> Margem Financeira', () => {
  let testUserId: string;
  let recipeId: string;
  let cupProductId: string;
  let toppingProductId: string;

  beforeAll(async () => {
    const user = await createTestUser(
      'test-accessories@gelatoprod.com',
      'test123456',
      'gelatie',
    );
    testUserId = user.uid;

    // Limpa coleções essenciais (não remove outras que possam interferir em permissões)
    await clearCollection('products');
    await clearCollection('recipes');
    await clearCollection('productionPlans');
    await clearCollection('pricingSettings');
  }, 30000);

  afterAll(async () => {
    await clearCollection('products');
    await clearCollection('recipes');
    await clearCollection('productionPlans');
    await clearCollection('pricingSettings');
    await deleteTestUser(testUserId);
  }, 30000);

  it('aplica globais, override e revert corretamente', async () => {
    // 1. Produtos base
    const cupRef = await db.collection('products').add({
      name: 'Copo',
      unitOfMeasure: 'UNITS',
      isActive: true,
      averageUnitCostInBRL: 0.5,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });
    cupProductId = cupRef.id;

    const toppingRef = await db.collection('products').add({
      name: 'Cobertura',
      unitOfMeasure: 'GRAMS',
      isActive: true,
      averageUnitCostInBRL: 0.02, // 0.02 por grama
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });
    toppingProductId = toppingRef.id;

    // 2. pricingSettings globais
    const pricingRef = db.collection('pricingSettings').doc('global');
    const globalSettings: PricingSettingsDoc = {
      sellingPricePer100gInBRL: 10, // receita: 1000g => 10 * 10 = 100 de receita
      accessories: {
        items: [
          { productId: cupProductId, defaultQtyPerPortion: 1 },
          { productId: toppingProductId, defaultQtyPerPortion: 5 },
        ],
      },
      updatedAt: new Date(),
    };
    await pricingRef.set(globalSettings);

    // 3. Criar receita e plano concluído
    const recipeRef = await db.collection('recipes').add({
      name: 'Gelato Base',
      yieldInGrams: 1000,
      ingredients: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });
    recipeId = recipeRef.id;

    const _planRef = await db.collection('productionPlans').add({
      recipeId: recipeId,
      quantityInGrams: 1000,
      unitOfMeasure: 'GRAMS',
      code: 'PLAN-ACC-1',
      status: 'completed',
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Helper para recomputar margem diretamente via util server-side simplificada
    async function computeMargin(): Promise<number> {
      // Releitura dos dados relevantes
      const settingsSnap = await pricingRef.get();
      const settings = settingsSnap.data() as PricingSettingsDoc | undefined;
      if (!settings) return 0;

      // Revenue
      const revenue = (1000 / 100) * (settings.sellingPricePer100gInBRL ?? 0);
      const portions = 1000 / 100;

      // Determinar lista de acessórios efetiva
      const overrides = settings.accessories?.overridesByRecipeId?.[recipeId];
      const effective =
        overrides && overrides.length > 0
          ? overrides
          : (settings.accessories?.items ?? []);

      // Mapear custos de produtos (consulta simples)
      const productsSnap = await db.collection('products').get();
      const productCosts: Record<string, { unit: string; cost: number }> = {};
      productsSnap.docs.forEach(d => {
        const p = d.data();
        productCosts[d.id] = { unit: p.unitOfMeasure, cost: p.averageUnitCostInBRL ?? 0 };
      });

      let accessoriesCost = 0;
      for (const acc of effective) {
        const pc = productCosts[acc.productId];
        if (!pc) continue;
        if (pc.unit === 'UNITS') {
          accessoriesCost += acc.defaultQtyPerPortion * pc.cost * portions;
        } else {
          // grams (ou heurística 1ml=1g)
          accessoriesCost += acc.defaultQtyPerPortion * pc.cost * portions;
        }
      }
      // Sem outros custos nesse teste
      return revenue - accessoriesCost;
    }

    const marginGlobal = await computeMargin();
    // Globais: portions = 10
    // Copo: 1 * 0.5 * 10 = 5
    // Cobertura: 5 * 0.02 * 10 = 1
    // Receita: 100 => margem = 94
    expect(marginGlobal).toBeCloseTo(94, 2);

    // 5. Aplicar override (2 copos, sem cobertura)
    await pricingRef.update({
      accessories: {
        items: globalSettings.accessories?.items, // mantém globais
        overridesByRecipeId: {
          [recipeId]: [{ productId: cupProductId, defaultQtyPerPortion: 2 }],
        },
      },
      updatedAt: new Date(),
    });

    const marginOverride = await computeMargin();
    // Override: 2 * 0.5 * 10 = 10 => margem 100 - 10 = 90
    expect(marginOverride).toBeCloseTo(90, 2);

    // 6. Reverter override (exclui chave)
    await pricingRef.update({
      accessories: {
        items: globalSettings.accessories?.items,
        overridesByRecipeId: {},
      },
      updatedAt: new Date(),
    });
    const marginReverted = await computeMargin();
    expect(marginReverted).toBeCloseTo(94, 2);
  }, 30000);
});
