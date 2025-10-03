import {
  addDoc,
  deleteDoc,
  DocumentData,
  DocumentSnapshot,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  QueryConstraint,
  QueryDocumentSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  doc,
} from 'firebase/firestore';

import {
  StockItem,
  StockItemCreateInput,
  StockItemUpdateInput,
  StockMovement,
  StockMovementCreateInput,
  StockMovementType,
} from '@/domain';
import {
  FirestoreObserver,
  getCollection,
  getDocument,
  getDb,
  normalizeFirestoreError,
  serializeDateOrNull,
  timestampToDate,
} from './utils';

const STOCK_ITEMS_COLLECTION = 'stockItems';
const STOCK_MOVEMENTS_COLLECTION = 'stockMovements';

type StockItemDocument = DocumentData & {
  productId: string;
  currentQuantityInGrams: number;
  minimumQuantityInGrams: number;
  lastMovementId?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp | null;
};

type StockMovementDocument = DocumentData & {
  productId: string;
  stockItemId: string;
  type: StockMovementType;
  quantityInGrams: number;
  previousQuantityInGrams: number;
  resultingQuantityInGrams: number;
  note?: string | null;
  performedBy: string;
  performedAt: Timestamp;
};

type StockItemSnapshot =
  | DocumentSnapshot<StockItemDocument>
  | QueryDocumentSnapshot<StockItemDocument>;

type StockMovementSnapshot =
  | DocumentSnapshot<StockMovementDocument>
  | QueryDocumentSnapshot<StockMovementDocument>;

function mapStockItem(snapshot: StockItemSnapshot): StockItem {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Item de estoque ${snapshot.id} não encontrado.`);
  }

  return {
    id: snapshot.id,
    productId: data.productId,
    currentQuantityInGrams: data.currentQuantityInGrams,
    minimumQuantityInGrams: data.minimumQuantityInGrams,
    lastMovementId: data.lastMovementId ?? null,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    archivedAt: timestampToDate(data.archivedAt),
  };
}

function mapStockMovement(snapshot: StockMovementSnapshot): StockMovement {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Movimentação ${snapshot.id} não encontrada.`);
  }

  return {
    id: snapshot.id,
    productId: data.productId,
    stockItemId: data.stockItemId,
    type: data.type,
    quantityInGrams: data.quantityInGrams,
    previousQuantityInGrams: data.previousQuantityInGrams,
    resultingQuantityInGrams: data.resultingQuantityInGrams,
    note: data.note ?? undefined,
    performedBy: data.performedBy,
    performedAt: timestampToDate(data.performedAt) ?? new Date(),
  };
}

export async function listStockItems(options?: {
  includeArchived?: boolean;
  productId?: string;
}): Promise<StockItem[]> {
  const db = getDb();
  const colRef = getCollection<StockItemDocument>(db, STOCK_ITEMS_COLLECTION);

  const constraints: QueryConstraint[] = [];

  if (!options?.includeArchived) {
    constraints.push(where('archivedAt', '==', null));
  }

  if (options?.productId) {
    constraints.push(where('productId', '==', options.productId));
  }

  constraints.push(orderBy('productId', 'asc'));

  const stockQuery = query(colRef, ...constraints);
  const snapshot = await getDocs(stockQuery);

  return snapshot.docs.map(mapStockItem);
}

export async function getStockItemById(stockItemId: string): Promise<StockItem> {
  const db = getDb();
  const docRef = getDocument<StockItemDocument>(
    db,
    `${STOCK_ITEMS_COLLECTION}/${stockItemId}`,
  );
  const docSnapshot = await getDoc(docRef);

  return mapStockItem(docSnapshot);
}

export async function createStockItem(input: StockItemCreateInput): Promise<StockItem> {
  const db = getDb();
  const colRef = getCollection<StockItemDocument>(db, STOCK_ITEMS_COLLECTION);

  const now = serverTimestamp();

  const docRef = await addDoc(colRef, {
    ...input,
    archivedAt: serializeDateOrNull(input.archivedAt),
    currentQuantityInGrams: input.currentQuantityInGrams ?? 0,
    createdAt: now,
    updatedAt: now,
  });

  const createdDoc = await getDoc(docRef);

  return mapStockItem(createdDoc);
}

export async function updateStockItem(
  stockItemId: string,
  input: StockItemUpdateInput,
): Promise<StockItem> {
  const db = getDb();
  const docRef = getDocument<StockItemDocument>(
    db,
    `${STOCK_ITEMS_COLLECTION}/${stockItemId}`,
  );

  const { archivedAt, ...rest } = input;

  await updateDoc(docRef, {
    ...rest,
    ...(archivedAt !== undefined
      ? { archivedAt: serializeDateOrNull(archivedAt) }
      : null),
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapStockItem(updatedDoc);
}

export async function archiveStockItem(stockItemId: string): Promise<StockItem> {
  const db = getDb();
  const docRef = getDocument<StockItemDocument>(
    db,
    `${STOCK_ITEMS_COLLECTION}/${stockItemId}`,
  );

  await updateDoc(docRef, {
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapStockItem(updatedDoc);
}

export async function restoreStockItem(stockItemId: string): Promise<StockItem> {
  const db = getDb();
  const docRef = getDocument<StockItemDocument>(
    db,
    `${STOCK_ITEMS_COLLECTION}/${stockItemId}`,
  );

  await updateDoc(docRef, {
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapStockItem(updatedDoc);
}

export async function deleteStockItem(stockItemId: string): Promise<void> {
  const db = getDb();
  const docRef = getDocument(db, `${STOCK_ITEMS_COLLECTION}/${stockItemId}`);
  await deleteDoc(docRef);
}

export async function listStockMovements(options?: {
  stockItemId?: string;
  productId?: string;
  limit?: number;
}): Promise<StockMovement[]> {
  const db = getDb();
  const colRef = getCollection<StockMovementDocument>(db, STOCK_MOVEMENTS_COLLECTION);

  const constraints: QueryConstraint[] = [];

  if (options?.stockItemId) {
    constraints.push(where('stockItemId', '==', options.stockItemId));
  }

  if (options?.productId) {
    constraints.push(where('productId', '==', options.productId));
  }

  constraints.push(orderBy('performedAt', 'desc'));

  const movementConstraints = [...constraints];

  if (options?.limit) {
    movementConstraints.push(limit(options.limit));
  }

  const movementsQuery = query(colRef, ...movementConstraints);
  const snapshot = await getDocs(movementsQuery);

  return snapshot.docs.map(mapStockMovement);
}

export async function recordStockMovement(
  input: StockMovementCreateInput,
): Promise<StockMovement> {
  const db = getDb();
  const colRef = getCollection<StockMovementDocument>(db, STOCK_MOVEMENTS_COLLECTION);

  const docRef = await addDoc(colRef, {
    ...input,
    performedAt: input.performedAt
      ? Timestamp.fromDate(input.performedAt)
      : serverTimestamp(),
  });

  const createdDoc = await getDoc(docRef);

  return mapStockMovement(createdDoc);
}

export async function adjustStockLevel(options: {
  stockItemId: string;
  quantityInGrams: number;
  type: StockMovementType;
  performedBy: string;
  note?: string;
}): Promise<StockMovement> {
  const db = getDb();
  const itemRef = getDocument<StockItemDocument>(
    db,
    `${STOCK_ITEMS_COLLECTION}/${options.stockItemId}`,
  );
  const movementsCollection = getCollection<StockMovementDocument>(
    db,
    STOCK_MOVEMENTS_COLLECTION,
  );
  const movementRef = doc(movementsCollection);

  await runTransaction(db, async transaction => {
    const itemSnapshot = await transaction.get(itemRef);
    const itemData = itemSnapshot.data();

    if (!itemData) {
      throw new Error('Item de estoque não encontrado para ajuste.');
    }

    const previous = itemData.currentQuantityInGrams ?? 0;

    let resulting = previous;

    if (options.type === 'increment' || options.type === 'initial') {
      resulting = previous + options.quantityInGrams;
    } else if (options.type === 'decrement') {
      resulting = previous - options.quantityInGrams;
    } else if (options.type === 'adjustment') {
      resulting = options.quantityInGrams;
    }

    if (resulting < 0) {
      resulting = 0;
    }

    transaction.update(itemRef, {
      currentQuantityInGrams: resulting,
      lastMovementId: movementRef.id,
      updatedAt: serverTimestamp(),
    });

    transaction.set(movementRef, {
      productId: itemData.productId,
      stockItemId: options.stockItemId,
      type: options.type,
      quantityInGrams: options.quantityInGrams,
      previousQuantityInGrams: previous,
      resultingQuantityInGrams: resulting,
      note: options.note ?? null,
      performedBy: options.performedBy,
      performedAt: serverTimestamp(),
    });
  });

  const createdMovement = await getDoc(movementRef);

  return mapStockMovement(createdMovement);
}

export function subscribeToStockItems(
  handlers: FirestoreObserver<StockItem[]>,
  options?: { includeArchived?: boolean; productId?: string },
) {
  const db = getDb();
  const colRef = getCollection<StockItemDocument>(db, STOCK_ITEMS_COLLECTION);

  const constraints: QueryConstraint[] = [];

  if (!options?.includeArchived) {
    constraints.push(where('archivedAt', '==', null));
  }

  if (options?.productId) {
    constraints.push(where('productId', '==', options.productId));
  }

  constraints.push(orderBy('productId', 'asc'));

  const stockQuery = query(colRef, ...constraints);

  return onSnapshot(
    stockQuery,
    snapshot => {
      handlers.next(snapshot.docs.map(mapStockItem));
    },
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}

export function subscribeToStockItem(
  stockItemId: string,
  handlers: FirestoreObserver<StockItem>,
) {
  const db = getDb();
  const docRef = getDocument<StockItemDocument>(
    db,
    `${STOCK_ITEMS_COLLECTION}/${stockItemId}`,
  );

  return onSnapshot(
    docRef,
    document => {
      handlers.next(mapStockItem(document));
    },
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}

export function subscribeToStockMovements(
  handlers: FirestoreObserver<StockMovement[]>,
  options?: { stockItemId?: string; productId?: string; limit?: number },
) {
  const db = getDb();
  const colRef = getCollection<StockMovementDocument>(db, STOCK_MOVEMENTS_COLLECTION);

  const constraints: QueryConstraint[] = [];

  if (options?.stockItemId) {
    constraints.push(where('stockItemId', '==', options.stockItemId));
  }

  if (options?.productId) {
    constraints.push(where('productId', '==', options.productId));
  }

  constraints.push(orderBy('performedAt', 'desc'));

  const queryConstraints = [...constraints];

  if (options?.limit) {
    queryConstraints.push(limit(options.limit));
  }

  const movementsQuery = query(colRef, ...queryConstraints);

  return onSnapshot(
    movementsQuery,
    snapshot => {
      handlers.next(snapshot.docs.map(mapStockMovement));
    },
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}
