import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  DocumentSnapshot,
  getDoc,
  getDocs,
  orderBy,
  query,
  QueryConstraint,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { Recipe, RecipeCreateInput, RecipeUpdateInput } from '@/domain';
import { getDb, timestampToDate } from './utils';

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

function mapRecipe(docSnapshot: DocumentSnapshot<RecipeDocument>): Recipe {
  const data = docSnapshot.data();

  if (!data) {
    throw new Error(`Receita ${docSnapshot.id} não encontrada.`);
  }

  return {
    id: docSnapshot.id,
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
  const colRef = collection(db, COLLECTION_NAME);

  const constraints: QueryConstraint[] = [];

  if (!options?.includeInactive) {
    constraints.push(where('isActive', '==', true));
  }

  constraints.push(orderBy('name', 'asc'));

  const snapshot = await getDocs(query(colRef, ...constraints));

  return snapshot.docs.map(docSnapshot =>
    mapRecipe(docSnapshot as DocumentSnapshot<RecipeDocument>),
  );
}

export async function getRecipeById(recipeId: string): Promise<Recipe> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, recipeId);
  const docSnapshot = await getDoc(docRef);

  return mapRecipe(docSnapshot as DocumentSnapshot<RecipeDocument>);
}

export async function createRecipe(input: RecipeCreateInput): Promise<Recipe> {
  const db = getDb();
  const colRef = collection(db, COLLECTION_NAME);

  const now = serverTimestamp();

  const docRef = await addDoc(colRef, {
    ...input,
    ingredients: input.ingredients ?? [],
    isActive: input.isActive ?? true,
    archivedAt: input.archivedAt ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const createdDoc = await getDoc(docRef);

  return mapRecipe(createdDoc as DocumentSnapshot<RecipeDocument>);
}

export async function updateRecipe(
  recipeId: string,
  input: RecipeUpdateInput,
): Promise<Recipe> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, recipeId);

  await updateDoc(docRef, {
    ...input,
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapRecipe(updatedDoc as DocumentSnapshot<RecipeDocument>);
}

export async function archiveRecipe(recipeId: string): Promise<Recipe> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, recipeId);

  await updateDoc(docRef, {
    isActive: false,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapRecipe(updatedDoc as DocumentSnapshot<RecipeDocument>);
}

export async function restoreRecipe(recipeId: string): Promise<Recipe> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, recipeId);

  await updateDoc(docRef, {
    isActive: true,
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapRecipe(updatedDoc as DocumentSnapshot<RecipeDocument>);
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, recipeId);
  await deleteDoc(docRef);
}
