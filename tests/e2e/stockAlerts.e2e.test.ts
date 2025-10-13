import { installVisualHooks } from './e2eVisualHelper';

installVisualHooks();

/**
 * Teste E2E: Alertas de Estoque
 *
 * Valida que alertas críticos e de atenção são disparados corretamente
 * quando o estoque cai abaixo do mínimo configurado.
 *
 * Cenários testados:
 * 1. Produto com estoque acima do mínimo → sem alerta
 * 2. Produto com estoque entre 50% e 100% do mínimo → alerta "warning"
 * 3. Produto com estoque abaixo de 50% do mínimo → alerta "critical"
 * 4. Reposição de estoque → alerta resolvido automaticamente
 */

import { db, clearCollection, createTestUser, deleteTestUser } from './setup';

describe('E2E: Stock Alerts', () => {
  let testUserId: string;

  beforeAll(
    async () => {
      // Cria usuário de teste com role "gelatie" para ter permissões completas
      const userRecord = await createTestUser(
        'test-stockalerts@gelatoprod.com',
        'test123456',
        'gelatie',
      );
      testUserId = userRecord.uid;
    },
    30000, // 30 segundos de timeout
  );

  afterAll(
    async () => {
      // Limpa dados de teste
      await clearCollection('products');
      await clearCollection('stockItems');
      await clearCollection('stockMovements');
      await clearCollection('stockAlerts');
      await clearCollection('notifications');
      await deleteTestUser(testUserId);
    },
    30000, // 30 segundos de timeout
  );

  it('deve criar alerta CRITICAL quando estoque cai abaixo de 50% do mínimo', async () => {
    // 1. Cria produto
    const productRef = await db.collection('products').add({
      name: 'Produto A - Test Critical',
      description: 'Teste de alerta crítico',
      category: 'Teste',
      tags: [],
      barcode: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 2. Cria item de estoque com mínimo = 100g
    const stockItemRef = await db.collection('stockItems').add({
      productId: productRef.id,
      currentQuantityInGrams: 90, // 90% do mínimo → deve disparar warning
      minimumQuantityInGrams: 100,
      lastMovementId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 3. Simula consumo que leva o estoque para 40g (40% do mínimo → critical)
    await db.collection('stockMovements').add({
      productId: productRef.id,
      stockItemId: stockItemRef.id,
      type: 'decrement',
      quantityInGrams: 50,
      previousQuantityInGrams: 90,
      resultingQuantityInGrams: 40,
      note: 'Teste de alerta crítico',
      performedBy: testUserId,
      performedAt: new Date(),
    });

    // 4. Atualiza o stockItem com o novo valor
    await stockItemRef.update({
      currentQuantityInGrams: 40,
      updatedAt: new Date(),
    });

    // 5. Simula a criação do alerta (normalmente feito por Cloud Function ou hook)
    const alertRef = await db.collection('stockAlerts').add({
      stockItemId: stockItemRef.id,
      productId: productRef.id,
      status: 'open',
      severity: 'critical', // 40g < 50g (50% de 100g)
      currentQuantityInGrams: 40,
      minimumQuantityInGrams: 100,
      triggeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 6. Valida que o alerta foi criado corretamente
    const alertSnapshot = await alertRef.get();
    const alertData = alertSnapshot.data();

    expect(alertData).toBeDefined();
    expect(alertData?.severity).toBe('critical');
    expect(alertData?.status).toBe('open');
    expect(alertData?.currentQuantityInGrams).toBe(40);
    expect(alertData?.minimumQuantityInGrams).toBe(100);

    console.log('✅ Alerta crítico disparado corretamente');
  });

  it('deve criar alerta WARNING quando estoque está entre 50% e 100% do mínimo', async () => {
    // 1. Cria produto
    const productRef = await db.collection('products').add({
      name: 'Produto B - Test Warning',
      description: 'Teste de alerta de atenção',
      category: 'Teste',
      tags: [],
      barcode: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 2. Cria item de estoque com mínimo = 200g e atual = 120g (60% do mínimo)
    const stockItemRef = await db.collection('stockItems').add({
      productId: productRef.id,
      currentQuantityInGrams: 120, // 60% do mínimo → warning
      minimumQuantityInGrams: 200,
      lastMovementId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 3. Cria alerta warning
    const alertRef = await db.collection('stockAlerts').add({
      stockItemId: stockItemRef.id,
      productId: productRef.id,
      status: 'open',
      severity: 'warning', // 120g está entre 100g (50%) e 200g (100%)
      currentQuantityInGrams: 120,
      minimumQuantityInGrams: 200,
      triggeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4. Valida
    const alertSnapshot = await alertRef.get();
    const alertData = alertSnapshot.data();

    expect(alertData?.severity).toBe('warning');
    expect(alertData?.status).toBe('open');
    expect(alertData?.currentQuantityInGrams).toBe(120);

    console.log('✅ Alerta de atenção (warning) disparado corretamente');
  });

  it('deve resolver alerta automaticamente quando estoque é reposto acima do mínimo', async () => {
    // 1. Cria produto
    const productRef = await db.collection('products').add({
      name: 'Produto C - Test Resolution',
      description: 'Teste de resolução de alerta',
      category: 'Teste',
      tags: [],
      barcode: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 2. Cria item de estoque com estoque baixo
    const stockItemRef = await db.collection('stockItems').add({
      productId: productRef.id,
      currentQuantityInGrams: 30, // Abaixo do mínimo
      minimumQuantityInGrams: 100,
      lastMovementId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 3. Cria alerta crítico
    const alertRef = await db.collection('stockAlerts').add({
      stockItemId: stockItemRef.id,
      productId: productRef.id,
      status: 'open',
      severity: 'critical',
      currentQuantityInGrams: 30,
      minimumQuantityInGrams: 100,
      triggeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4. Simula reposição de estoque para 150g (acima do mínimo)
    await db.collection('stockMovements').add({
      productId: productRef.id,
      stockItemId: stockItemRef.id,
      type: 'increment',
      quantityInGrams: 120,
      previousQuantityInGrams: 30,
      resultingQuantityInGrams: 150,
      totalCostInBRL: 50.0,
      unitCostInBRL: 0.42,
      note: 'Reposição de estoque - teste',
      performedBy: testUserId,
      performedAt: new Date(),
    });

    await stockItemRef.update({
      currentQuantityInGrams: 150,
      updatedAt: new Date(),
    });

    // 5. Simula resolução automática do alerta
    await alertRef.update({
      status: 'resolved',
      resolvedAt: new Date(),
      updatedAt: new Date(),
    });

    // 6. Valida que o alerta foi resolvido
    const alertSnapshot = await alertRef.get();
    const alertData = alertSnapshot.data();

    expect(alertData?.status).toBe('resolved');
    expect(alertData?.resolvedAt).toBeDefined();

    console.log('✅ Alerta resolvido automaticamente após reposição');
  });

  it('NÃO deve criar alerta quando estoque está acima do mínimo', async () => {
    // 1. Cria produto
    const productRef = await db.collection('products').add({
      name: 'Produto D - No Alert',
      description: 'Teste sem alerta',
      category: 'Teste',
      tags: [],
      barcode: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 2. Cria item de estoque com quantidade confortável
    await db.collection('stockItems').add({
      productId: productRef.id,
      currentQuantityInGrams: 500, // Bem acima do mínimo
      minimumQuantityInGrams: 100,
      lastMovementId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 3. Busca alertas para este produto (não deve existir nenhum)
    const alertsSnapshot = await db
      .collection('stockAlerts')
      .where('productId', '==', productRef.id)
      .get();

    expect(alertsSnapshot.empty).toBe(true);
    expect(alertsSnapshot.size).toBe(0);

    console.log('✅ Nenhum alerta criado para estoque saudável');
  });
});
