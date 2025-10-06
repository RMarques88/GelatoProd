import { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { useNotifications, useProducts, useStockItems } from '@/hooks/data';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { formatRelativeDate } from '@/utils/date';

import type { AppNotification, NotificationCategory } from '@/domain';
import type { AppStackParamList } from '@/navigation';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const CATEGORY_FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'stock', label: 'Estoque' },
  { key: 'production', label: 'Produção' },
] as const;

const SAFE_AREA_BUFFER = 50;

type CategoryFilterKey = (typeof CATEGORY_FILTERS)[number]['key'];

type NotificationItemProps = {
  title: string;
  message: string;
  status: 'read' | 'unread';
  createdAt: Date;
  category: string;
  onPress: () => void;
};

function NotificationItem({
  title,
  message,
  status,
  createdAt,
  category,
  onPress,
}: NotificationItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.notificationCard,
        status === 'unread' && styles.notificationUnread,
        pressed && styles.notificationPressed,
      ]}
    >
      <View style={styles.notificationHeader}>
        <View
          style={[
            styles.notificationDot,
            status === 'unread'
              ? styles.notificationDotActive
              : styles.notificationDotInactive,
          ]}
        />
        <Text style={styles.notificationCategory}>{category}</Text>
        <Text style={styles.notificationTime}>{formatRelativeDate(createdAt)}</Text>
      </View>
      <Text style={styles.notificationTitle}>{title}</Text>
      <Text style={styles.notificationMessage}>{message}</Text>
      {status === 'unread' ? <Text style={styles.notificationBadge}>Novo</Text> : null}
    </Pressable>
  );
}

export function NotificationCenterScreen() {
  const { user } = useAuth();
  const authorization = useAuthorization(user);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [filter, setFilter] = useState<CategoryFilterKey>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    notifications,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    retry,
    unreadCount,
  } = useNotifications({
    status: 'unread',
    category: filter === 'all' ? undefined : (filter as NotificationCategory),
    limit: 50,
  });

  const { products } = useProducts({ includeInactive: true });
  const { stockItems } = useStockItems({ includeArchived: true });

  const enhancedNotifications = useMemo(() => {
    if (notifications.length === 0) {
      return notifications;
    }

    const productNameById = new Map<string, string>();
    products.forEach(product => {
      const trimmedName = product.name?.trim();
      if (trimmedName) {
        productNameById.set(product.id, trimmedName);
      }
    });

    const stockItemById = new Map(stockItems.map(item => [item.id, item]));

    return notifications.map(notification => {
      if (notification.category !== 'stock' || !notification.referenceId) {
        return notification;
      }

      const stockItem = stockItemById.get(notification.referenceId);
      if (!stockItem) {
        return notification;
      }

      const productName = productNameById.get(stockItem.productId);
      if (!productName) {
        return notification;
      }

      const suffixIndex = notification.message.indexOf(' está');
      const messageSuffix =
        suffixIndex >= 0 ? notification.message.slice(suffixIndex) : '';
      const friendlyMessage = messageSuffix
        ? `O item ${productName}${messageSuffix}`
        : `O item ${productName}`;

      let friendlyTitle = notification.title;
      if (!friendlyTitle.toLowerCase().includes(productName.toLowerCase())) {
        friendlyTitle = `${friendlyTitle} · ${productName}`;
      }

      if (
        friendlyTitle === notification.title &&
        friendlyMessage === notification.message
      ) {
        return notification;
      }

      return {
        ...notification,
        title: friendlyTitle,
        message: friendlyMessage,
      };
    });
  }, [notifications, products, stockItems]);

  const handleSelectFilter = useCallback((nextFilter: CategoryFilterKey) => {
    setFilter(nextFilter);
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      retry();
    } finally {
      setIsRefreshing(false);
    }
  }, [retry]);

  const handleMarkAllAsRead = useCallback(async () => {
    if (!authorization.canManageNotifications) {
      return;
    }

    try {
      await markAllAsRead();
    } catch (markError) {
      console.warn(markError);
    }
  }, [authorization.canManageNotifications, markAllAsRead]);

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => (
      <NotificationItem
        title={item.title}
        message={item.message}
        status={item.status}
        category={item.category}
        createdAt={item.createdAt}
        onPress={() => {
          if (item.status === 'unread') {
            markAsRead(item.id).catch(console.warn);
          }

          if (item.referenceId) {
            if (item.category === 'stock') {
              navigation.navigate('StockItem', { stockItemId: item.referenceId });
            }

            if (item.category === 'production') {
              navigation.navigate('ProductionExecution', { planId: item.referenceId });
            }
          }
        }}
      />
    ),
    [markAsRead, navigation],
  );

  const listEmptyComponent = useMemo(() => {
    if (isLoading) {
      return <ActivityIndicator style={styles.loader} color="#4E9F3D" />;
    }

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Não foi possível carregar as notificações. Tente novamente.
          </Text>
          <Pressable
            onPress={retry}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.retryButtonPressed,
            ]}
          >
            <Text style={styles.retryButtonText}>Recarregar</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          Você está em dia! Nenhuma notificação pendente por aqui.
        </Text>
      </View>
    );
  }, [error, isLoading, retry]);

  const renderSeparator = useCallback(() => <View style={styles.separator} />, []);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Central de notificações</Text>
          <Text style={styles.subheading}>
            Acompanhe os alertas e atualizações importantes.
          </Text>
        </View>
        {authorization.canManageNotifications ? (
          <Pressable
            onPress={handleMarkAllAsRead}
            style={({ pressed }) => [
              styles.markAllButton,
              pressed && styles.markAllButtonPressed,
            ]}
          >
            <Text style={styles.markAllButtonText}>Marcar todas como lidas</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {CATEGORY_FILTERS.map(option => (
          <Pressable
            key={option.key}
            onPress={() => handleSelectFilter(option.key)}
            style={({ pressed }) => [
              styles.filterChip,
              filter === option.key && styles.filterChipActive,
              pressed && styles.filterChipPressed,
            ]}
          >
            <Text
              style={[
                styles.filterChipLabel,
                filter === option.key && styles.filterChipLabelActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryTitle}>Notificações não lidas</Text>
          <Text style={styles.summarySubtitle}>Itens aguardando sua atenção.</Text>
        </View>
        <Text style={styles.summaryValue}>{unreadCount}</Text>
      </View>

      <FlatList<AppNotification>
        data={enhancedNotifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={renderSeparator}
        ListHeaderComponent={<View style={styles.safeAreaSpacer} />}
        ListFooterComponent={<View style={styles.safeAreaSpacer} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#4E9F3D"
            colors={['#4E9F3D']}
          />
        }
        ListEmptyComponent={listEmptyComponent}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 24,
    gap: 12,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  subheading: {
    fontSize: 15,
    color: '#4B5563',
  },
  markAllButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(78, 159, 61, 0.1)',
  },
  markAllButtonPressed: {
    opacity: 0.8,
  },
  markAllButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2F855A',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  filterChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    alignItems: 'center',
  },
  filterChipActive: {
    borderColor: '#4E9F3D',
    backgroundColor: 'rgba(78, 159, 61, 0.12)',
  },
  filterChipPressed: {
    opacity: 0.85,
  },
  filterChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterChipLabelActive: {
    color: '#2F855A',
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  summarySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
  },
  listContent: {
    paddingBottom: 16,
  },
  notificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  notificationUnread: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  notificationPressed: {
    opacity: 0.85,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  notificationDotActive: {
    backgroundColor: '#2563EB',
  },
  notificationDotInactive: {
    backgroundColor: '#D1D5DB',
  },
  notificationCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  notificationTime: {
    marginLeft: 'auto',
    fontSize: 12,
    color: '#6B7280',
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  notificationMessage: {
    fontSize: 14,
    color: '#374151',
  },
  notificationBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '600',
  },
  separator: {
    height: 16,
  },
  loader: {
    marginTop: 32,
  },
  emptyContainer: {
    marginTop: 48,
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  retryButtonPressed: {
    opacity: 0.8,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  safeAreaSpacer: {
    height: SAFE_AREA_BUFFER,
    width: '100%',
  },
});

export default NotificationCenterScreen;
