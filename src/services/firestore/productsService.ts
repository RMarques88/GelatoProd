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

import { Product, ProductCreateInput, ProductUpdateInput } from '@/domain';
import { deleteStockItem, listStockItems, recordStockMovement } from './stockService';
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
  tags: string[];
  barcode?: string | null;
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
    tags: data.tags ?? [],
    barcode: data.barcode ?? null,
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

  const basePayload = {
    name: input.name,
    description: input.description ?? undefined,
    category: input.category ?? undefined,
    tags: input.tags ?? [],
    barcode: input.barcode ?? null,
    isActive: input.isActive ?? true,
    archivedAt: serializeDateOrNull(input.archivedAt),
    createdAt: now,
    updatedAt: now,
  };

  const payload = Object.fromEntries(
    Object.entries(basePayload).filter(([, value]) => value !== undefined),
  ) as WithFieldValue<ProductDocument>;

  const docRef = await addDoc(colRef, payload);

  const createdDoc = await getDoc(docRef);

  return mapProduct(createdDoc);
}

export async function updateProduct(
  productId: string,
  input: ProductUpdateInput,
): Promise<Product> {
  const db = getDb();
  const docRef = getDocument<ProductDocument>(db, `${COLLECTION_NAME}/${productId}`);

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Product ${productId} not found`);
  }
  const currentData = currentSnapshot.data();

  const { archivedAt, ...rest } = input;

  await updateDoc(docRef, {
    ...rest,
    barcode: rest.barcode ?? null,
    ...(archivedAt !== undefined
      ? { archivedAt: serializeDateOrNull(archivedAt) }
      : null),
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapProduct(updatedDoc);
}

export async function archiveProduct(productId: string): Promise<Product> {
  const db = getDb();
  const docRef = getDocument<ProductDocument>(db, `${COLLECTION_NAME}/${productId}`);

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Product ${productId} not found`);
  }
  const currentData = currentSnapshot.data();

  await updateDoc(docRef, {
    isActive: false,
    archivedAt: serverTimestamp(),
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapProduct(updatedDoc);
}

export async function restoreProduct(productId: string): Promise<Product> {
  const db = getDb();
  const docRef = getDocument<ProductDocument>(db, `${COLLECTION_NAME}/${productId}`);

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Product ${productId} not found`);
  }
  const currentData = currentSnapshot.data();

  await updateDoc(docRef, {
    isActive: true,
    archivedAt: null,
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapProduct(updatedDoc);
}

type DeleteProductOptions = {
  performedBy?: string;
  reason?: string;
};

export async function deleteProduct(
  productId: string,
  options?: DeleteProductOptions,
): Promise<void> {
  const db = getDb();
  const stockItems = await listStockItems({ productId, includeArchived: true });

  const reason =
    options?.reason ??
    'Estoque zerado automaticamente após exclusão definitiva do produto.';

  for (const item of stockItems) {
    if (options?.performedBy && item.currentQuantityInGrams > 0) {
      try {
        await recordStockMovement({
          productId,
          stockItemId: item.id,
          type: 'adjustment',
          quantityInGrams: item.currentQuantityInGrams,
          previousQuantityInGrams: item.currentQuantityInGrams,
          resultingQuantityInGrams: 0,
          note: reason,
          performedBy: options.performedBy,
          performedAt: new Date(),
        });
      } catch (movementError) {
        console.warn(
          '[productsService] Falha ao registrar ajuste de estoque antes da exclusão do produto',
          movementError,
        );
      }
    }

    await deleteStockItem(item.id);
  }

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
