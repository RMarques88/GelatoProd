import { useCallback } from 'react';

import {
  ProductionPlan,
  ProductionPlanCreateInput,
  ProductionPlanUpdateInput,
  ProductionStatus,
} from '@/domain';
import {
  archiveProductionPlan,
  createProductionPlan,
  deleteProductionPlan,
  subscribeToProductionPlans,
  updateProductionPlan,
  updateProductionPlanStatus,
} from '@/services/firestore';

import { useFirestoreSubscription } from './useFirestoreSubscription';

type UseProductionPlansOptions = {
  status?: ProductionStatus[];
  from?: Date;
  to?: Date;
  includeArchived?: boolean;
  limit?: number;
  suspense?: boolean;
  enabled?: boolean;
};

type UseProductionPlansResult = {
  plans: ProductionPlan[];
  isLoading: boolean;
  error: Error | null;
  create: (input: ProductionPlanCreateInput) => Promise<ProductionPlan>;
  update: (planId: string, input: ProductionPlanUpdateInput) => Promise<ProductionPlan>;
  updateStatus: (planId: string, status: ProductionStatus) => Promise<ProductionPlan>;
  archive: (planId: string) => Promise<ProductionPlan>;
  remove: (planId: string) => Promise<void>;
  retry: () => void;
};

export function useProductionPlans(
  options: UseProductionPlansOptions = {},
): UseProductionPlansResult {
  const { status, from, to, includeArchived, limit, suspense, enabled = true } = options;

  const subscribe = useCallback(
    ({
      next,
      error,
    }: {
      next: (value: ProductionPlan[]) => void;
      error?: (err: Error) => void;
    }) =>
      subscribeToProductionPlans(
        {
          next,
          error,
        },
        {
          status,
          from,
          to,
          includeArchived,
          limit,
        },
      ),
    [status, from, to, includeArchived, limit],
  );

  const { data, error, isLoading, mutate, retry } = useFirestoreSubscription<
    ProductionPlan[]
  >({
    subscribe,
    initialValue: [],
    suspense,
    enabled,
  });

  const handleCreate = useCallback(
    async (input: ProductionPlanCreateInput) => {
      const tempId = `temp-${Date.now()}`;
      const optimisticPlan: ProductionPlan = {
        id: tempId,
        recipeId: input.recipeId,
        recipeName: input.recipeName,
        sequenceNumber: input.sequenceNumber ?? Number.MAX_SAFE_INTEGER,
        code: input.code ?? 'Gerando código…',
        scheduledFor: input.scheduledFor,
        quantityInUnits: input.quantityInUnits,
        unitOfMeasure: input.unitOfMeasure,
        notes: input.notes,
        status: input.status ?? 'scheduled',
        requestedBy: input.requestedBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: input.archivedAt ?? null,
        estimatedProductionCostInBRL: input.estimatedProductionCostInBRL ?? null,
        actualProductionCostInBRL: input.actualProductionCostInBRL ?? null,
      };

      mutate(previous => [optimisticPlan, ...previous]);

      try {
        const created = await createProductionPlan(input);
        mutate(previous => previous.map(plan => (plan.id === tempId ? created : plan)));
        return created;
      } catch (creationError) {
        mutate(previous => previous.filter(plan => plan.id !== tempId));
        throw creationError;
      }
    },
    [mutate],
  );

  const handleUpdate = useCallback(
    async (planId: string, input: ProductionPlanUpdateInput) => {
      let snapshot: ProductionPlan | undefined;

      mutate(previous => {
        snapshot = previous.find(plan => plan.id === planId);

        if (!snapshot) {
          return previous;
        }

        const sanitizedInput = Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        ) as ProductionPlanUpdateInput;

        return previous.map(plan =>
          plan.id === planId
            ? {
                ...plan,
                ...sanitizedInput,
                scheduledFor: input.scheduledFor ?? plan.scheduledFor,
                archivedAt:
                  input.archivedAt !== undefined ? input.archivedAt : plan.archivedAt,
                updatedAt: new Date(),
              }
            : plan,
        );
      });

      try {
        const updated = await updateProductionPlan(planId, input);
        mutate(previous => previous.map(plan => (plan.id === planId ? updated : plan)));
        return updated;
      } catch (updateError) {
        if (snapshot) {
          mutate(previous =>
            previous.map(plan => (plan.id === planId ? snapshot! : plan)),
          );
        }
        throw updateError;
      }
    },
    [mutate],
  );

  const handleUpdateStatus = useCallback(
    async (planId: string, nextStatus: ProductionStatus) => {
      let snapshot: ProductionPlan | undefined;

      mutate(previous => {
        snapshot = previous.find(plan => plan.id === planId);

        if (!snapshot) {
          return previous;
        }

        return previous.map(plan =>
          plan.id === planId
            ? {
                ...plan,
                status: nextStatus,
                updatedAt: new Date(),
              }
            : plan,
        );
      });

      try {
        const updated = await updateProductionPlanStatus(planId, nextStatus);
        mutate(previous => previous.map(plan => (plan.id === planId ? updated : plan)));
        return updated;
      } catch (statusError) {
        if (snapshot) {
          mutate(previous =>
            previous.map(plan => (plan.id === planId ? snapshot! : plan)),
          );
        }
        throw statusError;
      }
    },
    [mutate],
  );

  const handleArchive = useCallback(
    async (planId: string) => {
      let snapshot: ProductionPlan | undefined;

      mutate(previous => {
        snapshot = previous.find(plan => plan.id === planId);

        if (!snapshot) {
          return previous;
        }

        return previous.map(plan =>
          plan.id === planId
            ? {
                ...plan,
                status: 'cancelled',
                archivedAt: new Date(),
                updatedAt: new Date(),
              }
            : plan,
        );
      });

      try {
        const archived = await archiveProductionPlan(planId);
        mutate(previous => previous.map(plan => (plan.id === planId ? archived : plan)));
        return archived;
      } catch (archiveError) {
        if (snapshot) {
          mutate(previous =>
            previous.map(plan => (plan.id === planId ? snapshot! : plan)),
          );
        }
        throw archiveError;
      }
    },
    [mutate],
  );

  const handleRemove = useCallback(
    async (planId: string) => {
      let snapshot: ProductionPlan | undefined;
      let index = -1;

      mutate(previous => {
        index = previous.findIndex(plan => plan.id === planId);
        snapshot = index >= 0 ? previous[index] : undefined;
        return previous.filter(plan => plan.id !== planId);
      });

      try {
        await deleteProductionPlan(planId);
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
    plans: data,
    isLoading,
    error,
    create: handleCreate,
    update: handleUpdate,
    updateStatus: handleUpdateStatus,
    archive: handleArchive,
    remove: handleRemove,
    retry,
  };
}
