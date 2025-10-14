import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import {
  usePricingSettings,
  useProductionPlans,
  useProducts,
  useStockItems,
} from '@/hooks/data';
import { computeFinancialSummary } from '@/utils/financial';
// (UnitOfMeasure no longer needed directly after refactor)

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
      <View style={[styles.iconBadge, { backgroundColor: iconBackground }]}>
        <Ionicons name={iconName} size={18} color={iconColor} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      {subtitle ? <Text style={styles.summarySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export default function FinancialReportScreen() {
  const { width, height } = useWindowDimensions();
  const orientation = height >= width ? 'portrait' : 'landscape';
  const { settings, isLoading: isLoadingPricing } = usePricingSettings();
  const { plans: completedPlans, isLoading: isLoadingPlans } = useProductionPlans({
    status: ['completed'],
    includeArchived: false,
    limit: 250,
  });
  const { plans: scheduledPlans } = useProductionPlans({
    status: ['scheduled'],
    includeArchived: false,
    limit: 250,
  });
  const { products } = useProducts({ includeInactive: true });
  const { stockItems } = useStockItems({ includeArchived: true });

  const currency = useMemo(
    () => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
    [],
  );

  const { rangeFrom, rangeTo } = useMemo(() => {
    const _to = new Date();
    const _from = new Date();
    _from.setDate(_to.getDate() - 30);
    return { rangeFrom: _from, rangeTo: _to };
  }, []);

  const { summary, hasAnyOverride } = useMemo(() => {
    // detect overrides presence among filtered plans within window
    const s = computeFinancialSummary(
      completedPlans,
      products,
      stockItems,
      settings ?? undefined,
      rangeFrom,
      rangeTo,
    );
    let any = false;
    const overrides = settings?.accessories?.overridesByRecipeId;
    if (overrides) {
      for (const p of plans) {
        if (!p.recipeId) continue;
        if (overrides[p.recipeId] && overrides[p.recipeId]!.length > 0) {
          const ref = p.completedAt ?? p.scheduledFor;
          if (ref && ref >= rangeFrom && ref <= rangeTo) {
            any = true;
            break;
          }
        }
      }
    }
    return { summary: s, hasAnyOverride: any };
  }, [completedPlans, products, stockItems, settings, rangeFrom, rangeTo]);

  const isLoading = isLoadingPricing || isLoadingPlans;

  // Projection: sum estimated costs and computed revenue for scheduled plans in the
  // next 15 days. If there are no scheduled plans, projection will be zeros.
  const projection = useMemo(() => {
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 15);

    const upcoming = (scheduledPlans ?? []).filter(p => {
      const ref = p.scheduledFor;
      return ref && ref >= now && ref <= end;
    });

    if (!upcoming.length) return { revenue: 0, cost: 0, margin: 0 };

    const sellingPricePer100g = settings?.sellingPricePer100gInBRL ?? 0;
    const totalCost = upcoming.reduce(
      (s, p) => s + (p.estimatedProductionCostInBRL ?? 0),
      0,
    );
    const totalRevenue = upcoming.reduce((s, p) => {
      if (!p.quantityInUnits || !p.unitOfMeasure) return s;
      if (p.unitOfMeasure !== 'GRAMS' || sellingPricePer100g <= 0) return s;
      return s + (p.quantityInUnits / 100) * sellingPricePer100g;
    }, 0);

    return {
      revenue: totalRevenue,
      cost: totalCost,
      margin: Math.max(0, totalRevenue - totalCost),
    };
  }, [scheduledPlans, settings]);

  return (
    <ScreenContainer>
      <ScrollView
        key={orientation}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Relatórios financeiros</Text>
        <Text style={styles.subheading}>
          Resumo de receita, custo e margens (últimos 30 dias)
        </Text>

        {isLoading ? (
          <ActivityIndicator color="#2563EB" />
        ) : (
          <View style={styles.summaryRow}>
            <SummaryCard
              iconName="cash-outline"
              iconBackground="#DCFCE7"
              iconColor="#047857"
              label="Receita estimada"
              value={currency.format(summary.revenue)}
            />
            <SummaryCard
              iconName="pricetag-outline"
              iconBackground="#E0E7FF"
              iconColor="#3730A3"
              label="Custo real"
              value={currency.format(summary.cost)}
            />
            <View style={styles.metricColWrapper}>
              <SummaryCard
                iconName="trending-up-outline"
                iconBackground="#DBEAFE"
                iconColor="#1D4ED8"
                label="Margem (estimada)"
                value={currency.format(summary.margin)}
              />
              {hasAnyOverride ? (
                <View style={styles.badgeRow}>
                  <Text style={styles.overrideBadge}>Overrides ativos</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Projeção (15 dias)</Text>
          {isLoading ? (
            <ActivityIndicator color="#2563EB" />
          ) : (
            <View style={styles.summaryRow}>
              <SummaryCard
                iconName="calendar-outline"
                iconBackground="#FEF9C3"
                iconColor="#B45309"
                label="Receita (proj.)"
                value={currency.format(projection.revenue)}
              />
              <SummaryCard
                iconName="stats-chart-outline"
                iconBackground="#FEE2E2"
                iconColor="#B91C1C"
                label="Custo (proj.)"
                value={currency.format(projection.cost)}
              />
              <View style={styles.metricColWrapper}>
                <SummaryCard
                  iconName="trending-up-outline"
                  iconBackground="#E0F2FE"
                  iconColor="#0369A1"
                  label="Margem (proj.)"
                  value={currency.format(projection.margin)}
                />
                {hasAnyOverride ? (
                  <View style={styles.badgeRow}>
                    <Text style={styles.overrideBadge}>Overrides ativos</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
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
  metricColWrapper: {
    flexBasis: '32%',
    flexGrow: 1,
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
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  summarySubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: '#4B5563',
  },
  badgeRow: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  overrideBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3E8FF',
    color: '#6D28D9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
});
