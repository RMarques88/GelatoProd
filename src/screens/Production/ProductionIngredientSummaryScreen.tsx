import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { getProductById } from '@/services/firestore/productsService';
import { getRecipeById } from '@/services/firestore/recipesService';
import { getProductionPlanById } from '@/services/firestore/productionService';
import { listStockItems } from '@/services/firestore/stockService';
import { resolveProductRequirements } from '@/services/productionRequirements';
import type { Recipe, ProductionPlan, UnitOfMeasure } from '@/domain';
import type { AppStackParamList } from '@/navigation';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

function formatGrams(quantityInGrams: number): string {
  if (!Number.isFinite(quantityInGrams) || quantityInGrams <= 0) {
    return '0 g';
  }

  if (quantityInGrams >= 1000) {
    const kilograms = quantityInGrams / 1000;
    return `${kilograms.toLocaleString('pt-BR', {
      minimumFractionDigits: kilograms % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })} kg`;
  }

  return `${quantityInGrams.toLocaleString('pt-BR', {
    minimumFractionDigits: quantityInGrams % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} g`;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return currencyFormatter.format(value);
}

function formatProductionQuantity(quantity: number, unit: UnitOfMeasure): string {
  if (!Number.isFinite(quantity)) {
    return '0';
  }

  const formatted = quantity.toLocaleString('pt-BR', {
    minimumFractionDigits: quantity % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  if (unit === 'GRAMS') {
    return formatGrams(quantity);
  }

  if (unit === 'MILLILITERS') {
    return `${formatted} ml`;
  }

  return `${formatted} un`;
}

type IngredientSummary = {
  productId: string;
  productName: string;
  barcode: string | null;
  requiredQuantityInGrams: number;
  estimatedCostInBRL: number | null;
  averageUnitCostInBRL: number | null;
};

type IngredientSummaryError = {
  title: string;
  message: string;
};

export function ProductionIngredientSummaryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, 'ProductionIngredientSummary'>>();
  const { planId } = route.params;

  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredientSummary, setIngredientSummary] = useState<IngredientSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<IngredientSummaryError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const batchFactor = useMemo(() => {
    if (!plan || !recipe) {
      return null;
    }

    if (plan.unitOfMeasure === 'GRAMS') {
      if (!Number.isFinite(recipe.yieldInGrams) || recipe.yieldInGrams <= 0) {
        return null;
      }

      return plan.quantityInUnits / recipe.yieldInGrams;
    }

    return plan.quantityInUnits;
  }, [plan, recipe]);

  const totalEstimatedCost = useMemo(() => {
    if (ingredientSummary.length === 0) {
      return 0;
    }

    return ingredientSummary.reduce((accumulator, item) => {
      return accumulator + (item.estimatedCostInBRL ?? 0);
    }, 0);
  }, [ingredientSummary]);

  const costInsights = useMemo(() => {
    if (ingredientSummary.length === 0) {
      return { withCost: 0, missingCost: 0, coverage: 0 } as const;
    }

    let withCost = 0;
    let missingCost = 0;

    for (const item of ingredientSummary) {
      if (
        typeof item.estimatedCostInBRL === 'number' &&
        Number.isFinite(item.estimatedCostInBRL)
      ) {
        withCost += 1;
      } else {
        missingCost += 1;
      }
    }

    const coverage = Math.round((withCost / ingredientSummary.length) * 100);

    return { withCost, missingCost, coverage } as const;
  }, [ingredientSummary]);

  const planQuantityLabel = useMemo(() => {
    if (!plan) {
      return '';
    }

    return formatProductionQuantity(plan.quantityInUnits, plan.unitOfMeasure);
  }, [plan]);

  useEffect(() => {
    if (!planId) {
      setIngredientSummary([]);
      setRecipe(null);
      setPlan(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    let cancelled = false;

    (async () => {
      try {
        // Fetch plan first
        const planData = await getProductionPlanById(planId);
        if (cancelled) return;

        setPlan(planData);

        if (!planData.recipeId) {
          throw new Error('Este plano de produção não possui uma receita associada.');
        }

        // Fetch recipe
        const recipeData = await getRecipeById(planData.recipeId);
        if (cancelled) return;

        setRecipe(recipeData);

        // Calculate requirements
        const requirementsMap = await resolveProductRequirements({
          quantityInUnits: planData.quantityInUnits,
          unitOfMeasure: planData.unitOfMeasure,
          recipe: recipeData,
        });

        if (cancelled) return;

        const requirementEntries = Array.from(requirementsMap.entries()).filter(
          ([, quantity]) => Number.isFinite(quantity) && quantity > 0,
        );

        // Fetch product and stock data for each ingredient
        const summaries: IngredientSummary[] = await Promise.all(
          requirementEntries.map(async ([productId, requiredQuantity]) => {
            const [product, stockItems] = await Promise.all([
              getProductById(productId).catch(() => null),
              listStockItems({ productId }).catch(() => []),
            ]);

            const aggregatedCost = stockItems.reduce(
              (accumulator, item) => {
                const quantity = item.currentQuantityInGrams ?? 0;
                const unitCost =
                  item.averageUnitCostInBRL ?? item.highestUnitCostInBRL ?? 0;
                return {
                  totalQuantity: accumulator.totalQuantity + quantity,
                  totalCost: accumulator.totalCost + quantity * unitCost,
                };
              },
              { totalQuantity: 0, totalCost: 0 },
            );

            let averageUnitCostInBRL: number | null = null;

            if (aggregatedCost.totalQuantity > 0 && aggregatedCost.totalCost > 0) {
              averageUnitCostInBRL =
                aggregatedCost.totalCost / aggregatedCost.totalQuantity;
            } else if (stockItems[0]) {
              averageUnitCostInBRL =
                stockItems[0].averageUnitCostInBRL ??
                stockItems[0].highestUnitCostInBRL ??
                null;
            }

            const estimatedCostInBRL =
              averageUnitCostInBRL !== null && Number.isFinite(requiredQuantity)
                ? averageUnitCostInBRL * requiredQuantity
                : null;

            return {
              productId,
              productName: product?.name ?? 'Produto sem cadastro',
              barcode: product?.barcode ?? null,
              requiredQuantityInGrams: requiredQuantity,
              estimatedCostInBRL,
              averageUnitCostInBRL,
            };
          }),
        );

        if (cancelled) return;

        const sortedSummaries = summaries.sort((a, b) =>
          a.productName.localeCompare(b.productName, 'pt-BR', { sensitivity: 'base' }),
        );

        setIngredientSummary(sortedSummaries);
      } catch (err) {
        if (cancelled) return;

        const fallbackMessage =
          err instanceof Error && err.message
            ? err.message
            : 'Não foi possível calcular os ingredientes para esta produção.';

        setError({
          title: 'Erro ao carregar ingredientes',
          message: fallbackMessage,
        });
        setIngredientSummary([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [planId, reloadToken]);

  const handleRetry = useCallback(() => {
    setReloadToken(previous => previous + 1);
  }, []);

  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleGoBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <Text style={styles.backButtonText}>Voltar</Text>
          </Pressable>
          <View style={styles.headerTextBlock}>
            <Text style={styles.heading}>Resumo dos ingredientes</Text>
            <Text style={styles.subheading}>
              Consulte as quantidades necessárias e o custo estimado para esta produção.
            </Text>
          </View>
        </View>

        {plan ? (
          <View style={styles.planCard}>
            <Text style={styles.planTitle}>{plan.recipeName}</Text>
            <Text style={styles.planMeta}>Produção de {planQuantityLabel}</Text>
            <Text style={styles.planMeta}>
              Receita base rende{' '}
              {recipe?.yieldInGrams
                ? formatGrams(recipe.yieldInGrams)
                : 'quantidade não informada'}
            </Text>
            {batchFactor ? (
              <Text style={styles.planBatchFactor}>
                Fator de produção:{' '}
                {batchFactor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
              </Text>
            ) : null}
            {recipe?.ingredients?.length ? (
              <Text style={styles.planIngredientsCount}>
                {recipe.ingredients.length} ingrediente(s) mapeado(s)
              </Text>
            ) : null}
          </View>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color="#2563EB" style={styles.loader} />
        ) : error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorTitle}>{error.title}</Text>
            <Text style={styles.errorMessage}>{error.message}</Text>
            <Pressable
              onPress={handleRetry}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.retryButtonPressed,
              ]}
            >
              <Text style={styles.retryButtonText}>Recarregar</Text>
            </Pressable>
          </View>
        ) : ingredientSummary.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Nenhum ingrediente encontrado</Text>
            <Text style={styles.emptySubtitle}>
              Esta receita não possui produtos cadastrados ou ainda está incompleta.
            </Text>
          </View>
        ) : (
          <View style={styles.summaryWrapper}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryHeading}>Ingredientes</Text>
              <Text style={styles.summarySubheading}>
                Veja as quantidades necessárias e o impacto financeiro de cada insumo.
              </Text>
            </View>

            <View style={styles.summaryHighlightCard}>
              <View style={styles.summaryHighlightRow}>
                <Text style={styles.summaryHighlightLabel}>Custo estimado total</Text>
                <Text style={styles.summaryHighlightValue}>
                  {formatCurrency(totalEstimatedCost)}
                </Text>
              </View>
              <View style={styles.summaryHighlightMetaRow}>
                <Text style={styles.summaryHighlightMeta}>
                  {ingredientSummary.length} ingrediente(s)
                </Text>
                <Text style={styles.summaryHighlightMeta}>
                  {costInsights.coverage}% com custo mapeado
                  {costInsights.missingCost > 0
                    ? ` · ${costInsights.missingCost} sem preço`
                    : ''}
                </Text>
              </View>
            </View>

            <View style={styles.ingredientsList}>
              {ingredientSummary.map((item, index) => {
                const hasCost =
                  typeof item.estimatedCostInBRL === 'number' &&
                  Number.isFinite(item.estimatedCostInBRL);
                const unitCostPerKilogram =
                  typeof item.averageUnitCostInBRL === 'number' &&
                  Number.isFinite(item.averageUnitCostInBRL)
                    ? item.averageUnitCostInBRL * 1000
                    : null;

                return (
                  <View
                    key={item.productId}
                    style={[
                      styles.ingredientRow,
                      index === ingredientSummary.length - 1 && styles.ingredientRowLast,
                    ]}
                  >
                    <View style={styles.ingredientInfo}>
                      <Text style={styles.ingredientName}>{item.productName}</Text>
                      <Text style={styles.ingredientMeta}>ID: {item.productId}</Text>
                      {item.barcode ? (
                        <Text style={styles.ingredientMeta}>
                          Código de barras: {item.barcode}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.ingredientMetrics}>
                      <Text style={styles.ingredientQuantity}>
                        {formatGrams(item.requiredQuantityInGrams)}
                      </Text>
                      <Text
                        style={[
                          styles.ingredientCost,
                          !hasCost && styles.ingredientCostUnavailable,
                        ]}
                      >
                        {hasCost
                          ? formatCurrency(item.estimatedCostInBRL)
                          : 'Custo indisponível'}
                      </Text>
                      <Text
                        style={[
                          styles.ingredientUnitCost,
                          !hasCost && styles.ingredientUnitCostWarning,
                        ]}
                      >
                        {hasCost && unitCostPerKilogram !== null
                          ? `Custo médio: ${formatCurrency(unitCostPerKilogram)} / kg`
                          : 'Cadastre o custo médio deste insumo no estoque para estimar o total.'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.footerSpacer} />
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
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 24,
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  backButtonPressed: {
    opacity: 0.85,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  headerTextBlock: {
    flex: 1,
    gap: 6,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  subheading: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 24,
  },
  planTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  planMeta: {
    fontSize: 14,
    color: '#4B5563',
  },
  planBatchFactor: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  planIngredientsCount: {
    fontSize: 12,
    color: '#6B7280',
  },
  loader: {
    marginTop: 32,
  },
  summaryWrapper: {
    gap: 20,
  },
  summaryHeader: {
    gap: 8,
  },
  summaryHeading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  summarySubheading: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  summaryHighlightCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 12,
  },
  summaryHighlightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  summaryHighlightLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  summaryHighlightValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  summaryHighlightMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryHighlightMeta: {
    fontSize: 12,
    color: '#1E3A8A',
    opacity: 0.85,
  },
  ingredientsList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    overflow: 'hidden',
  },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  ingredientRowLast: {
    borderBottomWidth: 0,
  },
  ingredientInfo: {
    flex: 1,
    gap: 4,
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  ingredientMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  ingredientMetrics: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 140,
  },
  ingredientQuantity: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563EB',
  },
  ingredientCost: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  ingredientCostUnavailable: {
    color: '#B91C1C',
  },
  ingredientUnitCost: {
    fontSize: 12,
    color: '#6B7280',
  },
  ingredientUnitCostWarning: {
    fontSize: 12,
    color: '#B91C1C',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 280,
  },
  errorBanner: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#B91C1C',
  },
  errorMessage: {
    fontSize: 13,
    color: '#7F1D1D',
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  retryButtonPressed: {
    opacity: 0.85,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
  },
  footerSpacer: {
    height: 24,
  },
});

export default ProductionIngredientSummaryScreen;
