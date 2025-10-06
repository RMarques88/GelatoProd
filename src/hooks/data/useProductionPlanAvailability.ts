import { subscribeToProductionPlanAvailabilityRecord } from '@/services/firestore';
import { useFirestoreSubscription } from './useFirestoreSubscription';
import type { ProductionPlanAvailabilityRecord } from '@/domain';

type UseProductionPlanAvailabilityOptions = {
  suspense?: boolean;
};

type UseProductionPlanAvailabilityResult = {
  record: ProductionPlanAvailabilityRecord | null;
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
};

export function useProductionPlanAvailability(
  planId: string,
  options: UseProductionPlanAvailabilityOptions = {},
): UseProductionPlanAvailabilityResult {
  const { data, error, isLoading, retry } =
    useFirestoreSubscription<ProductionPlanAvailabilityRecord | null>({
      subscribe: ({ next, error: onError }) =>
        subscribeToProductionPlanAvailabilityRecord(planId, {
          next,
          error: onError,
        }),
      initialValue: null,
      suspense: options.suspense,
      dependencies: [planId],
    });

  return {
    record: data,
    isLoading,
    error,
    retry,
  };
}
