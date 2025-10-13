import type { Firestore } from 'firebase/firestore';

type SnapshotData<T> = {
  id: string;
  data: () => T | undefined;
  exists: () => boolean;
};

type CollectionLike = {
  path?: string;
};

export const collection = jest.fn((db: Firestore, path: string) => ({
  __type: 'collection',
  db,
  path,
}));

let autoDocId = 0;

export const doc = jest.fn((ref: CollectionLike | Firestore, path?: string) => {
  if (path) {
    return {
      __type: 'doc',
      parent: ref,
      path,
      id: path.split('/').pop() ?? path,
    };
  }

  autoDocId += 1;
  const parentRef = ref as CollectionLike;
  const basePath = parentRef.path ?? 'collection';

  return {
    __type: 'doc',
    parent: ref,
    path: `${basePath}/mock-doc-${autoDocId}`,
    id: `mock-doc-${autoDocId}`,
  };
});

export const addDoc = jest.fn(async () => ({ __type: 'docRef' }));
export const getDoc = jest.fn(async () => createSnapshot('doc-id', undefined));
export const getDocs = jest.fn(async () => ({
  docs: [] as Array<SnapshotData<unknown>>,
}));
export const updateDoc = jest.fn(async () => {});
export const deleteDoc = jest.fn(async () => {});
export const runTransaction = jest.fn(
  async (
    _db: Firestore,
    updateFunction: (transaction: {
      get: typeof transactionGet;
      update: typeof transactionUpdate;
      set: typeof transactionSet;
    }) => Promise<unknown> | unknown,
  ) => {
    return updateFunction({
      get: transactionGet,
      update: transactionUpdate,
      set: transactionSet,
    });
  },
);

export const transactionGet = jest.fn();
export const transactionUpdate = jest.fn();
export const transactionSet = jest.fn();

export const onSnapshotListeners: Array<{
  ref: unknown;
  next: (value: unknown) => void;
  error?: (error: Error) => void;
}> = [];

export const onSnapshot = jest.fn(
  (ref: unknown, next: (value: unknown) => void, error?: (error: Error) => void) => {
    const listener = { ref, next, error };
    onSnapshotListeners.push(listener);
    return () => {
      const index = onSnapshotListeners.indexOf(listener);
      if (index >= 0) {
        onSnapshotListeners.splice(index, 1);
      }
    };
  },
);

export const query = jest.fn((ref: unknown, ...constraints: unknown[]) => ({
  __type: 'query',
  ref,
  constraints,
}));

export const where = jest.fn((field: string, op: string, value: unknown) => ({
  __type: 'where',
  field,
  op,
  value,
}));

export const orderBy = jest.fn((field: string, direction: 'asc' | 'desc') => ({
  __type: 'orderBy',
  field,
  direction,
}));

export const limit = jest.fn((value: number) => ({
  __type: 'limit',
  value,
}));

const serverTimestampValue = Symbol('serverTimestamp');

export const serverTimestamp = jest.fn(() => serverTimestampValue);

class MockTimestamp {
  constructor(private readonly date: Date) {}

  toDate() {
    return this.date;
  }
}

export const Timestamp = {
  fromDate: jest.fn((date: Date) => new MockTimestamp(date)),
};

export const FieldValue: Record<string, never> = {};

export function createSnapshot<T>(id: string, data: T | undefined): SnapshotData<T> {
  return {
    id,
    data: () => data,
    exists: () => data !== undefined,
  };
}

export function createTimestamp(date: Date) {
  return new MockTimestamp(date);
}

export function resetFirestoreMocks() {
  // Reset mocks and clear any queued one-time resolved values so tests are isolated.
  collection.mockReset();
  doc.mockReset();
  addDoc.mockReset();
  getDoc.mockReset();
  getDocs.mockReset();
  updateDoc.mockReset();
  deleteDoc.mockReset();
  runTransaction.mockReset();
  transactionGet.mockReset();
  transactionUpdate.mockReset();
  transactionSet.mockReset();
  onSnapshot.mockReset();
  query.mockReset();
  where.mockReset();
  orderBy.mockReset();
  limit.mockReset();
  serverTimestamp.mockReset();
  Timestamp.fromDate.mockReset();

  // Restore default implementations expected by tests
  collection.mockImplementation((db: Firestore, path: string) => ({
    __type: 'collection',
    db,
    path,
  }));

  autoDocId = 0;
  doc.mockImplementation((ref: CollectionLike | Firestore, path?: string) => {
    if (path) {
      return {
        __type: 'doc',
        parent: ref,
        path,
        id: path.split('/').pop() ?? path,
      };
    }

    autoDocId += 1;
    const parentRef = ref as CollectionLike;
    const basePath = parentRef.path ?? 'collection';

    return {
      __type: 'doc',
      parent: ref,
      path: `${basePath}/mock-doc-${autoDocId}`,
      id: `mock-doc-${autoDocId}`,
    };
  });

  addDoc.mockImplementation(async () => ({ __type: 'docRef' }));
  getDoc.mockImplementation(async () => createSnapshot('doc-id', undefined));
  getDocs.mockImplementation(async () => ({ docs: [] as Array<SnapshotData<unknown>>, empty: true }));
  updateDoc.mockImplementation(async () => {});
  deleteDoc.mockImplementation(async () => {});
  runTransaction.mockImplementation(
    async (
      _db: Firestore,
      updateFunction: (transaction: {
        get: typeof transactionGet;
        update: typeof transactionUpdate;
        set: typeof transactionSet;
      }) => Promise<unknown> | unknown,
    ) => {
      return updateFunction({
        get: transactionGet,
        update: transactionUpdate,
        set: transactionSet,
      });
    },
  );

  transactionGet.mockImplementation(() => {});
  transactionUpdate.mockImplementation(() => {});
  transactionSet.mockImplementation(() => {});

  onSnapshot.mockImplementation(
    (ref: unknown, next: (value: unknown) => void, error?: (e: Error) => void) => {
      const listener = { ref, next, error };
      onSnapshotListeners.push(listener);
      return () => {
        const index = onSnapshotListeners.indexOf(listener);
        if (index >= 0) {
          onSnapshotListeners.splice(index, 1);
        }
      };
    },
  );

  query.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({
    __type: 'query',
    ref,
    constraints,
  }));

  where.mockImplementation((field: string, op: string, value: unknown) => ({
    __type: 'where',
    field,
    op,
    value,
  }));

  orderBy.mockImplementation((field: string, direction: 'asc' | 'desc') => ({
    __type: 'orderBy',
    field,
    direction,
  }));

  limit.mockImplementation((value: number) => ({ __type: 'limit', value }));

  serverTimestamp.mockImplementation(() => serverTimestampValue);
  Timestamp.fromDate.mockImplementation((date: Date) => new MockTimestamp(date));

  onSnapshotListeners.length = 0;
}

module.exports = {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  runTransaction,
  transactionGet,
  transactionUpdate,
  transactionSet,
  onSnapshot,
  onSnapshotListeners,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  FieldValue,
  createSnapshot,
  createTimestamp,
  resetFirestoreMocks,
};
