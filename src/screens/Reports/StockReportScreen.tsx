import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
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
import { ReportingAnalyticsPanel } from '@/components/stock/ReportingAnalyticsPanel';
import {
  usePricingSettings,
  useProducts,
  useProductionAvailabilityRecords,
  useProductionDivergences,
  useProductionPlans,
  useReportingSummaries,
  useStockAlerts,
  useStockMovements,
} from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { formatRelativeDate } from '@/utils/date';
import type {
  ProductionDivergenceStatus,
  ProductionPlanAvailabilityStatus,
  StockAlertStatus,
  StockMovement,
  UnitOfMeasure,
} from '@/domain';
import type { AppStackParamList } from '@/navigation';
import type { PeriodGranularity } from '@/services/reportingMetrics';
import type { RouteProp } from '@react-navigation/native';

function formatGrams(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} g`;
}

function movementTypeLabel(movement: StockMovement) {
  switch (movement.type) {
    case 'increment':
      return 'Entrada';
    case 'initial':
      return 'Estoque inicial';
    case 'decrement':
      return 'Saída';
    case 'adjustment':
      return 'Ajuste';
    default:
      return movement.type;
  }
}

function movementIcon(movement: StockMovement): {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
} {
  switch (movement.type) {
    case 'increment':
    case 'initial':
      return {
        name: 'arrow-down-outline',
        color: '#047857',
        background: '#D1FAE5',
      };
    case 'decrement':
      return {
        name: 'arrow-up-outline',
        color: '#B91C1C',
        background: '#FEE2E2',
      };
    case 'adjustment':
    default:
      return {
        name: 'swap-vertical-outline',
        color: '#2563EB',
        background: '#DBEAFE',
      };
  }
}

function alertSeverityStyle(severity: 'warning' | 'critical') {
  if (severity === 'critical') {
    return {
      badge: styles.alertBadgeCritical,
      text: styles.alertBadgeCriticalText,
    };
  }

  return {
    badge: styles.alertBadgeWarning,
    text: styles.alertBadgeWarningText,
  };
}

function availabilityStatusLabel(status: ProductionPlanAvailabilityStatus) {
  switch (status) {
    case 'fulfilled':
      return 'Executado';
    case 'reconciled':
      return 'Reconciliado';
    case 'insufficient':
      return 'Com faltas';
    case 'sufficient':
    default:
      return 'Disponível';
  }
}

function availabilityStatusStyle(status: ProductionPlanAvailabilityStatus) {
  switch (status) {
    case 'fulfilled':
      return {
        badge: styles.availabilityStatusBadgeFulfilled,
        text: styles.availabilityStatusBadgeFulfilledText,
      };
    case 'reconciled':
      return {
        badge: styles.availabilityStatusBadgeReconciled,
        text: styles.availabilityStatusBadgeReconciledText,
      };
    case 'insufficient':
      return {
        badge: styles.availabilityStatusBadgeInsufficient,
        text: styles.availabilityStatusBadgeInsufficientText,
      };
    case 'sufficient':
    default:
      return {
        badge: styles.availabilityStatusBadgeSufficient,
        text: styles.availabilityStatusBadgeSufficientText,
      };
  }
}

function formatUnitQuantity(value: number, unit: UnitOfMeasure) {
  const formatted = value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  switch (unit) {
    case 'GRAMS':
      return `${formatted} g`;
    case 'MILLILITERS':
      return `${formatted} ml`;
    case 'UNITS':
    default:
      return `${formatted} un`;
  }
}

function formatPercentage(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0%';
  }

  return `${Math.round(value * 100)}%`;
}

type RangePreset = '7d' | '30d' | '90d' | 'custom';

const REPORTING_RANGE_PRESETS: Array<{
  id: Exclude<RangePreset, 'custom'>;
  label: string;
  days: number;
}> = [
  { id: '7d', label: '7 dias', days: 7 },
  { id: '30d', label: '30 dias', days: 30 },
  { id: '90d', label: '90 dias', days: 90 },
];

const GRANULARITY_OPTIONS: Array<{ value: PeriodGranularity; label: string }> = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
];

function detectInitialRangePreset(
  rangeInDays: number,
  hasCustomWindow: boolean,
): RangePreset {
  if (hasCustomWindow) {
    return 'custom';
  }

  const match = REPORTING_RANGE_PRESETS.find(preset => preset.days === rangeInDays);
  return match?.id ?? '30d';
}

function formatDateRangeLabel(from: Date, to: Date): string {
  const sameMonth =
    from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const includeYear = from.getFullYear() !== to.getFullYear();

  const startLabel = from.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: includeYear ? 'numeric' : undefined,
  });

  const endLabel = to.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: includeYear || !sameMonth ? 'numeric' : undefined,
  });

  return `${startLabel} – ${endLabel}`;
}

function parseDateParam(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function SummaryCard({
  iconName,
  iconBackground,
  iconColor,
  label,
  value,
  subtitle,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  iconBackground: string;
  iconColor: string;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIconWrapper, { backgroundColor: iconBackground }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      {subtitle ? <Text style={styles.summarySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export default function StockReportScreen() {
  const authorization = useAuthorization();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const canViewReports = authorization.canViewReports;
  const canEditPrice = authorization.hasRole('gelatie');
  const route = useRoute<RouteProp<AppStackParamList, 'StockReports'>>();

  const initialGranularity = route.params?.granularity ?? 'week';
  const initialRangeInDays = route.params?.rangeInDays ?? 30;
  const initialFrom = parseDateParam(route.params?.from);
  const initialTo = parseDateParam(route.params?.to);
  const hasCustomWindow = Boolean(initialFrom && initialTo);

  const [granularity, setGranularity] = useState<PeriodGranularity>(initialGranularity);
  const [selectedRangePreset, setSelectedRangePreset] = useState<RangePreset>(
    detectInitialRangePreset(initialRangeInDays, hasCustomWindow),
  );
  const [customRange] = useState<{ from?: Date; to?: Date }>(() => ({
    from: initialFrom,
    to: initialTo,
  }));
  const [sellingPriceInput, setSellingPriceInput] = useState('');
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceSuccess, setPriceSuccess] = useState<string | null>(null);
  const priceFeedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (priceFeedbackTimeout.current) {
        clearTimeout(priceFeedbackTimeout.current);
      }
    };
  }, []);

  const { products } = useProducts({
    enabled: canViewReports,
  });
  const productsById = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach(product => map.set(product.id, product.name));
    return map;
  }, [products]);

  const {
    settings: pricingSettings,
    isLoading: isLoadingPricing,
    error: pricingError,
    update: savePricingSettings,
    retry: retryPricingSettings,
  } = usePricingSettings({ enabled: canViewReports });

  const {
    plans: completedPlans,
    isLoading: isLoadingCompletedPlans,
    error: completedPlansError,
    retry: retryCompletedPlans,
  } = useProductionPlans({
    status: ['completed'],
    includeArchived: false,
    limit: 200,
    enabled: canViewReports,
  });

  const pricingValue = pricingSettings?.sellingPricePer100gInBRL;

  useEffect(() => {
    if (!pricingValue || isSavingPrice) {
      return;
    }

    const formatted = pricingValue.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    setSellingPriceInput(prev => {
      if (prev !== formatted) {
        return formatted;
      }
      return prev;
    });

    setPriceError(prev => {
      if (prev !== null) {
        return null;
      }
      return prev;
    });
  }, [pricingValue, isSavingPrice]);

  const getProductName = useCallback(
    (productId: string) => productsById.get(productId) ?? 'Produto sem nome',
    [productsById],
  );

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 2,
      }),
    [],
  );

  const formatCurrency = useCallback(
    (value: number | null | undefined) => currencyFormatter.format(value ?? 0),
    [currencyFormatter],
  );

  const pricePer100g = pricingSettings?.sellingPricePer100gInBRL ?? 0;
  const pricePerKg = pricingSettings?.sellingPricePerKilogramInBRL ?? (pricePer100g ? pricePer100g * 10 : 0);

  const sellingPrice = useMemo(() => {
    return {
      per100g: pricePer100g,
      perKg: pricePerKg,
    };
  }, [pricePer100g, pricePerKg]);

  const reportingRangeSelection = useMemo(() => {
    if (selectedRangePreset === 'custom' && customRange.from && customRange.to) {
      return {
        from: customRange.from,
        to: customRange.to,
      } as const;
    }

    const defaultPreset = REPORTING_RANGE_PRESETS[1];
    const preset =
      REPORTING_RANGE_PRESETS.find(item => item.id === selectedRangePreset) ??
      defaultPreset;

    return {
      rangeInDays: preset.days,
    } as const;
  }, [customRange.from, customRange.to, selectedRangePreset]);

  const {
    summaries: analyticsSummaries,
    isLoading: isLoadingReporting,
    error: reportingError,
    refetch: refetchReporting,
    from: reportingFrom,
    to: reportingTo,
  } = useReportingSummaries({
    granularity,
    enabled: canViewReports,
    ...reportingRangeSelection,
  });

  const reportingRangeLabel = useMemo(
    () => formatDateRangeLabel(reportingFrom, reportingTo),
    [reportingFrom, reportingTo],
  );

  const productionCostSummary = useMemo(() => {
    const sellingPricePer100g = sellingPrice.per100g;

    const computeRevenue = (
      quantity: number | null | undefined,
      unit: UnitOfMeasure,
    ): number | null => {
      if (!quantity || !Number.isFinite(quantity) || quantity <= 0) {
        return null;
      }

      if (unit !== 'GRAMS' || sellingPricePer100g <= 0) {
        return null;
      }

      return (quantity / 100) * sellingPricePer100g;
    };

    const filtered = completedPlans.filter(plan => {
      const reference = plan.completedAt ?? plan.scheduledFor;
      return reference >= reportingFrom && reference <= reportingTo;
    });

    if (filtered.length === 0) {
      return {
        totals: {
          estimatedCost: 0,
          actualCost: 0,
          estimatedRevenue: 0,
          actualRevenue: 0,
        },
        rows: [],
        totalCount: 0,
        hasRevenueReference: sellingPricePer100g > 0,
      } as const;
    }

    const sorted = [...filtered].sort((a, b) => {
      const aDate = (a.completedAt ?? a.scheduledFor)?.getTime?.() ?? 0;
      const bDate = (b.completedAt ?? b.scheduledFor)?.getTime?.() ?? 0;
      return bDate - aDate;
    });

    const totals = sorted.reduce(
      (accumulator, plan) => {
        accumulator.estimatedCost += plan.estimatedProductionCostInBRL ?? 0;
        accumulator.actualCost += plan.actualProductionCostInBRL ?? 0;

        const estimatedRevenue = computeRevenue(plan.quantityInUnits, plan.unitOfMeasure);
        if (estimatedRevenue != null) {
          accumulator.estimatedRevenue += estimatedRevenue;
        }

        const actualRevenue = computeRevenue(
          plan.actualQuantityInUnits,
          plan.unitOfMeasure,
        );
        if (actualRevenue != null) {
          accumulator.actualRevenue += actualRevenue;
        }

        return accumulator;
      },
      {
        estimatedCost: 0,
        actualCost: 0,
        estimatedRevenue: 0,
        actualRevenue: 0,
      },
    );

    const rows = sorted.slice(0, 6).map(plan => {
      const estimatedRevenue = computeRevenue(plan.quantityInUnits, plan.unitOfMeasure);
      const actualRevenue = computeRevenue(
        plan.actualQuantityInUnits,
        plan.unitOfMeasure,
      );
      const actualCost = plan.actualProductionCostInBRL ?? null;
      const margin =
        actualRevenue != null && actualCost != null ? actualRevenue - actualCost : null;
      const marginRate =
        margin != null && actualRevenue && actualRevenue > 0
          ? margin / actualRevenue
          : null;

      return {
        id: plan.id,
        code: plan.code,
        recipeName: plan.recipeName,
        completedAt: plan.completedAt ?? plan.updatedAt ?? plan.scheduledFor,
        estimatedCost: plan.estimatedProductionCostInBRL ?? null,
        actualCost,
        estimatedRevenue,
        actualRevenue,
        margin,
        marginRate,
        unitOfMeasure: plan.unitOfMeasure,
        quantityInUnits: plan.quantityInUnits,
        actualQuantityInUnits: plan.actualQuantityInUnits ?? null,
      };
    });

    return {
      totals,
      rows,
      totalCount: filtered.length,
      hasRevenueReference: sellingPricePer100g > 0,
    } as const;
  }, [completedPlans, reportingFrom, reportingTo, sellingPrice.per100g]);

  const handleSavePrice = useCallback(async () => {
    if (!canEditPrice) {
      setPriceError('Somente o Gelatiê pode alterar o preço de venda.');
      return;
    }

    const normalizedValue = sellingPriceInput
      .trim()
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(',', '.');

    const parsedValue = Number(normalizedValue || '0');

    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      setPriceError('Informe um valor válido em reais por 100 g.');
      setPriceSuccess(null);
      return;
    }

    try {
      setIsSavingPrice(true);
      setPriceError(null);
      setPriceSuccess(null);

      if (priceFeedbackTimeout.current) {
        clearTimeout(priceFeedbackTimeout.current);
        priceFeedbackTimeout.current = null;
      }

      await savePricingSettings({
        sellingPricePer100gInBRL: parsedValue,
        updatedBy: userId,
      });

      setPriceSuccess('Configuração de preço salva com sucesso.');
      priceFeedbackTimeout.current = setTimeout(() => {
        setPriceSuccess(null);
        priceFeedbackTimeout.current = null;
      }, 3500);
    } catch (error) {
      setPriceError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o preço de venda.',
      );
    } finally {
      setIsSavingPrice(false);
    }
  }, [canEditPrice, savePricingSettings, sellingPriceInput, userId]);

  const stockMovementsOptions = useMemo(
    () => ({ limit: 50, enabled: canViewReports }),
    [canViewReports],
  );

  const stockAlertStatuses = useMemo<StockAlertStatus[]>(
    () => ['open', 'acknowledged'],
    [],
  );

  const productionDivergenceStatuses = useMemo<ProductionDivergenceStatus[]>(
    () => ['open'],
    [],
  );

  const {
    movements,
    isLoading: isLoadingMovements,
    error: movementsError,
    retry: retryMovements,
  } = useStockMovements(stockMovementsOptions);

  const {
    records: availabilityRecords,
    metrics: availabilityMetrics,
    isLoading: isLoadingAvailability,
    error: availabilityError,
    retry: retryAvailability,
  } = useProductionAvailabilityRecords({
    limit: 40,
    windowInDays: 45,
    enabled: canViewReports,
  });

  const {
    alerts,
    isLoading: isLoadingAlerts,
    error: alertsError,
    retry: retryAlerts,
  } = useStockAlerts({ status: stockAlertStatuses, limit: 50, enabled: canViewReports });

  const {
    divergences,
    isLoading: isLoadingDivergences,
    error: divergencesError,
    retry: retryDivergences,
  } = useProductionDivergences({
    status: productionDivergenceStatuses,
    limit: 50,
    suspense: false,
  });

  const totals = useMemo(() => {
    return movements.reduce(
      (acc, movement: StockMovement) => {
        if (movement.type === 'increment' || movement.type === 'initial') {
          acc.entryCount += 1;
          acc.entryQuantity += movement.quantityInGrams;
        } else if (movement.type === 'decrement') {
          acc.exitCount += 1;
          acc.exitQuantity += movement.quantityInGrams;
        } else if (movement.type === 'adjustment') {
          acc.adjustmentCount += 1;
          acc.adjustmentQuantity += movement.quantityInGrams;
        }
        return acc;
      },
      {
        entryCount: 0,
        entryQuantity: 0,
        exitCount: 0,
        exitQuantity: 0,
        adjustmentCount: 0,
        adjustmentQuantity: 0,
      },
    );
  }, [movements]);

  const openAlertsCount = useMemo(
    () => alerts.filter(alert => alert.status === 'open').length,
    [alerts],
  );

  const acknowledgedAlertsCount = useMemo(
    () => alerts.filter(alert => alert.status === 'acknowledged').length,
    [alerts],
  );

  const handleRetryAll = useCallback(() => {
    retryMovements();
    retryAlerts();
    retryDivergences();
    retryAvailability();
    retryCompletedPlans();
    retryPricingSettings();
    refetchReporting();
  }, [
    refetchReporting,
    retryAlerts,
    retryAvailability,
    retryDivergences,
    retryCompletedPlans,
    retryPricingSettings,
    retryMovements,
  ]);

  if (!canViewReports) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={36} color="#9CA3AF" />
          <Text style={styles.centeredTitle}>Acesso restrito</Text>
          <Text style={styles.centeredSubtitle}>
            Você não tem permissão para visualizar os relatórios de estoque.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const hasError = Boolean(
    movementsError ||
      alertsError ||
      divergencesError ||
      availabilityError ||
      reportingError ||
      pricingError ||
      completedPlansError,
  );

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Relatórios de estoque</Text>
        <Text style={styles.subheading}>
          Acompanhe em tempo real as entradas, saídas, alertas e divergências registradas.
        </Text>

        <View style={styles.summaryRow}>
          <SummaryCard
            iconName="arrow-down-circle-outline"
            iconBackground="#E0F2FE"
            iconColor="#0369A1"
            label="Entradas de estoque"
            value={formatGrams(totals.entryQuantity)}
            subtitle={`${totals.entryCount} movimentações`}
          />
          <SummaryCard
            iconName="arrow-up-circle-outline"
            iconBackground="#FEE2E2"
            iconColor="#B91C1C"
            label="Saídas de estoque"
            value={formatGrams(totals.exitQuantity)}
            subtitle={`${totals.exitCount} movimentações`}
          />
          <SummaryCard
            iconName="warning-outline"
            iconBackground="#FEF3C7"
            iconColor="#92400E"
            label="Alertas pendentes"
            value={`${openAlertsCount}`}
            subtitle={`Reconhecidos: ${acknowledgedAlertsCount}`}
          />
          <SummaryCard
            iconName="clipboard-outline"
            iconBackground="#EDE9FE"
            iconColor="#6D28D9"
            label="Checagens de produção"
            value={availabilityMetrics.checkedCount.toString()}
            subtitle={`Faltas previstas: ${availabilityMetrics.shortageCount}`}
          />
        </View>

        <View style={styles.configurationCard}>
          <View style={styles.configurationHeader}>
            <View>
              <Text style={styles.configurationTitle}>Preço de venda por 100 g</Text>
              <Text style={styles.configurationSubtitle}>
                Utilizado para comparar custo x receita nas produções concluídas.
              </Text>
            </View>
            {isLoadingPricing || isSavingPrice ? (
              <ActivityIndicator color="#2563EB" />
            ) : null}
          </View>
          <View style={styles.priceInputRow}>
            <TextInput
              style={[styles.priceInput, !canEditPrice && styles.priceInputDisabled]}
              value={sellingPriceInput}
              onChangeText={value => {
                setSellingPriceInput(value);
                setPriceError(null);
              }}
              editable={canEditPrice && !isSavingPrice}
              keyboardType="decimal-pad"
              placeholder="0,00"
            />
            {canEditPrice ? (
              <Pressable
                onPress={handleSavePrice}
                disabled={isSavingPrice}
                style={({ pressed }) => [
                  styles.priceSaveButton,
                  (isSavingPrice || pressed) && styles.priceSaveButtonDisabled,
                ]}
              >
                <Text style={styles.priceSaveButtonText}>
                  {isSavingPrice ? 'Salvando…' : 'Salvar'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.configurationHint}>
            Equivalente a {formatCurrency(sellingPrice.perKg)} por kg.
          </Text>
          {priceError ? (
            <Text style={styles.configurationError}>{priceError}</Text>
          ) : null}
          {priceSuccess ? (
            <Text style={styles.configurationSuccess}>{priceSuccess}</Text>
          ) : null}
        </View>

        <View style={styles.analyticsFiltersSection}>
          <Text style={styles.analyticsFiltersTitle}>Filtros das análises</Text>
          <View style={styles.filterChipRow}>
            {REPORTING_RANGE_PRESETS.map(preset => {
              const isSelected = selectedRangePreset === preset.id;
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => setSelectedRangePreset(preset.id)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    isSelected && styles.filterChipSelected,
                    pressed && styles.filterChipPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isSelected && styles.filterChipTextSelected,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
            {hasCustomWindow ? (
              <View
                style={[
                  styles.filterChip,
                  selectedRangePreset === 'custom'
                    ? styles.filterChipSelected
                    : styles.filterChipDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedRangePreset === 'custom'
                      ? styles.filterChipTextSelected
                      : styles.filterChipText,
                  ]}
                >
                  Janela personalizada
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.filterChipRow}>
            {GRANULARITY_OPTIONS.map(option => {
              const isSelected = granularity === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setGranularity(option.value)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    isSelected && styles.filterChipSelected,
                    pressed && styles.filterChipPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isSelected && styles.filterChipTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ReportingAnalyticsPanel
          granularity={granularity}
          rangeLabel={reportingRangeLabel}
          isLoading={isLoadingReporting}
          error={reportingError}
          recipeSummaries={analyticsSummaries.recipeProduction}
          ingredientSummaries={analyticsSummaries.ingredientConsumption}
          divergenceSummaries={analyticsSummaries.divergenceUsage}
          onRetry={refetchReporting}
          getProductName={getProductName}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Produções concluídas</Text>
            {isLoadingCompletedPlans ? <ActivityIndicator color="#2563EB" /> : null}
          </View>
          {completedPlansError ? (
            <Text style={styles.sectionError}>{completedPlansError.message}</Text>
          ) : productionCostSummary.rows.length === 0 ? (
            <Text style={styles.sectionEmpty}>
              Nenhuma produção concluída no período selecionado.
            </Text>
          ) : (
            <>
              <View style={styles.costSummaryRow}>
                <View style={styles.costSummaryItem}>
                  <Text style={styles.costSummaryValue}>
                    {formatCurrency(productionCostSummary.totals.actualCost)}
                  </Text>
                  <Text style={styles.costSummaryLabel}>Custo real</Text>
                </View>
                <View style={styles.costSummaryItem}>
                  <Text style={styles.costSummaryValue}>
                    {formatCurrency(productionCostSummary.totals.estimatedCost)}
                  </Text>
                  <Text style={styles.costSummaryLabel}>Custo estimado</Text>
                </View>
                {productionCostSummary.hasRevenueReference ? (
                  <View style={styles.costSummaryItem}>
                    <Text style={styles.costSummaryValue}>
                      {formatCurrency(productionCostSummary.totals.actualRevenue)}
                    </Text>
                    <Text style={styles.costSummaryLabel}>Receita estimada</Text>
                  </View>
                ) : null}
              </View>
              {!productionCostSummary.hasRevenueReference ? (
                <Text style={styles.productionCostHint}>
                  Configure o preço de venda para visualizar a comparação com receita.
                </Text>
              ) : null}
              {productionCostSummary.rows.map(plan => (
                <View key={plan.id} style={styles.productionCostCard}>
                  <View style={styles.productionCostHeader}>
                    <Text style={styles.productionCostTitle}>{plan.recipeName}</Text>
                    <Text style={styles.productionCostCode}>#{plan.code}</Text>
                  </View>
                  <Text style={styles.productionCostMeta}>
                    {plan.completedAt.toLocaleDateString('pt-BR')} ·{' '}
                    {formatUnitQuantity(
                      plan.actualQuantityInUnits ?? plan.quantityInUnits,
                      plan.unitOfMeasure,
                    )}
                  </Text>
                  <View style={styles.productionCostRow}>
                    <View style={styles.productionCostMetric}>
                      <Text style={styles.productionCostLabel}>Custo real</Text>
                      <Text style={styles.productionCostValue}>
                        {formatCurrency(plan.actualCost)}
                      </Text>
                    </View>
                    <View style={styles.productionCostMetric}>
                      <Text style={styles.productionCostLabel}>Custo estimado</Text>
                      <Text style={styles.productionCostValue}>
                        {formatCurrency(plan.estimatedCost)}
                      </Text>
                    </View>
                    {productionCostSummary.hasRevenueReference ? (
                      <View style={styles.productionCostMetric}>
                        <Text style={styles.productionCostLabel}>Receita</Text>
                        <Text style={styles.productionCostValue}>
                          {formatCurrency(plan.actualRevenue ?? plan.estimatedRevenue)}
                        </Text>
                        {plan.margin != null ? (
                          <Text style={styles.productionCostDelta}>
                            Margem: {formatCurrency(plan.margin)}
                            {plan.marginRate != null
                              ? ` (${Math.round(plan.marginRate * 100)}%)`
                              : ''}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}
            </>
          )}
        </View>

        {hasError ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={24} color="#B91C1C" />
            <Text style={styles.errorTitle}>
              Não foi possível carregar todos os dados.
            </Text>
            <Pressable
              onPress={handleRetryAll}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.retryButtonPressed,
              ]}
            >
              <Text style={styles.retryButtonText}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Checagens de disponibilidade</Text>
            {isLoadingAvailability ? <ActivityIndicator color="#4E9F3D" /> : null}
          </View>
          {availabilityError ? (
            <Text style={styles.sectionError}>{availabilityError.message}</Text>
          ) : availabilityRecords.length === 0 ? (
            <Text style={styles.sectionEmpty}>
              Nenhum registro de disponibilidade encontrado no período.
            </Text>
          ) : (
            <>
              <View style={styles.availabilitySummaryRow}>
                <View style={styles.availabilitySummaryItem}>
                  <Text style={styles.availabilitySummaryValue}>
                    {formatPercentage(availabilityMetrics.shortageRate)}
                  </Text>
                  <Text style={styles.availabilitySummaryLabel}>Taxa de faltas</Text>
                </View>
                <View style={styles.availabilitySummaryItem}>
                  <Text style={styles.availabilitySummaryValue}>
                    {availabilityMetrics.executedCount}
                  </Text>
                  <Text style={styles.availabilitySummaryLabel}>Planos executados</Text>
                </View>
                <View style={styles.availabilitySummaryItem}>
                  <Text style={styles.availabilitySummaryValue}>
                    {formatGrams(availabilityMetrics.totalPredictedShortageInGrams)}
                  </Text>
                  <Text style={styles.availabilitySummaryLabel}>Falta prevista</Text>
                </View>
              </View>
              {availabilityRecords.slice(0, 8).map(record => {
                const statusStyles = availabilityStatusStyle(record.status);
                const shortageLabel =
                  record.totalShortageInGrams > 0
                    ? `Falta prevista: ${formatGrams(record.totalShortageInGrams)}`
                    : 'Sem faltas previstas';
                const actualShortage =
                  record.actualShortageInGrams !== null &&
                  record.actualShortageInGrams !== undefined
                    ? `Falta real: ${formatGrams(record.actualShortageInGrams)}`
                    : null;

                return (
                  <View key={record.id} style={styles.availabilityCard}>
                    <View style={styles.availabilityHeader}>
                      <View style={styles.availabilityTitleRow}>
                        <Text style={styles.availabilityTitle}>{record.recipeName}</Text>
                        <View
                          style={[styles.availabilityStatusBadge, statusStyles.badge]}
                        >
                          <Text
                            style={[styles.availabilityStatusText, statusStyles.text]}
                          >
                            {availabilityStatusLabel(record.status)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.availabilityMeta}>
                        {record.planCode} ·{' '}
                        {formatRelativeDate(record.createdAt ?? record.scheduledFor)}
                      </Text>
                    </View>
                    <Text style={styles.availabilityDescription}>
                      Quantidade planejada:{' '}
                      {formatUnitQuantity(record.quantityInUnits, record.unitOfMeasure)}
                    </Text>
                    <Text style={styles.availabilityDescription}>{shortageLabel}</Text>
                    {actualShortage ? (
                      <Text style={styles.availabilityDescription}>{actualShortage}</Text>
                    ) : null}
                    <Text style={styles.availabilityFooter}>
                      Total previsto: {formatGrams(record.totalRequiredInGrams)} ·{' '}
                      Consumido: {formatGrams(record.actualConsumedInGrams ?? 0)}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Movimentações recentes</Text>
            {isLoadingMovements ? <ActivityIndicator color="#4E9F3D" /> : null}
          </View>
          {movementsError ? (
            <Text style={styles.sectionError}>{movementsError.message}</Text>
          ) : movements.length === 0 ? (
            <Text style={styles.sectionEmpty}>
              Nenhuma movimentação registrada nos últimos dias.
            </Text>
          ) : (
            movements.slice(0, 10).map(movement => {
              const productName =
                productsById.get(movement.productId) ?? `Produto ${movement.productId}`;
              const icon = movementIcon(movement);

              return (
                <View key={movement.id} style={styles.listItem}>
                  <View
                    style={[
                      styles.listItemIconWrapper,
                      { backgroundColor: icon.background },
                    ]}
                  >
                    <Ionicons name={icon.name} size={18} color={icon.color} />
                  </View>
                  <View style={styles.listItemContent}>
                    <Text style={styles.listItemTitle}>{productName}</Text>
                    <Text style={styles.listItemSubtitle}>
                      {movementTypeLabel(movement)} ·{' '}
                      {formatGrams(movement.quantityInGrams)}
                    </Text>
                    <Text style={styles.listItemMeta}>
                      {formatRelativeDate(movement.performedAt)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Alertas ativos</Text>
            {isLoadingAlerts ? <ActivityIndicator color="#4E9F3D" /> : null}
          </View>
          {alertsError ? (
            <Text style={styles.sectionError}>{alertsError.message}</Text>
          ) : alerts.length === 0 ? (
            <Text style={styles.sectionEmpty}>
              Nenhum alerta aberto ou reconhecido no momento.
            </Text>
          ) : (
            alerts.slice(0, 10).map(alert => {
              const severityStyle = alertSeverityStyle(alert.severity);
              const productName =
                productsById.get(alert.productId) ?? `Produto ${alert.productId}`;

              return (
                <View key={alert.id} style={styles.alertCard}>
                  <View style={[styles.alertBadge, severityStyle.badge]}>
                    <Text style={[styles.alertBadgeText, severityStyle.text]}>
                      {alert.severity === 'critical' ? 'Crítico' : 'Atenção'}
                    </Text>
                  </View>
                  <View style={styles.alertContent}>
                    <Text style={styles.alertTitle}>{productName}</Text>
                    <Text style={styles.alertDescription}>
                      Estoque atual: {formatGrams(alert.currentQuantityInGrams)} · mínimo{' '}
                      {formatGrams(alert.minimumQuantityInGrams)}
                    </Text>
                    <Text style={styles.alertMeta}>
                      {alert.status === 'acknowledged' ? 'Reconhecido' : 'Aberto'} ·{' '}
                      {formatRelativeDate(alert.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Divergências de produção</Text>
            {isLoadingDivergences ? <ActivityIndicator color="#4E9F3D" /> : null}
          </View>
          {divergencesError ? (
            <Text style={styles.sectionError}>{divergencesError.message}</Text>
          ) : divergences.length === 0 ? (
            <Text style={styles.sectionEmpty}>
              Nenhuma divergência aberta registrada.
            </Text>
          ) : (
            divergences.slice(0, 10).map(divergence => (
              <View key={divergence.id} style={styles.divergenceCard}>
                <View style={styles.divergenceHeader}>
                  <View style={styles.divergenceSeverity}>
                    <Ionicons
                      name={
                        divergence.severity === 'high'
                          ? 'flame-outline'
                          : divergence.severity === 'medium'
                            ? 'alert-circle-outline'
                            : 'information-circle-outline'
                      }
                      size={18}
                      color={
                        divergence.severity === 'high'
                          ? '#B91C1C'
                          : divergence.severity === 'medium'
                            ? '#D97706'
                            : '#2563EB'
                      }
                    />
                    <Text style={styles.divergenceSeverityText}>
                      {divergence.severity === 'high'
                        ? 'Alta'
                        : divergence.severity === 'medium'
                          ? 'Média'
                          : 'Baixa'}
                    </Text>
                  </View>
                  <Text style={styles.divergenceMeta}>
                    {formatRelativeDate(divergence.createdAt)}
                  </Text>
                </View>
                <Text style={styles.divergenceDescription}>{divergence.description}</Text>
                {divergence.expectedQuantityInUnits !== null ? (
                  <Text style={styles.divergenceQuantities}>
                    Esperado: {formatGrams(divergence.expectedQuantityInUnits ?? 0)} ·
                    Produzido: {formatGrams(divergence.actualQuantityInUnits ?? 0)}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1B1E',
    marginBottom: 6,
  },
  subheading: {
    fontSize: 15,
    color: '#4B5563',
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    flexBasis: '32%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  summaryIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  summarySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  analyticsFiltersSection: {
    marginBottom: 24,
    gap: 12,
  },
  configurationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  configurationHeader: {
    gap: 4,
  },
  configurationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  configurationSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  priceInputRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  priceInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  priceInputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
  },
  priceSaveButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#111827',
  },
  priceSaveButtonDisabled: {
    opacity: 0.5,
  },
  priceSaveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  configurationHint: {
    fontSize: 12,
    color: '#6B7280',
  },
  configurationError: {
    fontSize: 13,
    color: '#B91C1C',
  },
  configurationSuccess: {
    fontSize: 13,
    color: '#047857',
  },
  analyticsFiltersTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#E5E7EB',
  },
  filterChipSelected: {
    backgroundColor: '#111827',
  },
  filterChipDisabled: {
    backgroundColor: '#E5E7EB',
    opacity: 0.7,
  },
  filterChipPressed: {
    opacity: 0.85,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
  },
  errorCard: {
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'flex-start',
    gap: 12,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#991B1B',
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#991B1B',
  },
  retryButtonPressed: {
    opacity: 0.85,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  sectionError: {
    color: '#B91C1C',
    fontSize: 14,
  },
  sectionEmpty: {
    color: '#6B7280',
    fontSize: 14,
  },
  listItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  listItemIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  listItemSubtitle: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 2,
  },
  listItemMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  alertCard: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    gap: 12,
  },
  alertBadge: {
    height: 28,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBadgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  alertBadgeWarningText: {
    color: '#92400E',
  },
  alertBadgeCritical: {
    backgroundColor: '#FEE2E2',
  },
  alertBadgeCriticalText: {
    color: '#B91C1C',
  },
  alertBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  alertDescription: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 2,
  },
  alertMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  costSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 16,
  },
  costSummaryItem: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 14,
  },
  costSummaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  costSummaryLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  productionCostHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
  },
  divergenceCard: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  divergenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divergenceSeverity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  divergenceSeverityText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  divergenceMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  divergenceDescription: {
    fontSize: 14,
    color: '#374151',
  },
  divergenceQuantities: {
    fontSize: 13,
    color: '#6B7280',
  },
  availabilityCard: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  availabilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  availabilityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  availabilityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flexShrink: 1,
  },
  availabilityStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  availabilityStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  availabilityStatusBadgeFulfilled: {
    backgroundColor: '#DCFCE7',
  },
  availabilityStatusBadgeFulfilledText: {
    color: '#047857',
  },
  availabilityStatusBadgeReconciled: {
    backgroundColor: '#FEF9C3',
  },
  availabilityStatusBadgeReconciledText: {
    color: '#B45309',
  },
  availabilityStatusBadgeInsufficient: {
    backgroundColor: '#FEE2E2',
  },
  availabilityStatusBadgeInsufficientText: {
    color: '#B91C1C',
  },
  availabilityStatusBadgeSufficient: {
    backgroundColor: '#E0F2FE',
  },
  availabilityStatusBadgeSufficientText: {
    color: '#0369A1',
  },
  availabilityMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  availabilityDescription: {
    fontSize: 13,
    color: '#4B5563',
  },
  availabilityFooter: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  availabilitySummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  availabilitySummaryItem: {
    flexGrow: 1,
    minWidth: 100,
  },
  availabilitySummaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  availabilitySummaryLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  productionCostCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  productionCostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productionCostTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flexShrink: 1,
  },
  productionCostCode: {
    fontSize: 12,
    color: '#6B7280',
  },
  productionCostMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  productionCostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productionCostMetric: {
    gap: 4,
  },
  productionCostLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  productionCostValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  productionCostDelta: {
    fontSize: 12,
    fontWeight: '500',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  centeredTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  centeredSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
