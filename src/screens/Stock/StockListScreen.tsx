import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { BarcodeScannerField } from '@/components/inputs/BarcodeScannerField';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import {
  AdjustStockModal,
  AdjustStockModalState,
  movementTypeLabels,
} from '@/components/stock/AdjustStockModal';
import {
  CreateStockItemModal,
  type CreateStockItemModalState,
} from '@/components/stock/CreateStockItemModal';
import { EditMinimumQuantityModal } from '@/components/stock/EditMinimumQuantityModal';
import {
  useStockItems,
  useStockMovements,
  useStockAlerts,
  useProducts,
} from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import type { StockAlertStatus, StockMovementType } from '@/domain';
import type { AppStackParamList } from '@/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<AppStackParamList, 'Stock'>;

type AdjustModalState = AdjustStockModalState & {
  itemId: string | null;
};

export default function StockListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const authorization = useAuthorization(user);
  const { width } = useWindowDimensions();
  const isCompactLayout = width < 768;
  const [includeArchived, setIncludeArchived] = useState(false);
  const [adjustState, setAdjustState] = useState<AdjustModalState>({
    visible: false,
    itemId: null,
    type: 'increment',
    quantity: '',
    note: '',
    totalCost: '',
  });
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);
  const [createState, setCreateState] = useState<CreateStockItemModalState>({
    visible: false,
    productId: null,
    minimumQuantity: '',
    initialQuantity: '',
  });
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [editMinimumState, setEditMinimumState] = useState<{
    visible: boolean;
    itemId: string | null;
    value: string;
    productName: string | null;
    error: string | null;
  }>({
    visible: false,
    itemId: null,
    value: '',
    productName: null,
    error: null,
  });
  const [isUpdatingMinimum, setIsUpdatingMinimum] = useState(false);
  const [filterText, setFilterText] = useState('');

  const alertStatuses = useMemo(() => ['open', 'acknowledged'] as StockAlertStatus[], []);

  const { stockItems, isLoading, error, adjust, retry, create, update } =
    useStockItems({
      includeArchived,
    });
  const { alerts } = useStockAlerts({ status: alertStatuses });
  const { products } = useProducts({ includeInactive: true });
  const { movements } = useStockMovements({ limit: 20 });

  const productsById = useMemo(
    () => new Map(products.map(product => [product.id, product])),
    [products],
  );

  const availableProductsForCreation = useMemo(() => {
    const existingProductIds = new Set(stockItems.map(item => item.productId));
    return products
      .filter(product => !existingProductIds.has(product.id))
      .map(product => ({ id: product.id, name: product.name, barcode: product.barcode }));
  }, [products, stockItems]);

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

  const filteredItems = useMemo(() => {
    const normalized = filterText.trim().toLowerCase();

    if (!normalized) {
      return stockItems;
    }

    return stockItems.filter(item => {
      const product = productsById.get(item.productId);
      const name = product?.name?.toLowerCase() ?? '';
      const barcode = product?.barcode?.toLowerCase() ?? '';
      const productId = item.productId.toLowerCase();

      return (
        name.includes(normalized) ||
        barcode.includes(normalized) ||
        productId.includes(normalized)
      );
    });
  }, [filterText, productsById, stockItems]);

  const sortedItems = useMemo(() => {
    const items = [...filteredItems];
    return items.sort((first, second) => {
      const firstProduct = productsById.get(first.productId)?.name ?? first.productId;
      const secondProduct = productsById.get(second.productId)?.name ?? second.productId;
      return firstProduct.localeCompare(secondProduct, 'pt-BR', { sensitivity: 'base' });
    });
  }, [filteredItems, productsById]);

  const handleRefresh = useCallback(() => {
    retry();
  }, [retry]);

  const handleClearFilter = useCallback(() => {
    setFilterText('');
  }, []);

  const openAdjustModal = useCallback(
    (itemId: string, type: StockMovementType = 'increment') => {
      setAdjustState({
        visible: true,
        itemId,
        type,
        quantity: '',
        note: '',
        totalCost: '',
      });
    },
    [],
  );

  const closeAdjustModal = useCallback(() => {
    setAdjustState(previous => ({ ...previous, visible: false }));
  }, []);

  const openCreateModal = useCallback(() => {
    setCreateState({
      visible: true,
      productId: availableProductsForCreation[0]?.id ?? null,
      minimumQuantity: '',
      initialQuantity: '',
    });
  }, [availableProductsForCreation]);

  const closeCreateModal = useCallback(() => {
    setCreateState(previous => ({ ...previous, visible: false }));
  }, []);

  const handleCreateChange = useCallback((nextState: CreateStockItemModalState) => {
    setCreateState(nextState);
  }, []);

  const openEditMinimumModal = useCallback(
    (stockItemId: string, productName?: string | null) => {
      const item = stockItems.find(candidate => candidate.id === stockItemId);

      if (!item) {
        Alert.alert(
          'Item não encontrado',
          'Não foi possível localizar o item selecionado para atualizar o mínimo.',
        );
        return;
      }

      setEditMinimumState({
        visible: true,
        itemId: stockItemId,
        value: String(item.minimumQuantityInGrams),
        productName: productName ?? null,
        error: null,
      });
    },
    [stockItems],
  );

  const closeEditMinimumModal = useCallback(() => {
    setEditMinimumState(previous => ({ ...previous, visible: false }));
  }, []);

  const handleMinimumValueChange = useCallback((nextValue: string) => {
    setEditMinimumState(previous => ({ ...previous, value: nextValue, error: null }));
  }, []);

  const handleConfirmMinimumUpdate = useCallback(async () => {
    if (!editMinimumState.itemId) {
      return;
    }

    const trimmedValue = editMinimumState.value.trim();
    const valueWithoutSpaces = trimmedValue.replace(/\s+/g, '');
    const sanitizedValue = valueWithoutSpaces.includes(',')
      ? valueWithoutSpaces.replace(/\./g, '').replace(',', '.')
      : valueWithoutSpaces;
    const parsedValue = Number(sanitizedValue);

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setEditMinimumState(previous => ({
        ...previous,
        error: 'Informe um valor maior que zero.',
      }));
      return;
    }

    try {
      setIsUpdatingMinimum(true);
      await update(editMinimumState.itemId, {
        minimumQuantityInGrams: parsedValue,
      });

      setEditMinimumState({
        visible: false,
        itemId: null,
        value: '',
        productName: null,
        error: null,
      });

      Alert.alert(
        'Quantidade mínima atualizada',
        'Os alertas serão gerados com base no novo limite mínimo.',
      );
    } catch (updateError) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : 'Não foi possível atualizar a quantidade mínima.';
      setEditMinimumState(previous => ({ ...previous, error: message }));
    } finally {
      setIsUpdatingMinimum(false);
    }
  }, [editMinimumState, update]);

  const modalState = useMemo<AdjustStockModalState>(() => {
    const { visible, type, quantity, note, totalCost } = adjustState;
    return { visible, type, quantity, note, totalCost };
  }, [adjustState]);

  const handleModalChange = useCallback((nextState: AdjustStockModalState) => {
    setAdjustState(previous => ({ ...previous, ...nextState }));
  }, []);

  const headerRowStyle = useMemo(
    () => [styles.headerRow, isCompactLayout && styles.headerRowCompact],
    [isCompactLayout],
  );

  const headerActionsStyle = useMemo(
    () => [styles.headerActions, isCompactLayout && styles.headerActionsCompact],
    [isCompactLayout],
  );

  const actionsRowStyle = useMemo(
    () => [styles.actionsRow, isCompactLayout && styles.actionsRowCompact],
    [isCompactLayout],
  );
  const filterRowStyle = useMemo(
    () => [styles.filterRow, isCompactLayout && styles.filterRowCompact],
    [isCompactLayout],
  );
  const filterScannerFieldStyle = useMemo(
    () => [
      styles.filterScannerField,
      isCompactLayout ? styles.filterScannerFieldCompact : styles.filterScannerFieldWide,
    ],
    [isCompactLayout],
  );

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
    const shouldCaptureCost =
      adjustState.type === 'increment' || adjustState.type === 'initial';
    const totalCostValue = Number(adjustState.totalCost.replace(',', '.'));

    if (Number.isNaN(quantityValue) || quantityValue <= 0) {
      Alert.alert(
        'Quantidade inválida',
        'Informe um valor maior que zero para o ajuste.',
      );
      return;
    }

    if (shouldCaptureCost) {
      if (Number.isNaN(totalCostValue) || totalCostValue <= 0) {
        Alert.alert(
          'Valor inválido',
          'Informe o valor total do lote para registrar uma entrada de estoque.',
        );
        return;
      }
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
                totalCostInBRL: shouldCaptureCost ? totalCostValue : undefined,
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

  const handleConfirmCreate = useCallback(async () => {
    if (!createState.productId) {
      Alert.alert('Selecione um produto', 'Escolha um produto para criar o item.');
      return;
    }

    const minimumQuantityValue = Number(createState.minimumQuantity.replace(',', '.'));
    const initialQuantityValue = Number(createState.initialQuantity.replace(',', '.'));

    if (!Number.isFinite(minimumQuantityValue) || minimumQuantityValue <= 0) {
      Alert.alert('Quantidade mínima inválida', 'Informe um valor maior que zero.');
      return;
    }

    if (!Number.isFinite(initialQuantityValue) || initialQuantityValue < 0) {
      Alert.alert(
        'Quantidade inicial inválida',
        'Informe um valor maior ou igual a zero para iniciar o estoque.',
      );
      return;
    }

    if (!user) {
      Alert.alert('Sessão expirada', 'Faça login novamente e tente de novo.');
      return;
    }

    try {
      setIsCreatingItem(true);
      const created = await create({
        productId: createState.productId,
        minimumQuantityInGrams: minimumQuantityValue,
        currentQuantityInGrams: 0,
      });

      Alert.alert('Item criado', 'Agora registre a entrada do lote.');

      setCreateState({
        visible: false,
        productId: null,
        minimumQuantity: '',
        initialQuantity: '',
      });

      setAdjustState({
        visible: true,
        itemId: created.id,
        type: 'increment',
        quantity: initialQuantityValue > 0 ? String(initialQuantityValue) : '',
        note: '',
        totalCost: '',
      });
    } catch (creationError) {
      Alert.alert(
        'Erro ao criar item',
        creationError instanceof Error
          ? creationError.message
          : 'Não foi possível adicionar o item ao estoque.',
      );
    } finally {
      setIsCreatingItem(false);
    }
  }, [create, createState, user]);

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
            <View style={styles.cardHeaderRight}>
              <View style={styles.quantityBadge}>
                <Text style={styles.quantityText}>{item.currentQuantityInGrams} g</Text>
                <Text style={styles.quantitySubtext}>Atual</Text>
              </View>
              {authorization.canManageStock ? (
                <Pressable
                  onPress={() => openEditMinimumModal(item.id, product?.name)}
                  style={({ pressed }) => [
                    styles.editMinimumButton,
                    pressed && styles.editMinimumButtonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Editar quantidade mínima"
                  accessibilityHint="Abre um modal para atualizar o limite mínimo desse item"
                >
                  <Ionicons name="pencil" size={16} color="#1F2937" />
                  <Text style={styles.editMinimumButtonText}>Editar mínimo</Text>
                </Pressable>
              ) : null}
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
          <View style={actionsRowStyle}>
            <Pressable
              onPress={() => navigation.navigate('StockItem', { stockItemId: item.id })}
              style={({ pressed }) => [
                styles.secondaryButton,
                isCompactLayout && styles.fullWidthButton,
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
                  isCompactLayout && styles.fullWidthButton,
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
                  isCompactLayout && styles.fullWidthButton,
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
      authorization.canManageStock,
      lastMovementByItem,
      actionsRowStyle,
      isCompactLayout,
      navigation,
      openAdjustModal,
      openEditMinimumModal,
      productsById,
    ],
  );

  const renderEmptyList = useCallback(() => {
    const hasFilter = Boolean(filterText.trim());

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {isLoading
            ? 'Carregando estoque...'
            : hasFilter
              ? 'Nenhum item corresponde ao filtro.'
              : 'Nenhum item cadastrado.'}
        </Text>
        {authorization.canManageStock && !hasFilter ? (
          <Text style={styles.emptySubtitle}>
            Toque em "Novo item" no topo para cadastrar o primeiro estoque.
          </Text>
        ) : null}
      </View>
    );
  }, [authorization.canManageStock, filterText, isLoading]);

  return (
    <ScreenContainer>
      <View style={headerRowStyle}>
        <View>
          <Text style={styles.title}>Estoque</Text>
          <Text style={styles.subtitle}>
            Acompanhe níveis, alertas e movimentações em tempo real.
          </Text>
        </View>
        <View style={headerActionsStyle}>
          <Pressable
            onPress={() => navigation.navigate('StockAlerts')}
            style={({ pressed }) => [
              styles.alertButton,
              isCompactLayout && styles.fullWidthButton,
              pressed && styles.alertButtonPressed,
            ]}
          >
            <Text style={styles.alertButtonText}>Alertas ({alerts.length})</Text>
          </Pressable>
          {authorization.canManageStock ? (
            <Pressable
              onPress={openCreateModal}
              disabled={availableProductsForCreation.length === 0}
              style={({ pressed }) => [
                styles.primaryButton,
                isCompactLayout && styles.fullWidthButton,
                pressed && styles.primaryButtonPressed,
                availableProductsForCreation.length === 0 && styles.primaryButtonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>Novo item</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={filterRowStyle}>
        <BarcodeScannerField
          value={filterText}
          onChangeText={setFilterText}
          placeholder="Buscar por nome, código de barras ou ID"
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Buscar no estoque"
          containerStyle={filterScannerFieldStyle}
          inputStyle={styles.filterInput}
          editable
        />
        {filterText ? (
          <Pressable
            onPress={handleClearFilter}
            style={({ pressed }) => [
              styles.clearFilterButton,
              isCompactLayout && styles.clearFilterButtonFullWidth,
              pressed && styles.clearFilterButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Limpar filtro de busca"
          >
            <Text style={styles.clearFilterText}>Limpar</Text>
          </Pressable>
        ) : null}
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
        keyboardShouldPersistTaps="handled"
      />

      <AdjustStockModal
        state={modalState}
        onClose={closeAdjustModal}
        onConfirm={handleConfirmAdjust}
        onChange={handleModalChange}
        isSubmitting={isSubmittingAdjustment}
        disabled={!authorization.canAdjustStock}
      />

      <CreateStockItemModal
        products={availableProductsForCreation}
        state={createState}
        onChange={handleCreateChange}
        onClose={closeCreateModal}
        onConfirm={handleConfirmCreate}
        isSubmitting={isCreatingItem}
        disabled={
          !authorization.canManageStock || availableProductsForCreation.length === 0
        }
      />

      <EditMinimumQuantityModal
        visible={editMinimumState.visible}
        value={editMinimumState.value}
        productName={editMinimumState.productName}
        errorMessage={editMinimumState.error}
        onChangeValue={handleMinimumValueChange}
        onClose={closeEditMinimumModal}
        onConfirm={handleConfirmMinimumUpdate}
        isSubmitting={isUpdatingMinimum}
        disabled={!authorization.canManageStock}
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
  headerRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionsCompact: {
    width: '100%',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 12,
    marginTop: 16,
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 16,
    width: '100%',
  },
  filterRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  filterScannerField: {
    flex: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  filterScannerFieldCompact: {
    width: '100%',
    flexGrow: 1,
  },
  filterScannerFieldWide: {
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 360,
  },
  filterInput: {
    fontSize: 15,
    color: '#1A1B1E',
    paddingVertical: 6,
  },
  clearFilterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignSelf: 'center',
  },
  clearFilterButtonFullWidth: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearFilterButtonPressed: {
    opacity: 0.85,
  },
  clearFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  alertButton: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
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
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  editMinimumButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editMinimumButtonPressed: {
    backgroundColor: '#E5E7EB',
  },
  editMinimumButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
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
  actionsRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
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
    alignItems: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  fullWidthButton: {
    width: '100%',
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
