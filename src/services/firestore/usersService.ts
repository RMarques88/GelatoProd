import {
  DocumentData,
  DocumentSnapshot,
  onSnapshot,
  QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  getDoc,
} from 'firebase/firestore';

import {
  UserProfile,
  UserProfileCreateInput,
  UserProfileUpdateInput,
  UserRole,
} from '@/domain';
import {
  FirestoreObserver,
  getDb,
  getDocument,
  normalizeFirestoreError,
  serializeDateOrNull,
  timestampToDate,
} from './utils';

const COLLECTION_NAME = 'users';

const DEFAULT_ROLE: UserRole = 'gelatie';

type UserDocument = DocumentData & {
  email: string;
  displayName?: string | null;
  role: UserRole;
  phoneNumber?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp | null;
};

type UserDocSnapshot =
  | DocumentSnapshot<UserDocument>
  | QueryDocumentSnapshot<UserDocument>;

function mapUserProfile(snapshot: UserDocSnapshot): UserProfile {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Perfil de usuário ${snapshot.id} não encontrado.`);
  }

  return {
    id: snapshot.id,
    email: data.email,
    displayName: data.displayName ?? null,
    role: data.role ?? DEFAULT_ROLE,
    phoneNumber: data.phoneNumber ?? null,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    archivedAt: timestampToDate(data.archivedAt),
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const db = getDb();
  const docRef = getDocument<UserDocument>(db, `${COLLECTION_NAME}/${userId}`);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  return mapUserProfile(snapshot);
}

export async function ensureUserProfile(
  userId: string,
  input: UserProfileCreateInput,
): Promise<UserProfile> {
  const db = getDb();
  const docRef = getDocument<UserDocument>(db, `${COLLECTION_NAME}/${userId}`);
  const snapshot = await getDoc(docRef);

  if (snapshot.exists()) {
    return mapUserProfile(snapshot);
  }

  const now = serverTimestamp();

  await setDoc(docRef, {
    email: input.email,
    displayName: input.displayName ?? null,
    phoneNumber: input.phoneNumber ?? null,
    role: input.role ?? DEFAULT_ROLE,
    archivedAt: serializeDateOrNull(input.archivedAt ?? null),
    createdAt: now,
    updatedAt: now,
  });

  const createdDoc = await getDoc(docRef);

  if (!createdDoc.exists()) {
    throw new Error('Falha ao criar perfil de usuário.');
  }

  return mapUserProfile(createdDoc);
}

export async function updateUserProfile(
  userId: string,
  input: UserProfileUpdateInput,
): Promise<UserProfile> {
  const db = getDb();
  const docRef = getDocument<UserDocument>(db, `${COLLECTION_NAME}/${userId}`);

  const { archivedAt, ...rest } = input;

  await updateDoc(docRef, {
    ...rest,
    ...(archivedAt !== undefined
      ? { archivedAt: serializeDateOrNull(archivedAt) }
      : null),
    updatedAt: serverTimestamp(),
  });

  const updatedDoc = await getDoc(docRef);

  if (!updatedDoc.exists()) {
    throw new Error('Perfil de usuário não encontrado após atualização.');
  }

  return mapUserProfile(updatedDoc);
}

export function subscribeToUserProfile(
  userId: string,
  handlers: FirestoreObserver<UserProfile | null>,
) {
  const db = getDb();
  const docRef = getDocument<UserDocument>(db, `${COLLECTION_NAME}/${userId}`);

  return onSnapshot(
    docRef,
    snapshot => {
      if (!snapshot.exists()) {
        handlers.next(null);
        return;
      }

      handlers.next(mapUserProfile(snapshot));
    },
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}
