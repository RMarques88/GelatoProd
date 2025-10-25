/* eslint-disable import/order */
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { BarcodeScannerField } from '@/components/inputs/BarcodeScannerField';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import {
  useNotifications,
  usePricingSettings,
  useProducts,
  useProductionPlans,
  useStockAlerts,
  useStockItems,
  useRecipes,
} from '@/hooks/data';
import { formatRelativeDate } from '@/utils/date';
import { computeFinancialSummary, unitCostPerGram } from '@/utils/financial';
import { logError } from '@/utils/logger';
import { completeProductionPlanWithConsumption } from '@/services/productionExecution';
import {
  checkProductionPlanAvailability,
  scheduleProductionPlan,
  type PlanAvailabilityResult,
} from '@/services/productionScheduling';

import type {
  NotificationStatus,
  ProductionPlanCreateInput,
  ProductionStatus,
  Recipe,
  RecipeIngredient,
  StockAlertStatus,
  UnitOfMeasure,
  UserRole,
} from '@/domain';
import type { AppStackParamList } from '@/navigation';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StyleProp, ViewStyle } from 'react-native';

const productionStatusLabels: Record<ProductionStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  in_progress: 'Em produção',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const productionStatusActions: Partial<
  Record<ProductionStatus, { label: string; next: ProductionStatus }>
> = {
  draft: { label: 'Agendar produção', next: 'scheduled' },
  scheduled: { label: 'Iniciar produção', next: 'in_progress' },
  in_progress: { label: 'Concluir produção', next: 'completed' },
};

const roleLabels: Record<UserRole, string> = {
  gelatie: 'Gelatiê · Gerente Geral',
  estoquista: 'Estoquista',
  produtor: 'Produtor',
};

export function HomeScreen() {
  const { user, signOut, isLoading } = useAuth();
  const authorization = useAuthorization(user);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { width, height } = useWindowDimensions();
  const orientation = height >= width ? 'portrait' : 'landscape';
  const isGelatie = authorization.hasRole('gelatie');
  const isProdutor = authorization.hasRole('produtor');
  const isEstoquista = authorization.hasRole('estoquista');

  const canViewProducts = isGelatie;
  const canViewRecipes = isProdutor || isGelatie;
  const canViewStock = authorization.canViewStock;
  const canViewAlerts = authorization.canViewStockAlerts;
  const canViewPlans = isProdutor || isGelatie;
  const canReadNotifications = authorization.canMarkNotificationRead;

  // Controle de visibilidade por seção
  const shouldShowMetrics = isGelatie;
  const shouldShowProduction = isProdutor || isGelatie;
  const shouldShowStock = isEstoquista || isGelatie;
  const shouldShowNotifications = isGelatie;

  const isCompactMetricsLayout = width < 768;
  const metricsRowStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.metricsRow, isCompactMetricsLayout && styles.metricsRowCompact],
    [isCompactMetricsLayout],
  );
  const metricCardStyle = useMemo<StyleProp<ViewStyle>>(
    () => (isCompactMetricsLayout ? styles.metricCardCompact : undefined),
    [isCompactMetricsLayout],
  );
  const metricsRowKey = useMemo(
    () => `metrics-${orientation}-${isCompactMetricsLayout ? 'compact' : 'wide'}`,
    [orientation, isCompactMetricsLayout],
  );
  const isCompactHeaderLayout = width < 640;
  const headerRowStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.headerRow, isCompactHeaderLayout && styles.headerRowCompact],
    [isCompactHeaderLayout],
  );
  const signOutButtonStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.button, isCompactHeaderLayout && styles.buttonFullWidth],
    [isCompactHeaderLayout],
  );

  const productionPlanStatuses = useMemo(
    () => ['scheduled', 'in_progress'] as ProductionStatus[],
    [],
  );
  const stockAlertStatuses = useMemo(
    () => ['open', 'acknowledged'] as StockAlertStatus[],
    [],
  );

  const stockReportShortcuts = useMemo<
    Array<{
      label: string;
      icon: keyof typeof Ionicons.glyphMap;
      params: NonNullable<AppStackParamList['StockReports']>;
    }>
  >(
    () => [
      {
        label: 'Últimos 7 dias',
        icon: 'calendar-outline',
        params: { granularity: 'day', rangeInDays: 7 },
      },
      {
        label: '4 semanas',
        icon: 'stats-chart-outline',
        params: { granularity: 'week', rangeInDays: 28 },
      },
      {
        label: '6 meses',
        icon: 'time-outline',
        params: { granularity: 'month', rangeInDays: 180 },
      },
    ],
    [],
  );

  const {
    products,
    isLoading: isLoadingProducts,
    error: productsError,
    create: createProduct,
  } = useProducts({ suspense: false, enabled: canViewProducts });
  const {
    recipes,
    isLoading: isLoadingRecipes,
    error: recipesError,
  } = useRecipes({ enabled: canViewRecipes, includeInactive: true });
  const {
    stockItems,
    isLoading: isLoadingStock,
    error: stockError,
  } = useStockItems({ enabled: canViewStock });
  const {
    alerts,
    isLoading: isLoadingAlerts,
    error: alertsError,
    acknowledge: acknowledgeAlert,
    resolve: resolveAlert,
  } = useStockAlerts({ status: stockAlertStatuses, enabled: canViewAlerts });

  const {
    notifications,
    isLoading: isLoadingNotifications,
    error: notificationsError,
    markAsRead,
    markAllAsRead,
    unreadCount,
  } = useNotifications({ limit: 10, status: 'unread', enabled: canReadNotifications });
  const {
    plans,
    isLoading: isLoadingPlans,
    error: plansError,
    updateStatus: updatePlanStatus,
    archive: archivePlan,
  } = useProductionPlans({
    status: productionPlanStatuses,
    limit: 10,
    enabled: canViewPlans,
  });

  const unreadNotifications = useMemo(
    () =>
      notifications.filter((n: (typeof notifications)[number]) => n.status === 'unread'),
    [notifications],
  );
  const roleLabel = useMemo(() => (user ? roleLabels[user.role] : 'Sem acesso'), [user]);
  const userDisplayName = useMemo(() => user?.name ?? 'Gelatiê', [user?.name]);
  const userId = user?.id ?? null;
  const productsById = useMemo(() => {
    const map = new Map<string, (typeof products)[number]>();

    for (const product of products) {
      map.set(product.id, product);
    }

    return map;
  }, [products]);

  const [newProductName, setNewProductName] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [newProductUnit, setNewProductUnit] = useState<UnitOfMeasure>('GRAMS');
  const [newProductTrackInventory, setNewProductTrackInventory] = useState<boolean>(true);
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [isRecipeDetailVisible, setIsRecipeDetailVisible] = useState(false);
  const [isRecipePickerVisible, setIsRecipePickerVisible] = useState(false);
  const [recipeSearchTerm, setRecipeSearchTerm] = useState('');
  const [newPlanDate, setNewPlanDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newPlanQuantity, setNewPlanQuantity] = useState('');
  const [newPlanUnit, setNewPlanUnit] = useState<UnitOfMeasure>('GRAMS');
  const [newPlanNotes, setNewPlanNotes] = useState('');
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
  const [planFormError, setPlanFormError] = useState<string | null>(null);
  const [pendingPlanInput, setPendingPlanInput] =
    useState<ProductionPlanCreateInput | null>(null);
  const [availabilityResult, setAvailabilityResult] =
    useState<PlanAvailabilityResult | null>(null);
  const [isAvailabilityModalVisible, setIsAvailabilityModalVisible] = useState(false);
  const [availabilityModalError, setAvailabilityModalError] = useState<string | null>(
    null,
  );

  const resetPlanForm = useCallback(() => {
    setSelectedRecipeId(null);
    setNewPlanDate(new Date());
    setNewPlanQuantity('');
    setNewPlanUnit('GRAMS');
    setNewPlanNotes('');
  }, []);

  const dismissAvailabilityModal = useCallback(() => {
    setIsAvailabilityModalVisible(false);
    setAvailabilityResult(null);
    setPendingPlanInput(null);
    setAvailabilityModalError(null);
  }, []);
  const [isMarkingNotifications, setIsMarkingNotifications] = useState(false);
  const [selectedDayFilter, setSelectedDayFilter] = useState<string | 'all'>('all');

  const activeProducts = useMemo(
    () => products.filter((p: (typeof products)[number]) => p.isActive),
    [products],
  );

  const criticalAlerts = useMemo(
    () => alerts.filter((a: (typeof alerts)[number]) => a.severity === 'critical'),
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
    () => plans.filter((pl: (typeof plans)[number]) => pl.status === 'in_progress'),
    [plans],
  );

  // Calcula os dias únicos com produção agendada
  const daysWithProduction = useMemo(() => {
    const daysMap = new Map<string, Date>();

    for (const plan of plans) {
      const dayKey = plan.scheduledFor.toLocaleDateString('pt-BR');
      if (!daysMap.has(dayKey)) {
        daysMap.set(dayKey, plan.scheduledFor);
      }
    }

    // Ordena por data
    return Array.from(daysMap.entries())
      .sort((a, b) => a[1].getTime() - b[1].getTime())
      .map(([key]) => key);
  }, [plans]);

  // Filtra planos pelo dia selecionado
  const filteredPlans = useMemo(() => {
    if (selectedDayFilter === 'all') {
      return sortedPlans;
    }

    return sortedPlans.filter(
      plan => plan.scheduledFor.toLocaleDateString('pt-BR') === selectedDayFilter,
    );
  }, [sortedPlans, selectedDayFilter]);

  const displayedPlans = useMemo(() => filteredPlans.slice(0, 10), [filteredPlans]);
  const selectedRecipe = useMemo(
    () =>
      recipes.find((r: (typeof recipes)[number]) => r.id === selectedRecipeId) ?? null,
    [recipes, selectedRecipeId],
  );

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
    [],
  );

  const closeRecipeDetail = useCallback(() => {
    setIsRecipeDetailVisible(false);
    setSelectedRecipeId(null);
  }, []);

  const computeIngredientCost = useCallback(
    (ingredient: RecipeIngredient, visited = new Set<string>()): number => {
      // Product cost
      if (ingredient.type === 'product') {
        const prod = products.find(p => p.id === ingredient.referenceId);
        const stockItem = stockItems.find(si => si.productId === ingredient.referenceId);
        const perGram = unitCostPerGram(stockItem ?? null);
        if (prod && prod.unitOfMeasure === 'UNITS') {
          const raw =
            stockItem?.averageUnitCostInBRL ?? stockItem?.highestUnitCostInBRL ?? 0;
          return ingredient.quantityInGrams * raw;
        }
        return ingredient.quantityInGrams * perGram;
      }

      // Recipe composition: sum costs of its ingredients proportionally
      if (ingredient.type === 'recipe') {
        const sub = recipes.find(r => r.id === ingredient.referenceId);
        if (!sub) return 0;
        // prevent cycles
        if (visited.has(sub.id)) return 0;
        visited.add(sub.id);

        const factor =
          sub.yieldInGrams > 0 ? ingredient.quantityInGrams / sub.yieldInGrams : 1;
        let total = 0;
        for (const inner of sub.ingredients) {
          const scaledInner: RecipeIngredient = {
            ...inner,
            quantityInGrams: inner.quantityInGrams * factor,
          };
          total += computeIngredientCost(scaledInner, visited);
        }
        return total;
      }

      return 0;
    },
    [products, stockItems, recipes],
  );

  const selectedRecipeTotalCost = useMemo(() => {
    if (!selectedRecipe) return 0;
    return selectedRecipe.ingredients.reduce((sum, ing) => {
      return sum + computeIngredientCost(ing, new Set<string>());
    }, 0);
  }, [selectedRecipe, computeIngredientCost]);

  const parsedPlanQuantity = useMemo(() => {
    if (!newPlanQuantity.trim()) {
      return NaN;
    }

    return Number(newPlanQuantity.replace(',', '.'));
  }, [newPlanQuantity]);

  const parsedPlanDate = useMemo(() => {
    return newPlanDate;
  }, [newPlanDate]);

  const canSubmitPlan = useMemo(() => {
    if (isSubmittingPlan) {
      return false;
    }

    if (!selectedRecipe) {
      return false;
    }

    if (!parsedPlanDate) {
      return false;
    }

    if (!Number.isFinite(parsedPlanQuantity) || parsedPlanQuantity <= 0) {
      return false;
    }

    return true;
  }, [isSubmittingPlan, parsedPlanDate, parsedPlanQuantity, selectedRecipe]);
  const filteredRecipes = useMemo(() => {
    const term = recipeSearchTerm.trim().toLowerCase();
    if (!term) return recipes;
    return recipes.filter((r: (typeof recipes)[number]) => {
      const nameMatches = r.name.toLowerCase().includes(term);
      const descriptionMatches = r.description
        ? r.description.toLowerCase().includes(term)
        : false;
      return nameMatches || descriptionMatches;
    });
  }, [recipeSearchTerm, recipes]);
  const handleSelectRecipe = useCallback((recipeId: string) => {
    setSelectedRecipeId(recipeId);
    setIsRecipePickerVisible(false);
    setPlanFormError(null);
    setRecipeSearchTerm('');
  }, []);
  const handleOpenRecipePicker = useCallback(() => {
    if (recipes.length === 0) {
      setPlanFormError('Cadastre uma receita antes de agendar a produção.');
      return;
    }

    setRecipeSearchTerm('');
    setIsRecipePickerVisible(true);
  }, [recipes.length, setPlanFormError]);

  const handleCloseRecipePicker = useCallback(() => {
    setIsRecipePickerVisible(false);
  }, []);

  // renderRecipeItem is declared after formatters below to avoid use-before-declaration

  const handleCreateProduct = async () => {
    if (!authorization.canManageProducts) {
      setFormError('Você não tem permissão para cadastrar produtos.');
      return;
    }

    if (!newProductName.trim()) {
      setFormError('Informe o nome do produto.');
      return;
    }

    try {
      setFormError(null);
      setIsSubmittingProduct(true);

      // Client-side duplicate validations for faster feedback
      const normalizedName = newProductName.trim().toLocaleLowerCase('pt-BR');
      const existsByName = products.some(
        p => p.name.toLocaleLowerCase('pt-BR') === normalizedName,
      );
      if (existsByName) {
        setFormError('Já existe um produto com este nome.');
        return;
      }

      const trimmedBarcode = newProductBarcode.trim();
      if (trimmedBarcode) {
        const existsByBarcode = products.some(
          p => (p.barcode ?? '').trim() === trimmedBarcode,
        );
        if (existsByBarcode) {
          setFormError('Já existe um produto com este código de barras.');
          return;
        }
      }
      await createProduct({
        name: newProductName.trim(),
        barcode: newProductBarcode.trim() ? newProductBarcode.trim() : null,
        tags: [],
        unitOfMeasure: newProductUnit,
        trackInventory: newProductTrackInventory,
      });
      setNewProductName('');
      setNewProductBarcode('');
      setNewProductUnit('GRAMS');
      setNewProductTrackInventory(true);
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

    if (!selectedRecipe) {
      setPlanFormError('Selecione uma receita para o plano.');
      return;
    }

    if (!Number.isFinite(parsedPlanQuantity) || parsedPlanQuantity <= 0) {
      setPlanFormError('Informe uma quantidade válida.');
      return;
    }

    const planInput: ProductionPlanCreateInput = {
      recipeId: selectedRecipe.id,
      recipeName: selectedRecipe.name,
      scheduledFor: parsedPlanDate,
      quantityInUnits: parsedPlanQuantity,
      unitOfMeasure: newPlanUnit,
      notes: newPlanNotes.trim() ? newPlanNotes.trim() : undefined,
      requestedBy: userId ?? 'system',
    };

    try {
      setPlanFormError(null);
      setIsSubmittingPlan(true);
      const availability = await checkProductionPlanAvailability({
        recipeId: selectedRecipe.id,
        quantityInUnits: parsedPlanQuantity,
        unitOfMeasure: newPlanUnit,
        recipeOverride: selectedRecipe,
      });

      if (availability.status === 'insufficient') {
        setPendingPlanInput(planInput);
        setAvailabilityResult(availability);
        setAvailabilityModalError(null);
        setIsAvailabilityModalVisible(true);
        return;
      }

      await scheduleProductionPlan({
        input: planInput,
        availability,
        confirmedBy: userId,
      });

      resetPlanForm();
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

  const gramsFormatter = useMemo(
    () => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }),
    [],
  );

  const formatGrams = useCallback(
    (value: number) => gramsFormatter.format(value),
    [gramsFormatter],
  );

  const renderRecipeItem = useCallback(
    ({ item }: { item: Recipe }) => {
      const isSelected = item.id === selectedRecipeId;

      return (
        <Pressable
          onPress={() => handleSelectRecipe(item.id)}
          style={({ pressed }) => [
            styles.recipeItem,
            isSelected && styles.recipeItemSelected,
            pressed && styles.recipeItemPressed,
          ]}
        >
          <View style={styles.recipeItemTitleRow}>
            <Text style={styles.recipeName}>{item.name}</Text>
            {isSelected ? <Ionicons name="checkmark" size={18} color="#2563EB" /> : null}
          </View>
          <Text style={styles.recipeMeta}>
            {`Rendimento ${formatGrams(item.yieldInGrams)} g · ${item.ingredients.length} ingredientes`}
          </Text>
        </Pressable>
      );
    },
    [handleSelectRecipe, selectedRecipeId, formatGrams],
  );

  const handleConfirmAvailabilityOverride = useCallback(async () => {
    if (!pendingPlanInput || !availabilityResult) {
      return;
    }

    if (!authorization.hasRole('gelatie')) {
      setAvailabilityModalError(
        'Somente o Gelatiê pode confirmar um agendamento com produtos insuficientes.',
      );
      return;
    }

    try {
      setAvailabilityModalError(null);
      setPlanFormError(null);
      setIsSubmittingPlan(true);

      await scheduleProductionPlan({
        input: pendingPlanInput,
        availability: availabilityResult,
        confirmedBy: userId,
      });

      resetPlanForm();
      dismissAvailabilityModal();
    } catch (error) {
      logError(error, 'home.production.confirmShortage');
      setAvailabilityModalError(
        error instanceof Error
          ? error.message
          : 'Não foi possível confirmar o agendamento com estoque insuficiente.',
      );
    } finally {
      setIsSubmittingPlan(false);
    }
  }, [
    pendingPlanInput,
    availabilityResult,
    authorization,
    userId,
    resetPlanForm,
    dismissAvailabilityModal,
  ]);

  const handleCancelAvailabilityOverride = useCallback(() => {
    if (isSubmittingPlan) {
      return;
    }

    dismissAvailabilityModal();
  }, [dismissAvailabilityModal, isSubmittingPlan]);

  const handleToggleUnit = (unit: UnitOfMeasure) => {
    setNewPlanUnit(unit);
  };

  const handleOpenIngredientSummary = useCallback(
    (planId: string) => {
      if (!authorization.canAdvanceProduction) {
        return;
      }

      navigation.navigate('ProductionIngredientSummary', { planId });
    },
    [authorization.canAdvanceProduction, navigation],
  );

  const handleAdvancePlan = async (planId: string, currentStatus: ProductionStatus) => {
    if (!authorization.canAdvanceProduction) {
      return;
    }

    const action = productionStatusActions[currentStatus];

    if (!action) {
      return;
    }

    try {
      // 🚨 CRÍTICO: Se está concluindo produção (in_progress → completed),
      // DEVE consumir o estoque!
      if (currentStatus === 'in_progress' && action.next === 'completed') {
        console.log('🏭 [HomeScreen] Concluindo produção com consumo de estoque...');
        if (!user?.id) {
          throw new Error('Usuário não identificado');
        }
        await completeProductionPlanWithConsumption({
          planId,
          performedBy: user.id,
        });
        console.log('✅ [HomeScreen] Produção concluída com sucesso!');
      } else {
        // Para outros status (draft → scheduled, scheduled → in_progress),
        // apenas atualiza o status
        await updatePlanStatus(planId, action.next);
      }
    } catch (statusError) {
      logError(statusError, 'home.production.advance');
      throw statusError; // Re-throw para mostrar erro ao usuário
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

  const handleNavigateToStock = useCallback(() => {
    if (!authorization.canViewStock) {
      return;
    }

    navigation.navigate('Stock');
  }, [authorization.canViewStock, navigation]);

  const handleNavigateToProducts = useCallback(() => {
    if (!authorization.hasRole('gelatie')) {
      return;
    }

    navigation.navigate('Products');
  }, [authorization, navigation]);

  const handleNavigateToRecipes = useCallback(() => {
    if (!authorization.hasRole('produtor')) {
      return;
    }

    navigation.navigate('Recipes');
  }, [authorization, navigation]);

  const handleNavigateToStockAlerts = useCallback(() => {
    if (!authorization.canViewStockAlerts) {
      return;
    }

    navigation.navigate('StockAlerts');
  }, [authorization.canViewStockAlerts, navigation]);

  const handleNavigateToStockReports = useCallback(
    (params?: AppStackParamList['StockReports']) => {
      if (!authorization.canViewReports) {
        return;
      }

      navigation.navigate('StockReports', params);
    },
    [authorization.canViewReports, navigation],
  );

  const handleNavigateToFinancialReports = useCallback(() => {
    if (!authorization.hasRole('gelatie')) return;
    navigation.navigate('FinancialReports');
  }, [authorization, navigation]);

  const handleNavigateToStockItem = useCallback(
    (stockItemId: string) => {
      if (!authorization.canViewStock) {
        return;
      }

      navigation.navigate('StockItem', { stockItemId });
    },
    [authorization.canViewStock, navigation],
  );

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
        <View style={styles.headerWrapper}>
          <View style={headerRowStyle}>
            <View style={styles.headerLeftCluster}>
              <View style={styles.avatarCircle}>
                <Ionicons name="ice-cream" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.headerTextArea}>
                <Text style={styles.heading}>King Gelato HQ</Text>
                <Text style={styles.subtitle} numberOfLines={2}>
                  Acompanhe a produção artesanal e o frescor da vitrine em tempo real.
                </Text>
                <View style={styles.userMetaRow}>
                  <Text style={styles.userGreeting}>Olá, {userDisplayName}</Text>
                  {user ? (
                    <View style={styles.roleBadgePrimary}>
                      <Ionicons name="person" size={12} color="#1D4ED8" />
                      <Text style={styles.roleBadgePrimaryText}>{roleLabel}</Text>
                    </View>
                  ) : null}
                  {unreadNotifications.length > 0 ? (
                    <View style={styles.unreadPill}>
                      <Text style={styles.unreadPillText}>
                        {unreadNotifications.length} alerta
                        {unreadNotifications.length > 1 ? 's' : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* header actions cluster */}
            </View>
            <Pressable
              style={({ pressed }) => [
                signOutButtonStyle,
                pressed && styles.buttonPressed,
              ]}
              onPress={signOut}
              disabled={isLoading}
              accessibilityLabel="Sair da conta"
            >
              <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
              <Text style={styles.buttonText}>Sair</Text>
            </Pressable>
          </View>
        </View>

        {shouldShowMetrics && (
          <View style={metricsRowStyle} key={metricsRowKey}>
            <MetricCard
              label="Produtos ativos"
              iconName="ice-cream-outline"
              iconBackground="#F4E8FF"
              iconColor="#7C3AED"
              value={canViewProducts ? activeProducts.length : undefined}
              isLoading={canViewProducts && isLoadingProducts}
              locked={!canViewProducts}
              style={metricCardStyle}
            />
            <MetricCard
              label="Alertas de estoque"
              iconName="alert-circle-outline"
              iconBackground="#FEE2E2"
              iconColor="#DC2626"
              value={canViewAlerts ? alerts.length : undefined}
              isLoading={canViewAlerts && isLoadingAlerts}
              highlight={canViewAlerts && criticalAlerts.length > 0}
              locked={!canViewAlerts}
              style={metricCardStyle}
            />
            <MetricCard
              label="Produções abertas"
              iconName="timer-outline"
              iconBackground="#DBEAFE"
              iconColor="#2563EB"
              value={canViewPlans ? plans.length : undefined}
              isLoading={canViewPlans && isLoadingPlans}
              highlight={canViewPlans && inProgressPlans.length > 0}
              locked={!canViewPlans}
              style={metricCardStyle}
            />
            <MetricCard
              label="Notificações pendentes"
              iconName="notifications-outline"
              iconBackground="#FFE4E6"
              iconColor="#DB2777"
              value={isLoadingNotifications ? undefined : unreadCount}
              isLoading={isLoadingNotifications}
              highlight={unreadCount > 0}
              style={metricCardStyle}
            />
          </View>
        )}

        {shouldShowStock && (
          <Section
            title="Alertas de estoque"
            error={alertsError?.message}
            action={
              authorization.canViewStockAlerts && alerts.length > 0 ? (
                <Pressable
                  onPress={handleNavigateToStockAlerts}
                  style={({ pressed }) => [
                    styles.linkButton,
                    pressed && styles.linkButtonDisabled,
                  ]}
                >
                  <Text style={styles.linkButtonText}>Ver todos</Text>
                </Pressable>
              ) : null
            }
          >
            {isLoadingAlerts ? (
              <ActivityIndicator color="#4E9F3D" />
            ) : alerts.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum alerta ativo no momento.</Text>
            ) : (
              alerts.map((alert: (typeof alerts)[number]) => (
                <Pressable
                  key={alert.id}
                  onPress={() => handleNavigateToStockItem(alert.stockItemId)}
                  style={({ pressed }) => [
                    styles.listItem,
                    styles.listItemInteractive,
                    pressed && styles.listItemPressed,
                  ]}
                >
                  <View style={styles.listItemContent}>
                    <View>
                      <Text style={styles.listItemTitle}>
                        {productsById.get(alert.productId)?.name ??
                          `Produto #${alert.productId}`}
                      </Text>
                      <Text style={styles.listItemSubtitle}>
                        {`${formatGrams(alert.currentQuantityInGrams)} g disponíveis · mínimo `}
                        {`${formatGrams(alert.minimumQuantityInGrams)} g`}
                      </Text>
                      <Text style={styles.listItemMeta}>
                        Atualizado {formatRelativeDate(alert.updatedAt)}
                      </Text>
                    </View>
                    <View style={styles.alertActionsWrapper}>
                      <View
                        style={[
                          styles.alertBadge,
                          alert.severity === 'critical' && styles.alertBadgeCritical,
                          alert.status === 'acknowledged' &&
                            styles.alertBadgeAcknowledged,
                        ]}
                      >
                        <Text style={styles.alertBadgeText}>
                          {alert.severity === 'critical' ? 'Crítico' : 'Alerta'}
                        </Text>
                      </View>
                      <View style={styles.alertActions}>
                        {alert.status !== 'acknowledged' &&
                        authorization.canAcknowledgeAlerts ? (
                          <Pressable
                            onPress={event => {
                              event.stopPropagation();
                              handleAcknowledgeAlertPress(alert.id);
                            }}
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
                            onPress={event => {
                              event.stopPropagation();
                              handleResolveAlertPress(alert.id);
                            }}
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
                </Pressable>
              ))
            )}
          </Section>
        )}

        {shouldShowNotifications && (
          <Section
            title="Notificações"
            error={notificationsError?.message}
            action={
              unreadNotifications.length > 0 && authorization.canManageNotifications ? (
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
            ) : unreadNotifications.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma notificação por aqui.</Text>
            ) : (
              unreadNotifications
                .slice(0, 6)
                .map((notification: (typeof unreadNotifications)[number]) => (
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
        )}

        {shouldShowProduction && (
          <Section title="Produção" error={plansError?.message}>
            <>
              {daysWithProduction.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayTabsContainer}
                  style={styles.dayTabsScroll}
                >
                  <Pressable
                    onPress={() => setSelectedDayFilter('all')}
                    style={({ pressed }) => [
                      styles.dayTab,
                      selectedDayFilter === 'all' && styles.dayTabActive,
                      pressed && styles.dayTabPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayTabText,
                        selectedDayFilter === 'all' && styles.dayTabTextActive,
                      ]}
                    >
                      Todos
                    </Text>
                  </Pressable>
                  {daysWithProduction.map(day => (
                    <Pressable
                      key={day}
                      onPress={() => setSelectedDayFilter(day)}
                      style={({ pressed }) => [
                        styles.dayTab,
                        selectedDayFilter === day && styles.dayTabActive,
                        pressed && styles.dayTabPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayTabText,
                          selectedDayFilter === day && styles.dayTabTextActive,
                        ]}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {isLoadingPlans ? (
                <ActivityIndicator color="#4E9F3D" />
              ) : displayedPlans.length === 0 ? (
                <Text style={styles.emptyText}>
                  {selectedDayFilter === 'all'
                    ? 'Nenhuma produção agendada.'
                    : 'Nenhuma produção agendada para este dia.'}
                </Text>
              ) : (
                displayedPlans.map((plan: (typeof displayedPlans)[number]) => {
                  const status = plan.status as ProductionStatus;
                  const action = productionStatusActions[status];
                  return (
                    <View key={plan.id} style={styles.listItem}>
                      <View style={styles.planInfo}>
                        <Text style={styles.listItemTitle}>{plan.recipeName}</Text>
                        <Text style={styles.listItemSubtitle}>
                          {plan.quantityInUnits}{' '}
                          {plan.unitOfMeasure === 'GRAMS' ? 'g' : 'un'} ·{' '}
                          {plan.scheduledFor.toLocaleDateString('pt-BR')}
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
                              plan.status === 'in_progress' &&
                                styles.statusBadgeTextWarning,
                              plan.status === 'cancelled' &&
                                styles.statusBadgeTextInactive,
                            ]}
                          >
                            {productionStatusLabels[status]}
                          </Text>
                        </View>
                        <View style={styles.planActions}>
                          {authorization.canAdvanceProduction ? (
                            <Pressable
                              onPress={() => handleOpenIngredientSummary(plan.id)}
                              style={({ pressed }) => [
                                styles.secondaryButtonInfo,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.secondaryButtonInfoText}>
                                Ver ingredientes
                              </Text>
                            </Pressable>
                          ) : null}
                          {action && authorization.canAdvanceProduction ? (
                            <Pressable
                              onPress={() => handleAdvancePlan(plan.id, plan.status)}
                              style={({ pressed }) => [
                                styles.secondaryButton,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.secondaryButtonText}>
                                {action.label}
                              </Text>
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
                              <Text style={styles.secondaryButtonDangerText}>
                                Cancelar
                              </Text>
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
                  <Pressable
                    onPress={handleOpenRecipePicker}
                    style={({ pressed }) => [
                      styles.selectorField,
                      pressed && styles.selectorFieldPressed,
                      !recipes.length && styles.selectorFieldDisabled,
                    ]}
                    disabled={!recipes.length}
                  >
                    <View style={styles.selectorContent}>
                      <Ionicons name="ice-cream-outline" size={18} color="#7C3AED" />
                      <View>
                        <Text style={styles.selectorLabel}>
                          {selectedRecipe ? selectedRecipe.name : 'Selecionar receita'}
                        </Text>
                        <Text style={styles.selectorHint}>
                          {selectedRecipe
                            ? `${formatGrams(selectedRecipe.yieldInGrams)} g · ${selectedRecipe.ingredients.length} ingredientes`
                            : recipes.length === 0
                              ? 'Nenhuma receita cadastrada ainda'
                              : 'Toque para escolher uma receita cadastrada'}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#7C3AED" />
                  </Pressable>
                  <View style={styles.formRow}>
                    <Pressable
                      onPress={() => setShowDatePicker(true)}
                      style={({ pressed }) => [
                        styles.input,
                        styles.inputHalf,
                        styles.datePickerButton,
                        pressed && styles.datePickerButtonPressed,
                        !selectedRecipe && styles.inputDisabled,
                      ]}
                      disabled={!selectedRecipe}
                    >
                      <Ionicons name="calendar-outline" size={18} color="#7C3AED" />
                      <Text
                        style={[
                          styles.datePickerButtonText,
                          !selectedRecipe && styles.datePickerButtonTextDisabled,
                        ]}
                      >
                        {newPlanDate.toLocaleDateString('pt-BR')}
                      </Text>
                    </Pressable>
                    {showDatePicker && (
                      <DateTimePicker
                        value={newPlanDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, selectedDate) => {
                          setShowDatePicker(Platform.OS === 'ios');
                          if (selectedDate) {
                            setNewPlanDate(selectedDate);
                          }
                        }}
                        minimumDate={new Date()}
                      />
                    )}
                    <TextInput
                      placeholder="Quantidade"
                      keyboardType="numeric"
                      value={newPlanQuantity}
                      onChangeText={setNewPlanQuantity}
                      style={[styles.input, styles.inputHalf]}
                      editable={Boolean(selectedRecipe)}
                    />
                  </View>
                  <View style={styles.unitToggleRow}>
                    <Pressable
                      onPress={() => handleToggleUnit('GRAMS')}
                      style={({ pressed }) => [
                        styles.unitOption,
                        newPlanUnit === 'GRAMS' && styles.unitOptionActive,
                        pressed && styles.unitOptionPressed,
                        !selectedRecipe && styles.unitOptionDisabled,
                      ]}
                      disabled={!selectedRecipe}
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
                        !selectedRecipe && styles.unitOptionDisabled,
                      ]}
                      disabled={!selectedRecipe}
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
                    editable={Boolean(selectedRecipe)}
                  />
                  {planFormError ? (
                    <Text style={styles.errorText}>{planFormError}</Text>
                  ) : null}
                  <Pressable
                    onPress={handleCreatePlan}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.buttonPressed,
                      (!canSubmitPlan || !selectedRecipe) && styles.primaryButtonDisabled,
                    ]}
                    disabled={!canSubmitPlan}
                  >
                    {isSubmittingPlan ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Agendar produção</Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                <PermissionNotice message="Somente o Gelatiê pode agendar produções." />
              )}
            </>
          </Section>
        )}

        {shouldShowMetrics && (
          <>
            {authorization.hasRole('gelatie') ? (
              <Section
                title="Resumo financeiro"
                action={
                  <Pressable
                    onPress={handleNavigateToFinancialReports}
                    style={({ pressed }) => [
                      styles.linkButton,
                      pressed && styles.linkButtonDisabled,
                    ]}
                  >
                    <Text style={styles.linkButtonText}>Abrir financeiro</Text>
                  </Pressable>
                }
              >
                <HomeFinancialSummary />
              </Section>
            ) : null}
            <Section
              title="Produtos"
              error={productsError?.message}
              action={
                authorization.hasRole('gelatie') ? (
                  <Pressable
                    onPress={handleNavigateToProducts}
                    style={({ pressed }) => [
                      styles.linkButton,
                      pressed && styles.linkButtonDisabled,
                    ]}
                  >
                    <Text style={styles.linkButtonText}>Abrir catálogo</Text>
                  </Pressable>
                ) : null
              }
            >
              {isLoadingProducts ? (
                <ActivityIndicator color="#4E9F3D" />
              ) : products.length === 0 ? (
                <Text style={styles.emptyText}>
                  Nenhum produto cadastrado até o momento.
                </Text>
              ) : (
                products.slice(0, 5).map((product: (typeof products)[number]) => (
                  <View key={product.id} style={styles.productCard}>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>{product.name}</Text>
                      <Text style={styles.productBarcode}>
                        {product.barcode ? `${product.barcode}` : 'Sem código de barras'}
                      </Text>
                      <View style={styles.inlineRowGap}>
                        {product.unitOfMeasure ? (
                          <View style={styles.miniBadgeInfo}>
                            <Text style={styles.miniBadgeInfoText}>
                              Unidade:{' '}
                              {product.unitOfMeasure === 'GRAMS'
                                ? 'g'
                                : product.unitOfMeasure === 'KILOGRAMS'
                                  ? 'kg'
                                  : product.unitOfMeasure === 'MILLILITERS'
                                    ? 'ml'
                                    : product.unitOfMeasure === 'LITERS'
                                      ? 'L'
                                      : 'un'}
                            </Text>
                          </View>
                        ) : null}
                        {product.trackInventory === false ? (
                          <View style={styles.miniBadgeWarn}>
                            <Text style={styles.miniBadgeWarnText}>
                              Sem controle de estoque
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        !product.isActive && styles.statusBadgeInactive,
                        styles.clearButton,
                      ]}
                    />
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
                  <View>
                    <Text style={styles.inputLabel}>Código de barras (opcional):</Text>
                    <BarcodeScannerField
                      placeholder="Digite ou escaneie o código"
                      value={newProductBarcode}
                      onChangeText={setNewProductBarcode}
                      editable={!isSubmittingProduct}
                    />
                  </View>
                  <View style={styles.formRow}>
                    <View style={[styles.input, styles.inputHalf, styles.clearContainer]}>
                      <Text style={styles.inputLabel}>Unidade</Text>
                      <View style={styles.inlineWrapRow}>
                        {(
                          [
                            'GRAMS',
                            'KILOGRAMS',
                            'MILLILITERS',
                            'LITERS',
                            'UNITS',
                          ] as UnitOfMeasure[]
                        ).map(unit => (
                          <Pressable
                            key={unit}
                            onPress={() => setNewProductUnit(unit)}
                            style={({ pressed }) => [
                              styles.filterChip,
                              newProductUnit === unit && styles.filterChipSelected,
                              pressed && styles.filterChipPressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.filterChipText,
                                newProductUnit === unit && styles.filterChipTextSelected,
                              ]}
                            >
                              {unit === 'GRAMS'
                                ? 'g'
                                : unit === 'KILOGRAMS'
                                  ? 'kg'
                                  : unit === 'MILLILITERS'
                                    ? 'ml'
                                    : unit === 'LITERS'
                                      ? 'L'
                                      : 'un'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    <View style={[styles.input, styles.inputHalf, styles.inputTall]}>
                      <View style={styles.rowSpaceBetween}>
                        <Text style={styles.inputLabel}>Controlar estoque</Text>
                        <Pressable
                          onPress={() => setNewProductTrackInventory(prev => !prev)}
                          style={({ pressed }) => [
                            styles.switchChip,
                            pressed && styles.switchChipPressed,
                          ]}
                        >
                          <Text style={styles.switchChipText}>
                            {newProductTrackInventory ? 'Sim' : 'Não'}
                          </Text>
                        </Pressable>
                      </View>
                      <Text style={styles.formHint}>
                        Desative para itens de venda como copo/guardanapo/cascão.
                      </Text>
                    </View>
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
                <PermissionNotice message="Somente o Gelatiê pode cadastrar novos produtos." />
              )}
            </Section>

            <Section
              title="Receitas"
              error={recipesError?.message}
              action={
                authorization.hasRole('produtor') ? (
                  <View style={styles.sectionActionGroup}>
                    <Pressable
                      onPress={() =>
                        navigation.navigate('RecipeUpsert', { recipeId: undefined })
                      }
                      style={({ pressed }) => [
                        styles.linkButton,
                        pressed && styles.linkButtonDisabled,
                      ]}
                    >
                      <Text style={styles.linkButtonText}>Nova receita</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleNavigateToRecipes}
                      style={({ pressed }) => [
                        styles.linkButton,
                        pressed && styles.linkButtonDisabled,
                      ]}
                    >
                      <Text style={styles.linkButtonText}>Ver receitas</Text>
                    </Pressable>
                  </View>
                ) : null
              }
            >
              {isLoadingRecipes ? (
                <ActivityIndicator color="#4E9F3D" />
              ) : recipes.length === 0 ? (
                <Text style={styles.emptyText}>Nenhuma receita registrada ainda.</Text>
              ) : (
                <>
                  <TextInput
                    placeholder="Filtrar receitas"
                    value={recipeSearchTerm}
                    onChangeText={setRecipeSearchTerm}
                    style={[styles.input, styles.recipeFilterInput]}
                    placeholderTextColor="#9CA3AF"
                  />
                  {filteredRecipes
                    .slice(0, 10)
                    .map((recipe: (typeof recipes)[number]) => (
                      <Pressable
                        key={recipe.id}
                        onPress={() => {
                          setSelectedRecipeId(recipe.id);
                          setIsRecipeDetailVisible(true);
                        }}
                        style={({ pressed }) => [
                          styles.listItem,
                          styles.listItemInteractive,
                          pressed && styles.listItemPressed,
                        ]}
                      >
                        <View>
                          <Text style={styles.listItemTitle}>{recipe.name}</Text>
                          <Text style={styles.listItemSubtitle}>
                            {`Rendimento: ${formatGrams(recipe.yieldInGrams)} g • ${recipe.ingredients.length} ingredientes`}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                </>
              )}
            </Section>
          </>
        )}

        {shouldShowStock && (
          <Section
            title="Estoque"
            error={stockError?.message}
            action={
              authorization.canViewStock ? (
                <View style={styles.sectionActionGroup}>
                  {authorization.canViewReports ? (
                    <Pressable
                      onPress={() => handleNavigateToStockReports()}
                      style={({ pressed }) => [
                        styles.linkButton,
                        pressed && styles.linkButtonDisabled,
                      ]}
                    >
                      <Text style={styles.linkButtonText}>Ver relatórios</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={handleNavigateToStock}
                    style={({ pressed }) => [
                      styles.linkButton,
                      pressed && styles.linkButtonDisabled,
                    ]}
                  >
                    <Text style={styles.linkButtonText}>Abrir estoque</Text>
                  </Pressable>
                </View>
              ) : null
            }
          >
            {authorization.canViewReports ? (
              <View style={styles.reportQuickFiltersRow}>
                {stockReportShortcuts.map(shortcut => (
                  <Pressable
                    key={shortcut.label}
                    onPress={() => handleNavigateToStockReports(shortcut.params)}
                    style={({ pressed }) => [
                      styles.reportQuickFilterChip,
                      pressed && styles.reportQuickFilterChipPressed,
                    ]}
                  >
                    <Ionicons name={shortcut.icon} size={14} color="#2563EB" />
                    <Text style={styles.reportQuickFilterText}>{shortcut.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {isLoadingStock ? (
              <ActivityIndicator color="#4E9F3D" />
            ) : stockItems.length === 0 ? (
              <Text style={styles.emptyText}>
                Cadastre produtos para começar o controle.
              </Text>
            ) : (
              stockItems.slice(0, 5).map((item: (typeof stockItems)[number]) => (
                <Pressable
                  key={item.id}
                  onPress={() => handleNavigateToStockItem(item.id)}
                  style={({ pressed }) => [
                    styles.listItem,
                    styles.listItemInteractive,
                    pressed && styles.listItemPressed,
                  ]}
                >
                  <View style={styles.listItemContent}>
                    <View>
                      <Text style={styles.listItemTitle}>
                        {productsById.get(item.productId)?.name ??
                          `Produto #${item.productId}`}
                      </Text>
                      <Text style={styles.listItemSubtitle}>
                        {formatGrams(item.currentQuantityInGrams)} g disponíveis · mínimo{' '}
                        {formatGrams(item.minimumQuantityInGrams)} g
                      </Text>
                      <Text style={styles.listItemMeta}>
                        Atualizado {formatRelativeDate(item.updatedAt)}
                      </Text>
                    </View>
                    {item.currentQuantityInGrams <= item.minimumQuantityInGrams ? (
                      <View style={[styles.statusBadge, styles.statusBadgeAlert]}>
                        <Text style={styles.statusBadgeText}>Crítico</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              ))
            )}
          </Section>
        )}
        </ScrollView>

      <Modal
        visible={isRecipeDetailVisible}
        animationType="slide"
        onRequestClose={closeRecipeDetail}
      >
        <ScreenContainer>
          <View style={styles.modalHeaderRow}>
            <Pressable onPress={closeRecipeDetail} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Voltar</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Detalhes da receita</Text>
            <View />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScrollContent}
          >
            {selectedRecipe ? (
              <View>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>{selectedRecipe.name}</Text>
                  <Text
                    style={styles.modalDescription}
                  >{`Rendimento: ${formatGrams(selectedRecipe.yieldInGrams)} g`}</Text>
                </View>

                <Text style={styles.sectionSubtitle}>Ingredientes</Text>
                <View style={styles.modalCard}>
                  {selectedRecipe.ingredients.map((ing: RecipeIngredient) => {
                    if (ing.type === 'product') {
                      const product = products.find(p => p.id === ing.referenceId);
                      const cost = computeIngredientCost(ing);
                      return (
                        <View
                          key={`${ing.referenceId}-${ing.quantityInGrams}`}
                          style={styles.ingredientRow}
                        >
                          <View>
                            <Text style={styles.listItemTitle}>
                              {product?.name ?? ing.referenceId}
                            </Text>
                            <Text style={styles.listItemSubtitle}>
                              {`${formatGrams(ing.quantityInGrams)} g`}
                            </Text>
                          </View>
                          <View style={styles.ingredientRight}>
                            <Text style={styles.listItemTitle}>
                              {currencyFormatter.format(cost)}
                            </Text>
                          </View>
                        </View>
                      );
                    }

                    // recipe composition
                    if (ing.type === 'recipe') {
                      const sub = recipes.find(r => r.id === ing.referenceId);
                      if (!sub) {
                        const cost = computeIngredientCost(ing);
                        return (
                          <View
                            key={`${ing.referenceId}-${ing.quantityInGrams}`}
                            style={styles.ingredientRow}
                          >
                            <View>
                              <Text style={styles.listItemTitle}>{ing.referenceId}</Text>
                              <Text
                                style={styles.listItemSubtitle}
                              >{`${formatGrams(ing.quantityInGrams)} g`}</Text>
                            </View>
                            <View style={styles.ingredientRight}>
                              <Text style={styles.listItemTitle}>
                                {currencyFormatter.format(cost)}
                              </Text>
                            </View>
                          </View>
                        );
                      }

                      const factor =
                        sub.yieldInGrams > 0 ? ing.quantityInGrams / sub.yieldInGrams : 1;

                      // subtotal for this nested recipe (scaled)
                      const subTotal = sub.ingredients.reduce((acc, inner) => {
                        const scaledInner: RecipeIngredient = {
                          ...inner,
                          quantityInGrams: inner.quantityInGrams * factor,
                        };
                        return (
                          acc + computeIngredientCost(scaledInner, new Set<string>())
                        );
                      }, 0);

                      return (
                        <View
                          key={`${ing.referenceId}-${ing.quantityInGrams}`}
                          style={styles.recipeDetailCard}
                        >
                          <View style={styles.recipeItemTitleRow}>
                            <View style={styles.recipeTitleLeft}>
                              <Text style={styles.recipeName}>{sub.name}</Text>
                              <Text
                                style={styles.recipeMeta}
                              >{`Rendimento base: ${formatGrams(
                                sub.yieldInGrams,
                              )} g`}</Text>
                            </View>
                            <View style={styles.recipeTitleRight}>
                              <Text style={styles.recipeRightCost}>
                                {currencyFormatter.format(subTotal)}
                              </Text>
                              <View style={styles.statusBadge}>
                                <Text
                                  style={styles.statusBadgeText}
                                >{`x${factor.toFixed(2)}`}</Text>
                              </View>
                            </View>
                          </View>

                          <Text
                            style={styles.listItemSubtitle}
                          >{`Quantidade solicitada: ${formatGrams(
                            ing.quantityInGrams,
                          )} g`}</Text>

                          <View style={[styles.modalCard, styles.modalCardNested]}>
                            {sub.ingredients.map(inner => {
                              const scaled: RecipeIngredient = {
                                ...inner,
                                quantityInGrams: inner.quantityInGrams * factor,
                              };
                              const innerProd = products.find(
                                p => p.id === inner.referenceId,
                              );
                              const innerCost = computeIngredientCost(scaled);
                              return (
                                <View
                                  key={`${inner.referenceId}-${scaled.quantityInGrams}`}
                                  style={styles.ingredientRow}
                                >
                                  <View>
                                    <Text style={styles.listItemTitle}>
                                      {innerProd?.name ?? inner.referenceId}
                                    </Text>
                                    <Text style={styles.listItemSubtitle}>
                                      {`${formatGrams(scaled.quantityInGrams)} g`}
                                    </Text>
                                  </View>
                                  <View style={styles.ingredientRight}>
                                    <Text style={styles.listItemTitle}>
                                      {currencyFormatter.format(innerCost)}
                                    </Text>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      );
                    }

                    return null;
                  })}
                </View>
                <View style={[styles.modalCard, styles.totalCard]}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Custo total estimado</Text>
                    <Text style={styles.totalValue}>
                      {currencyFormatter.format(selectedRecipeTotalCost)}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.emptyText}>Receita não encontrada.</Text>
            )}
          </ScrollView>
        </ScreenContainer>
      </Modal>

      <Modal
        visible={isAvailabilityModalVisible}
        animationType="fade"
        transparent
        onRequestClose={dismissAvailabilityModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Estoque insuficiente</Text>
              <Pressable
                onPress={dismissAvailabilityModal}
                style={({ pressed }) => [
                  styles.modalCloseButton,
                  pressed && styles.modalCloseButtonPressed,
                ]}
              >
                <Ionicons name="close" size={20} color="#111827" />
              </Pressable>
            </View>
            <Text style={styles.modalDescription}>
              Os ingredientes abaixo não possuem estoque suficiente para esta produção.
              Confirme a continuidade para registrar a divergência.
            </Text>
            <View style={styles.shortageList}>
              {(availabilityResult?.shortages ?? []).map(shortage => (
                <View key={shortage.productId} style={styles.shortageRow}>
                  <Text style={styles.shortageName}>
                    {productsById.get(shortage.productId)?.name ??
                      `Produto #${shortage.productId}`}
                  </Text>
                  <Text style={styles.shortageDetail}>
                    Necessário: {formatGrams(shortage.requiredQuantityInGrams)}g
                  </Text>
                  <Text style={styles.shortageDetail}>
                    Disponível: {formatGrams(shortage.availableQuantityInGrams)}g
                  </Text>
                  <Text style={styles.shortageHighlight}>
                    Falta: {formatGrams(shortage.shortageInGrams)}g
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.shortageSummary}>
              <Text style={styles.shortageSummaryText}>
                {`Falta total: ${formatGrams(availabilityResult?.totalShortageInGrams ?? 0)}g · Requisitado: ${formatGrams(availabilityResult?.totalRequiredInGrams ?? 0)}g`}
              </Text>
            </View>
            {!authorization.hasRole('gelatie') ? (
              <Text style={styles.modalWarning}>
                Somente o Gelatiê pode autorizar o agendamento com estoque insuficiente.
              </Text>
            ) : null}
            {availabilityModalError ? (
              <Text style={styles.modalErrorText}>{availabilityModalError}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                onPress={handleCancelAvailabilityOverride}
                style={({ pressed }) => [
                  styles.modalSecondaryButton,
                  pressed && styles.modalSecondaryButtonPressed,
                ]}
                disabled={isSubmittingPlan}
              >
                <Text style={styles.modalSecondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmAvailabilityOverride}
                style={({ pressed }) => [
                  styles.modalPrimaryButton,
                  (pressed || isSubmittingPlan) && styles.modalPrimaryButtonPressed,
                  (!authorization.hasRole('gelatie') || isSubmittingPlan) &&
                    styles.modalPrimaryButtonDisabled,
                ]}
                disabled={!authorization.hasRole('gelatie') || isSubmittingPlan}
              >
                {isSubmittingPlan ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>Confirmar agendamento</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isRecipePickerVisible}
        animationType="fade"
        transparent
        onRequestClose={handleCloseRecipePicker}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar receita</Text>
              <Pressable
                onPress={handleCloseRecipePicker}
                style={({ pressed }) => [
                  styles.modalCloseButton,
                  pressed && styles.modalCloseButtonPressed,
                ]}
              >
                <Ionicons name="close" size={20} color="#111827" />
              </Pressable>
            </View>
            <TextInput
              placeholder="Buscar por nome ou descrição"
              value={recipeSearchTerm}
              onChangeText={setRecipeSearchTerm}
              style={styles.modalSearchInput}
              autoFocus
            />
            <FlatList
              data={filteredRecipes}
              keyExtractor={item => item.id}
              renderItem={renderRecipeItem}
              ListEmptyComponent={
                <Text style={styles.modalEmptyText}>
                  {recipes.length === 0
                    ? 'Cadastre uma receita para começar.'
                    : 'Nenhum resultado encontrado com esse termo.'}
                </Text>
              }
              contentContainerStyle={styles.recipeListContent}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
  },
  modalScrollContent: {
    paddingBottom: 32,
  },
  headerWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  headerLeftCluster: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    flex: 1,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  headerTextArea: { flex: 1 },
  roleBadgePrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgePrimaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  unreadPill: {
    backgroundColor: '#FEE2E2',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  unreadPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 16,
  },
  headerRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonFullWidth: {
    alignSelf: 'stretch',
    justifyContent: 'center',
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
  metricsRowCompact: {
    flexWrap: 'wrap',
    justifyContent: 'space-between',
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
  metricCardCompact: {
    // Override base flex to avoid shrinking after orientation changes
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    width: '48%',
    flexBasis: '48%',
    // Keep two columns with stable widths on wrap
    marginBottom: 12,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  metricIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 13,
    color: '#5E5F61',
    marginBottom: 8,
    flexShrink: 1,
    flexGrow: 1,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1B1E',
  },
  metricHighlight: {
    color: '#E53E3E',
  },
  metricLocked: {
    color: '#9CA3AF',
  },
  metricLockedLabel: {
    marginTop: 4,
    fontSize: 11,
    color: '#9CA3AF',
  },
  section: {
    marginBottom: 32,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
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
  sectionActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportQuickFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  reportQuickFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  reportQuickFilterChipPressed: {
    opacity: 0.85,
  },
  reportQuickFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
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
  productCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  productInfo: {
    flex: 1,
    gap: 6,
  },
  productName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  productBarcode: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  listItemInteractive: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listItemPressed: {
    opacity: 0.85,
  },
  listItemContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 8,
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
  listItemMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
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
  selectorField: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  selectorFieldPressed: {
    opacity: 0.85,
  },
  selectorFieldDisabled: {
    opacity: 0.6,
  },
  selectorContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectorLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  selectorHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
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
  unitOptionDisabled: {
    opacity: 0.5,
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
    color: '#111827',
  },
  recipeFilterInput: {
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  recipeDetailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  recipeDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  ingredientRight: {
    alignItems: 'flex-end',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  inputHalf: {
    flex: 1,
  },
  inputDisabled: {
    opacity: 0.5,
    backgroundColor: '#F3F4F6',
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-start',
  },
  datePickerButtonPressed: {
    opacity: 0.75,
  },
  datePickerButtonText: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '500',
  },
  datePickerButtonTextDisabled: {
    color: '#9CA3AF',
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
  secondaryButtonInfo: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366F1',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  secondaryButtonInfoText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4338CA',
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
  primaryButtonDisabled: {
    backgroundColor: '#9CA3AF',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 16,
    maxHeight: '80%',
  },
  modalCardNested: {
    marginTop: 8,
    backgroundColor: '#FAFAFB',
    padding: 12,
    borderRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(17, 24, 39, 0.08)',
  },
  modalCloseButtonPressed: {
    opacity: 0.85,
  },
  modalDescription: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  shortageList: {
    gap: 12,
  },
  shortageRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    gap: 4,
  },
  shortageName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  shortageDetail: {
    fontSize: 13,
    color: '#4B5563',
  },
  shortageHighlight: {
    fontSize: 13,
    color: '#B91C1C',
    fontWeight: '600',
  },
  shortageSummary: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },
  shortageSummaryText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
  },
  modalWarning: {
    fontSize: 13,
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 12,
  },
  modalErrorText: {
    fontSize: 13,
    color: '#DC2626',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalSecondaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  modalSecondaryButtonPressed: {
    opacity: 0.85,
  },
  modalSecondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  modalPrimaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  modalPrimaryButtonPressed: {
    opacity: 0.9,
  },
  modalPrimaryButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  modalPrimaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalSearchInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: '#F9FAFB',
    color: '#111827',
  },
  recipeListContent: {
    paddingBottom: 8,
  },
  recipeItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  recipeItemSelected: {
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  recipeItemPressed: {
    opacity: 0.9,
  },
  recipeItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  recipeTitleRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  recipeRightCost: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  recipeMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  recipeTitleLeft: {
    flex: 1,
  },
  recipeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalEmptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 16,
  },
  dayTabsScroll: {
    marginBottom: 16,
    marginTop: 8,
  },
  dayTabsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
  },
  dayTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dayTabActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  dayTabPressed: {
    opacity: 0.7,
  },
  dayTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  dayTabTextActive: {
    color: '#FFFFFF',
  },
  // New styles for quick-create product unit chips and toggle
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipSelected: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  filterChipPressed: {
    opacity: 0.85,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  filterChipTextSelected: {
    color: '#1D4ED8',
  },
  switchChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  switchChipPressed: {
    opacity: 0.85,
  },
  switchChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  formHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },
  // Newly added extracted inline styles
  inlineRowGap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  miniBadgeInfo: {
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  miniBadgeInfoText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  miniBadgeWarn: {
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  miniBadgeWarnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B45309',
  },
  clearButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  inlineWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inputTall: {
    minHeight: 110,
    justifyContent: 'flex-start',
  },
  rowSpaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearContainer: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 12,
  },
  totalLabel: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '700',
  },
  totalCard: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
});

export default HomeScreen;

type MetricCardProps = {
  label: string;
  value?: number | string;
  isLoading?: boolean;
  highlight?: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBackground?: string;
  locked?: boolean;
  style?: StyleProp<ViewStyle>;
};

function MetricCard({
  label,
  value,
  isLoading,
  highlight,
  iconName,
  iconColor = '#1A1B1E',
  iconBackground = 'rgba(26, 27, 30, 0.08)',
  locked,
  style,
}: MetricCardProps) {
  const showValue = !locked;
  return (
    <View style={[styles.metricCard, style]}>
      <View style={styles.metricHeader}>
        <View style={[styles.metricIconBadge, { backgroundColor: iconBackground }]}>
          <Ionicons name={iconName} size={18} color={iconColor} />
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color="#4E9F3D" />
      ) : (
        <Text
          style={[
            styles.metricValue,
            highlight && styles.metricHighlight,
            locked && styles.metricLocked,
          ]}
        >
          {showValue ? (value ?? 0) : '—'}
        </Text>
      )}
      {locked ? <Text style={styles.metricLockedLabel}>Acesso restrito</Text> : null}
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
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <View style={styles.sectionHeaderRight}>
            {error ? <Text style={styles.sectionError}>{error}</Text> : null}
            {action}
          </View>
        </View>
        {children}
      </View>
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

// Lightweight summary for last 30 days used in Home (reusing financial util for consistency)
function HomeFinancialSummary() {
  const { settings } = usePricingSettings();
  const { plans, isLoading: isLoadingPlans } = useProductionPlans({
    status: ['completed'],
    includeArchived: false,
    limit: 250,
  });
  const { products } = useProducts({ includeInactive: true });
  const { stockItems } = useStockItems({ includeArchived: true });

  const { revenue, cost, margin } = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 30);
    return computeFinancialSummary(
      plans,
      products,
      stockItems,
      settings ?? undefined,
      from,
      to,
    );
  }, [plans, products, stockItems, settings]);
  const currency = useMemo(
    () => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
    [],
  );

  return (
    <View style={styles.metricsRow}>
      <MetricCard
        label="Receita (estim.) 30d"
        iconName="cash-outline"
        iconBackground="#DCFCE7"
        iconColor="#047857"
        value={currency.format(revenue)}
        isLoading={isLoadingPlans}
      />
      <MetricCard
        label="Custo (real) 30d"
        iconName="pricetag-outline"
        iconBackground="#E0E7FF"
        iconColor="#3730A3"
        value={currency.format(cost)}
        isLoading={isLoadingPlans}
      />
      <MetricCard
        label="Margem 30d"
        iconName="trending-up-outline"
        iconBackground="#DBEAFE"
        iconColor="#1D4ED8"
        value={currency.format(margin)}
        isLoading={isLoadingPlans}
      />
    </View>
  );
}
