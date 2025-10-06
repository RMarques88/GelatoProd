import { useCallback, useMemo } from 'react';

import {
  ProductionStage,
  ProductionStageCreateInput,
  ProductionStageStatus,
  ProductionStageUpdateInput,
} from '@/domain';
import {
  createProductionStage,
  deleteProductionStage,
  subscribeToProductionStages,
  updateProductionStage,
} from '@/services/firestore';

import { useFirestoreSubscription } from './useFirestoreSubscription';

type UseProductionStagesOptions = {
  planId?: string;
  status?: ProductionStageStatus[];
  limit?: number;
  suspense?: boolean;
};

type UseProductionStagesResult = {
  stages: ProductionStage[];
  isLoading: boolean;
  error: Error | null;
  create: (input: ProductionStageCreateInput) => Promise<ProductionStage>;
  update: (
    stageId: string,
    input: ProductionStageUpdateInput,
  ) => Promise<ProductionStage>;
  remove: (stageId: string) => Promise<void>;
  retry: () => void;
};

export function useProductionStages(
  options: UseProductionStagesOptions = {},
): UseProductionStagesResult {
  const statusKey = useMemo(
    () => options.status?.slice().sort().join('|') ?? 'all',
    [options.status],
  );

  const subscribe = useCallback(
    ({
      next,
      error,
    }: {
      next: (value: ProductionStage[]) => void;
      error?: (err: Error) => void;
    }) =>
      subscribeToProductionStages(
        {
          next,
          error,
        },
        {
          planId: options.planId,
          status: options.status,
          limit: options.limit,
        },
      ),
    [options.planId, options.status, options.limit],
  );

  const { data, error, isLoading, mutate, retry } = useFirestoreSubscription<
    ProductionStage[]
  >({
    subscribe,
    initialValue: [],
    suspense: options.suspense,
    dependencies: [options.planId ?? 'all', statusKey, options.limit],
  });

  const handleCreate = useCallback(
    async (input: ProductionStageCreateInput) => {
      const tempId = `temp-stage-${Date.now()}`;
      const optimisticStage: ProductionStage = {
        id: tempId,
        planId: input.planId,
        name: input.name,
        description: input.description,
        sequence: input.sequence,
        status: input.status ?? 'pending',
        assignedTo: input.assignedTo ?? null,
        scheduledStart: input.scheduledStart ?? null,
        scheduledEnd: input.scheduledEnd ?? null,
        startedAt: input.startedAt ?? null,
        completedAt: input.completedAt ?? null,
        notes: input.notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mutate(previous =>
        [...previous, optimisticStage].sort((a, b) => a.sequence - b.sequence),
      );

      try {
        const created = await createProductionStage(input);
        mutate(previous =>
          previous
            .map(stage => (stage.id === tempId ? created : stage))
            .sort((a, b) => a.sequence - b.sequence),
        );
        return created;
      } catch (creationError) {
        mutate(previous => previous.filter(stage => stage.id !== tempId));
        throw creationError;
      }
    },
    [mutate],
  );

  const handleUpdate = useCallback(
    async (stageId: string, input: ProductionStageUpdateInput) => {
      let snapshot: ProductionStage | undefined;

      mutate(previous => {
        snapshot = previous.find(stage => stage.id === stageId);

        if (!snapshot) {
          return previous;
        }

        return previous
          .map(stage =>
            stage.id === stageId
              ? {
                  ...stage,
                  ...input,
                  scheduledStart:
                    input.scheduledStart !== undefined
                      ? (input.scheduledStart ?? null)
                      : stage.scheduledStart,
                  scheduledEnd:
                    input.scheduledEnd !== undefined
                      ? (input.scheduledEnd ?? null)
                      : stage.scheduledEnd,
                  startedAt:
                    input.startedAt !== undefined
                      ? (input.startedAt ?? null)
                      : stage.startedAt,
                  completedAt:
                    input.completedAt !== undefined
                      ? (input.completedAt ?? null)
                      : stage.completedAt,
                  updatedAt: new Date(),
                }
              : stage,
          )
          .sort((a, b) => a.sequence - b.sequence);
      });

      try {
        const updated = await updateProductionStage(stageId, input);
        mutate(previous =>
          previous
            .map(stage => (stage.id === stageId ? updated : stage))
            .sort((a, b) => a.sequence - b.sequence),
        );
        return updated;
      } catch (updateError) {
        if (snapshot) {
          mutate(previous =>
            previous
              .map(stage => (stage.id === stageId ? snapshot! : stage))
              .sort((a, b) => a.sequence - b.sequence),
          );
        }
        throw updateError;
      }
    },
    [mutate],
  );

  const handleRemove = useCallback(
    async (stageId: string) => {
      let snapshot: ProductionStage | undefined;

      mutate(previous => {
        snapshot = previous.find(stage => stage.id === stageId);
        return previous.filter(stage => stage.id !== stageId);
      });

      try {
        await deleteProductionStage(stageId);
      } catch (deleteError) {
        if (snapshot) {
          mutate(previous =>
            [...previous, snapshot!].sort((a, b) => a.sequence - b.sequence),
          );
        }
        throw deleteError;
      }
    },
    [mutate],
  );

  return {
    stages: data,
    isLoading,
    error,
    create: handleCreate,
    update: handleUpdate,
    remove: handleRemove,
    retry,
  };
}
