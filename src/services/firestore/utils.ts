import {
  Timestamp,
  collection,
  doc,
  Firestore,
  DocumentData,
  QueryDocumentSnapshot,
} from 'firebase/firestore';

import { getFirestoreDb } from '@/services/firebase';

type WithTimestamps<T extends DocumentData> = T & {
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  archivedAt?: Timestamp | null;
};

export function getCollection(db: Firestore, path: string) {
  return collection(db, path);
}

export function getDocument(db: Firestore, path: string) {
  return doc(db, path);
}

export function timestampToDate(timestamp?: Timestamp | null): Date | null {
  if (!timestamp) {
    return null;
  }

  return timestamp.toDate();
}

export function mapSnapshotWithTimestamps<T extends DocumentData>(
  snapshot: QueryDocumentSnapshot<WithTimestamps<T>>,
) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    ...data,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    archivedAt: timestampToDate(data.archivedAt),
  } as const;
}

export function getDb() {
  return getFirestoreDb();
}
