import {
  Timestamp,
  collection,
  doc,
  Firestore,
  DocumentData,
  DocumentReference,
  QueryDocumentSnapshot,
  CollectionReference,
} from 'firebase/firestore';

import { getFirestoreDb } from '@/services/firebase';

type WithTimestamps<T extends DocumentData> = T & {
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  archivedAt?: Timestamp | null;
};

export type FirestoreObserver<T> = {
  next: (value: T) => void;
  error?: (error: Error) => void;
};

export function getCollection<T = DocumentData>(db: Firestore, path: string) {
  return collection(db, path) as CollectionReference<T>;
}

export function getDocument<T = DocumentData>(db: Firestore, path: string) {
  return doc(db, path) as DocumentReference<T>;
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

export function normalizeFirestoreError(
  error: unknown,
  fallbackMessage = 'Ocorreu um erro ao comunicar com o Firestore.',
) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
}

export function serializeDateOrNull(value?: Date | null) {
  if (value === undefined || value === null) {
    return value ?? null;
  }

  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }

  return null;
}
