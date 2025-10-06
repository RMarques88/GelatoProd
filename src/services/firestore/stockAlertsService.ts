import {
  DocumentData,
  DocumentSnapshot,
  QueryConstraint,
  QueryDocumentSnapshot,
  Timestamp,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

import { StockAlert, StockAlertSeverity, StockAlertStatus } from '@/domain';

import {
  FirestoreObserver,
  getCollection,
  getDocument,
  getDb,
  normalizeFirestoreError,
  timestampToDate,
} from './utils';

export const STOCK_ALERTS_COLLECTION = 'stockAlerts';

type StockAlertDocument = DocumentData & {
  stockItemId: string;
  productId: string;
  status: StockAlertStatus;
  severity: StockAlertSeverity;
  currentQuantityInGrams: number;
  minimumQuantityInGrams: number;
  triggeredAt: Timestamp;
  acknowledgedAt?: Timestamp | null;
  resolvedAt?: Timestamp | null;
  lastNotificationAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type StockAlertSnapshot =
  | DocumentSnapshot<StockAlertDocument>
  | QueryDocumentSnapshot<StockAlertDocument>;

export function mapStockAlert(snapshot: StockAlertSnapshot): StockAlert {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Alerta de estoque ${snapshot.id} não encontrado.`);
  }

  return {
    id: snapshot.id,
    stockItemId: data.stockItemId,
    productId: data.productId,
    status: data.status,
    severity: data.severity,
    currentQuantityInGrams: data.currentQuantityInGrams,
    minimumQuantityInGrams: data.minimumQuantityInGrams,
    triggeredAt: timestampToDate(data.triggeredAt) ?? new Date(),
    acknowledgedAt: timestampToDate(data.acknowledgedAt),
    resolvedAt: timestampToDate(data.resolvedAt),
    lastNotificationAt: timestampToDate(data.lastNotificationAt),
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    archivedAt: null,
  };
}

function buildStatusConstraint(statuses?: StockAlertStatus[]): QueryConstraint | null {
  if (!statuses || statuses.length === 0) {
    return where('status', 'in', ['open', 'acknowledged']);
  }

  if (statuses.length === 1) {
    return where('status', '==', statuses[0]);
  }

  return where('status', 'in', statuses);
}

export async function listStockAlerts(options?: {
  status?: StockAlertStatus[];
  onlyCritical?: boolean;
  productId?: string;
  limit?: number;
}): Promise<StockAlert[]> {
  const db = getDb();
  const colRef = getCollection<StockAlertDocument>(db, STOCK_ALERTS_COLLECTION);

  const constraints: QueryConstraint[] = [];

  const statusConstraint = buildStatusConstraint(options?.status);
  if (statusConstraint) {
    constraints.push(statusConstraint);
  }

  if (options?.onlyCritical) {
    constraints.push(where('severity', '==', 'critical'));
  }

  if (options?.productId) {
    constraints.push(where('productId', '==', options.productId));
  }

  constraints.push(orderBy('updatedAt', 'desc'));

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const alertsQuery = query(colRef, ...constraints);
  const snapshot = await getDocs(alertsQuery);

  return snapshot.docs.map(mapStockAlert);
}

export function subscribeToStockAlerts(
  handlers: FirestoreObserver<StockAlert[]>,
  options?: {
    status?: StockAlertStatus[];
    onlyCritical?: boolean;
    productId?: string;
    limit?: number;
  },
) {
  const db = getDb();
  const colRef = getCollection<StockAlertDocument>(db, STOCK_ALERTS_COLLECTION);

  const constraints: QueryConstraint[] = [];
  const statusConstraint = buildStatusConstraint(options?.status);

  if (statusConstraint) {
    constraints.push(statusConstraint);
  }

  if (options?.onlyCritical) {
    constraints.push(where('severity', '==', 'critical'));
  }

  if (options?.productId) {
    constraints.push(where('productId', '==', options.productId));
  }

  constraints.push(orderBy('updatedAt', 'desc'));

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const alertsQuery = query(colRef, ...constraints);

  return onSnapshot(
    alertsQuery,
    snapshot => {
      const alerts = snapshot.docs.map(mapStockAlert);
      console.log(`📊 [StockAlerts] Recebidos ${alerts.length} alertas:`, {
        total: alerts.length,
        open: alerts.filter(a => a.status === 'open').length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        statusFilter: options?.status,
        alerts: alerts.map(a => ({
          id: a.id,
          status: a.status,
          severity: a.severity,
          productId: a.productId,
        })),
      });
      handlers.next(alerts);
    },
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}

export async function acknowledgeStockAlert(alertId: string): Promise<StockAlert> {
  const db = getDb();
  const docRef = getDocument<StockAlertDocument>(
    db,
    `${STOCK_ALERTS_COLLECTION}/${alertId}`,
  );

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Stock alert ${alertId} not found`);
  }
  const currentData = currentSnapshot.data();

  await updateDoc(docRef, {
    status: 'acknowledged',
    acknowledgedAt: serverTimestamp(),
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
    updatedAt: serverTimestamp(),
  });

  const snapshot = await getDoc(docRef);
  return mapStockAlert(snapshot);
}

export async function resolveStockAlert(alertId: string): Promise<StockAlert> {
  const db = getDb();
  const docRef = getDocument<StockAlertDocument>(
    db,
    `${STOCK_ALERTS_COLLECTION}/${alertId}`,
  );

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Stock alert ${alertId} not found`);
  }
  const currentData = currentSnapshot.data();

  await updateDoc(docRef, {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
    updatedAt: serverTimestamp(),
  });

  const snapshot = await getDoc(docRef);
  return mapStockAlert(snapshot);
}

export function getStockAlertDocumentForItem(db: Firestore, stockItemId: string) {
  return getDocument<StockAlertDocument>(db, `${STOCK_ALERTS_COLLECTION}/${stockItemId}`);
}

export type { StockAlertDocument };
