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
  AppNotificationCreateInput,
  StockAlertSeverity,
  StockItem,
  StockItemCreateInput,
  StockItemUpdateInput,
  StockMovement,
  StockMovementCreateInput,
  StockMovementType,
} from '@/domain';
import { logError } from '@/utils/logger';
import { createNotification } from './notificationsService';
import {
  getStockAlertDocumentForItem,
  type StockAlertDocument,
} from './stockAlertsService';
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
  highestUnitCostInBRL?: number;
  averageUnitCostInBRL?: number;
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
  totalCostInBRL?: number | null;
  unitCostInBRL?: number | null;
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
    highestUnitCostInBRL: data.highestUnitCostInBRL ?? 0,
    averageUnitCostInBRL: data.averageUnitCostInBRL ?? data.highestUnitCostInBRL ?? 0,
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
    totalCostInBRL: data.totalCostInBRL ?? undefined,
    unitCostInBRL: data.unitCostInBRL ?? undefined,
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
  console.log('📦 [StockService] Criando item de estoque:', {
    productId: input.productId,
    quantity: input.currentQuantityInGrams,
    averageUnitCost: input.averageUnitCostInBRL,
    highestUnitCost: input.highestUnitCostInBRL,
  });
  
  const db = getDb();
  const colRef = getCollection<StockItemDocument>(db, STOCK_ITEMS_COLLECTION);

  const now = serverTimestamp();

  const docRef = await addDoc(colRef, {
    ...input,
    archivedAt: serializeDateOrNull(input.archivedAt),
    currentQuantityInGrams: input.currentQuantityInGrams ?? 0,
    highestUnitCostInBRL: input.highestUnitCostInBRL ?? 0,
    averageUnitCostInBRL: input.averageUnitCostInBRL ?? 0,
    createdAt: now,
    updatedAt: now,
  });
  
  console.log('✅ [StockService] Item criado com ID:', docRef.id);

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

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Stock item ${stockItemId} not found`);
  }
  const currentData = currentSnapshot.data();

  const { archivedAt, ...rest } = input;

  await updateDoc(docRef, {
    ...rest,
    ...(archivedAt !== undefined
      ? { archivedAt: serializeDateOrNull(archivedAt) }
      : null),
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
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

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Stock item ${stockItemId} not found`);
  }
  const currentData = currentSnapshot.data();

  await updateDoc(docRef, {
    archivedAt: serverTimestamp(),
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
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

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Stock item ${stockItemId} not found`);
  }
  const currentData = currentSnapshot.data();

  await updateDoc(docRef, {
    archivedAt: null,
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
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
  types?: StockMovementType[];
  performedBy?: string;
  from?: Date;
  to?: Date;
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

  if (options?.performedBy) {
    constraints.push(where('performedBy', '==', options.performedBy));
  }

  if (options?.types?.length) {
    if (options.types.length === 1) {
      constraints.push(where('type', '==', options.types[0]));
    } else {
      constraints.push(where('type', 'in', options.types.slice(0, 10)));
    }
  }

  if (options?.from) {
    constraints.push(where('performedAt', '>=', Timestamp.fromDate(options.from)));
  }

  if (options?.to) {
    constraints.push(where('performedAt', '<=', Timestamp.fromDate(options.to)));
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

  const { performedAt, totalCostInBRL, unitCostInBRL, ...rest } = input;

  const docRef = await addDoc(colRef, {
    ...rest,
    totalCostInBRL: totalCostInBRL ?? null,
    unitCostInBRL: unitCostInBRL ?? null,
    performedAt: performedAt ? Timestamp.fromDate(performedAt) : serverTimestamp(),
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
  totalCostInBRL?: number;
}): Promise<StockMovement> {
  console.log('🔄 [StockService] adjustStockLevel chamado:', {
    stockItemId: options.stockItemId,
    quantityInGrams: options.quantityInGrams,
    type: options.type,
    totalCostInBRL: options.totalCostInBRL,
    note: options.note,
  });
  
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
  const alertRef = getStockAlertDocumentForItem(db, options.stockItemId);

  let notificationPayload: AppNotificationCreateInput | null = null;
  const shouldTrackCost = options.type === 'increment' || options.type === 'initial';

  if (shouldTrackCost) {
    if (!options.totalCostInBRL || options.totalCostInBRL <= 0) {
      throw new Error('Informe o valor total da compra para registrar a entrada.');
    }

    if (options.quantityInGrams <= 0) {
      throw new Error('A quantidade precisa ser maior que zero para calcular o custo.');
    }
  }

  await runTransaction(db, async transaction => {
    // IMPORTANTE: Todas as leituras devem vir ANTES de qualquer escrita
    const itemSnapshot = await transaction.get(itemRef);
    const alertSnapshot = await transaction.get(alertRef);

    const itemData = itemSnapshot.data();

    if (!itemData) {
      throw new Error('Item de estoque não encontrado para ajuste.');
    }

    const productRef = doc(db, 'products', itemData.productId);
    const productSnapshot = await transaction.get(productRef);
    const productData = productSnapshot.data() as { name?: string } | undefined;
    const productDisplayName = productData?.name?.trim()
      ? productData.name.trim()
      : itemData.productId;

    const previous = itemData.currentQuantityInGrams ?? 0;
    const minimum = itemData.minimumQuantityInGrams ?? 0;

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

    const previousAverage =
      itemData.averageUnitCostInBRL ?? itemData.highestUnitCostInBRL ?? null;
    let nextAverage = previousAverage ?? null;

    const itemUpdatePayload: Record<string, unknown> = {
      currentQuantityInGrams: resulting,
      lastMovementId: movementRef.id,
      createdAt: itemData.createdAt, // Preserve createdAt for Firestore rules
      updatedAt: serverTimestamp(),
    };

    let movementTotalCost: number | null = null;
    let movementUnitCost: number | null = null;

    if (options.type === 'increment' || options.type === 'initial') {
      if (shouldTrackCost) {
        movementTotalCost = options.totalCostInBRL ?? null;
        movementUnitCost = movementTotalCost
          ? Number(movementTotalCost / options.quantityInGrams)
          : null;
      }

      if (movementUnitCost && Number.isFinite(movementUnitCost)) {
        const previousHighest = itemData.highestUnitCostInBRL ?? 0;
        itemUpdatePayload.highestUnitCostInBRL = Math.max(
          previousHighest,
          movementUnitCost,
        );

        const previousTotalCost = previousAverage ? previousAverage * previous : 0;
        const incrementCost = movementUnitCost * options.quantityInGrams;
        nextAverage =
          resulting > 0
            ? (previousTotalCost + incrementCost) / resulting
            : movementUnitCost;
      }
    } else if (options.type === 'decrement') {
      const effectiveUnitCost = previousAverage ?? itemData.highestUnitCostInBRL ?? null;
      
      if (effectiveUnitCost && Number.isFinite(effectiveUnitCost)) {
        movementUnitCost = effectiveUnitCost;
        movementTotalCost = effectiveUnitCost * options.quantityInGrams;
      } else {
        console.warn('⚠️  SEM CUSTO para decrement (avg:', previousAverage, 'highest:', itemData.highestUnitCostInBRL, ')');
      }

      if (resulting === 0) {
        nextAverage = 0;
      }
    } else if (options.type === 'adjustment') {
      if (options.totalCostInBRL && options.quantityInGrams > 0) {
        movementTotalCost = options.totalCostInBRL;
        movementUnitCost = Number(movementTotalCost / options.quantityInGrams);
        const previousHighest = itemData.highestUnitCostInBRL ?? 0;
        if (movementUnitCost && Number.isFinite(movementUnitCost)) {
          itemUpdatePayload.highestUnitCostInBRL = Math.max(
            previousHighest,
            movementUnitCost,
          );
          nextAverage = movementUnitCost;
        }
      }
    }

    if (nextAverage != null && Number.isFinite(nextAverage)) {
      itemUpdatePayload.averageUnitCostInBRL = nextAverage;
    }

    // Agora podemos fazer as escritas (updates e sets)
    console.log(`💾 Atualizando estoque: ${previous}g → ${resulting}g (${options.type} ${options.quantityInGrams}g)`);
    
    transaction.update(itemRef, itemUpdatePayload);

    console.log(`📝 Criando movimentação: tipo=${options.type}, qty=${options.quantityInGrams}g, custo=R$${movementTotalCost?.toFixed(2) || '0'}`);
    
    transaction.set(movementRef, {
      productId: itemData.productId,
      stockItemId: options.stockItemId,
      type: options.type,
      quantityInGrams: options.quantityInGrams,
      previousQuantityInGrams: previous,
      resultingQuantityInGrams: resulting,
      totalCostInBRL: movementTotalCost,
      unitCostInBRL: movementUnitCost,
      note: options.note ?? null,
      performedBy: options.performedBy,
      performedAt: serverTimestamp(),
    });

    // Usar o alertSnapshot que já foi lido no início
    const alertData = alertSnapshot.data() as StockAlertDocument | undefined;
    const isBelowMinimum = resulting <= minimum;
    const severity: StockAlertSeverity = resulting <= 0 ? 'critical' : 'warning';
    const now = serverTimestamp();

    notificationPayload = null;

    if (isBelowMinimum) {
      const isResolvedOrMissing = !alertData || alertData.status === 'resolved';
      const isReopened = alertData && alertData.status !== 'open';
      const severityEscalated =
        alertData && alertData.severity !== severity && severity === 'critical';

      if (isResolvedOrMissing) {
        transaction.set(
          alertRef,
          {
            stockItemId: options.stockItemId,
            productId: itemData.productId,
            status: 'open',
            severity,
            currentQuantityInGrams: resulting,
            minimumQuantityInGrams: minimum,
            triggeredAt: now,
            acknowledgedAt: null,
            resolvedAt: null,
            lastNotificationAt: now,
            createdAt: alertData?.createdAt ?? now,
            updatedAt: now,
          },
          { merge: true },
        );

        notificationPayload = {
          title: severity === 'critical' ? 'Estoque crítico' : 'Alerta de estoque',
          message: `O item ${productDisplayName} está com ${resulting}g (mínimo ${minimum}g).`,
          category: 'stock',
          type: severity === 'critical' ? 'stock-critical' : 'stock-warning',
          referenceId: options.stockItemId,
        };
      } else {
        const updateData: Record<string, unknown> = {
          currentQuantityInGrams: resulting,
          minimumQuantityInGrams: minimum,
          severity,
          updatedAt: now,
        };

        let shouldNotify = false;

        if (isReopened) {
          updateData.status = 'open';
          updateData.acknowledgedAt = null;
          updateData.resolvedAt = null;
          updateData.triggeredAt = now;
          updateData.lastNotificationAt = now;
          shouldNotify = true;
        }

        if (severityEscalated) {
          updateData.lastNotificationAt = now;
          shouldNotify = true;
        }

        transaction.update(alertRef, updateData);

        if (shouldNotify) {
          notificationPayload = {
            title: severity === 'critical' ? 'Estoque crítico' : 'Alerta de estoque',
            message: `O item ${productDisplayName} está com ${resulting}g (mínimo ${minimum}g).`,
            category: 'stock',
            type: severity === 'critical' ? 'stock-critical' : 'stock-warning',
            referenceId: options.stockItemId,
          };
        }
      }
    } else if (alertData && alertData.status !== 'resolved') {
      transaction.update(alertRef, {
        status: 'resolved',
        resolvedAt: now,
        updatedAt: now,
        currentQuantityInGrams: resulting,
        minimumQuantityInGrams: minimum,
      });
    }
  });

  if (notificationPayload) {
    try {
      await createNotification(notificationPayload);
    } catch (notificationError) {
      logError(notificationError, 'stock.adjustStockLevel.notification');
    }
  }

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
  options?: {
    stockItemId?: string;
    productId?: string;
    types?: StockMovementType[];
    performedBy?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  },
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

  if (options?.performedBy) {
    constraints.push(where('performedBy', '==', options.performedBy));
  }

  if (options?.types?.length) {
    if (options.types.length === 1) {
      constraints.push(where('type', '==', options.types[0]));
    } else {
      constraints.push(where('type', 'in', options.types.slice(0, 10)));
    }
  }

  if (options?.from) {
    constraints.push(where('performedAt', '>=', Timestamp.fromDate(options.from)));
  }

  if (options?.to) {
    constraints.push(where('performedAt', '<=', Timestamp.fromDate(options.to)));
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
