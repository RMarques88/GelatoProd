import { useCallback, useMemo } from 'react';

import {
  ProductionDivergence,
  ProductionDivergenceCreateInput,
  ProductionDivergenceStatus,
  ProductionDivergenceUpdateInput,
} from '@/domain';
import {
  createProductionDivergence,
  deleteProductionDivergence,
  subscribeToProductionDivergences,
  updateProductionDivergence,
} from '@/services/firestore';

import { useFirestoreSubscription } from './useFirestoreSubscription';

type UseProductionDivergencesOptions = {
  planId?: string;
  stageId?: string;
  status?: ProductionDivergenceStatus[];
  limit?: number;
  suspense?: boolean;
};

type UseProductionDivergencesResult = {
  divergences: ProductionDivergence[];
  isLoading: boolean;
  error: Error | null;
  create: (input: ProductionDivergenceCreateInput) => Promise<ProductionDivergence>;
  update: (
    divergenceId: string,
    input: ProductionDivergenceUpdateInput,
  ) => Promise<ProductionDivergence>;
  remove: (divergenceId: string) => Promise<void>;
  retry: () => void;
};

export function useProductionDivergences(
  options: UseProductionDivergencesOptions = {},
): UseProductionDivergencesResult {
  const statusKey = useMemo(
    () => options.status?.slice().sort().join('|') ?? 'all',
    [options.status],
  );

  const subscribe = useCallback(
    ({
      next,
      error,
    }: {
      next: (value: ProductionDivergence[]) => void;
      error?: (err: Error) => void;
    }) =>
      subscribeToProductionDivergences(
        {
          next,
          error,
        },
        {
          planId: options.planId,
          stageId: options.stageId,
          status: options.status,
          limit: options.limit,
        },
      ),
    [options.planId, options.stageId, options.status, options.limit],
  );

  const { data, error, isLoading, mutate, retry } = useFirestoreSubscription<
    ProductionDivergence[]
  >({
    subscribe,
    initialValue: [],
    suspense: options.suspense,
    dependencies: [
      options.planId ?? 'all',
      options.stageId ?? 'all',
      statusKey,
      options.limit,
    ],
  });

  const handleCreate = useCallback(
    async (input: ProductionDivergenceCreateInput) => {
      const tempId = `temp-divergence-${Date.now()}`;
      const optimisticDivergence: ProductionDivergence = {
        id: tempId,
        planId: input.planId,
        stageId: input.stageId ?? null,
        reportedBy: input.reportedBy,
        resolvedBy: null,
        status: 'open',
        severity: input.severity,
        type: input.type,
        description: input.description,
        expectedQuantityInUnits: input.expectedQuantityInUnits ?? null,
        actualQuantityInUnits: input.actualQuantityInUnits ?? null,
        resolutionNotes: undefined,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mutate(previous => [optimisticDivergence, ...previous]);

      try {
        const created = await createProductionDivergence(input);
        mutate(previous =>
          previous.map(divergence => (divergence.id === tempId ? created : divergence)),
        );
        return created;
      } catch (creationError) {
        mutate(previous => previous.filter(divergence => divergence.id !== tempId));
        throw creationError;
      }
    },
    [mutate],
  );

  const handleUpdate = useCallback(
    async (divergenceId: string, input: ProductionDivergenceUpdateInput) => {
      let snapshot: ProductionDivergence | undefined;

      mutate(previous => {
        snapshot = previous.find(divergence => divergence.id === divergenceId);

        if (!snapshot) {
          return previous;
        }

        return previous.map(divergence =>
          divergence.id === divergenceId
            ? {
                ...divergence,
                ...input,
                resolvedAt:
                  input.resolvedAt !== undefined
                    ? (input.resolvedAt ?? null)
                    : divergence.resolvedAt,
                resolvedBy:
                  input.resolvedBy !== undefined
                    ? (input.resolvedBy ?? null)
                    : divergence.resolvedBy,
                updatedAt: new Date(),
              }
            : divergence,
        );
      });

      try {
        const updated = await updateProductionDivergence(divergenceId, input);
        mutate(previous =>
          previous.map(divergence =>
            divergence.id === divergenceId ? updated : divergence,
          ),
        );
        return updated;
      } catch (updateError) {
        if (snapshot) {
          mutate(previous =>
            previous.map(divergence =>
              divergence.id === divergenceId ? snapshot! : divergence,
            ),
          );
        }
        throw updateError;
      }
    },
    [mutate],
  );

  const handleRemove = useCallback(
    async (divergenceId: string) => {
      let snapshot: ProductionDivergence | undefined;
      let index = -1;

      mutate(previous => {
        index = previous.findIndex(divergence => divergence.id === divergenceId);
        snapshot = index >= 0 ? previous[index] : undefined;
        return previous.filter(divergence => divergence.id !== divergenceId);
      });

      try {
        await deleteProductionDivergence(divergenceId);
      } catch (deleteError) {
        if (snapshot) {
          mutate(previous => {
            const clone = [...previous];
            const insertionIndex = index >= 0 ? index : clone.length;
            clone.splice(insertionIndex, 0, snapshot!);
            return clone;
          });
        }
        throw deleteError;
      }
    },
    [mutate],
  );

  return {
    divergences: data,
    isLoading,
    error,
    create: handleCreate,
    update: handleUpdate,
    remove: handleRemove,
    retry,
  };
}
