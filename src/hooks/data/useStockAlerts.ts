import { useCallback, useMemo } from 'react';

import { StockAlert, StockAlertStatus } from '@/domain';
import {
  acknowledgeStockAlert,
  resolveStockAlert,
  subscribeToStockAlerts,
} from '@/services/firestore';

import { useFirestoreSubscription } from './useFirestoreSubscription';

type UseStockAlertsOptions = {
  status?: StockAlertStatus[];
  onlyCritical?: boolean;
  productId?: string;
  limit?: number;
  suspense?: boolean;
};

type UseStockAlertsResult = {
  alerts: StockAlert[];
  isLoading: boolean;
  error: Error | null;
  acknowledge: (alertId: string) => Promise<StockAlert>;
  resolve: (alertId: string) => Promise<StockAlert>;
  retry: () => void;
};

export function useStockAlerts(
  options: UseStockAlertsOptions = {},
): UseStockAlertsResult {
  const statusKey = useMemo(
    () => options.status?.slice().sort().join('|') ?? 'default',
    [options.status],
  );

  const subscribe = useCallback(
    ({
      next,
      error,
    }: {
      next: (value: StockAlert[]) => void;
      error?: (err: Error) => void;
    }) =>
      subscribeToStockAlerts(
        {
          next,
          error,
        },
        {
          status: options.status,
          onlyCritical: options.onlyCritical,
          productId: options.productId,
          limit: options.limit,
        },
      ),
    [options.limit, options.onlyCritical, options.productId, options.status],
  );

  const { data, error, isLoading, mutate, retry } = useFirestoreSubscription<
    StockAlert[]
  >({
    subscribe,
    initialValue: [],
    suspense: options.suspense,
    dependencies: [statusKey, options.onlyCritical, options.productId, options.limit],
  });

  const handleAcknowledge = useCallback(
    async (alertId: string) => {
      let snapshot: StockAlert | undefined;

      mutate(previous => {
        snapshot = previous.find(alert => alert.id === alertId);

        if (!snapshot) {
          return previous;
        }

        return previous.map(alert =>
          alert.id === alertId
            ? {
                ...alert,
                status: 'acknowledged',
                acknowledgedAt: new Date(),
              }
            : alert,
        );
      });

      try {
        const acknowledged = await acknowledgeStockAlert(alertId);
        mutate(previous =>
          previous.map(alert => (alert.id === alertId ? acknowledged : alert)),
        );
        return acknowledged;
      } catch (ackError) {
        if (snapshot) {
          mutate(previous =>
            previous.map(alert => (alert.id === alertId ? snapshot! : alert)),
          );
        }
        throw ackError;
      }
    },
    [mutate],
  );

  const handleResolve = useCallback(
    async (alertId: string) => {
      let snapshot: StockAlert | undefined;

      mutate(previous => {
        snapshot = previous.find(alert => alert.id === alertId);

        if (!snapshot) {
          return previous;
        }

        return previous.map(alert =>
          alert.id === alertId
            ? {
                ...alert,
                status: 'resolved',
                resolvedAt: new Date(),
              }
            : alert,
        );
      });

      try {
        const resolved = await resolveStockAlert(alertId);
        mutate(previous =>
          previous.map(alert => (alert.id === alertId ? resolved : alert)),
        );
        return resolved;
      } catch (resolveError) {
        if (snapshot) {
          mutate(previous =>
            previous.map(alert => (alert.id === alertId ? snapshot! : alert)),
          );
        }
        throw resolveError;
      }
    },
    [mutate],
  );

  return {
    alerts: data,
    isLoading,
    error,
    acknowledge: handleAcknowledge,
    resolve: handleResolve,
    retry,
  };
}
