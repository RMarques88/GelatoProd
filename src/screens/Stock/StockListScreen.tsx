import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import {
  AdjustStockModal,
  AdjustStockModalState,
  movementTypeLabels,
} from '@/components/stock/AdjustStockModal';
import {
  useStockItems,
  useStockMovements,
  useStockAlerts,
  useProducts,
} from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import type { StockMovementType } from '@/domain';
import type { AppStackParamList } from '@/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<AppStackParamList, 'Stock'>;

type AdjustModalState = AdjustStockModalState & {
  itemId: string | null;
};

export default function StockListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const authorization = useAuthorization(user);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [adjustState, setAdjustState] = useState<AdjustModalState>({
    visible: false,
    itemId: null,
    type: 'increment',
    quantity: '',
    note: '',
  });
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);

  const { stockItems, isLoading, error, adjust, retry } = useStockItems({
    includeArchived,
  });
  const { alerts } = useStockAlerts({ status: ['open', 'acknowledged'] });
  const { products } = useProducts({ includeInactive: true });
  const { movements } = useStockMovements({ limit: 20 });

  const productsById = useMemo(
    () => new Map(products.map(product => [product.id, product])),
    [products],
  );

  const lastMovementByItem = useMemo(() => {
    const map = new Map<string, (typeof movements)[number]>();
    movements.forEach(movement => {
      if (!map.has(movement.stockItemId)) {
        map.set(movement.stockItemId, movement);
      }
    });
    return map;
  }, [movements]);

  const alertsByItem = useMemo(() => {
    const map = new Map<string, ReturnType<typeof useStockAlerts>['alerts'][number]>();
    alerts.forEach(alert => {
      map.set(alert.stockItemId, alert);
    });
    return map;
  }, [alerts]);

  const sortedItems = useMemo(() => {
    const items = [...stockItems];
    return items.sort((first, second) => {
      const firstProduct = productsById.get(first.productId)?.name ?? first.productId;
      const secondProduct = productsById.get(second.productId)?.name ?? second.productId;
      return firstProduct.localeCompare(secondProduct, 'pt-BR', { sensitivity: 'base' });
    });
  }, [productsById, stockItems]);

  const handleRefresh = useCallback(() => {
    retry();
  }, [retry]);

  const openAdjustModal = useCallback(
    (itemId: string, type: StockMovementType = 'increment') => {
      setAdjustState({ visible: true, itemId, type, quantity: '', note: '' });
    },
    [],
  );

  const closeAdjustModal = useCallback(() => {
    setAdjustState(previous => ({ ...previous, visible: false }));
  }, []);

  const modalState = useMemo<AdjustStockModalState>(() => {
    const { visible, type, quantity, note } = adjustState;
    return { visible, type, quantity, note };
  }, [adjustState]);

  const handleModalChange = useCallback((nextState: AdjustStockModalState) => {
    setAdjustState(previous => ({ ...previous, ...nextState }));
  }, []);

  const handleConfirmAdjust = useCallback(() => {
    if (!adjustState.itemId) {
      return;
    }

    const item = stockItems.find(candidate => candidate.id === adjustState.itemId);
    if (!item) {
      Alert.alert(
        'Item não encontrado',
        'Não foi possível localizar o item selecionado.',
      );
      closeAdjustModal();
      return;
    }

    const quantityValue = Number(adjustState.quantity.replace(',', '.'));

    if (Number.isNaN(quantityValue) || quantityValue <= 0) {
      Alert.alert(
        'Quantidade inválida',
        'Informe um valor maior que zero para o ajuste.',
      );
      return;
    }

    Alert.alert(
      'Confirmar ajuste',
      `Deseja registrar ${movementTypeLabels[adjustState.type].toLowerCase()} de ${quantityValue}g?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            if (!user) {
              return;
            }
            try {
              setIsSubmittingAdjustment(true);
              await adjust({
                stockItemId: item.id,
                quantityInGrams: quantityValue,
                type: adjustState.type,
                note: adjustState.note.trim() || undefined,
                performedBy: user.id,
              });
              Alert.alert('Ajuste registrado', 'Movimentação adicionada com sucesso.');
              closeAdjustModal();
            } catch (adjustError) {
              Alert.alert(
                'Erro ao ajustar',
                adjustError instanceof Error
                  ? adjustError.message
                  : 'Não foi possível registrar o ajuste.',
              );
            } finally {
              setIsSubmittingAdjustment(false);
            }
          },
        },
      ],
    );
  }, [adjust, adjustState, closeAdjustModal, stockItems, user]);

  const renderItem = useCallback(
    ({ item }: { item: (typeof stockItems)[number] }) => {
      const product = productsById.get(item.productId);
      const alert = alertsByItem.get(item.id);
      const movement = lastMovementByItem.get(item.id);
      const alertBadgeStyle =
        alert?.severity === 'critical'
          ? styles.alertBadgeCritical
          : styles.alertBadgeWarning;
      const hasAlert = Boolean(alert);

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.productName}>{product?.name ?? item.productId}</Text>
              <Text style={styles.productMeta}>ID produto: {item.productId}</Text>
            </View>
            <View style={styles.quantityBadge}>
              <Text style={styles.quantityText}>{item.currentQuantityInGrams} g</Text>
              <Text style={styles.quantitySubtext}>Atual</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Mínimo: {item.minimumQuantityInGrams} g</Text>
            <Text style={styles.metaLabel}>
              {movement
                ? `Última mov.: ${movementTypeLabels[movement.type]} (${movement.quantityInGrams} g)`
                : 'Sem movimentações'}
            </Text>
          </View>

          {hasAlert ? (
            <View style={[styles.alertBadge, alertBadgeStyle]}>
              <Text style={styles.alertBadgeText}>
                {alert?.severity === 'critical' ? 'Crítico' : 'Atenção'}
              </Text>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => navigation.navigate('StockItem', { stockItemId: item.id })}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Ver histórico</Text>
            </Pressable>
            {authorization.canAdjustStock ? (
              <Pressable
                onPress={() => openAdjustModal(item.id, 'decrement')}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Registrar saída</Text>
              </Pressable>
            ) : null}
            {authorization.canAdjustStock ? (
              <Pressable
                onPress={() => openAdjustModal(item.id, 'increment')}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>Adicionar estoque</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    },
    [
      alertsByItem,
      authorization.canAdjustStock,
      lastMovementByItem,
      navigation,
      openAdjustModal,
      productsById,
    ],
  );

  const renderEmptyList = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {isLoading ? 'Carregando estoque...' : 'Nenhum item cadastrado.'}
        </Text>
        {authorization.canManageStock ? (
          <Text style={styles.emptySubtitle}>
            Cadastre um item na área administrativa do Firestore para começar.
          </Text>
        ) : null}
      </View>
    ),
    [authorization.canManageStock, isLoading],
  );

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Estoque</Text>
          <Text style={styles.subtitle}>
            Acompanhe níveis, alertas e movimentações em tempo real.
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('StockAlerts')}
          style={({ pressed }) => [
            styles.alertButton,
            pressed && styles.alertButtonPressed,
          ]}
        >
          <Text style={styles.alertButtonText}>Alertas ({alerts.length})</Text>
        </Pressable>
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Incluir itens arquivados</Text>
        <Switch value={includeArchived} onValueChange={setIncludeArchived} />
      </View>

      {error ? <Text style={styles.errorText}>{error.message}</Text> : null}

      <FlatList
        data={sortedItems}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={renderEmptyList}
      />

      <AdjustStockModal
        state={modalState}
        onClose={closeAdjustModal}
        onConfirm={handleConfirmAdjust}
        onChange={handleModalChange}
        isSubmitting={isSubmittingAdjustment}
        disabled={!authorization.canAdjustStock}
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
  alertButton: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  alertButtonPressed: {
    opacity: 0.85,
  },
  alertButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
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
    paddingBottom: 32,
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
    marginBottom: 12,
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1B1E',
  },
  productMeta: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 4,
  },
  quantityBadge: {
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  quantitySubtext: {
    fontSize: 12,
    color: '#6B7280',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
  },
  alertBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  alertBadgeCritical: {
    backgroundColor: '#DC2626',
  },
  alertBadgeWarning: {
    backgroundColor: '#F59E0B',
  },
  alertBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#4E9F3D',
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
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
  emptySubtitle: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
