import { useCallback } from 'react';

import {
  subscribeToProductionPlan,
  updateProductionPlan,
  updateProductionPlanStatus,
} from '@/services/firestore';

import { useFirestoreSubscription } from './useFirestoreSubscription';

import type {
  ProductionPlan,
  ProductionPlanUpdateInput,
  ProductionStatus,
} from '@/domain';

type UseProductionPlanOptions = {
  suspense?: boolean;
};

type UseProductionPlanResult = {
  plan: ProductionPlan | null;
  isLoading: boolean;
  error: Error | null;
  update: (input: ProductionPlanUpdateInput) => Promise<ProductionPlan>;
  updateStatus: (status: ProductionStatus) => Promise<ProductionPlan>;
  retry: () => void;
};

export function useProductionPlan(
  planId: string,
  options: UseProductionPlanOptions = {},
): UseProductionPlanResult {
  const { data, error, isLoading, mutate, retry } =
    useFirestoreSubscription<ProductionPlan | null>({
      subscribe: ({ next, error: onError }) =>
        subscribeToProductionPlan(planId, {
          next,
          error: onError,
        }),
      initialValue: null,
      suspense: options.suspense,
      dependencies: [planId],
    });

  const handleUpdate = useCallback(
    async (input: ProductionPlanUpdateInput) => {
      if (!data) {
        throw new Error('Plano não carregado.');
      }

      const temp = { ...data, ...input, updatedAt: new Date() } as ProductionPlan;
      mutate(temp);

      try {
        const updated = await updateProductionPlan(planId, input);
        mutate(updated);
        return updated;
      } catch (updateError) {
        mutate(data);
        throw updateError;
      }
    },
    [data, mutate, planId],
  );

  const handleUpdateStatus = useCallback(
    async (status: ProductionStatus) => {
      if (!data) {
        throw new Error('Plano não carregado.');
      }

      const snapshot = data;
      mutate({ ...data, status, updatedAt: new Date() });

      try {
        const updated = await updateProductionPlanStatus(planId, status);
        mutate(updated);
        return updated;
      } catch (statusError) {
        mutate(snapshot);
        throw statusError;
      }
    },
    [data, mutate, planId],
  );

  return {
    plan: data,
    isLoading,
    error,
    update: handleUpdate,
    updateStatus: handleUpdateStatus,
    retry,
  };
}
