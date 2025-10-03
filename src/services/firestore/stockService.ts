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
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  limit,
} from 'firebase/firestore';

import {
  StockItem,
  StockItemCreateInput,
  StockItemUpdateInput,
  StockMovement,
  StockMovementCreateInput,
  StockMovementType,
} from '@/domain';
import { getDb, timestampToDate } from './utils';

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
  note?: string;
  performedBy: string;
  performedAt: Timestamp;
};

function mapStockItem(docSnapshot: DocumentSnapshot<StockItemDocument>): StockItem {
  const data = docSnapshot.data();

  if (!data) {
    throw new Error(`Estoque ${docSnapshot.id} não encontrado.`);
  }

  return {
    id: docSnapshot.id,
    productId: data.productId,
    currentQuantityInGrams: data.currentQuantityInGrams,
    minimumQuantityInGrams: data.minimumQuantityInGrams,
    lastMovementId: data.lastMovementId ?? null,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    archivedAt: timestampToDate(data.archivedAt),
  };
}

function mapStockMovement(
  docSnapshot: DocumentSnapshot<StockMovementDocument>,
): StockMovement {
  const data = docSnapshot.data();

  if (!data) {
    throw new Error(`Movimentação ${docSnapshot.id} não encontrada.`);
  }

  return {
    id: docSnapshot.id,
    productId: data.productId,
    stockItemId: data.stockItemId,
    type: data.type,
    quantityInGrams: data.quantityInGrams,
    previousQuantityInGrams: data.previousQuantityInGrams,
    resultingQuantityInGrams: data.resultingQuantityInGrams,
    note: data.note,
    performedBy: data.performedBy,
    performedAt: timestampToDate(data.performedAt) ?? new Date(),
  };
}

export async function listStockItems(options?: {
  includeArchived?: boolean;
  productId?: string;
}): Promise<StockItem[]> {
  const db = getDb();
  const colRef = collection(db, STOCK_ITEMS_COLLECTION);

  const constraints: QueryConstraint[] = [];

  if (!options?.includeArchived) {
    constraints.push(where('archivedAt', '==', null));
  }

  if (options?.productId) {
    constraints.push(where('productId', '==', options.productId));
  }

  constraints.push(orderBy('productId', 'asc'));

  const snapshot = await getDocs(query(colRef, ...constraints));

  return snapshot.docs.map(docSnapshot =>
    mapStockItem(docSnapshot as DocumentSnapshot<StockItemDocument>),
  );
}

export async function getStockItemById(stockItemId: string): Promise<StockItem> {
  const db = getDb();
  const docRef = doc(db, STOCK_ITEMS_COLLECTION, stockItemId);
  const docSnapshot = await getDoc(docRef);

  return mapStockItem(docSnapshot as DocumentSnapshot<StockItemDocument>);
}

export async function createStockItem(input: StockItemCreateInput): Promise<StockItem> {
  const db = getDb();
  const colRef = collection(db, STOCK_ITEMS_COLLECTION);

  const now = serverTimestamp();

  const docRef = await addDoc(colRef, {
    ...input,
    archivedAt: input.archivedAt ?? null,
    currentQuantityInGrams: input.currentQuantityInGrams ?? 0,
    createdAt: now,
    updatedAt: now,
  });

  const createdDoc = await getDoc(docRef);

  return mapStockItem(createdDoc as DocumentSnapshot<StockItemDocument>);
}

export async function updateStockItem(
  stockItemId: string,
  input: StockItemUpdateInput,
): Promise<StockItem> {
  const db = getDb();
  const docRef = doc(db, STOCK_ITEMS_COLLECTION, stockItemId);

  await updateDoc(docRef, {
    ...input,
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapStockItem(updatedDoc as DocumentSnapshot<StockItemDocument>);
}

export async function archiveStockItem(stockItemId: string): Promise<StockItem> {
  const db = getDb();
  const docRef = doc(db, STOCK_ITEMS_COLLECTION, stockItemId);

  await updateDoc(docRef, {
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapStockItem(updatedDoc as DocumentSnapshot<StockItemDocument>);
}

export async function restoreStockItem(stockItemId: string): Promise<StockItem> {
  const db = getDb();
  const docRef = doc(db, STOCK_ITEMS_COLLECTION, stockItemId);

  await updateDoc(docRef, {
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  return mapStockItem(updatedDoc as DocumentSnapshot<StockItemDocument>);
}

export async function deleteStockItem(stockItemId: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, STOCK_ITEMS_COLLECTION, stockItemId);
  await deleteDoc(docRef);
}

export async function listStockMovements(options?: {
  stockItemId?: string;
  productId?: string;
  limit?: number;
}): Promise<StockMovement[]> {
  const db = getDb();
  const colRef = collection(db, STOCK_MOVEMENTS_COLLECTION);

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

  const snapshot = await getDocs(query(colRef, ...queryConstraints));

  return snapshot.docs.map(docSnapshot =>
    mapStockMovement(docSnapshot as DocumentSnapshot<StockMovementDocument>),
  );
}

export async function recordStockMovement(
  input: StockMovementCreateInput,
): Promise<StockMovement> {
  const db = getDb();
  const colRef = collection(db, STOCK_MOVEMENTS_COLLECTION);

  const docRef = await addDoc(colRef, {
    ...input,
    performedAt: input.performedAt ? input.performedAt : serverTimestamp(),
  });

  const createdDoc = await getDoc(docRef);

  return mapStockMovement(createdDoc as DocumentSnapshot<StockMovementDocument>);
}

export async function adjustStockLevel(options: {
  stockItemId: string;
  quantityInGrams: number;
  type: StockMovementType;
  performedBy: string;
  note?: string;
}): Promise<StockMovement> {
  const db = getDb();
  const itemRef = doc(db, STOCK_ITEMS_COLLECTION, options.stockItemId);
  const movementRef = doc(collection(db, STOCK_MOVEMENTS_COLLECTION));

  await runTransaction(db, async transaction => {
    const itemSnapshot = await transaction.get(itemRef);

    const itemData = itemSnapshot.data() as StockItemDocument | undefined;

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

  return mapStockMovement(createdMovement as DocumentSnapshot<StockMovementDocument>);
}
