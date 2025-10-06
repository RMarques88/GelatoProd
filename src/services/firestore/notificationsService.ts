import {
  DocumentData,
  DocumentSnapshot,
  QueryConstraint,
  QueryDocumentSnapshot,
  Timestamp,
  addDoc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import {
  AppNotification,
  AppNotificationCreateInput,
  NotificationCategory,
  NotificationStatus,
} from '@/domain';

import {
  FirestoreObserver,
  getCollection,
  getDocument,
  getDb,
  normalizeFirestoreError,
  timestampToDate,
} from './utils';

export const NOTIFICATIONS_COLLECTION = 'notifications';

type NotificationDocument = DocumentData & {
  title: string;
  message: string;
  category: NotificationCategory;
  type: string;
  referenceId?: string | null;
  status: NotificationStatus;
  createdAt: Timestamp;
  readAt?: Timestamp | null;
};

type NotificationSnapshot =
  | DocumentSnapshot<NotificationDocument>
  | QueryDocumentSnapshot<NotificationDocument>;

function mapNotification(snapshot: NotificationSnapshot): AppNotification {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Notificação ${snapshot.id} não encontrada.`);
  }

  return {
    id: snapshot.id,
    title: data.title,
    message: data.message,
    category: data.category,
    type: data.type,
    referenceId: data.referenceId ?? null,
    status: data.status,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    readAt: timestampToDate(data.readAt),
  };
}

function buildStatusConstraint(
  status?: NotificationStatus | NotificationStatus[],
): QueryConstraint | null {
  if (!status) {
    return null;
  }

  if (Array.isArray(status)) {
    if (status.length === 0) {
      return null;
    }

    if (status.length === 1) {
      return where('status', '==', status[0]);
    }

    return where('status', 'in', status);
  }

  return where('status', '==', status);
}

export async function createNotification(
  input: AppNotificationCreateInput,
): Promise<AppNotification> {
  const db = getDb();
  const colRef = getCollection<NotificationDocument>(db, NOTIFICATIONS_COLLECTION);

  const docRef = await addDoc(colRef, {
    title: input.title,
    message: input.message,
    category: input.category,
    type: input.type,
    referenceId: input.referenceId ?? null,
    status: 'unread',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    readAt: null,
  });

  const snapshot = await getDoc(docRef);
  return mapNotification(snapshot);
}

export async function listNotifications(options?: {
  status?: NotificationStatus | NotificationStatus[];
  category?: NotificationCategory;
  limit?: number;
}): Promise<AppNotification[]> {
  const db = getDb();
  const colRef = getCollection<NotificationDocument>(db, NOTIFICATIONS_COLLECTION);

  const constraints: QueryConstraint[] = [];

  const statusConstraint = buildStatusConstraint(options?.status);
  if (statusConstraint) {
    constraints.push(statusConstraint);
  }

  if (options?.category) {
    constraints.push(where('category', '==', options.category));
  }

  constraints.push(orderBy('createdAt', 'desc'));

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const notificationsQuery = query(colRef, ...constraints);
  const snapshot = await getDocs(notificationsQuery);

  return snapshot.docs.map(mapNotification);
}

export function subscribeToNotifications(
  handlers: FirestoreObserver<AppNotification[]>,
  options?: {
    status?: NotificationStatus | NotificationStatus[];
    category?: NotificationCategory;
    limit?: number;
  },
) {
  const db = getDb();
  const colRef = getCollection<NotificationDocument>(db, NOTIFICATIONS_COLLECTION);

  const constraints: QueryConstraint[] = [];

  const statusConstraint = buildStatusConstraint(options?.status);
  if (statusConstraint) {
    constraints.push(statusConstraint);
  }

  if (options?.category) {
    constraints.push(where('category', '==', options.category));
  }

  constraints.push(orderBy('createdAt', 'desc'));

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const notificationsQuery = query(colRef, ...constraints);

  return onSnapshot(
    notificationsQuery,
    snapshot => {
      handlers.next(snapshot.docs.map(mapNotification));
    },
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}

export async function markNotificationAsRead(
  notificationId: string,
): Promise<AppNotification> {
  const db = getDb();
  const docRef = getDocument<NotificationDocument>(
    db,
    `${NOTIFICATIONS_COLLECTION}/${notificationId}`,
  );

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Notification ${notificationId} not found`);
  }
  const currentData = currentSnapshot.data();

  await updateDoc(docRef, {
    status: 'read',
    readAt: serverTimestamp(),
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
    updatedAt: serverTimestamp(),
  });

  const snapshot = await getDoc(docRef);
  return mapNotification(snapshot);
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const unread = await listNotifications({ status: 'unread' });

  await Promise.all(
    unread.map(notification =>
      markNotificationAsRead(notification.id).catch(() => undefined),
    ),
  );
}

export type { NotificationDocument };
