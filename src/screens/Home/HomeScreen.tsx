import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import {
  useNotifications,
  useProductionPlans,
  useProducts,
  useRecipes,
  useStockAlerts,
  useStockItems,
} from '@/hooks/data';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useAuth } from '@/hooks/useAuth';
import { logError } from '@/utils/logger';
import type {
  NotificationStatus,
  ProductionStatus,
  UnitOfMeasure,
  UserRole,
} from '@/domain';

type ProductionStatusActionMap = Partial<
  Record<ProductionStatus, { label: string; next: ProductionStatus }>
>;

const productionStatusLabels: Record<ProductionStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  in_progress: 'Em produção',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const productionStatusActions: ProductionStatusActionMap = {
  draft: {
    label: 'Agendar produção',
    next: 'scheduled',
  },
  scheduled: {
    label: 'Iniciar produção',
    next: 'in_progress',
  },
  in_progress: {
    label: 'Concluir produção',
    next: 'completed',
  },
};

const roleLabels: Record<UserRole, string> = {
  gelatie: 'Equipe de balcão',
  manager: 'Gerência',
  admin: 'Administração',
};

export function HomeScreen() {
  const { user, signOut, isLoading } = useAuth();
  const authorization = useAuthorization(user);
  const {
    products,
    isLoading: isLoadingProducts,
    error: productsError,
    create: createProduct,
  } = useProducts({ suspense: true });
  const {
    recipes,
    isLoading: isLoadingRecipes,
    error: recipesError,
  } = useRecipes({ suspense: true });
  const {
    stockItems,
    isLoading: isLoadingStock,
    error: stockError,
  } = useStockItems({ suspense: true });
  const {
    alerts,
    isLoading: isLoadingAlerts,
    error: alertsError,
    acknowledge: acknowledgeAlert,
    resolve: resolveAlert,
  } = useStockAlerts({ suspense: true, status: ['open', 'acknowledged'] });
  const {
    notifications,
    isLoading: isLoadingNotifications,
    error: notificationsError,
    markAsRead,
    markAllAsRead,
    unreadCount,
  } = useNotifications({ suspense: true, limit: 10 });
  const {
    plans,
    isLoading: isLoadingPlans,
    error: plansError,
    create: createPlan,
    updateStatus: updatePlanStatus,
    archive: archivePlan,
  } = useProductionPlans({
    suspense: true,
    status: ['scheduled', 'in_progress'],
    limit: 10,
  });

  const roleLabel = useMemo(
    () => (user ? roleLabels[user.role] : 'Sem acesso'),
    [user?.role],
  );
  const userDisplayName = useMemo(() => user?.name ?? 'Gelatiê', [user?.name]);

  const [newProductName, setNewProductName] = useState('');
  const [newProductWeight, setNewProductWeight] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [newPlanRecipeId, setNewPlanRecipeId] = useState('');
  const [newPlanRecipeName, setNewPlanRecipeName] = useState('');
  const [newPlanDate, setNewPlanDate] = useState('');
  const [newPlanQuantity, setNewPlanQuantity] = useState('');
  const [newPlanUnit, setNewPlanUnit] = useState<UnitOfMeasure>('GRAMS');
  const [newPlanNotes, setNewPlanNotes] = useState('');
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
  const [planFormError, setPlanFormError] = useState<string | null>(null);
  const [isMarkingNotifications, setIsMarkingNotifications] = useState(false);

  const activeProducts = useMemo(
    () => products.filter(product => product.isActive),
    [products],
  );

  const criticalAlerts = useMemo(
    () => alerts.filter(alert => alert.severity === 'critical'),
    [alerts],
  );

  const sortedPlans = useMemo(
    () =>
      [...plans].sort(
        (first, second) => first.scheduledFor.getTime() - second.scheduledFor.getTime(),
      ),
    [plans],
  );

  const inProgressPlans = useMemo(
    () => plans.filter(plan => plan.status === 'in_progress'),
    [plans],
  );

  const displayedPlans = useMemo(() => sortedPlans.slice(0, 5), [sortedPlans]);

  const handleCreateProduct = async () => {
    if (!authorization.canManageProducts) {
      setFormError('Você não tem permissão para cadastrar produtos.');
      return;
    }

    const weight = Number(newProductWeight.replace(',', '.'));
    const price = Number(newProductPrice.replace(',', '.'));

    if (!newProductName.trim()) {
      setFormError('Informe o nome do produto.');
      return;
    }

    if (Number.isNaN(weight) || weight <= 0) {
      setFormError('Peso unitário inválido.');
      return;
    }

    if (Number.isNaN(price) || price <= 0) {
      setFormError('Preço por grama inválido.');
      return;
    }

    try {
      setFormError(null);
      setIsSubmittingProduct(true);
      await createProduct({
        name: newProductName.trim(),
        unitWeightInGrams: weight,
        pricePerGram: price,
        tags: [],
      });
      setNewProductName('');
      setNewProductWeight('');
      setNewProductPrice('');
    } catch (creationError) {
      setFormError(
        creationError instanceof Error
          ? creationError.message
          : 'Não foi possível criar o produto.',
      );
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const handleMarkAllNotifications = async () => {
    if (!authorization.canManageNotifications) {
      return;
    }

    try {
      setIsMarkingNotifications(true);
      await markAllAsRead();
    } catch (notificationError) {
      logError(notificationError, 'home.notifications.markAll');
    } finally {
      setIsMarkingNotifications(false);
    }
  };

  const handleCreatePlan = async () => {
    if (!authorization.canScheduleProduction) {
      setPlanFormError('Você não tem permissão para agendar produções.');
      return;
    }

    const quantity = Number(newPlanQuantity.replace(',', '.'));
    const scheduledDate = new Date(`${newPlanDate}T00:00:00`);

    if (!newPlanRecipeId.trim()) {
      setPlanFormError('Informe o ID da receita.');
      return;
    }

    if (!newPlanDate.trim() || Number.isNaN(scheduledDate.getTime())) {
      setPlanFormError('Informe uma data válida no formato AAAA-MM-DD.');
      return;
    }

    if (Number.isNaN(quantity) || quantity <= 0) {
      setPlanFormError('Informe uma quantidade válida.');
      return;
    }

    try {
      setPlanFormError(null);
      setIsSubmittingPlan(true);
      await createPlan({
        recipeId: newPlanRecipeId.trim(),
        recipeName: newPlanRecipeName.trim() || `Receita ${newPlanRecipeId.trim()}`,
        scheduledFor: scheduledDate,
        quantityInUnits: quantity,
        unitOfMeasure: newPlanUnit,
        notes: newPlanNotes.trim() ? newPlanNotes.trim() : undefined,
        requestedBy: user?.id ?? 'system',
      });

      setNewPlanRecipeId('');
      setNewPlanRecipeName('');
      setNewPlanDate('');
      setNewPlanQuantity('');
      setNewPlanUnit('GRAMS');
      setNewPlanNotes('');
    } catch (creationError) {
      logError(creationError, 'home.production.create');
      setPlanFormError(
        creationError instanceof Error
          ? creationError.message
          : 'Não foi possível agendar a produção.',
      );
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  const handleToggleUnit = (unit: UnitOfMeasure) => {
    setNewPlanUnit(unit);
  };

  const handleAdvancePlan = async (planId: string, currentStatus: ProductionStatus) => {
    if (!authorization.canAdvanceProduction) {
      return;
    }

    const action = productionStatusActions[currentStatus];

    if (!action) {
      return;
    }

    try {
      await updatePlanStatus(planId, action.next);
    } catch (statusError) {
      logError(statusError, 'home.production.advance');
    }
  };

  const handleCancelPlan = async (planId: string) => {
    if (!authorization.canCancelProduction) {
      return;
    }

    try {
      await archivePlan(planId);
    } catch (archiveError) {
      logError(archiveError, 'home.production.cancel');
    }
  };

  const handleAcknowledgeAlertPress = async (alertId: string) => {
    if (!authorization.canAcknowledgeAlerts) {
      return;
    }

    try {
      await acknowledgeAlert(alertId);
    } catch (ackError) {
      logError(ackError, 'home.alerts.acknowledge');
    }
  };

  const handleResolveAlertPress = async (alertId: string) => {
    if (!authorization.canResolveAlerts) {
      return;
    }

    try {
      await resolveAlert(alertId);
    } catch (resolveError) {
      logError(resolveError, 'home.alerts.resolve');
    }
  };

  const handleNotificationPress = async (
    notificationId: string,
    status: NotificationStatus,
  ) => {
    if (!authorization.canMarkNotificationRead) {
      return;
    }

    if (status === 'read') {
      return;
    }

    try {
      await markAsRead(notificationId);
    } catch (markError) {
      logError(markError, 'home.notifications.markSingle');
    }
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>Painel da Gelateria</Text>
            <Text style={styles.subtitle}>Acompanhe os cadastros em tempo real.</Text>
            <View style={styles.userMetaRow}>
              <Text style={styles.userGreeting}>Olá, {userDisplayName}</Text>
              {user ? (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{roleLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={signOut}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Sair</Text>
          </Pressable>
        </View>

        <View style={styles.metricsRow}>
          <MetricCard
            label="Produtos ativos"
            value={isLoadingProducts ? undefined : activeProducts.length}
            isLoading={isLoadingProducts}
          />
          <MetricCard
            label="Alertas de estoque"
            value={isLoadingAlerts ? undefined : alerts.length}
            isLoading={isLoadingAlerts}
            highlight={criticalAlerts.length > 0}
          />
          <MetricCard
            label="Produções abertas"
            value={isLoadingPlans ? undefined : plans.length}
            isLoading={isLoadingPlans}
            highlight={inProgressPlans.length > 0}
          />
          <MetricCard
            label="Notificações pendentes"
            value={isLoadingNotifications ? undefined : unreadCount}
            isLoading={isLoadingNotifications}
            highlight={unreadCount > 0}
          />
        </View>

        <Section title="Alertas de estoque" error={alertsError?.message}>
          {isLoadingAlerts ? (
            <ActivityIndicator color="#4E9F3D" />
          ) : alerts.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum alerta ativo no momento.</Text>
          ) : (
            alerts.map(alert => (
              <View key={alert.id} style={styles.listItem}>
                <View>
                  <Text style={styles.listItemTitle}>Produto #{alert.productId}</Text>
                  <Text style={styles.listItemSubtitle}>
                    {alert.currentQuantityInGrams}g disponíveis · mínimo{' '}
                    {alert.minimumQuantityInGrams}g
                  </Text>
                </View>
                <View style={styles.alertActionsWrapper}>
                  <View
                    style={[
                      styles.alertBadge,
                      alert.severity === 'critical' && styles.alertBadgeCritical,
                      alert.status === 'acknowledged' && styles.alertBadgeAcknowledged,
                    ]}
                  >
                    <Text style={styles.alertBadgeText}>
                      {alert.severity === 'critical' ? 'Crítico' : 'Alerta'}
                    </Text>
                  </View>
                  <View style={styles.alertActions}>
                    {alert.status !== 'acknowledged' && authorization.canAcknowledgeAlerts ? (
                      <Pressable
                        onPress={() => handleAcknowledgeAlertPress(alert.id)}
                        style={({ pressed }) => [
                          styles.secondaryButton,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text style={styles.secondaryButtonText}>Reconhecer</Text>
                      </Pressable>
                    ) : null}
                    {authorization.canResolveAlerts ? (
                      <Pressable
                        onPress={() => handleResolveAlertPress(alert.id)}
                        style={({ pressed }) => [
                          styles.secondaryButton,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text style={styles.secondaryButtonText}>Resolver</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            ))
          )}
        </Section>

        <Section
          title="Notificações"
          error={notificationsError?.message}
          action={
            notifications.length > 0 && authorization.canManageNotifications ? (
              <Pressable
                onPress={handleMarkAllNotifications}
                disabled={isMarkingNotifications}
                style={({ pressed }) => [
                  styles.linkButton,
                  (pressed || isMarkingNotifications) && styles.linkButtonDisabled,
                ]}
              >
                {isMarkingNotifications ? (
                  <ActivityIndicator color="#1F2937" />
                ) : (
                  <Text style={styles.linkButtonText}>Marcar todas como lidas</Text>
                )}
              </Pressable>
            ) : null
          }
        >
          {isLoadingNotifications ? (
            <ActivityIndicator color="#4E9F3D" />
          ) : notifications.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma notificação por aqui.</Text>
          ) : (
            notifications.slice(0, 6).map(notification => (
              <Pressable
                key={notification.id}
                onPress={() =>
                  handleNotificationPress(notification.id, notification.status)
                }
                style={({ pressed }) => [
                  styles.notificationCard,
                  notification.status === 'unread' && styles.notificationCardUnread,
                  pressed && styles.notificationPressed,
                ]}
              >
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                <Text style={styles.notificationMessage}>{notification.message}</Text>
                <Text style={styles.notificationMeta}>
                  {notification.createdAt.toLocaleDateString('pt-BR')} ·{' '}
                  {notification.status === 'unread' ? 'Novo' : 'Lido'}
                </Text>
              </Pressable>
            ))
          )}
        </Section>

        <Section title="Produção" error={plansError?.message}>
          {isLoadingPlans ? (
            <ActivityIndicator color="#4E9F3D" />
          ) : displayedPlans.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma produção agendada.</Text>
          ) : (
            displayedPlans.map(plan => {
              const action = productionStatusActions[plan.status];
              return (
                <View key={plan.id} style={styles.listItem}>
                  <View style={styles.planInfo}>
                    <Text style={styles.listItemTitle}>{plan.recipeName}</Text>
                    <Text style={styles.listItemSubtitle}>
                      {plan.quantityInUnits} {plan.unitOfMeasure === 'GRAMS' ? 'g' : 'un'}{' '}
                      · {plan.scheduledFor.toLocaleDateString('pt-BR')}
                    </Text>
                    {plan.notes ? (
                      <Text style={styles.planNotes}>{plan.notes}</Text>
                    ) : null}
                  </View>
                  <View style={styles.planActionsWrapper}>
                    <View
                      style={[
                        styles.statusBadge,
                        plan.status === 'scheduled' && styles.statusBadgeInfo,
                        plan.status === 'in_progress' && styles.statusBadgeWarning,
                        plan.status === 'completed' && styles.statusBadgeSuccess,
                        plan.status === 'cancelled' && styles.statusBadgeInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          plan.status === 'scheduled' && styles.statusBadgeTextInfo,
                          plan.status === 'in_progress' && styles.statusBadgeTextWarning,
                          plan.status === 'cancelled' && styles.statusBadgeTextInactive,
                        ]}
                      >
                        {productionStatusLabels[plan.status]}
                      </Text>
                    </View>
                    <View style={styles.planActions}>
                      {action && authorization.canAdvanceProduction ? (
                        <Pressable
                          onPress={() => handleAdvancePlan(plan.id, plan.status)}
                          style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <Text style={styles.secondaryButtonText}>{action.label}</Text>
                        </Pressable>
                      ) : null}
                      {plan.status !== 'completed' &&
                      plan.status !== 'cancelled' &&
                      authorization.canCancelProduction ? (
                        <Pressable
                          onPress={() => handleCancelPlan(plan.id)}
                          style={({ pressed }) => [
                            styles.secondaryButtonDanger,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <Text style={styles.secondaryButtonDangerText}>Cancelar</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })
          )}

          {authorization.canScheduleProduction ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Agendar produção</Text>
              <TextInput
                placeholder="ID da receita"
                value={newPlanRecipeId}
                onChangeText={setNewPlanRecipeId}
                style={styles.input}
              />
              <TextInput
                placeholder="Nome da receita (opcional)"
                value={newPlanRecipeName}
                onChangeText={setNewPlanRecipeName}
                style={styles.input}
              />
              <View style={styles.formRow}>
                <TextInput
                  placeholder="Data (AAAA-MM-DD)"
                  value={newPlanDate}
                  onChangeText={setNewPlanDate}
                  style={[styles.input, styles.inputHalf]}
                />
                <TextInput
                  placeholder="Quantidade"
                  keyboardType="numeric"
                  value={newPlanQuantity}
                  onChangeText={setNewPlanQuantity}
                  style={[styles.input, styles.inputHalf]}
                />
              </View>
              <View style={styles.unitToggleRow}>
                <Pressable
                  onPress={() => handleToggleUnit('GRAMS')}
                  style={({ pressed }) => [
                    styles.unitOption,
                    newPlanUnit === 'GRAMS' && styles.unitOptionActive,
                    pressed && styles.unitOptionPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.unitOptionText,
                      newPlanUnit === 'GRAMS' && styles.unitOptionTextActive,
                    ]}
                  >
                    Gramas
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleToggleUnit('UNITS')}
                  style={({ pressed }) => [
                    styles.unitOption,
                    newPlanUnit === 'UNITS' && styles.unitOptionActive,
                    pressed && styles.unitOptionPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.unitOptionText,
                      newPlanUnit === 'UNITS' && styles.unitOptionTextActive,
                    ]}
                  >
                    Unidades
                  </Text>
                </Pressable>
              </View>
              <TextInput
                placeholder="Observações (opcional)"
                value={newPlanNotes}
                onChangeText={setNewPlanNotes}
                style={[styles.input, styles.textArea]}
                multiline
              />
              {planFormError ? (
                <Text style={styles.errorText}>{planFormError}</Text>
              ) : null}
              <Pressable
                onPress={handleCreatePlan}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}
                disabled={isSubmittingPlan}
              >
                {isSubmittingPlan ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Agendar produção</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <PermissionNotice message="Você precisa ser gerente para agendar produções." />
          )}
        </Section>

        <Section title="Produtos" error={productsError?.message}>
          {isLoadingProducts ? (
            <ActivityIndicator color="#4E9F3D" />
          ) : products.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum produto cadastrado até o momento.</Text>
          ) : (
            products.slice(0, 5).map(product => (
              <View key={product.id} style={styles.listItem}>
                <View>
                  <Text style={styles.listItemTitle}>{product.name}</Text>
                  <Text style={styles.listItemSubtitle}>
                    {product.unitWeightInGrams}g · R${' '}
                    {product.pricePerGram.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    /g
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    !product.isActive && styles.statusBadgeInactive,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {product.isActive ? 'Ativo' : 'Inativo'}
                  </Text>
                </View>
              </View>
            ))
          )}

          {authorization.canManageProducts ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Cadastrar produto rápido</Text>
              <TextInput
                placeholder="Nome do produto"
                value={newProductName}
                onChangeText={setNewProductName}
                style={styles.input}
              />
              <View style={styles.formRow}>
                <TextInput
                  placeholder="Peso (g)"
                  keyboardType="numeric"
                  value={newProductWeight}
                  onChangeText={setNewProductWeight}
                  style={[styles.input, styles.inputHalf]}
                />
                <TextInput
                  placeholder="Preço/g"
                  keyboardType="numeric"
                  value={newProductPrice}
                  onChangeText={setNewProductPrice}
                  style={[styles.input, styles.inputHalf]}
                />
              </View>
              {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
              <Pressable
                onPress={handleCreateProduct}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}
                disabled={isSubmittingProduct}
              >
                {isSubmittingProduct ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Salvar produto</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <PermissionNotice message="Somente a gerência pode cadastrar novos produtos." />
          )}
        </Section>

        <Section title="Receitas" error={recipesError?.message}>
          {isLoadingRecipes ? (
            <ActivityIndicator color="#4E9F3D" />
          ) : recipes.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma receita registrada ainda.</Text>
          ) : (
            recipes.slice(0, 5).map(recipe => (
              <View key={recipe.id} style={styles.listItem}>
                <View>
                  <Text style={styles.listItemTitle}>{recipe.name}</Text>
                  <Text style={styles.listItemSubtitle}>
                    Rendimento: {recipe.yieldInGrams}g • {recipe.ingredients.length}{' '}
                    ingredientes
                  </Text>
                </View>
              </View>
            ))
          )}
        </Section>

        <Section title="Estoque" error={stockError?.message}>
          {isLoadingStock ? (
            <ActivityIndicator color="#4E9F3D" />
          ) : stockItems.length === 0 ? (
            <Text style={styles.emptyText}>
              Cadastre produtos para começar o controle.
            </Text>
          ) : (
            stockItems.slice(0, 5).map(item => (
              <View key={item.id} style={styles.listItem}>
                <View>
                  <Text style={styles.listItemTitle}>Produto #{item.productId}</Text>
                  <Text style={styles.listItemSubtitle}>
                    {item.currentQuantityInGrams}g disponíveis · mínimo{' '}
                    {item.minimumQuantityInGrams}g
                  </Text>
                </View>
                {item.currentQuantityInGrams <= item.minimumQuantityInGrams ? (
                  <View style={[styles.statusBadge, styles.statusBadgeAlert]}>
                    <Text style={styles.statusBadgeText}>Crítico</Text>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </Section>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  subtitle: {
    fontSize: 16,
    color: '#5E5F61',
    marginTop: 4,
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  userGreeting: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  roleBadge: {
    backgroundColor: '#E0E7FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#E53E3E',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  metricLabel: {
    fontSize: 13,
    color: '#5E5F61',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1B1E',
  },
  metricHighlight: {
    color: '#E53E3E',
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  sectionError: {
    fontSize: 13,
    color: '#E53E3E',
  },
  linkButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(31, 41, 55, 0.08)',
  },
  linkButtonDisabled: {
    opacity: 0.6,
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  listItemSubtitle: {
    fontSize: 13,
    color: '#5E5F61',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#5E5F61',
  },
  notificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  notificationCardUnread: {
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  notificationPressed: {
    opacity: 0.8,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  notificationMessage: {
    fontSize: 14,
    color: '#374151',
  },
  notificationMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
  },
  statusBadgeInactive: {
    backgroundColor: '#E2E8F0',
  },
  statusBadgeAlert: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeInfo: {
    backgroundColor: '#DBEAFE',
  },
  statusBadgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeSuccess: {
    backgroundColor: '#D1FAE5',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  statusBadgeTextInfo: {
    color: '#1D4ED8',
  },
  statusBadgeTextWarning: {
    color: '#B45309',
  },
  statusBadgeTextInactive: {
    color: '#475569',
  },
  formCard: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  unitToggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  unitOption: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D4D5D8',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  unitOptionActive: {
    borderColor: '#4E9F3D',
    backgroundColor: 'rgba(78, 159, 61, 0.12)',
  },
  unitOptionPressed: {
    opacity: 0.85,
  },
  unitOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  unitOptionTextActive: {
    color: '#2F855A',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D4D5D8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputHalf: {
    flex: 1,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#E53E3E',
    fontSize: 13,
  },
  planInfo: {
    flex: 1,
    marginRight: 16,
  },
  planNotes: {
    marginTop: 8,
    fontSize: 13,
    color: '#4B5563',
  },
  planActionsWrapper: {
    alignItems: 'flex-end',
    gap: 12,
  },
  planActions: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5F5',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  secondaryButtonDanger: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  secondaryButtonDangerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#4E9F3D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  alertActionsWrapper: {
    alignItems: 'flex-end',
    gap: 12,
  },
  alertBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FEF9C3',
  },
  alertBadgeCritical: {
    backgroundColor: '#FECACA',
  },
  alertBadgeAcknowledged: {
    backgroundColor: '#E2E8F0',
  },
  alertBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  alertActions: {
    flexDirection: 'row',
    gap: 8,
  },
  permissionNotice: {
    marginTop: 24,
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#F9FAFB',
  },
  permissionNoticeText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
});

export default HomeScreen;

type MetricCardProps = {
  label: string;
  value?: number;
  isLoading?: boolean;
  highlight?: boolean;
};

function MetricCard({ label, value, isLoading, highlight }: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      {isLoading ? (
        <ActivityIndicator color="#4E9F3D" />
      ) : (
        <Text style={[styles.metricValue, highlight && styles.metricHighlight]}>
          {value ?? 0}
        </Text>
      )}
    </View>
  );
}

type SectionProps = {
  title: string;
  children: ReactNode;
  error?: string;
  action?: ReactNode;
};

function Section({ title, children, error, action }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionHeaderRight}>
          {error ? <Text style={styles.sectionError}>{error}</Text> : null}
          {action}
        </View>
      </View>
      {children}
    </View>
  );
}

type PermissionNoticeProps = {
  message: string;
};

function PermissionNotice({ message }: PermissionNoticeProps) {
  return (
    <View style={styles.permissionNotice}>
      <Text style={styles.permissionNoticeText}>{message}</Text>
    </View>
  );
}
