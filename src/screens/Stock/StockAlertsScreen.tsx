import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { useProducts, useStockAlerts } from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { formatRelativeDate } from '@/utils/date';
import { logError } from '@/utils/logger';
import type { StockAlertStatus } from '@/domain';
import type { AppStackParamList } from '@/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

const severityColors: Record<'critical' | 'warning', string> = {
  critical: '#DC2626',
  warning: '#F59E0B',
};

type Props = NativeStackScreenProps<AppStackParamList, 'StockAlerts'>;

export default function StockAlertsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const authorization = useAuthorization(user);
  const [onlyCritical, setOnlyCritical] = useState(true);
  const alertStatuses = useMemo(() => ['open', 'acknowledged'] as StockAlertStatus[], []);

  const { alerts, isLoading, error, acknowledge, resolve, retry } = useStockAlerts({
    status: alertStatuses,
    onlyCritical,
  });
  const { products } = useProducts({ includeInactive: true });

  const productsById = useMemo(
    () => new Map(products.map(product => [product.id, product])),
    [products],
  );

  const handleRefresh = useCallback(() => {
    retry();
  }, [retry]);

  const handleAcknowledge = useCallback(
    async (alertId: string) => {
      if (!authorization.canAcknowledgeStockAlerts) {
        return;
      }

      try {
        await acknowledge(alertId);
      } catch (ackError) {
        logError(ackError, 'stockAlerts.acknowledge');
      }
    },
    [acknowledge, authorization.canAcknowledgeStockAlerts],
  );

  const handleResolve = useCallback(
    async (alertId: string) => {
      if (!authorization.canAcknowledgeStockAlerts) {
        return;
      }
      try {
        await resolve(alertId);
      } catch (resolveError) {
        logError(resolveError, 'stockAlerts.resolve');
      }
    },
    [authorization.canAcknowledgeStockAlerts, resolve],
  );

  const renderEmptyAlerts = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {isLoading ? 'Carregando alertas...' : 'Nenhum alerta no momento.'}
        </Text>
        <Text style={styles.emptySubtitle}>
          Configure mínimos adequados para ser notificado ao atingir níveis críticos.
        </Text>
      </View>
    ),
    [isLoading],
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof alerts)[number] }) => {
      const product = productsById.get(item.productId);
      const color = severityColors[item.severity];

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.severityBadge, { backgroundColor: color }]}>
              <Text style={styles.severityText}>
                {item.severity === 'critical' ? 'Crítico' : 'Atenção'}
              </Text>
            </View>
            <Text style={styles.timestamp}>{formatRelativeDate(item.updatedAt)}</Text>
          </View>

          <Text style={styles.productName}>
            {product?.name ?? `Produto ${item.productId}`}
          </Text>
          <Text style={styles.alertDescription}>
            Estoque atual {item.currentQuantityInGrams} g — mínimo{' '}
            {item.minimumQuantityInGrams} g.
          </Text>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={() =>
                navigation.navigate('StockItem', { stockItemId: item.stockItemId })
              }
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Ver item</Text>
            </Pressable>
            {authorization.canAcknowledgeStockAlerts ? (
              <>
                <Pressable
                  onPress={() => handleAcknowledge(item.id)}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Reconhecer</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleResolve(item.id)}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Resolver</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      );
    },
    [
      authorization.canAcknowledgeStockAlerts,
      handleAcknowledge,
      handleResolve,
      navigation,
      productsById,
    ],
  );

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Alertas de estoque</Text>
          <Text style={styles.subtitle}>
            Monitore itens críticos e tome ações imediatas.
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('Stock')}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.secondaryButtonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Ver estoque</Text>
        </Pressable>
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Exibir apenas críticos</Text>
        <Switch value={onlyCritical} onValueChange={setOnlyCritical} />
      </View>

      {error ? <Text style={styles.errorText}>{error.message}</Text> : null}

      <FlatList
        data={alerts}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={renderEmptyAlerts}
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
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  severityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  severityText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  timestamp: {
    fontSize: 12,
    color: '#6B7280',
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  alertDescription: {
    fontSize: 14,
    color: '#4B5563',
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
