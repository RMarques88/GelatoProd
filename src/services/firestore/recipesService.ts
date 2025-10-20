import {
  addDoc,
  deleteDoc,
  DocumentData,
  DocumentSnapshot,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  QueryConstraint,
  QueryDocumentSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  WithFieldValue,
} from 'firebase/firestore';

import { Recipe, RecipeCreateInput, RecipeUpdateInput } from '@/domain';
import {
  FirestoreObserver,
  getCollection,
  getDocument,
  getDb,
  normalizeFirestoreError,
  serializeDateOrNull,
  timestampToDate,
} from './utils';

const COLLECTION_NAME = 'recipes';

type RecipeDocument = DocumentData & {
  name: string;
  description?: string;
  yieldInGrams: number;
  ingredients: Recipe['ingredients'];
  instructions?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp | null;
};

type RecipeDocSnapshot =
  | DocumentSnapshot<RecipeDocument>
  | QueryDocumentSnapshot<RecipeDocument>;

function mapRecipe(snapshot: RecipeDocSnapshot): Recipe {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Receita ${snapshot.id} não encontrada.`);
  }

  return {
    id: snapshot.id,
    name: data.name,
    description: data.description,
    yieldInGrams: data.yieldInGrams,
    ingredients: data.ingredients ?? [],
    instructions: data.instructions,
    isActive: data.isActive ?? true,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    archivedAt: timestampToDate(data.archivedAt),
  };
}

export async function listRecipes(options?: {
  includeInactive?: boolean;
}): Promise<Recipe[]> {
  const db = getDb();
  const colRef = getCollection<RecipeDocument>(db, COLLECTION_NAME);

  const constraints: QueryConstraint[] = [];

  if (!options?.includeInactive) {
    constraints.push(where('isActive', '==', true));
  }

  constraints.push(orderBy('name', 'asc'));

  const recipesQuery = query(colRef, ...constraints);
  const snapshot = await getDocs(recipesQuery);

  return snapshot.docs.map(mapRecipe);
}

export async function getRecipeById(recipeId: string): Promise<Recipe> {
  const db = getDb();
  const docRef = getDocument<RecipeDocument>(db, `${COLLECTION_NAME}/${recipeId}`);
  const docSnapshot = await getDoc(docRef);

  return mapRecipe(docSnapshot);
}

export async function createRecipe(input: RecipeCreateInput): Promise<Recipe> {
  const db = getDb();
  const colRef = getCollection<RecipeDocument>(db, COLLECTION_NAME);

  const now = serverTimestamp();
  // Compute yield automatically as the sum of top-level ingredient quantities
  // This ensures users don't need to manually enter the yield and avoids
  // mismatches between ingredients and declared yield.
  const ingredients = input.ingredients ?? [];
  const computedYield = ingredients.reduce((sum, ing) => {
    const q = Number(ing.quantityInGrams) || 0;
    return sum + q;
  }, 0);

  const payload: WithFieldValue<RecipeDocument> = {
    name: input.name,
    yieldInGrams:
      Number.isFinite(computedYield) && computedYield > 0
        ? computedYield
        : (input.yieldInGrams ?? 0),
    ingredients,
    isActive: input.isActive ?? true,
    archivedAt: serializeDateOrNull(input.archivedAt) ?? null,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
    createdAt: now,
    updatedAt: now,
  };

  console.log('[recipesService] createRecipe payload', {
    name: payload.name,
    yieldInGrams: payload.yieldInGrams,
    ingredientsCount: Array.isArray(payload.ingredients)
      ? payload.ingredients.length
      : 'server-value',
    isActive: payload.isActive,
    hasDescription: Boolean(payload.description),
    hasInstructions: Boolean(payload.instructions),
  });

  const docRef = await addDoc(colRef, payload);

  const createdDoc = (await getDoc(docRef)) as RecipeDocSnapshot;

  return mapRecipe(createdDoc);
}

export async function updateRecipe(
  recipeId: string,
  input: RecipeUpdateInput,
): Promise<Recipe> {
  const db = getDb();
  const docRef = getDocument<RecipeDocument>(db, `${COLLECTION_NAME}/${recipeId}`);

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Recipe ${recipeId} not found`);
  }
  const currentData = currentSnapshot.data();

  const { archivedAt, ...rest } = input;
  const updateData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      updateData[key] = value;
    }
  }

  // If ingredients are provided in the update, compute and set the yield
  // automatically so it always matches the sum of ingredient quantities.
  if (rest.ingredients !== undefined && Array.isArray(rest.ingredients)) {
    const computedYield = rest.ingredients.reduce((sum, ing) => {
      const q = Number(ing.quantityInGrams) || 0;
      return sum + q;
    }, 0);

    updateData.yieldInGrams =
      Number.isFinite(computedYield) && computedYield > 0 ? computedYield : 0;
  }

  if (archivedAt !== undefined) {
    updateData.archivedAt = serializeDateOrNull(archivedAt);
  }

  updateData.createdAt = currentData.createdAt; // Preserve createdAt for Firestore rules
  updateData.updatedAt = serverTimestamp();

  await updateDoc(docRef, updateData);

  const updatedDoc = await getDoc(docRef);

  return mapRecipe(updatedDoc);
}

export async function archiveRecipe(recipeId: string): Promise<Recipe> {
  const db = getDb();
  const docRef = getDocument<RecipeDocument>(db, `${COLLECTION_NAME}/${recipeId}`);

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Recipe ${recipeId} not found`);
  }
  const currentData = currentSnapshot.data();

  await updateDoc(docRef, {
    isActive: false,
    archivedAt: serverTimestamp(),
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapRecipe(updatedDoc);
}

export async function restoreRecipe(recipeId: string): Promise<Recipe> {
  const db = getDb();
  const docRef = getDocument<RecipeDocument>(db, `${COLLECTION_NAME}/${recipeId}`);

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Recipe ${recipeId} not found`);
  }
  const currentData = currentSnapshot.data();

  await updateDoc(docRef, {
    isActive: true,
    archivedAt: null,
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapRecipe(updatedDoc);
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  const db = getDb();
  const docRef = getDocument(db, `${COLLECTION_NAME}/${recipeId}`);
  await deleteDoc(docRef);
}

export function subscribeToRecipes(
  handlers: FirestoreObserver<Recipe[]>,
  options?: { includeInactive?: boolean },
) {
  const db = getDb();
  const colRef = getCollection<RecipeDocument>(db, COLLECTION_NAME);

  const constraints: QueryConstraint[] = [];

  if (!options?.includeInactive) {
    constraints.push(where('isActive', '==', true));
  }

  constraints.push(orderBy('name', 'asc'));

  const recipesQuery = query(colRef, ...constraints);

  return onSnapshot(
    recipesQuery,
    snapshot => {
      const items = snapshot.docs.map(mapRecipe);
      handlers.next(items);
    },
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}

export function subscribeToRecipe(recipeId: string, handlers: FirestoreObserver<Recipe>) {
  const db = getDb();
  const docRef = getDocument<RecipeDocument>(db, `${COLLECTION_NAME}/${recipeId}`);

  return onSnapshot(
    docRef,
    document => {
      handlers.next(mapRecipe(document));
    },
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}
