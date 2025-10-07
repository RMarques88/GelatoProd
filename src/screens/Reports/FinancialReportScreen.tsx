import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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
  const { settings, isLoading: isLoadingPricing } = usePricingSettings();
  const { plans, isLoading: isLoadingPlans } = useProductionPlans({
    status: ['completed'],
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

  const summary = useMemo(
    () =>
      computeFinancialSummary(
        plans,
        products,
        stockItems,
        settings ?? undefined,
        rangeFrom,
        rangeTo,
      ),
    [plans, products, stockItems, settings, rangeFrom, rangeTo],
  );

  const isLoading = isLoadingPricing || isLoadingPlans;

  const projection = useMemo(() => {
    const days = Math.max(
      1,
      (rangeTo.getTime() - rangeFrom.getTime()) / (1000 * 60 * 60 * 24),
    );
    return {
      revenue: (summary.revenue / days) * 15,
      cost: (summary.cost / days) * 15,
      margin: (summary.margin / days) * 15,
    };
  }, [rangeFrom, rangeTo, summary]);

  return (
    <ScreenContainer>
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
          <SummaryCard
            iconName="trending-up-outline"
            iconBackground="#DBEAFE"
            iconColor="#1D4ED8"
            label="Margem (estimada)"
            value={currency.format(summary.margin)}
          />
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
            <SummaryCard
              iconName="trending-up-outline"
              iconBackground="#E0F2FE"
              iconColor="#0369A1"
              label="Margem (proj.)"
              value={currency.format(projection.margin)}
            />
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
});
