/**
 * Teste E2E: Notificações
 *
 * Valida criação, leitura e limpeza de notificações do sistema.
 *
 * Cenários testados:
 * 1. Criar notificação crítica
 * 2. Marcar notificação como lida
 * 3. Filtrar notificações por status
 * 4. Limpar notificações antigas
 * 5. Notificações de múltiplos tipos (alerta, produção, sistema)
 */

import { db, clearCollection, createTestUser, deleteTestUser } from './setup';

describe('E2E: Notifications', () => {
  let testUserId: string;

  beforeAll(async () => {
    const userRecord = await createTestUser(
      'test-notifications@gelatoprod.com',
      'test123456',
      'gelatie',
    );
    testUserId = userRecord.uid;
  }, 30000);

  afterAll(async () => {
    await clearCollection('notifications');
    await deleteTestUser(testUserId);
  }, 30000);

  it('deve criar notificação crítica de alerta de estoque', async () => {
    // 1. Criar notificação
    const notificacaoRef = await db.collection('notifications').add({
      userId: testUserId,
      type: 'stock_alert',
      severity: 'critical',
      title: 'Estoque Crítico',
      message: 'Produto X está com apenas 20g (mínimo: 100g)',
      relatedEntityType: 'stockAlert',
      relatedEntityId: 'alert-123',
      status: 'unread',
      createdAt: new Date(),
      readAt: null,
      updatedAt: new Date(),
    });

    // 2. Validar criação
    const notificacao = (await notificacaoRef.get()).data();

    expect(notificacao).toBeDefined();
    expect(notificacao?.type).toBe('stock_alert');
    expect(notificacao?.severity).toBe('critical');
    expect(notificacao?.status).toBe('unread');
    expect(notificacao?.userId).toBe(testUserId);
    expect(notificacao?.readAt).toBeNull();

    console.log('✅ Notificação crítica criada: stock_alert');
  });

  it('deve marcar notificação como lida', async () => {
    // 1. Criar notificação não lida
    const notificacaoRef = await db.collection('notifications').add({
      userId: testUserId,
      type: 'production_completed',
      severity: 'info',
      title: 'Produção Concluída',
      message: 'Lote PROD-001 finalizado com sucesso',
      relatedEntityType: 'productionPlan',
      relatedEntityId: 'plan-123',
      status: 'unread',
      createdAt: new Date(),
      readAt: null,
      updatedAt: new Date(),
    });

    // 2. Marcar como lida
    const readAt = new Date();
    await notificacaoRef.update({
      status: 'read',
      readAt: readAt,
      updatedAt: new Date(),
    });

    // 3. Validar atualização
    const notificacaoLida = (await notificacaoRef.get()).data();

    expect(notificacaoLida?.status).toBe('read');
    expect(notificacaoLida?.readAt).toBeDefined();
    // Converter Firestore Timestamp para Date para comparação
    const readAtFromDb = notificacaoLida?.readAt?.toDate?.() || notificacaoLida?.readAt;
    expect(readAtFromDb).toBeInstanceOf(Date);

    console.log('✅ Notificação marcada como lida');
  });

  it('deve filtrar notificações por status (não lidas)', async () => {
    // 1. Criar múltiplas notificações
    await db.collection('notifications').add({
      userId: testUserId,
      type: 'system',
      severity: 'info',
      title: 'Notificação 1',
      message: 'Não lida',
      relatedEntityType: null,
      relatedEntityId: null,
      status: 'unread',
      createdAt: new Date(),
      readAt: null,
      updatedAt: new Date(),
    });

    await db.collection('notifications').add({
      userId: testUserId,
      type: 'system',
      severity: 'info',
      title: 'Notificação 2',
      message: 'Lida',
      relatedEntityType: null,
      relatedEntityId: null,
      status: 'read',
      createdAt: new Date(),
      readAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection('notifications').add({
      userId: testUserId,
      type: 'system',
      severity: 'info',
      title: 'Notificação 3',
      message: 'Não lida',
      relatedEntityType: null,
      relatedEntityId: null,
      status: 'unread',
      createdAt: new Date(),
      readAt: null,
      updatedAt: new Date(),
    });

    // 2. Buscar apenas não lidas
    const naoLidasSnapshot = await db
      .collection('notifications')
      .where('userId', '==', testUserId)
      .where('status', '==', 'unread')
      .get();

    // 3. Validar filtro
    expect(naoLidasSnapshot.size).toBeGreaterThanOrEqual(2);
    naoLidasSnapshot.forEach(doc => {
      const data = doc.data();
      expect(data.status).toBe('unread');
      expect(data.readAt).toBeNull();
    });

    console.log(
      `✅ Filtro de não lidas funcionando: ${naoLidasSnapshot.size} encontradas`,
    );
  });

  it('deve limpar notificações antigas (mais de 30 dias)', async () => {
    // 1. Criar notificação antiga (simulando data no passado)
    const dataAntiga = new Date();
    dataAntiga.setDate(dataAntiga.getDate() - 35); // 35 dias atrás

    const notificacaoAntigaRef = await db.collection('notifications').add({
      userId: testUserId,
      type: 'system',
      severity: 'info',
      title: 'Notificação Antiga',
      message: 'Criada há 35 dias',
      relatedEntityType: null,
      relatedEntityId: null,
      status: 'read',
      createdAt: dataAntiga,
      readAt: dataAntiga,
      updatedAt: dataAntiga,
    });

    // 2. Criar notificação recente
    const notificacaoRecenteRef = await db.collection('notifications').add({
      userId: testUserId,
      type: 'system',
      severity: 'info',
      title: 'Notificação Recente',
      message: 'Criada hoje',
      relatedEntityType: null,
      relatedEntityId: null,
      status: 'read',
      createdAt: new Date(),
      readAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Simular limpeza de notificações antigas (>30 dias)
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 30);

    // Buscar todas as notificações do usuário e filtrar manualmente
    const todasNotificacoesSnapshot = await db
      .collection('notifications')
      .where('userId', '==', testUserId)
      .get();

    const notificacoesAntigas = todasNotificacoesSnapshot.docs.filter(doc => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.() || data.createdAt;
      return createdAt < dataLimite;
    });

    // 4. Validar que notificação antiga foi encontrada
    expect(notificacoesAntigas.length).toBeGreaterThanOrEqual(1);

    // 5. Deletar notificação antiga
    await notificacaoAntigaRef.delete();

    // 6. Verificar que foi deletada
    const deletadaSnapshot = await notificacaoAntigaRef.get();
    expect(deletadaSnapshot.exists).toBe(false);

    // 7. Verificar que notificação recente ainda existe
    const recenteSnapshot = await notificacaoRecenteRef.get();
    expect(recenteSnapshot.exists).toBe(true);

    console.log('✅ Notificações antigas limpas, recentes preservadas');
  });

  it('deve criar notificações de múltiplos tipos', async () => {
    // 1. Notificação de alerta de estoque
    const alertaRef = await db.collection('notifications').add({
      userId: testUserId,
      type: 'stock_alert',
      severity: 'warning',
      title: 'Alerta de Estoque',
      message: 'Produto Y abaixo do mínimo',
      relatedEntityType: 'stockAlert',
      relatedEntityId: 'alert-456',
      status: 'unread',
      createdAt: new Date(),
      readAt: null,
      updatedAt: new Date(),
    });

    // 2. Notificação de produção
    const producaoRef = await db.collection('notifications').add({
      userId: testUserId,
      type: 'production_scheduled',
      severity: 'info',
      title: 'Produção Agendada',
      message: 'Lote PROD-006 agendado para amanhã',
      relatedEntityType: 'productionPlan',
      relatedEntityId: 'plan-456',
      status: 'unread',
      createdAt: new Date(),
      readAt: null,
      updatedAt: new Date(),
    });

    // 3. Notificação do sistema
    const sistemaRef = await db.collection('notifications').add({
      userId: testUserId,
      type: 'system',
      severity: 'info',
      title: 'Atualização do Sistema',
      message: 'Nova versão disponível',
      relatedEntityType: null,
      relatedEntityId: null,
      status: 'unread',
      createdAt: new Date(),
      readAt: null,
      updatedAt: new Date(),
    });

    // 4. Validar tipos
    const alerta = (await alertaRef.get()).data();
    const producao = (await producaoRef.get()).data();
    const sistema = (await sistemaRef.get()).data();

    expect(alerta?.type).toBe('stock_alert');
    expect(producao?.type).toBe('production_scheduled');
    expect(sistema?.type).toBe('system');

    expect(alerta?.severity).toBe('warning');
    expect(producao?.severity).toBe('info');
    expect(sistema?.severity).toBe('info');

    console.log(
      '✅ Notificações de múltiplos tipos criadas: stock_alert, production, system',
    );
  });

  it('deve ordenar notificações por data (mais recentes primeiro)', async () => {
    // 0. Limpar notificações anteriores do usuário para garantir teste limpo
    const oldNotifications = await db
      .collection('notifications')
      .where('userId', '==', testUserId)
      .get();
    await Promise.all(oldNotifications.docs.map(doc => doc.ref.delete()));

    // 1. Criar notificações em momentos diferentes
    const data1 = new Date();
    data1.setHours(data1.getHours() - 2); // 2 horas atrás

    const data2 = new Date();
    data2.setHours(data2.getHours() - 1); // 1 hora atrás

    const data3 = new Date(); // Agora

    await db.collection('notifications').add({
      userId: testUserId,
      type: 'system',
      severity: 'info',
      title: 'Primeira',
      message: 'Há 2 horas',
      relatedEntityType: null,
      relatedEntityId: null,
      status: 'unread',
      createdAt: data1,
      readAt: null,
      updatedAt: data1,
    });

    await db.collection('notifications').add({
      userId: testUserId,
      type: 'system',
      severity: 'info',
      title: 'Segunda',
      message: 'Há 1 hora',
      relatedEntityType: null,
      relatedEntityId: null,
      status: 'unread',
      createdAt: data2,
      readAt: null,
      updatedAt: data2,
    });

    await db.collection('notifications').add({
      userId: testUserId,
      type: 'system',
      severity: 'info',
      title: 'Terceira',
      message: 'Agora',
      relatedEntityType: null,
      relatedEntityId: null,
      status: 'unread',
      createdAt: data3,
      readAt: null,
      updatedAt: data3,
    });

    // 2. Buscar todas as notificações do usuário
    const notificacoesSnapshot = await db
      .collection('notifications')
      .where('userId', '==', testUserId)
      .get();

    // 3. Ordenar manualmente por createdAt decrescente
    const notificacoes = notificacoesSnapshot.docs
      .map(doc => doc.data())
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || a.createdAt;
        const dateB = b.createdAt?.toDate?.() || b.createdAt;
        return dateB - dateA; // Decrescente (mais recente primeiro)
      })
      .slice(0, 3); // Pegar apenas as 3 primeiras

    expect(notificacoes[0].title).toBe('Terceira'); // Mais recente
    expect(notificacoes[1].title).toBe('Segunda');
    expect(notificacoes[2].title).toBe('Primeira'); // Mais antiga

    console.log('✅ Notificações ordenadas corretamente por data (desc)');
  });
});
