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
  QueryConstraint,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { Product, ProductCreateInput, ProductUpdateInput } from '@/domain';
import { getDb, timestampToDate } from './utils';

const COLLECTION_NAME = 'products';

type ProductDocument = DocumentData & {
  name: string;
  description?: string;
  category?: string;
  unitWeightInGrams: number;
  pricePerGram: number;
  tags: string[];
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp | null;
};

function mapProduct(docSnapshot: DocumentSnapshot<ProductDocument>): Product {
  const data = docSnapshot.data();

  if (!data) {
    throw new Error(`Produto ${docSnapshot.id} não encontrado.`);
  }

  return {
    id: docSnapshot.id,
    name: data.name,
    description: data.description,
    category: data.category,
    unitWeightInGrams: data.unitWeightInGrams,
    pricePerGram: data.pricePerGram,
    tags: data.tags ?? [],
    isActive: data.isActive ?? true,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    archivedAt: timestampToDate(data.archivedAt),
  };
}

export async function listProducts(options?: {
  includeInactive?: boolean;
}): Promise<Product[]> {
  const db = getDb();
  const colRef = collection(db, COLLECTION_NAME);

  const constraints: QueryConstraint[] = [];

  if (!options?.includeInactive) {
    constraints.push(where('isActive', '==', true));
  }

  constraints.push(orderBy('name', 'asc'));

  const snapshot = await getDocs(query(colRef, ...constraints));

  return snapshot.docs.map(docSnapshot =>
    mapProduct(docSnapshot as DocumentSnapshot<ProductDocument>),
  );
}

export async function getProductById(productId: string): Promise<Product> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, productId);
  const docSnapshot = await getDoc(docRef);

  return mapProduct(docSnapshot as DocumentSnapshot<ProductDocument>);
}

export async function createProduct(input: ProductCreateInput): Promise<Product> {
  const db = getDb();
  const colRef = collection(db, COLLECTION_NAME);

  const now = serverTimestamp();

  const docRef = await addDoc(colRef, {
    ...input,
    tags: input.tags ?? [],
    isActive: input.isActive ?? true,
    archivedAt: input.archivedAt ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const createdDoc = await getDoc(docRef);

  return mapProduct(createdDoc as DocumentSnapshot<ProductDocument>);
}

export async function updateProduct(
  productId: string,
  input: ProductUpdateInput,
): Promise<Product> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, productId);

  await updateDoc(docRef, {
    ...input,
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapProduct(updatedDoc as DocumentSnapshot<ProductDocument>);
}

export async function archiveProduct(productId: string): Promise<Product> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, productId);

  await updateDoc(docRef, {
    isActive: false,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapProduct(updatedDoc as DocumentSnapshot<ProductDocument>);
}

export async function restoreProduct(productId: string): Promise<Product> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, productId);

  await updateDoc(docRef, {
    isActive: true,
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapProduct(updatedDoc as DocumentSnapshot<ProductDocument>);
}

export async function deleteProduct(productId: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, productId);
  await deleteDoc(docRef);
}
