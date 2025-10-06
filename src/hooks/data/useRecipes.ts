import { useCallback } from 'react';

import { Recipe, RecipeCreateInput, RecipeUpdateInput } from '@/domain';
import {
  archiveRecipe,
  createRecipe,
  deleteRecipe,
  restoreRecipe,
  subscribeToRecipes,
  updateRecipe,
} from '@/services/firestore';

import { useFirestoreSubscription } from './useFirestoreSubscription';

type UseRecipesOptions = {
  includeInactive?: boolean;
  suspense?: boolean;
  enabled?: boolean;
};

type UseRecipesResult = {
  recipes: Recipe[];
  isLoading: boolean;
  error: Error | null;
  create: (input: RecipeCreateInput) => Promise<Recipe>;
  update: (recipeId: string, input: RecipeUpdateInput) => Promise<Recipe>;
  archive: (recipeId: string) => Promise<Recipe>;
  restore: (recipeId: string) => Promise<Recipe>;
  remove: (recipeId: string) => Promise<void>;
  retry: () => void;
};

export function useRecipes(options: UseRecipesOptions = {}): UseRecipesResult {
  const { includeInactive, suspense, enabled = true } = options;

  const subscribe = useCallback(
    ({
      next,
      error,
    }: {
      next: (value: Recipe[]) => void;
      error?: (err: Error) => void;
    }) =>
      subscribeToRecipes(
        {
          next,
          error,
        },
        { includeInactive },
      ),
    [includeInactive],
  );

  const { data, error, isLoading, mutate, retry } = useFirestoreSubscription<Recipe[]>({
    subscribe,
    initialValue: [],
    suspense,
    enabled,
  });

  const handleCreate = useCallback(
    async (input: RecipeCreateInput) => {
      const tempId = `temp-${Date.now()}`;
      const optimisticRecipe: Recipe = {
        id: tempId,
        name: input.name,
        description: input.description,
        yieldInGrams: input.yieldInGrams,
        ingredients: input.ingredients ?? [],
        instructions: input.instructions,
        isActive: input.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: input.archivedAt ?? null,
      };

      mutate(previous => [...previous, optimisticRecipe]);

      try {
        const created = await createRecipe(input);
        mutate(previous =>
          previous.map(recipe => (recipe.id === tempId ? created : recipe)),
        );
        return created;
      } catch (creationError) {
        console.error('[useRecipes] createRecipe failed', creationError);
        mutate(previous => previous.filter(recipe => recipe.id !== tempId));
        throw creationError;
      }
    },
    [mutate],
  );

  const handleUpdate = useCallback(
    async (recipeId: string, input: RecipeUpdateInput) => {
      let snapshot: Recipe | undefined;

      mutate(previous => {
        snapshot = previous.find(recipe => recipe.id === recipeId);
        if (!snapshot) {
          return previous;
        }

        return previous.map(recipe =>
          recipe.id === recipeId
            ? {
                ...recipe,
                ...input,
                ingredients: input.ingredients ?? recipe.ingredients,
                updatedAt: new Date(),
              }
            : recipe,
        );
      });

      try {
        const updated = await updateRecipe(recipeId, input);
        mutate(previous =>
          previous.map(recipe => (recipe.id === recipeId ? updated : recipe)),
        );
        return updated;
      } catch (updateError) {
        if (snapshot) {
          mutate(previous =>
            previous.map(recipe => (recipe.id === recipeId ? snapshot! : recipe)),
          );
        }
        throw updateError;
      }
    },
    [mutate],
  );

  const handleArchive = useCallback(
    async (recipeId: string) => {
      mutate(previous =>
        previous.map(recipe =>
          recipe.id === recipeId
            ? {
                ...recipe,
                isActive: false,
                archivedAt: new Date(),
                updatedAt: new Date(),
              }
            : recipe,
        ),
      );

      try {
        const archived = await archiveRecipe(recipeId);
        mutate(previous =>
          previous.map(recipe => (recipe.id === recipeId ? archived : recipe)),
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
    async (recipeId: string) => {
      mutate(previous =>
        previous.map(recipe =>
          recipe.id === recipeId
            ? { ...recipe, isActive: true, archivedAt: null, updatedAt: new Date() }
            : recipe,
        ),
      );

      try {
        const restored = await restoreRecipe(recipeId);
        mutate(previous =>
          previous.map(recipe => (recipe.id === recipeId ? restored : recipe)),
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
    async (recipeId: string) => {
      let snapshot: Recipe | undefined;

      mutate(previous => {
        snapshot = previous.find(recipe => recipe.id === recipeId);
        return previous.filter(recipe => recipe.id !== recipeId);
      });

      try {
        await deleteRecipe(recipeId);
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
    recipes: data,
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
