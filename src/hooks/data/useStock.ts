import { useCallback } from 'react';

import {
  StockItem,
  StockItemCreateInput,
  StockItemUpdateInput,
  StockMovement,
  StockMovementCreateInput,
} from '@/domain';
import {
  adjustStockLevel,
  archiveStockItem,
  createStockItem,
  deleteStockItem,
  recordStockMovement,
  restoreStockItem,
  subscribeToStockItems,
  subscribeToStockMovements,
  updateStockItem,
} from '@/services/firestore';

import { useFirestoreSubscription } from './useFirestoreSubscription';

type UseStockItemsOptions = {
  includeArchived?: boolean;
  productId?: string;
  suspense?: boolean;
};

type UseStockItemsResult = {
  stockItems: StockItem[];
  isLoading: boolean;
  error: Error | null;
  create: (input: StockItemCreateInput) => Promise<StockItem>;
  update: (stockItemId: string, input: StockItemUpdateInput) => Promise<StockItem>;
  archive: (stockItemId: string) => Promise<StockItem>;
  restore: (stockItemId: string) => Promise<StockItem>;
  remove: (stockItemId: string) => Promise<void>;
  adjust: (params: {
    stockItemId: string;
    quantityInGrams: number;
    type: StockMovementCreateInput['type'];
    performedBy: string;
    note?: string;
  }) => Promise<StockMovement>;
  retry: () => void;
};

type UseStockMovementsOptions = {
  stockItemId?: string;
  productId?: string;
  limit?: number;
  suspense?: boolean;
};

type UseStockMovementsResult = {
  movements: StockMovement[];
  isLoading: boolean;
  error: Error | null;
  create: (input: StockMovementCreateInput) => Promise<StockMovement>;
  retry: () => void;
};

export function useStockItems(options: UseStockItemsOptions = {}): UseStockItemsResult {
  const subscribe = useCallback(
    ({
      next,
      error,
    }: {
      next: (value: StockItem[]) => void;
      error?: (err: Error) => void;
    }) =>
      subscribeToStockItems(
        {
          next,
          error,
        },
        {
          includeArchived: options.includeArchived,
          productId: options.productId,
        },
      ),
    [options.includeArchived, options.productId],
  );

  const { data, error, isLoading, mutate, retry } = useFirestoreSubscription<StockItem[]>(
    {
      subscribe,
      initialValue: [],
      suspense: options.suspense,
      dependencies: [options.includeArchived, options.productId],
    },
  );

  const handleCreate = useCallback(
    async (input: StockItemCreateInput) => {
      const tempId = `temp-${Date.now()}`;
      const optimisticItem: StockItem = {
        id: tempId,
        productId: input.productId,
        currentQuantityInGrams: input.currentQuantityInGrams ?? 0,
        minimumQuantityInGrams: input.minimumQuantityInGrams,
        lastMovementId: input.lastMovementId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: input.archivedAt ?? null,
      };

      mutate(previous => [...previous, optimisticItem]);

      try {
        const created = await createStockItem(input);
        mutate(previous => previous.map(item => (item.id === tempId ? created : item)));
        return created;
      } catch (creationError) {
        mutate(previous => previous.filter(item => item.id !== tempId));
        throw creationError;
      }
    },
    [mutate],
  );

  const handleUpdate = useCallback(
    async (stockItemId: string, input: StockItemUpdateInput) => {
      let snapshot: StockItem | undefined;

      mutate(previous => {
        snapshot = previous.find(item => item.id === stockItemId);
        if (!snapshot) {
          return previous;
        }

        return previous.map(item =>
          item.id === stockItemId
            ? {
                ...item,
                ...input,
                updatedAt: new Date(),
              }
            : item,
        );
      });

      try {
        const updated = await updateStockItem(stockItemId, input);
        mutate(previous =>
          previous.map(item => (item.id === stockItemId ? updated : item)),
        );
        return updated;
      } catch (updateError) {
        if (snapshot) {
          mutate(previous =>
            previous.map(item => (item.id === stockItemId ? snapshot! : item)),
          );
        }
        throw updateError;
      }
    },
    [mutate],
  );

  const handleArchive = useCallback(
    async (stockItemId: string) => {
      mutate(previous =>
        previous.map(item =>
          item.id === stockItemId
            ? { ...item, archivedAt: new Date(), updatedAt: new Date() }
            : item,
        ),
      );

      try {
        const archived = await archiveStockItem(stockItemId);
        mutate(previous =>
          previous.map(item => (item.id === stockItemId ? archived : item)),
        );
        return archived;
      } catch (archiveError) {
        retry();
        throw archiveError;
      }
    },
    [mutate, retry],
  );

  const handleRestore = useCallback(
    async (stockItemId: string) => {
      mutate(previous =>
        previous.map(item =>
          item.id === stockItemId
            ? { ...item, archivedAt: null, updatedAt: new Date() }
            : item,
        ),
      );

      try {
        const restored = await restoreStockItem(stockItemId);
        mutate(previous =>
          previous.map(item => (item.id === stockItemId ? restored : item)),
        );
        return restored;
      } catch (restoreError) {
        retry();
        throw restoreError;
      }
    },
    [mutate, retry],
  );

  const handleDelete = useCallback(
    async (stockItemId: string) => {
      let snapshot: StockItem | undefined;

      mutate(previous => {
        snapshot = previous.find(item => item.id === stockItemId);
        return previous.filter(item => item.id !== stockItemId);
      });

      try {
        await deleteStockItem(stockItemId);
      } catch (deleteError) {
        if (snapshot) {
          mutate(previous => [...previous, snapshot!]);
        }
        throw deleteError;
      }
    },
    [mutate],
  );

  const handleAdjust = useCallback(
    async (params: {
      stockItemId: string;
      quantityInGrams: number;
      type: StockMovementCreateInput['type'];
      performedBy: string;
      note?: string;
    }) => {
      try {
        return await adjustStockLevel(params);
      } catch (adjustError) {
        retry();
        throw adjustError;
      }
    },
    [retry],
  );

  return {
    stockItems: data,
    isLoading,
    error,
    create: handleCreate,
    update: handleUpdate,
    archive: handleArchive,
    restore: handleRestore,
    remove: handleDelete,
    adjust: handleAdjust,
    retry,
  };
}

export function useStockMovements(
  options: UseStockMovementsOptions = {},
): UseStockMovementsResult {
  const subscribe = useCallback(
    ({
      next,
      error,
    }: {
      next: (value: StockMovement[]) => void;
      error?: (err: Error) => void;
    }) =>
      subscribeToStockMovements(
        {
          next,
          error,
        },
        {
          stockItemId: options.stockItemId,
          productId: options.productId,
          limit: options.limit,
        },
      ),
    [options.limit, options.productId, options.stockItemId],
  );

  const { data, error, isLoading, mutate, retry } = useFirestoreSubscription<
    StockMovement[]
  >({
    subscribe,
    initialValue: [],
    suspense: options.suspense,
    dependencies: [options.stockItemId, options.productId, options.limit],
  });

  const handleCreate = useCallback(
    async (input: StockMovementCreateInput) => {
      const tempId = `temp-${Date.now()}`;
      const optimisticMovement: StockMovement = {
        id: tempId,
        productId: input.productId,
        stockItemId: input.stockItemId,
        type: input.type,
        quantityInGrams: input.quantityInGrams,
        previousQuantityInGrams: input.previousQuantityInGrams,
        resultingQuantityInGrams: input.resultingQuantityInGrams,
        note: input.note,
        performedBy: input.performedBy,
        performedAt: input.performedAt ?? new Date(),
      };

      mutate(previous => [optimisticMovement, ...previous]);

      try {
        const created = await recordStockMovement(input);
        mutate(previous =>
          previous.map(movement => (movement.id === tempId ? created : movement)),
        );
        return created;
      } catch (creationError) {
        mutate(previous => previous.filter(movement => movement.id !== tempId));
        throw creationError;
      }
    },
    [mutate],
  );

  return {
    movements: data,
    isLoading,
    error,
    create: handleCreate,
    retry,
  };
}
