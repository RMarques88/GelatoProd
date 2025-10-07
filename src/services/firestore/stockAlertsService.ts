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

const DEFAULT_ALERT_STATUSES: ReadonlyArray<StockAlertStatus> = ['open', 'acknowledged'];

function normalizeStatusFilter(statuses?: StockAlertStatus[] | null): StockAlertStatus[] {
  if (!statuses || statuses.length === 0) {
    return [...DEFAULT_ALERT_STATUSES];
  }

  return statuses;
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
  const normalizedStatuses = normalizeStatusFilter(options?.status);
  const shouldFilterInQuery = normalizedStatuses.length === 1;

  if (shouldFilterInQuery) {
    constraints.push(where('status', '==', normalizedStatuses[0]));
  }

  if (options?.onlyCritical) {
    constraints.push(where('severity', '==', 'critical'));
  }

  if (options?.productId) {
    constraints.push(where('productId', '==', options.productId));
  }

  if (options?.limit && shouldFilterInQuery) {
    constraints.push(limit(options.limit));
  }

  const alertsQuery = query(colRef, ...constraints);
  const snapshot = await getDocs(alertsQuery);

  let alerts = snapshot.docs.map(mapStockAlert);

  alerts = alerts.filter(alert => normalizedStatuses.includes(alert.status));
  alerts.sort((first, second) => second.updatedAt.getTime() - first.updatedAt.getTime());

  if (options?.limit && !shouldFilterInQuery) {
    alerts = alerts.slice(0, options.limit);
  }

  return alerts;
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
  const normalizedStatuses = normalizeStatusFilter(options?.status);
  const shouldFilterInQuery = normalizedStatuses.length === 1;

  if (shouldFilterInQuery) {
    constraints.push(where('status', '==', normalizedStatuses[0]));
  }

  if (options?.onlyCritical) {
    constraints.push(where('severity', '==', 'critical'));
  }

  if (options?.productId) {
    constraints.push(where('productId', '==', options.productId));
  }

  if (options?.limit && shouldFilterInQuery) {
    constraints.push(limit(options.limit));
  }

  const alertsQuery = query(colRef, ...constraints);

  return onSnapshot(
    alertsQuery,
    snapshot => {
      let alerts = snapshot.docs.map(mapStockAlert);

      alerts = alerts.filter(alert => normalizedStatuses.includes(alert.status));
      alerts.sort(
        (first, second) => second.updatedAt.getTime() - first.updatedAt.getTime(),
      );

      if (options?.limit && !shouldFilterInQuery) {
        alerts = alerts.slice(0, options.limit);
      }

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
