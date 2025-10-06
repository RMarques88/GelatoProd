import { memo, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  DivergenceUsagePeriodSummary,
  IngredientConsumptionPeriodSummary,
  PeriodGranularity,
  RecipeProductionPeriodSummary,
} from '@/services/reportingMetrics';

const granularityLabels: Record<PeriodGranularity, string> = {
  day: 'Dia',
  week: 'Semana',
  month: 'Mês',
};

type ReportingAnalyticsPanelProps = {
  granularity: PeriodGranularity;
  rangeLabel: string;
  isLoading: boolean;
  error: Error | null;
  recipeSummaries: RecipeProductionPeriodSummary[];
  ingredientSummaries: IngredientConsumptionPeriodSummary[];
  divergenceSummaries: DivergenceUsagePeriodSummary[];
  onRetry: () => void;
  getProductName: (productId: string) => string;
};

function ReportingAnalyticsPanelComponent({
  granularity,
  rangeLabel,
  isLoading,
  error,
  recipeSummaries,
  ingredientSummaries,
  divergenceSummaries,
  onRetry,
  getProductName,
}: ReportingAnalyticsPanelProps) {
  const latestRecipeSummary = recipeSummaries[0] ?? null;
  const latestIngredientSummary = ingredientSummaries[0] ?? null;
  const latestDivergenceSummary = divergenceSummaries[0] ?? null;
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 2,
      }),
    [],
  );

  const recipeTopList = useMemo(() => {
    if (!latestRecipeSummary) {
      return [];
    }

    return latestRecipeSummary.totals.recipes.slice(0, 4);
  }, [latestRecipeSummary]);

  const ingredientTopList = useMemo(() => {
    if (!latestIngredientSummary) {
      return [];
    }

    return latestIngredientSummary.totals.products.slice(0, 4);
  }, [latestIngredientSummary]);

  const severityBreakdown = useMemo(() => {
    if (!latestDivergenceSummary) {
      return [];
    }

    return latestDivergenceSummary.totals.severity;
  }, [latestDivergenceSummary]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Tendências analíticas</Text>
          <Text style={styles.subtitle}>
            {granularityLabels[granularity]} · {rangeLabel}
          </Text>
        </View>
        {isLoading ? <ActivityIndicator color="#2563EB" /> : null}
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color="#B91C1C" />
          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>Não foi possível carregar as métricas.</Text>
            <Text style={styles.errorMessage}>{error.message}</Text>
          </View>
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.retryButtonPressed,
            ]}
          >
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      {!isLoading && !error ? (
        <View style={styles.cardsGrid}>
          <View style={styles.analyticsCard}>
            <View style={[styles.cardIconWrapper, styles.cardIconWrapperProduction]}>
              <Ionicons name="bar-chart-outline" size={20} color="#0369A1" />
            </View>
            <Text style={styles.cardTitle}>Produção por receita</Text>
            {latestRecipeSummary ? (
              <>
                <Text style={styles.cardPeriod}>{latestRecipeSummary.periodLabel}</Text>
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>
                      {latestRecipeSummary.totals.totalPlans}
                    </Text>
                    <Text style={styles.metricLabel}>Planos concluídos</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>
                      {latestRecipeSummary.totals.totalPlannedQuantityInUnits.toLocaleString(
                        'pt-BR',
                        { maximumFractionDigits: 0 },
                      )}
                    </Text>
                    <Text style={styles.metricLabel}>Qtd planejada</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>
                      {latestRecipeSummary.totals.totalActualQuantityInUnits.toLocaleString(
                        'pt-BR',
                        { maximumFractionDigits: 0 },
                      )}
                    </Text>
                    <Text style={styles.metricLabel}>Qtd real</Text>
                  </View>
                </View>
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>
                      {currencyFormatter.format(
                        latestRecipeSummary.totals.totalEstimatedCostInBRL ?? 0,
                      )}
                    </Text>
                    <Text style={styles.metricLabel}>Custo estimado</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>
                      {currencyFormatter.format(
                        latestRecipeSummary.totals.totalActualCostInBRL ?? 0,
                      )}
                    </Text>
                    <Text style={styles.metricLabel}>Custo real</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                {recipeTopList.length > 0 ? (
                  <View style={styles.list}>
                    {recipeTopList.map(recipe => (
                      <View key={recipe.recipeId} style={styles.listItem}>
                        <Text style={styles.listItemTitle}>{recipe.recipeName}</Text>
                        <Text style={styles.listItemSubtitle}>
                          {recipe.planCount} plano(s) ·{' '}
                          {recipe.actualQuantityInUnits.toLocaleString('pt-BR', {
                            maximumFractionDigits: 0,
                          })}{' '}
                          un reais
                        </Text>
                        <Text style={styles.listItemDetail}>
                          Custo: {currencyFormatter.format(recipe.actualCostInBRL ?? 0)}{' '}
                          {recipe.actualCostInBRL != null &&
                          recipe.estimatedCostInBRL != null
                            ? `(${currencyFormatter.format(
                                recipe.estimatedCostInBRL,
                              )} previsto)`
                            : null}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>
                    Sem dados de produção finalizada no período.
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.emptyText}>
                Sem dados de produção finalizada no período selecionado.
              </Text>
            )}
          </View>

          <View style={styles.analyticsCard}>
            <View style={[styles.cardIconWrapper, styles.cardIconWrapperConsumption]}>
              <Ionicons name="leaf-outline" size={20} color="#92400E" />
            </View>
            <Text style={styles.cardTitle}>Consumo de insumos</Text>
            {latestIngredientSummary ? (
              <>
                <Text style={styles.cardPeriod}>
                  {latestIngredientSummary.periodLabel}
                </Text>
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>
                      {latestIngredientSummary.totals.totalMovements}
                    </Text>
                    <Text style={styles.metricLabel}>Movimentações</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>
                      {latestIngredientSummary.totals.totalConsumedInGrams.toLocaleString(
                        'pt-BR',
                        { maximumFractionDigits: 0 },
                      )}
                      g
                    </Text>
                    <Text style={styles.metricLabel}>Consumo total</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                {ingredientTopList.length > 0 ? (
                  <View style={styles.list}>
                    {ingredientTopList.map(product => (
                      <View key={product.productId} style={styles.listItem}>
                        <Text style={styles.listItemTitle}>
                          {getProductName(product.productId)}
                        </Text>
                        <Text style={styles.listItemSubtitle}>
                          {product.quantityInGrams.toLocaleString('pt-BR', {
                            maximumFractionDigits: 0,
                          })}{' '}
                          g · {product.movementCount} mov.
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>
                    Nenhuma movimentação de saída registrada no período.
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.emptyText}>
                Nenhuma movimentação de saída registrada no período selecionado.
              </Text>
            )}
          </View>

          <View style={styles.analyticsCard}>
            <View style={[styles.cardIconWrapper, styles.cardIconWrapperDivergence]}>
              <Ionicons name="alert-circle-outline" size={20} color="#5B21B6" />
            </View>
            <Text style={styles.cardTitle}>Divergências de produção</Text>
            {latestDivergenceSummary ? (
              <>
                <Text style={styles.cardPeriod}>
                  {latestDivergenceSummary.periodLabel}
                </Text>
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>
                      {latestDivergenceSummary.totals.totalDivergences}
                    </Text>
                    <Text style={styles.metricLabel}>Registros</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>
                      {latestDivergenceSummary.totals.totalShortageInUnits.toLocaleString(
                        'pt-BR',
                        { maximumFractionDigits: 0 },
                      )}
                    </Text>
                    <Text style={styles.metricLabel}>Faltas acumuladas (un)</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                {severityBreakdown.length > 0 ? (
                  <View style={styles.badgeList}>
                    {severityBreakdown.map(entry => (
                      <View key={entry.severity} style={styles.badgeItem}>
                        <View
                          style={[styles.badgeDot, severityDotStyle(entry.severity)]}
                        />
                        <Text style={styles.badgeText}>
                          {entry.severity.toUpperCase()}: {entry.count} registro(s)
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>
                    Nenhuma divergência de ingrediente registrada no período.
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.emptyText}>
                Nenhuma divergência de ingrediente registrada no período selecionado.
              </Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function severityDotStyle(severity: 'high' | 'medium' | 'low') {
  switch (severity) {
    case 'high':
      return { backgroundColor: '#DC2626' };
    case 'medium':
      return { backgroundColor: '#F59E0B' };
    case 'low':
    default:
      return { backgroundColor: '#10B981' };
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
    marginBottom: 32,
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FCA5A5',
    marginBottom: 16,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#991B1B',
  },
  errorMessage: {
    fontSize: 13,
    color: '#B91C1C',
    marginTop: 2,
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  retryButtonPressed: {
    opacity: 0.8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  cardsGrid: {
    flexDirection: 'column',
    gap: 16,
  },
  analyticsCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  cardIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconWrapperProduction: {
    backgroundColor: '#E0F2FE',
  },
  cardIconWrapperConsumption: {
    backgroundColor: '#FEF3C7',
  },
  cardIconWrapperDivergence: {
    backgroundColor: '#EDE9FE',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  cardPeriod: {
    fontSize: 13,
    color: '#6B7280',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricItem: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
  },
  list: {
    gap: 10,
  },
  listItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  listItemSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  listItemDetail: {
    fontSize: 12,
    color: '#374151',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
  },
  badgeList: {
    gap: 8,
  },
  badgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    color: '#4B5563',
  },
});

export const ReportingAnalyticsPanel = memo(ReportingAnalyticsPanelComponent);
