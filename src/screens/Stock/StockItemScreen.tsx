import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { StockAlertStatus, StockMovement, StockMovementType } from '@/domain';
import type { AppStackParamList } from '@/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import {
  AdjustStockModal,
  AdjustStockModalState,
  movementTypeLabels,
} from '@/components/stock/AdjustStockModal';
import PriceRegisterModal, {
  PriceRegisterState,
} from '@/components/stock/PriceRegisterModal';
import {
  useProducts,
  useStockAlerts,
  useStockItems,
  useStockMovements,
} from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { formatRelativeDate } from '@/utils/date';
import { logError } from '@/utils/logger';
type Props = NativeStackScreenProps<AppStackParamList, 'StockItem'>;

type AdjustState = AdjustStockModalState & { stockItemId: string | null };

export default function StockItemScreen({ navigation, route }: Props) {
  const { stockItemId } = route.params;
  const { user } = useAuth();
  const authorization = useAuthorization(user);
  const alertStatuses = useMemo(() => ['open', 'acknowledged'] as StockAlertStatus[], []);

  const { stockItems, isLoading, adjust } = useStockItems({ includeArchived: true });
  const { products } = useProducts({ includeInactive: true });
  const {
    movements,
    isLoading: isLoadingMovements,
    error: movementsError,
    retry,
  } = useStockMovements({
    stockItemId,
    limit: 50,
  });
  const { alerts, acknowledge, resolve } = useStockAlerts({
    status: alertStatuses,
  });

  const stockItem = useMemo(
    () => stockItems.find(item => item.id === stockItemId) ?? null,
    [stockItems, stockItemId],
  );

  const product = useMemo(
    () =>
      stockItem
        ? (products.find(entry => entry.id === stockItem.productId) ?? null)
        : null,
    [products, stockItem],
  );
  const unitLabel = useMemo(() => {
    const unit = product?.unitOfMeasure;
    return unit === 'GRAMS'
      ? 'g'
      : unit === 'KILOGRAMS'
        ? 'kg'
        : unit === 'MILLILITERS'
          ? 'ml'
          : unit === 'LITERS'
            ? 'L'
            : 'un';
  }, [product?.unitOfMeasure]);

  const alert = useMemo(
    () => alerts.find(entry => entry.stockItemId === stockItemId) ?? null,
    [alerts, stockItemId],
  );

  const [adjustState, setAdjustState] = useState<AdjustState>({
    visible: false,
    stockItemId: null,
    type: 'increment',
    quantity: '',
    note: '',
    totalCost: '',
    unitPrice: undefined,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priceModalState, setPriceModalState] = useState<PriceRegisterState>({
    visible: false,
    price: '',
    note: '',
  });
  const [isSubmittingPrice, setIsSubmittingPrice] = useState(false);
  const [isResolvingAlert, setIsResolvingAlert] = useState(false);
  const [isAcknowledgingAlert, setIsAcknowledgingAlert] = useState(false);

  const modalState = useMemo<AdjustStockModalState>(() => {
    const { visible, type, quantity, note, totalCost } = adjustState;
    return { visible, type, quantity, note, totalCost, unitPrice: adjustState.unitPrice };
  }, [adjustState]);

  const gramsFormatter = useMemo(
    () => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }),
    [],
  );

  const formatGrams = useCallback(
    (value: number | null | undefined) => gramsFormatter.format(Number(value ?? 0)),
    [gramsFormatter],
  );

  const handleModalChange = useCallback((state: AdjustStockModalState) => {
    setAdjustState(previous => ({ ...previous, ...state }));
  }, []);

  const openAdjustModal = useCallback(
    (type: StockMovementType) => {
      setAdjustState(previous => ({
        ...previous,
        stockItemId: stockItemId,
        visible: true,
        type,
        quantity: '',
        note: '',
        totalCost: '',
        unitPrice: undefined,
      }));
    },
    [stockItemId],
  );

  const closeAdjustModal = useCallback(() => {
    setAdjustState(previous => ({ ...previous, visible: false }));
  }, []);

  const openPriceModal = useCallback(() => {
    setPriceModalState({ visible: true, price: '', note: '' });
  }, []);

  const closePriceModal = useCallback(() => {
    setPriceModalState(prev => ({ ...prev, visible: false }));
  }, []);

  const handleConfirmAdjust = useCallback(() => {
    if (!adjustState.stockItemId || !stockItem) {
      closeAdjustModal();
      return;
    }

    const quantityValue = Number(adjustState.quantity.replace(',', '.'));
    const shouldCaptureCost =
      adjustState.type === 'increment' || adjustState.type === 'initial';

    // Parse provided total cost and optional unit price (R$ / kg or R$ / L).
    const rawTotalCost = adjustState.totalCost
      ? adjustState.totalCost.replace(',', '.')
      : '';
    let totalCostValue = rawTotalCost ? Number(rawTotalCost) : NaN;

    const unitPriceRaw = adjustState.unitPrice
      ? adjustState.unitPrice.replace(',', '.')
      : '';
    const unitPriceValue = unitPriceRaw ? Number(unitPriceRaw) : NaN;

    // If total cost not provided but unit price was, compute totalCost = unitPrice * (qty / 1000)
    if (
      (Number.isNaN(totalCostValue) || totalCostValue <= 0) &&
      !Number.isNaN(unitPriceValue) &&
      unitPriceValue > 0
    ) {
      totalCostValue = unitPriceValue * (quantityValue / 1000);
    }

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
          'Informe o valor total do lote para registrar a entrada de estoque.',
        );
        return;
      }
    }

    const formattedQuantity = Number(quantityValue).toLocaleString('pt-BR', {
      maximumFractionDigits: 2,
    });

    Alert.alert(
      'Confirmar ajuste',
      `Deseja registrar ${movementTypeLabels[adjustState.type].toLowerCase()} de ${formattedQuantity} g?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            if (!user) {
              return;
            }
            try {
              setIsSubmitting(true);
              // Debug: log payload being sent to adjustStockLevel
              console.debug('[StockItemScreen] adjust payload', {
                stockItemId: adjustState.stockItemId,
                quantityInGrams: quantityValue,
                type: adjustState.type,
                performedBy: user.id,
                totalCostInBRL: shouldCaptureCost ? totalCostValue : undefined,
                unitPriceProvided: adjustState.unitPrice,
              });

              await adjust({
                stockItemId: adjustState.stockItemId!,
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
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  }, [adjust, adjustState, closeAdjustModal, stockItem, user]);

  const handleRetryMovements = useCallback(() => {
    retry();
  }, [retry]);

  const handleAcknowledgeAlert = useCallback(async () => {
    if (!alert || !authorization.canAcknowledgeStockAlerts) {
      return;
    }

    try {
      setIsAcknowledgingAlert(true);
      await acknowledge(alert.id);
    } catch (ackError) {
      logError(ackError, 'stockItem.acknowledgeAlert');
      Alert.alert('Erro', 'Não foi possível sinalizar o alerta como lido.');
    } finally {
      setIsAcknowledgingAlert(false);
    }
  }, [acknowledge, alert, authorization.canAcknowledgeStockAlerts]);

  const handleConfirmPriceRegister = useCallback(() => {
    if (!stockItem || !priceModalState.price) {
      closePriceModal();
      return;
    }

    const priceValue = Number(priceModalState.price.replace(',', '.'));

    if (Number.isNaN(priceValue) || priceValue <= 0) {
      Alert.alert(
        'Preço inválido',
        'Informe um preço válido maior que zero (R$ por kg).',
      );
      return;
    }

    // Aviso de confirmação conforme solicitado: sobrescrever histórico e não usar como controle de estoque
    Alert.alert(
      'Confirmar registro manual de preço',
      'Isso irá sobrescrever o histórico de preço e passar a ser o novo preço de custo. Não utilize este registro para controle regular de estoque; use apenas para correções pontuais. Deseja prosseguir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            if (!user) return;
            try {
              setIsSubmittingPrice(true);
              // The price entered in this modal is always R$ per kilogram.
              // The Firestore service expects unitCostInBRL as R$ / kg.
              const unitCostToStore = priceValue; // R$ per kg

              const { setManualPrice } = await import('@/services/firestore');
              await setManualPrice({
                stockItemId: stockItem.id,
                unitCostInBRL: unitCostToStore,
                performedBy: user.id,
                note: priceModalState.note?.trim() || undefined,
              });
              Alert.alert('Preço registrado', 'O preço foi atualizado com sucesso.');
              closePriceModal();
            } catch (err) {
              Alert.alert(
                'Erro',
                err instanceof Error
                  ? err.message
                  : 'Não foi possível registrar o preço.',
              );
            } finally {
              setIsSubmittingPrice(false);
            }
          },
        },
      ],
    );
  }, [priceModalState, stockItem, user, closePriceModal]);

  const handleResolveAlert = useCallback(async () => {
    if (!alert || !authorization.canAcknowledgeStockAlerts) {
      return;
    }

    Alert.alert('Resolver alerta', 'Deseja marcar o alerta como resolvido?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Resolver',
        onPress: async () => {
          try {
            setIsResolvingAlert(true);
            await resolve(alert.id);
          } catch (resolveError) {
            logError(resolveError, 'stockItem.resolveAlert');
            Alert.alert('Erro', 'Não foi possível resolver o alerta.');
          } finally {
            setIsResolvingAlert(false);
          }
        },
      },
    ]);
  }, [alert, authorization.canAcknowledgeStockAlerts, resolve]);

  const renderMovement = useCallback(
    ({ item }: { item: StockMovement }) => (
      <View style={styles.movementCard}>
        <View style={styles.movementHeader}>
          <Text style={styles.movementType}>{movementTypeLabels[item.type]}</Text>
          <Text
            style={styles.movementQuantity}
          >{`${formatGrams(item.quantityInGrams)} g`}</Text>
        </View>
        <Text style={styles.movementMeta}>
          Anterior: {`${formatGrams(item.previousQuantityInGrams)} g`}
        </Text>
        <Text style={styles.movementMeta}>
          Resultante: {`${formatGrams(item.resultingQuantityInGrams)} g`}
        </Text>
        <Text style={styles.movementDate}>{formatRelativeDate(item.performedAt)}</Text>
        {item.note ? <Text style={styles.movementNote}>{item.note}</Text> : null}
      </View>
    ),
    [formatGrams],
  );

  const renderEmptyMovements = useCallback(
    () => (
      <View style={styles.emptyMovements}>
        <Text style={styles.emptyTitle}>Nenhuma movimentação registrada.</Text>
        <Text style={styles.emptySubtitle}>
          Utilize as ações acima para registrar entradas, saídas ou ajustes.
        </Text>
      </View>
    ),
    [],
  );

  if (!stockItem && !isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Item não encontrado</Text>
          <Text style={styles.emptySubtitle}>
            O item pode ter sido removido ou arquivado permanentemente.
          </Text>
          <Pressable
            onPress={() => navigation.navigate('Stock')}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Voltar para estoque</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {stockItem ? (
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerInfo}>
              <Text style={styles.title}>{product?.name ?? stockItem.productId}</Text>
              <Text style={styles.subtitle}>Item de estoque #{stockItem.id}</Text>
              {product?.unitOfMeasure ? (
                <View style={styles.unitBadge}>
                  <Text style={styles.unitBadgeText}>Unidade padrão: {unitLabel}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.quantityBadge}>
              <Text style={styles.quantityText}>
                {`${formatGrams(stockItem.currentQuantityInGrams)} g`}
              </Text>
              <Text style={styles.quantitySubtext}>Atual</Text>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <Text style={styles.progressLabel}>
              Cobertura vs mínimo ({`${formatGrams(stockItem.minimumQuantityInGrams)} g`})
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${calculateCoverage(
                      stockItem.currentQuantityInGrams,
                      stockItem.minimumQuantityInGrams,
                    )}%`,
                  },
                ]}
              />
            </View>
          </View>

          {alert ? (
            <View
              style={[
                styles.alertBanner,
                alert.severity === 'critical'
                  ? styles.alertBannerCritical
                  : styles.alertBannerWarning,
              ]}
            >
              <Text style={styles.alertTitle}>
                {alert.severity === 'critical' ? 'Estoque crítico' : 'Abaixo do mínimo'}
              </Text>
              <Text style={styles.alertDescription}>
                Atualmente com {`${formatGrams(alert.currentQuantityInGrams)} g`}. Mínimo:{' '}
                {`${formatGrams(alert.minimumQuantityInGrams)} g`}.
              </Text>
              {authorization.canAcknowledgeStockAlerts ? (
                <View style={styles.alertActions}>
                  <Pressable
                    onPress={handleAcknowledgeAlert}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                    disabled={isAcknowledgingAlert}
                  >
                    {isAcknowledgingAlert ? (
                      <ActivityIndicator color="#1F2937" />
                    ) : (
                      <Text style={styles.secondaryButtonText}>Reconhecer</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={handleResolveAlert}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                    disabled={isResolvingAlert}
                  >
                    {isResolvingAlert ? (
                      <ActivityIndicator color="#1F2937" />
                    ) : (
                      <Text style={styles.secondaryButtonText}>Resolver</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {authorization.canAdjustStock ? (
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => openAdjustModal('increment')}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>Adicionar estoque</Text>
              </Pressable>
              <Pressable
                onPress={() => openAdjustModal('decrement')}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Registrar saída</Text>
              </Pressable>
              <Pressable
                onPress={() => openAdjustModal('adjustment')}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Ajustar manualmente</Text>
              </Pressable>
              <Pressable
                onPress={openPriceModal}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Registrar preço</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.movementsHeader}>
        <Text style={styles.sectionTitle}>Histórico de movimentações</Text>
        <Pressable
          onPress={handleRetryMovements}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.secondaryButtonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Atualizar</Text>
        </Pressable>
      </View>

      {movementsError ? (
        <Text style={styles.errorText}>{movementsError.message}</Text>
      ) : null}

      {isLoadingMovements ? (
        <ActivityIndicator color="#4E9F3D" style={styles.loader} />
      ) : (
        <FlatList
          data={movements}
          keyExtractor={item => item.id}
          renderItem={renderMovement}
          contentContainerStyle={styles.movementList}
          ListEmptyComponent={renderEmptyMovements}
        />
      )}

      <AdjustStockModal
        state={modalState}
        onChange={handleModalChange}
        onClose={closeAdjustModal}
        onConfirm={handleConfirmAdjust}
        isSubmitting={isSubmitting}
        disabled={!authorization.canAdjustStock}
      />
      <PriceRegisterModal
        state={priceModalState}
        onChange={next => setPriceModalState(next)}
        onClose={closePriceModal}
        onConfirm={handleConfirmPriceRegister}
        isSubmitting={isSubmittingPrice}
        disabled={!authorization.canAdjustStock}
      />
    </ScreenContainer>
  );
}

function calculateCoverage(current: number, minimum: number): number {
  if (minimum <= 0) {
    return 100;
  }

  const ratio = (current / minimum) * 100;
  if (!Number.isFinite(ratio)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(ratio)));
}

const styles = StyleSheet.create({
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1B1E',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
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
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  quantitySubtext: {
    fontSize: 12,
    color: '#6B7280',
  },
  unitBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    marginTop: 8,
  },
  unitBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  progressContainer: {
    gap: 8,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  progressBar: {
    height: 10,
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4E9F3D',
  },
  alertBanner: {
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  alertBannerCritical: {
    backgroundColor: '#FEE2E2',
  },
  alertBannerWarning: {
    backgroundColor: '#FEF3C7',
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B91C1C',
  },
  alertDescription: {
    fontSize: 14,
    color: '#7F1D1D',
  },
  alertActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#4E9F3D',
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  movementsHeader: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1B1E',
  },
  loader: {
    marginTop: 24,
  },
  movementList: {
    gap: 12,
    paddingBottom: 48,
  },
  movementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 4,
  },
  movementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  movementType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  movementQuantity: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  movementMeta: {
    fontSize: 13,
    color: '#4B5563',
  },
  movementDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  movementNote: {
    fontSize: 13,
    color: '#111827',
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyMovements: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
});
