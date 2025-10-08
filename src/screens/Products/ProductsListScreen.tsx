import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
  Pressable,
  TextInput,
} from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { useProducts } from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { logError } from '@/utils/logger';
import type { AppStackParamList } from '@/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<AppStackParamList, 'Products'>;

export default function ProductsListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const authorization = useAuthorization(user);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const userId = user?.id ?? null;

  const { products, isLoading, error, archive, restore, remove, retry } = useProducts({
    includeInactive,
  });

  const normalizedQuery = useMemo(() => query.trim().toLowerCase(), [query]);

  const filteredProducts = useMemo(() => {
    if (!normalizedQuery) return products;
    return products.filter(p => {
      const inName = p.name?.toLowerCase().includes(normalizedQuery);
      const inBarcode = (p.barcode ?? '').toLowerCase().includes(normalizedQuery);
      const inTags = (p.tags ?? []).some(t => t.toLowerCase().includes(normalizedQuery));
      const inCategory = (p.category ?? '').toLowerCase().includes(normalizedQuery);
      return inName || inBarcode || inTags || inCategory;
    });
  }, [normalizedQuery, products]);

  const sortedProducts = useMemo(
    () =>
      [...filteredProducts].sort((first, second) =>
        first.name.localeCompare(second.name, 'pt-BR', { sensitivity: 'base' }),
      ),
    [filteredProducts],
  );

  const handleRefresh = useCallback(() => {
    retry();
  }, [retry]);

  const handleCreatePress = useCallback(() => {
    navigation.navigate('ProductUpsert');
  }, [navigation]);

  const handleEditPress = useCallback(
    (productId: string) => {
      navigation.navigate('ProductUpsert', { productId });
    },
    [navigation],
  );

  const handleArchive = useCallback(
    (productId: string) => {
      Alert.alert('Arquivar produto', 'Deseja realmente arquivar este produto?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Arquivar',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingId(productId);
              await archive(productId);
            } catch (archiveError) {
              logError(archiveError, 'screens.products.archive');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]);
    },
    [archive],
  );

  const handleRestore = useCallback(
    (productId: string) => {
      Alert.alert('Restaurar produto', 'Deseja restaurar este produto?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: async () => {
            try {
              setProcessingId(productId);
              await restore(productId);
            } catch (restoreError) {
              logError(restoreError, 'screens.products.restore');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]);
    },
    [restore],
  );

  const handleDelete = useCallback(
    (productId: string) => {
      Alert.alert(
        'Excluir produto',
        'Esta ação não pode ser desfeita. Deseja excluir o produto permanentemente?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir',
            style: 'destructive',
            onPress: async () => {
              try {
                setProcessingId(productId);
                if (!userId) {
                  Alert.alert('Sessão expirada', 'Faça login novamente e tente de novo.');
                  return;
                }

                await remove(productId, {
                  performedBy: userId,
                  reason:
                    'Estoque limpo automaticamente após exclusão permanente do produto.',
                });
              } catch (deleteError) {
                logError(deleteError, 'screens.products.delete');
              } finally {
                setProcessingId(null);
              }
            },
          },
        ],
      );
    },
    [remove, userId],
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof products)[number] }) => {
      const disabled = Boolean(processingId && processingId !== item.id);
      const isProcessing = processingId === item.id;
      const unitLabel =
        item.unitOfMeasure === 'GRAMS'
          ? 'g'
          : item.unitOfMeasure === 'KILOGRAMS'
            ? 'kg'
            : item.unitOfMeasure === 'MILLILITERS'
              ? 'ml'
              : item.unitOfMeasure === 'LITERS'
                ? 'L'
                : 'un';

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.productName}>{item.name}</Text>
              {item.category ? (
                <Text style={styles.productCategory}>{item.category}</Text>
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
                {item.isActive ? 'Ativo' : 'Inativo'}
              </Text>
            </View>
          </View>
          {item.description ? (
            <Text style={styles.productDescription}>{item.description}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.metaValue}>
              {item.barcode
                ? `Código de barras: ${item.barcode}`
                : 'Sem código de barras'}
            </Text>
            {item.tags.length ? (
              <Text style={styles.metaTags}>Tags: {item.tags.join(', ')}</Text>
            ) : null}
            <View style={styles.metaChipsRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>Unidade: {unitLabel}</Text>
              </View>
              <View
                style={[styles.metaChip, !item.trackInventory && styles.metaChipWarning]}
              >
                <Text
                  style={[
                    styles.metaChipText,
                    !item.trackInventory && styles.metaChipTextWarning,
                  ]}
                >
                  {item.trackInventory ? 'Controla estoque' : 'Sem controle de estoque'}
                </Text>
              </View>
            </View>
          </View>

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
                  onPress={() => handleArchive(item.id)}
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
                  onPress={() => handleRestore(item.id)}
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
                  onPress={() => handleDelete(item.id)}
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
      handleArchive,
      handleDelete,
      handleEditPress,
      handleRestore,
      processingId,
    ],
  );

  const renderEmptyList = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {isLoading ? 'Buscando produtos...' : 'Nenhum produto encontrado.'}
        </Text>
        {!isLoading && authorization.canManageProducts ? (
          <Text style={styles.emptyMessage}>
            Cadastre seu primeiro produto tocando no botão "Novo produto".
          </Text>
        ) : null}
      </View>
    ),
    [authorization.canManageProducts, isLoading],
  );

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Produtos</Text>
          <Text style={styles.subtitle}>
            Gerencie o catálogo e mantenha os dados atualizados.
          </Text>
        </View>
        {authorization.canManageProducts ? (
          <Pressable
            onPress={handleCreatePress}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Novo produto</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nome, código ou tag"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
          accessibilityLabel="Buscar produtos"
        />
        {query ? (
          <Pressable
            onPress={() => setQuery('')}
            style={({ pressed }) => [
              styles.clearButton,
              pressed && styles.clearButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Limpar busca"
          >
            <Text style={styles.clearButtonText}>Limpar</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Incluir inativos</Text>
        <Switch value={includeInactive} onValueChange={setIncludeInactive} />
      </View>

      {error ? <Text style={styles.errorText}>{error.message}</Text> : null}

      <FlatList
        data={sortedProducts}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 6,
  },
  clearButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  clearButtonPressed: {
    opacity: 0.85,
  },
  clearButtonText: {
    color: '#1F2937',
    fontWeight: '600',
    fontSize: 12,
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
    alignItems: 'center',
    marginBottom: 8,
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  productCategory: {
    fontSize: 14,
    color: '#6B7280',
  },
  productDescription: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  metaChipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
  },
  metaChipWarning: {
    backgroundColor: '#FEF3C7',
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  metaChipTextWarning: {
    color: '#B45309',
  },
  metaValue: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
  metaTags: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '500',
  },
  statusBadge: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusBadgeInactive: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    color: '#047857',
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
});
