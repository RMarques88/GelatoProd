import { useCallback, useMemo } from 'react';

import { AppNotification, NotificationCategory, NotificationStatus } from '@/domain';
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotifications,
} from '@/services/firestore';

import { useFirestoreSubscription } from './useFirestoreSubscription';

type UseNotificationsOptions = {
  status?: NotificationStatus | NotificationStatus[];
  category?: NotificationCategory;
  limit?: number;
  suspense?: boolean;
  enabled?: boolean;
};

type UseNotificationsResult = {
  notifications: AppNotification[];
  isLoading: boolean;
  error: Error | null;
  markAsRead: (notificationId: string) => Promise<AppNotification>;
  markAllAsRead: () => Promise<void>;
  retry: () => void;
  unreadCount: number;
};

export function useNotifications(
  options: UseNotificationsOptions = {},
): UseNotificationsResult {
  const { status, category, limit, suspense, enabled = true } = options;

  const subscribe = useCallback(
    ({
      next,
      error,
    }: {
      next: (value: AppNotification[]) => void;
      error?: (err: Error) => void;
    }) =>
      subscribeToNotifications(
        {
          next,
          error,
        },
        {
          status,
          category,
          limit,
        },
      ),
    [category, limit, status],
  );

  const { data, error, isLoading, mutate, retry } = useFirestoreSubscription<
    AppNotification[]
  >({
    subscribe,
    initialValue: [],
    suspense,
    enabled,
  });

  const handleMarkAsRead = useCallback(
    async (notificationId: string) => {
      let snapshot: AppNotification | undefined;

      mutate(previous => {
        snapshot = previous.find(notification => notification.id === notificationId);

        if (!snapshot) {
          return previous;
        }

        return previous.map(notification =>
          notification.id === notificationId
            ? {
                ...notification,
                status: 'read',
                readAt: new Date(),
              }
            : notification,
        );
      });

      try {
        const updated = await markNotificationAsRead(notificationId);
        mutate(previous =>
          previous.map(notification =>
            notification.id === notificationId ? updated : notification,
          ),
        );
        return updated;
      } catch (markError) {
        if (snapshot) {
          mutate(previous =>
            previous.map(notification =>
              notification.id === notificationId ? snapshot! : notification,
            ),
          );
        }
        throw markError;
      }
    },
    [mutate],
  );

  const handleMarkAllAsRead = useCallback(async () => {
    const previous = data.map(notification => ({ ...notification }));

    mutate(previousNotifications =>
      previousNotifications.map(notification => ({
        ...notification,
        status: 'read',
        readAt: new Date(),
      })),
    );

    try {
      await markAllNotificationsAsRead();
    } catch (bulkError) {
      mutate(() => previous);
      throw bulkError;
    }
  }, [data, mutate]);

  const unreadCount = useMemo(
    () => data.filter(notification => notification.status === 'unread').length,
    [data],
  );

  return {
    notifications: data,
    isLoading,
    error,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    retry,
    unreadCount,
  };
}
