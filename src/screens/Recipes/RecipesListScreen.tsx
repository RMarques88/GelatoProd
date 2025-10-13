import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { BarcodeScannerField } from '@/components/inputs/BarcodeScannerField';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { RoleGate } from '@/components/security/RoleGate';
import { useRecipes, useProducts, useStockItems } from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { unitCostPerGram } from '@/utils/financial';
import { logError } from '@/utils/logger';
import type { AppStackParamList } from '@/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
// ...existing code...

const yieldFormatter = (value: number) => `${value.toFixed(0)} g`;

type Props = NativeStackScreenProps<AppStackParamList, 'Recipes'>;

export default function RecipesListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const authorization = useAuthorization(user);
  const [filterText, setFilterText] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { recipes, isLoading, error, archive, restore, remove, retry } = useRecipes({
    includeInactive,
  });
  const { products } = useProducts({ includeInactive: true });
  const { stockItems } = useStockItems({ includeArchived: true });

  const sortedRecipes = useMemo(
    () =>
      [...recipes]
        .filter(r => {
          const term = filterText.trim().toLowerCase();
          if (!term) return true;
          const nameMatches = r.name.toLowerCase().includes(term);
          const descriptionMatches = r.description
            ? r.description.toLowerCase().includes(term)
            : false;
          return nameMatches || descriptionMatches;
        })
        .sort((first, second) =>
          first.name.localeCompare(second.name, 'pt-BR', { sensitivity: 'base' }),
        ),
    [recipes, filterText],
  );

  const handleRefresh = useCallback(() => {
    retry();
  }, [retry]);

  const handleCreatePress = useCallback(() => {
    navigation.navigate('RecipeUpsert');
  }, [navigation]);

  const handleEditPress = useCallback(
    (recipeId: string) => {
      navigation.navigate('RecipeUpsert', { recipeId });
    },
    [navigation],
  );

  const confirmArchive = useCallback(
    (recipeId: string) => {
      Alert.alert('Arquivar receita', 'Deseja arquivar esta receita?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Arquivar',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingId(recipeId);
              await archive(recipeId);
            } catch (archiveError) {
              logError(archiveError, 'screens.recipes.archive');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]);
    },
    [archive],
  );

  const confirmRestore = useCallback(
    (recipeId: string) => {
      Alert.alert('Restaurar receita', 'Deseja restaurar esta receita?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: async () => {
            try {
              setProcessingId(recipeId);
              await restore(recipeId);
            } catch (restoreError) {
              logError(restoreError, 'screens.recipes.restore');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]);
    },
    [restore],
  );

  const confirmDelete = useCallback(
    (recipeId: string) => {
      Alert.alert(
        'Excluir receita',
        'Esta ação é permanente. Deseja excluir a receita?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir',
            style: 'destructive',
            onPress: async () => {
              try {
                setProcessingId(recipeId);
                await remove(recipeId);
              } catch (deleteError) {
                logError(deleteError, 'screens.recipes.delete');
              } finally {
                setProcessingId(null);
              }
            },
          },
        ],
      );
    },
    [remove],
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof recipes)[number] }) => {
      const disabled = Boolean(processingId && processingId !== item.id);
      const isProcessing = processingId === item.id;
      const ingredientCount = item.ingredients.length;
      // Helper to compute total cost of a recipe (in BRL) by summing its ingredients.
      const computeRecipeTotalCost = (recipeId: string, depth = 5): number => {
        if (depth <= 0) return 0;
        const recipe = recipes.find(r => r.id === recipeId);
        if (!recipe) return 0;

        return recipe.ingredients.reduce((s, ing) => {
          if (ing.type === 'product') {
            const prod = products.find(p => p.id === ing.referenceId);
            if (!prod) return s;
            const stockItem = stockItems.find(si => si.productId === prod.id);
            const perGram = unitCostPerGram(stockItem ?? null);
            if (prod.unitOfMeasure === 'UNITS') {
              const raw =
                stockItem?.averageUnitCostInBRL ?? stockItem?.highestUnitCostInBRL ?? 0;
              return s + ing.quantityInGrams * raw; // units still multiply directly
            }
            return s + ing.quantityInGrams * perGram;
          }

          // Nested recipe: compute total cost of nested recipe, then scale to quantity
          const nestedTotal = computeRecipeTotalCost(ing.referenceId, depth - 1);
          const nestedRecipe = recipes.find(r => r.id === ing.referenceId);
          const perGram =
            nestedRecipe && nestedRecipe.yieldInGrams > 0
              ? nestedTotal / nestedRecipe.yieldInGrams
              : 0;
          return s + perGram * ing.quantityInGrams;
        }, 0);
      };

      const estimatedCost = item.ingredients.reduce((sum, ing) => {
        if (ing.type === 'product') {
          const prod = products.find(p => p.id === ing.referenceId);
          if (!prod) return sum;
          const stockItem = stockItems.find(si => si.productId === prod.id);
          const perGram = unitCostPerGram(stockItem ?? null);
          if (prod.unitOfMeasure === 'UNITS') {
            const raw =
              stockItem?.averageUnitCostInBRL ?? stockItem?.highestUnitCostInBRL ?? 0;
            return sum + ing.quantityInGrams * raw;
          }
          return sum + ing.quantityInGrams * perGram;
        }

        // ingredient type is 'recipe'
        const nestedTotal = computeRecipeTotalCost(ing.referenceId);
        const nestedRecipe = recipes.find(r => r.id === ing.referenceId);
        const perGram =
          nestedRecipe && nestedRecipe.yieldInGrams > 0
            ? nestedTotal / nestedRecipe.yieldInGrams
            : 0;
        return sum + perGram * ing.quantityInGrams;
      }, 0);

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.recipeName}>{item.name}</Text>
              {item.description ? (
                <Text style={styles.recipeDescription}>{item.description}</Text>
              ) : null}
            </View>
            <View
              style={[styles.statusBadge, !item.isActive && styles.statusBadgeInactive]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  !item.isActive && styles.statusBadgeTextInactive,
                ]}
              >
                {item.isActive ? 'Ativa' : 'Inativa'}
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaValue}>
              Rendimento: {yieldFormatter(item.yieldInGrams)}
            </Text>
            <Text style={styles.metaValue}>
              Ingredientes: {ingredientCount} {ingredientCount === 1 ? 'item' : 'itens'}
            </Text>
          </View>

          {/* Estimated cost */}
          <View style={styles.estimatedCostRow}>
            <Text style={styles.estimatedCostText}>
              Custo estimado: R$ {estimatedCost.toFixed(2)}
            </Text>
          </View>

          {item.instructions ? (
            <Text style={styles.instructionsPreview}>{truncate(item.instructions)}</Text>
          ) : null}

          {authorization.canManageProducts ? (
            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => handleEditPress(item.id)}
                style={({ pressed }) => [
                  styles.actionButton,
                  pressed && styles.actionButtonPressed,
                ]}
                disabled={disabled}
              >
                <Text style={styles.actionButtonText}>Editar</Text>
              </Pressable>

              {item.isActive ? (
                <Pressable
                  onPress={() => confirmArchive(item.id)}
                  style={({ pressed }) => [
                    styles.actionButton,
                    pressed && styles.actionButtonPressed,
                  ]}
                  disabled={disabled}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="#1A1B1E" />
                  ) : (
                    <Text style={styles.actionButtonText}>Arquivar</Text>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => confirmRestore(item.id)}
                  style={({ pressed }) => [
                    styles.actionButton,
                    pressed && styles.actionButtonPressed,
                  ]}
                  disabled={disabled}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="#1A1B1E" />
                  ) : (
                    <Text style={styles.actionButtonText}>Restaurar</Text>
                  )}
                </Pressable>
              )}

              {!item.isActive ? (
                <Pressable
                  onPress={() => confirmDelete(item.id)}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    pressed && styles.deleteButtonPressed,
                  ]}
                  disabled={disabled}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.deleteButtonText}>Excluir</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      );
    },
    [
      authorization.canManageProducts,
      confirmArchive,
      confirmDelete,
      confirmRestore,
      handleEditPress,
      processingId,
      products,
      stockItems,
      recipes,
    ],
  );

  const renderEmptyList = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {isLoading ? 'Buscando receitas...' : 'Nenhuma receita cadastrada.'}
        </Text>
        {!isLoading ? (
          <RoleGate requiredRole="gelatie" fallback={null}>
            <Text style={styles.emptyMessage}>
              Cadastre sua primeira receita tocando no botão "Nova receita".
            </Text>
          </RoleGate>
        ) : null}
      </View>
    ),
    [isLoading],
  );

  return (
    <ScreenContainer>
      <View style={styles.filterRow}>
        <BarcodeScannerField
          value={filterText}
          onChangeText={setFilterText}
          placeholder="Buscar por nome ou descrição"
          placeholderTextColor="#9CA3AF"
          containerStyle={styles.filterScannerField}
          inputStyle={styles.filterInput}
          editable
        />
      </View>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Receitas</Text>
          <Text style={styles.subtitle}>
            Consulte e edite as fichas técnicas utilizadas na produção.
          </Text>
        </View>
        <RoleGate requiredRole="gelatie" fallback={null}>
          <Pressable
            onPress={handleCreatePress}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Nova receita</Text>
          </Pressable>
        </RoleGate>
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Incluir inativas</Text>
        <Switch value={includeInactive} onValueChange={setIncludeInactive} />
      </View>

      {error ? <Text style={styles.errorText}>{error.message}</Text> : null}

      <FlatList
        data={sortedRecipes}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyList}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
        }
      />
    </ScreenContainer>
  );
}

function truncate(text: string, max = 140) {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1B1E',
  },
  subtitle: {
    fontSize: 15,
    color: '#5E5F61',
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: '#4E9F3D',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  toggleLabel: {
    fontSize: 15,
    color: '#1A1B1E',
  },
  errorText: {
    color: '#E53E3E',
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 24,
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  recipeDescription: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  metaValue: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
  instructionsPreview: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusBadgeInactive: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    color: '#4338CA',
    fontWeight: '600',
    fontSize: 12,
  },
  statusBadgeTextInactive: {
    color: '#B91C1C',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#DC2626',
  },
  deleteButtonPressed: {
    opacity: 0.8,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  emptyMessage: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  estimatedCostRow: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  estimatedCostText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 16,
    width: '100%',
  },
  filterScannerField: {
    flex: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  filterInput: {
    fontSize: 15,
    color: '#1A1B1E',
    paddingVertical: 6,
  },
});
