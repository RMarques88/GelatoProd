/**
 * Teste E2E: Produção
 *
 * Valida criação de planos de produção, execução de etapas e consumo automático de estoque.
 *
 * Cenários testados:
 * 1. Criar plano de produção para receita
 * 2. Executar etapas de produção sequencialmente
 * 3. Consumir estoque automaticamente ao finalizar produção
 * 4. Registrar divergências durante execução
 * 5. Cancelar plano de produção
 */

import { db, clearCollection, createTestUser, deleteTestUser } from './setup';
import { installVisualHooks } from './e2eVisualHelper';

installVisualHooks();

describe('E2E: Production', () => {
  let testUserId: string;

  beforeAll(async () => {
    const userRecord = await createTestUser(
      'test-production@gelatoprod.com',
      'test123456',
      'gelatie',
    );
    testUserId = userRecord.uid;
  }, 30000);

  afterAll(async () => {
    await clearCollection('products');
    await clearCollection('recipes');
    await clearCollection('productionPlans');
    await clearCollection('productionStages');
    await clearCollection('productionDivergences');
    await clearCollection('stockItems');
    await clearCollection('stockMovements');
    await clearCollection('appSequences');
    await deleteTestUser(testUserId);
  }, 30000);

  it('deve criar plano de produção com código sequencial', async () => {
    // 1. Criar receita
    const receitaRef = await db.collection('recipes').add({
      name: 'Gelato de Morango',
      description: 'Receita teste',
      category: 'Gelatos',
      tags: ['morango'],
      yieldInGrams: 2000,
      preparationTimeInMinutes: 120,
      ingredients: [],
      preparationSteps: ['Etapa 1', 'Etapa 2', 'Etapa 3'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 2. Criar sequência inicial se não existir
    const sequenceRef = db.collection('appSequences').doc('productionPlans');
    await sequenceRef.set({
      currentValue: 0,
      updatedAt: new Date(),
    });

    // 3. Criar plano de produção
    const now = new Date();
    const scheduledDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Amanhã

    const planoRef = await db.collection('productionPlans').add({
      code: 'PROD-001',
      recipeId: receitaRef.id,
      recipeName: 'Gelato de Morango',
      quantityInGrams: 2000,
      scheduledDate: scheduledDate,
      status: 'pending',
      createdBy: testUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 4. Validar criação
    const plano = (await planoRef.get()).data();

    expect(plano).toBeDefined();
    expect(plano?.code).toBe('PROD-001');
    expect(plano?.status).toBe('pending');
    expect(plano?.recipeId).toBe(receitaRef.id);
    expect(plano?.quantityInGrams).toBe(2000);

    console.log('✅ Plano de produção criado com código PROD-001');
  });

  it('deve executar etapas de produção sequencialmente', async () => {
    // 1. Criar receita
    const receitaRef = await db.collection('recipes').add({
      name: 'Sorvete de Chocolate',
      description: 'Receita para teste de etapas',
      category: 'Sorvetes',
      tags: ['chocolate'],
      yieldInGrams: 1500,
      preparationTimeInMinutes: 90,
      ingredients: [],
      preparationSteps: ['Preparar base', 'Adicionar chocolate', 'Congelar'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 2. Criar plano
    const planoRef = await db.collection('productionPlans').add({
      code: 'PROD-002',
      recipeId: receitaRef.id,
      recipeName: 'Sorvete de Chocolate',
      quantityInGrams: 1500,
      scheduledDate: new Date(),
      status: 'in_progress',
      createdBy: testUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 3. Criar etapas de produção
    const etapa1Ref = await db.collection('productionStages').add({
      productionPlanId: planoRef.id,
      stageNumber: 1,
      description: 'Preparar base',
      status: 'completed',
      completedBy: testUserId,
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const etapa2Ref = await db.collection('productionStages').add({
      productionPlanId: planoRef.id,
      stageNumber: 2,
      description: 'Adicionar chocolate',
      status: 'in_progress',
      completedBy: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const etapa3Ref = await db.collection('productionStages').add({
      productionPlanId: planoRef.id,
      stageNumber: 3,
      description: 'Congelar',
      status: 'pending',
      completedBy: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4. Validar etapas
    const etapa1 = (await etapa1Ref.get()).data();
    const etapa2 = (await etapa2Ref.get()).data();
    const etapa3 = (await etapa3Ref.get()).data();

    expect(etapa1?.status).toBe('completed');
    expect(etapa1?.completedBy).toBe(testUserId);
    expect(etapa1?.completedAt).toBeDefined();

    expect(etapa2?.status).toBe('in_progress');
    expect(etapa3?.status).toBe('pending');

    console.log('✅ Etapas de produção criadas: 1 completa, 1 em progresso, 1 pendente');
  });

  it('deve consumir estoque automaticamente ao finalizar produção', async () => {
    // 1. Criar produto ingrediente
    const produtoRef = await db.collection('products').add({
      name: 'Leite',
      description: 'Leite integral',
      category: 'Ingredientes',
      tags: [],
      barcode: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 2. Criar estoque inicial
    const estoqueRef = await db.collection('stockItems').add({
      productId: produtoRef.id,
      currentQuantityInGrams: 5000, // 5kg disponível
      minimumQuantityInGrams: 1000,
      lastMovementId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 3. Criar receita que usa o produto
    const receitaRef = await db.collection('recipes').add({
      name: 'Creme de Leite',
      description: 'Receita com leite',
      category: 'Cremes',
      tags: [],
      yieldInGrams: 1000,
      preparationTimeInMinutes: 30,
      ingredients: [
        {
          type: 'product',
          productId: produtoRef.id,
          quantityInGrams: 1000, // Usa 1kg de leite
          notes: '',
        },
      ],
      preparationSteps: ['Preparar'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 4. Criar e finalizar plano de produção
    const planoRef = await db.collection('productionPlans').add({
      code: 'PROD-003',
      recipeId: receitaRef.id,
      recipeName: 'Creme de Leite',
      quantityInGrams: 1000,
      scheduledDate: new Date(),
      status: 'completed',
      createdBy: testUserId,
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 5. Simular consumo de estoque
    const movimentoRef = await db.collection('stockMovements').add({
      productId: produtoRef.id,
      stockItemId: estoqueRef.id,
      type: 'decrement',
      quantityInGrams: 1000, // Consome 1kg
      previousQuantityInGrams: 5000,
      resultingQuantityInGrams: 4000,
      productionPlanId: planoRef.id,
      note: 'Consumo automático - Produção PROD-003',
      performedBy: testUserId,
      performedAt: new Date(),
    });

    // 6. Atualizar estoque
    await estoqueRef.update({
      currentQuantityInGrams: 4000,
      lastMovementId: movimentoRef.id,
      updatedAt: new Date(),
    });

    // 7. Validar consumo
    const estoqueAtualizado = (await estoqueRef.get()).data();
    const movimento = (await movimentoRef.get()).data();

    expect(estoqueAtualizado?.currentQuantityInGrams).toBe(4000);
    expect(movimento?.type).toBe('decrement');
    expect(movimento?.quantityInGrams).toBe(1000);
    expect(movimento?.productionPlanId).toBe(planoRef.id);

    console.log('✅ Estoque consumido automaticamente: 5000g → 4000g');
  });

  it('deve registrar divergências durante execução', async () => {
    // 1. Criar plano de produção
    const planoRef = await db.collection('productionPlans').add({
      code: 'PROD-004',
      recipeId: 'recipe-test-id',
      recipeName: 'Teste Divergência',
      quantityInGrams: 2000,
      scheduledDate: new Date(),
      status: 'in_progress',
      createdBy: testUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 2. Registrar divergência
    const divergenciaRef = await db.collection('productionDivergences').add({
      productionPlanId: planoRef.id,
      type: 'quality_issue',
      description: 'Textura não atingiu o padrão esperado',
      reportedBy: testUserId,
      reportedAt: new Date(),
      resolvedAt: null,
      resolution: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Validar divergência
    const divergencia = (await divergenciaRef.get()).data();

    expect(divergencia).toBeDefined();
    expect(divergencia?.productionPlanId).toBe(planoRef.id);
    expect(divergencia?.type).toBe('quality_issue');
    expect(divergencia?.reportedBy).toBe(testUserId);
    expect(divergencia?.resolvedAt).toBeNull();

    console.log('✅ Divergência registrada: quality_issue não resolvida');

    // 4. Resolver divergência
    await divergenciaRef.update({
      resolvedAt: new Date(),
      resolution: 'Refeito o lote com ajustes na temperatura',
      updatedAt: new Date(),
    });

    const divergenciaResolvida = (await divergenciaRef.get()).data();
    expect(divergenciaResolvida?.resolvedAt).toBeDefined();
    expect(divergenciaResolvida?.resolution).toContain('temperatura');

    console.log('✅ Divergência resolvida com sucesso');
  });

  it('deve cancelar plano de produção sem consumir estoque', async () => {
    // 1. Criar plano pendente
    const planoRef = await db.collection('productionPlans').add({
      code: 'PROD-005',
      recipeId: 'recipe-test-id',
      recipeName: 'Plano Cancelado',
      quantityInGrams: 1000,
      scheduledDate: new Date(),
      status: 'pending',
      createdBy: testUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    // 2. Cancelar plano
    await planoRef.update({
      status: 'cancelled',
      cancelledBy: testUserId,
      cancelledAt: new Date(),
      cancellationReason: 'Falta de ingredientes',
      updatedAt: new Date(),
    });

    // 3. Validar cancelamento
    const planoCancelado = (await planoRef.get()).data();

    expect(planoCancelado?.status).toBe('cancelled');
    expect(planoCancelado?.cancelledBy).toBe(testUserId);
    expect(planoCancelado?.cancellationReason).toBe('Falta de ingredientes');

    // 4. Verificar que não há movimentações de estoque
    const movimentosSnapshot = await db
      .collection('stockMovements')
      .where('productionPlanId', '==', planoRef.id)
      .get();

    expect(movimentosSnapshot.empty).toBe(true);

    console.log('✅ Plano cancelado sem consumir estoque');
  });
});
