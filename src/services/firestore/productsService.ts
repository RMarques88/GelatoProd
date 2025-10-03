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

import { Product, ProductCreateInput, ProductUpdateInput } from '@/domain';
import {
  FirestoreObserver,
  getCollection,
  getDocument,
  getDb,
  normalizeFirestoreError,
  serializeDateOrNull,
  timestampToDate,
} from './utils';

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

type ProductDocSnapshot =
  | DocumentSnapshot<ProductDocument>
  | QueryDocumentSnapshot<ProductDocument>;

function mapProduct(snapshot: ProductDocSnapshot): Product {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Produto ${snapshot.id} não encontrado.`);
  }

  return {
    id: snapshot.id,
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
  const colRef = getCollection<ProductDocument>(db, COLLECTION_NAME);

  const constraints: QueryConstraint[] = [];

  if (!options?.includeInactive) {
    constraints.push(where('isActive', '==', true));
  }

  constraints.push(orderBy('name', 'asc'));

  const productsQuery = query(colRef, ...constraints);
  const snapshot = await getDocs(productsQuery);

  return snapshot.docs.map(mapProduct);
}

export async function getProductById(productId: string): Promise<Product> {
  const db = getDb();
  const docRef = getDocument<ProductDocument>(db, `${COLLECTION_NAME}/${productId}`);
  const docSnapshot = await getDoc(docRef);

  return mapProduct(docSnapshot);
}

export async function createProduct(input: ProductCreateInput): Promise<Product> {
  const db = getDb();
  const colRef = getCollection<ProductDocument>(db, COLLECTION_NAME);

  const now = serverTimestamp();

  const docRef = await addDoc(colRef, {
    ...input,
    tags: input.tags ?? [],
    isActive: input.isActive ?? true,
    archivedAt: serializeDateOrNull(input.archivedAt),
    createdAt: now,
    updatedAt: now,
  });

  const createdDoc = await getDoc(docRef);

  return mapProduct(createdDoc);
}

export async function updateProduct(
  productId: string,
  input: ProductUpdateInput,
): Promise<Product> {
  const db = getDb();
  const docRef = getDocument<ProductDocument>(db, `${COLLECTION_NAME}/${productId}`);

  const { archivedAt, ...rest } = input;

  await updateDoc(docRef, {
    ...rest,
    ...(archivedAt !== undefined
      ? { archivedAt: serializeDateOrNull(archivedAt) }
      : null),
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapProduct(updatedDoc);
}

export async function archiveProduct(productId: string): Promise<Product> {
  const db = getDb();
  const docRef = getDocument<ProductDocument>(db, `${COLLECTION_NAME}/${productId}`);

  await updateDoc(docRef, {
    isActive: false,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapProduct(updatedDoc);
}

export async function restoreProduct(productId: string): Promise<Product> {
  const db = getDb();
  const docRef = getDocument<ProductDocument>(db, `${COLLECTION_NAME}/${productId}`);

  await updateDoc(docRef, {
    isActive: true,
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapProduct(updatedDoc);
}

export async function deleteProduct(productId: string): Promise<void> {
  const db = getDb();
  const docRef = getDocument(db, `${COLLECTION_NAME}/${productId}`);
  await deleteDoc(docRef);
}

export function subscribeToProducts(
  handlers: FirestoreObserver<Product[]>,
  options?: { includeInactive?: boolean },
) {
  const db = getDb();
  const colRef = getCollection<ProductDocument>(db, COLLECTION_NAME);

  const constraints: QueryConstraint[] = [];

  if (!options?.includeInactive) {
    constraints.push(where('isActive', '==', true));
  }

  constraints.push(orderBy('name', 'asc'));

  const productsQuery = query(colRef, ...constraints);

  return onSnapshot(
    productsQuery,
    snapshot => {
      const items = snapshot.docs.map(mapProduct);
      handlers.next(items);
    },
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}

export function subscribeToProduct(
  productId: string,
  handlers: FirestoreObserver<Product>,
) {
  const db = getDb();
  const docRef = getDocument<ProductDocument>(db, `${COLLECTION_NAME}/${productId}`);

  return onSnapshot(
    docRef,
    document => {
      handlers.next(mapProduct(document));
    },
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}
