import { useCallback, useMemo } from 'react';

import { subscribeToProductionPlanAvailabilityRecords } from '@/services/firestore';
import { calculateAvailabilityMetrics } from '@/services/productionAvailabilityAnalytics';

import { useFirestoreSubscription } from './useFirestoreSubscription';
import type {
  ProductionPlanAvailabilityRecord,
  ProductionPlanAvailabilityStatus,
} from '@/domain';

const DEFAULT_WINDOW_IN_DAYS = 30;

function normalizeStatuses(statuses?: ProductionPlanAvailabilityStatus[]) {
  if (!statuses || statuses.length === 0) {
    return undefined;
  }

  const unique = Array.from(new Set(statuses));
  unique.sort();
  return unique;
}

function computeFromDate(days?: number) {
  if (!days) {
    return undefined;
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const distance = days * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - distance);
}

type UseProductionAvailabilityRecordsOptions = {
  limit?: number;
  statuses?: ProductionPlanAvailabilityStatus[];
  windowInDays?: number;
  enabled?: boolean;
  suspense?: boolean;
};

type UseProductionAvailabilityRecordsResult = {
  records: ProductionPlanAvailabilityRecord[];
  metrics: ReturnType<typeof calculateAvailabilityMetrics>;
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
};

export function useProductionAvailabilityRecords(
  options: UseProductionAvailabilityRecordsOptions = {},
): UseProductionAvailabilityRecordsResult {
  const {
    limit = 40,
    statuses,
    windowInDays = DEFAULT_WINDOW_IN_DAYS,
    enabled = true,
    suspense,
  } = options;

  const normalizedStatuses = useMemo(() => normalizeStatuses(statuses), [statuses]);
  const from = useMemo(() => computeFromDate(windowInDays), [windowInDays]);

  const subscriptionKey = useMemo(() => {
    const statusesKey = normalizedStatuses?.join('|') ?? 'all';
    const fromKey = from ? from.toISOString() : 'none';
    return `${statusesKey}:${fromKey}:${limit}`;
  }, [from, limit, normalizedStatuses]);

  const subscribe = useCallback(
    ({
      next,
      error,
    }: {
      next: (value: ProductionPlanAvailabilityRecord[]) => void;
      error?: (err: Error) => void;
    }) =>
      subscribeToProductionPlanAvailabilityRecords(
        {
          next,
          error,
        },
        {
          status: normalizedStatuses,
          from,
          limit,
        },
      ),
    [from, limit, normalizedStatuses],
  );

  const { data, error, isLoading, retry } = useFirestoreSubscription<
    ProductionPlanAvailabilityRecord[]
  >({
    subscribe,
    initialValue: [],
    suspense,
    enabled,
    dependencies: [subscriptionKey],
  });

  const metrics = useMemo(() => calculateAvailabilityMetrics(data), [data]);

  return {
    records: data,
    metrics,
    isLoading,
    error,
    retry,
  };
}
