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

  const docRef = await addDoc(colRef, {
    ...input,
    ingredients: input.ingredients ?? [],
    isActive: input.isActive ?? true,
    archivedAt: serializeDateOrNull(input.archivedAt),
    createdAt: now,
    updatedAt: now,
  });

  const createdDoc = await getDoc(docRef);

  return mapRecipe(createdDoc);
}

export async function updateRecipe(
  recipeId: string,
  input: RecipeUpdateInput,
): Promise<Recipe> {
  const db = getDb();
  const docRef = getDocument<RecipeDocument>(db, `${COLLECTION_NAME}/${recipeId}`);

  const { archivedAt, ...rest } = input;

  await updateDoc(docRef, {
    ...rest,
    ...(archivedAt !== undefined
      ? { archivedAt: serializeDateOrNull(archivedAt) }
      : null),
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapRecipe(updatedDoc);
}

export async function archiveRecipe(recipeId: string): Promise<Recipe> {
  const db = getDb();
  const docRef = getDocument<RecipeDocument>(db, `${COLLECTION_NAME}/${recipeId}`);

  await updateDoc(docRef, {
    isActive: false,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapRecipe(updatedDoc);
}

export async function restoreRecipe(recipeId: string): Promise<Recipe> {
  const db = getDb();
  const docRef = getDocument<RecipeDocument>(db, `${COLLECTION_NAME}/${recipeId}`);

  await updateDoc(docRef, {
    isActive: true,
    archivedAt: null,
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
