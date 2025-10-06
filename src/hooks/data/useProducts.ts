import { useCallback } from 'react';

import { Product, ProductCreateInput, ProductUpdateInput } from '@/domain';
import {
  archiveProduct,
  createProduct,
  deleteProduct,
  restoreProduct,
  subscribeToProducts,
  updateProduct,
} from '@/services/firestore';

import { useFirestoreSubscription } from './useFirestoreSubscription';

type UseProductsOptions = {
  includeInactive?: boolean;
  suspense?: boolean;
  enabled?: boolean;
};

type CreateProductInput = ProductCreateInput;
type UpdateProductInput = ProductUpdateInput;
type DeleteProductOptions = {
  performedBy?: string;
  reason?: string;
};

type UseProductsResult = {
  products: Product[];
  isLoading: boolean;
  error: Error | null;
  create: (input: CreateProductInput) => Promise<Product>;
  update: (productId: string, input: UpdateProductInput) => Promise<Product>;
  archive: (productId: string) => Promise<Product>;
  restore: (productId: string) => Promise<Product>;
  remove: (productId: string, deleteOptions?: DeleteProductOptions) => Promise<void>;
  retry: () => void;
};

export function useProducts(options: UseProductsOptions = {}): UseProductsResult {
  const { includeInactive, suspense, enabled = true } = options;

  const subscribe = useCallback(
    ({
      next,
      error,
    }: {
      next: (value: Product[]) => void;
      error?: (err: Error) => void;
    }) =>
      subscribeToProducts(
        {
          next,
          error,
        },
        { includeInactive },
      ),
    [includeInactive],
  );

  const { data, error, isLoading, mutate, retry } = useFirestoreSubscription<Product[]>({
    subscribe,
    initialValue: [],
    suspense,
    enabled,
  });

  const handleCreate = useCallback(
    async (input: CreateProductInput) => {
      const tempId = `temp-${Date.now()}`;
      const optimisticProduct: Product = {
        id: tempId,
        name: input.name,
        description: input.description,
        category: input.category,
        tags: input.tags ?? [],
        barcode: input.barcode ?? null,
        isActive: input.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: input.archivedAt ?? null,
      };

      mutate(previous => [...previous, optimisticProduct]);

      try {
        const created = await createProduct(input);

        mutate(previous =>
          previous.map(product => (product.id === tempId ? created : product)),
        );

        return created;
      } catch (creationError) {
        mutate(previous => previous.filter(product => product.id !== tempId));
        throw creationError;
      }
    },
    [mutate],
  );

  const handleUpdate = useCallback(
    async (productId: string, input: UpdateProductInput) => {
      let snapshot: Product | undefined;

      mutate(previous => {
        snapshot = previous.find(product => product.id === productId);

        if (!snapshot) {
          return previous;
        }

        return previous.map(product =>
          product.id === productId
            ? {
                ...product,
                ...input,
                tags: input.tags ?? product.tags,
                updatedAt: new Date(),
              }
            : product,
        );
      });

      try {
        const updated = await updateProduct(productId, input);
        mutate(previous =>
          previous.map(product => (product.id === productId ? updated : product)),
        );
        return updated;
      } catch (updateError) {
        if (snapshot) {
          mutate(previous =>
            previous.map(product => (product.id === productId ? snapshot! : product)),
          );
        }
        throw updateError;
      }
    },
    [mutate],
  );

  const handleArchive = useCallback(
    async (productId: string) => {
      mutate(previous =>
        previous.map(product =>
          product.id === productId
            ? {
                ...product,
                isActive: false,
                archivedAt: new Date(),
                updatedAt: new Date(),
              }
            : product,
        ),
      );

      try {
        const archived = await archiveProduct(productId);
        mutate(previous =>
          previous.map(product => (product.id === productId ? archived : product)),
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
    async (productId: string) => {
      mutate(previous =>
        previous.map(product =>
          product.id === productId
            ? { ...product, isActive: true, archivedAt: null, updatedAt: new Date() }
            : product,
        ),
      );

      try {
        const restored = await restoreProduct(productId);
        mutate(previous =>
          previous.map(product => (product.id === productId ? restored : product)),
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
    async (productId: string, deleteOptions?: DeleteProductOptions) => {
      let snapshot: Product | undefined;

      mutate(previous => {
        snapshot = previous.find(product => product.id === productId);
        return previous.filter(product => product.id !== productId);
      });

      try {
        await deleteProduct(productId, deleteOptions);
      } catch (deleteError) {
        if (snapshot) {
          mutate(previous => [...previous, snapshot!]);
        }
        throw deleteError;
      }
    },
    [mutate],
  );

  return {
    products: data,
    isLoading,
    error,
    create: handleCreate,
    update: handleUpdate,
    archive: handleArchive,
    restore: handleRestore,
    remove: handleDelete,
    retry,
  };
}
