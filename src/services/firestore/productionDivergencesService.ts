import {
  DocumentData,
  DocumentSnapshot,
  QueryConstraint,
  QueryDocumentSnapshot,
  Timestamp,
  addDoc,
  deleteDoc,
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
  ProductionDivergence,
  ProductionDivergenceCreateInput,
  ProductionDivergenceStatus,
  ProductionDivergenceUpdateInput,
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

export const PRODUCTION_DIVERGENCES_COLLECTION = 'productionDivergences';

type ProductionDivergenceDocument = DocumentData & {
  planId: string;
  stageId?: string | null;
  reportedBy: string;
  resolvedBy?: string | null;
  status: ProductionDivergenceStatus;
  severity: string;
  type: string;
  description: string;
  expectedQuantityInUnits?: number | null;
  actualQuantityInUnits?: number | null;
  resolutionNotes?: string | null;
  resolvedAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type ProductionDivergenceSnapshot =
  | DocumentSnapshot<ProductionDivergenceDocument>
  | QueryDocumentSnapshot<ProductionDivergenceDocument>;

export function mapProductionDivergence(
  snapshot: ProductionDivergenceSnapshot,
): ProductionDivergence {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Divergência de produção ${snapshot.id} não encontrada.`);
  }

  return {
    id: snapshot.id,
    planId: data.planId,
    stageId: data.stageId ?? null,
    reportedBy: data.reportedBy,
    resolvedBy: data.resolvedBy ?? null,
    status: data.status,
    severity: data.severity as ProductionDivergence['severity'],
    type: data.type as ProductionDivergence['type'],
    description: data.description,
    expectedQuantityInUnits: data.expectedQuantityInUnits ?? null,
    actualQuantityInUnits: data.actualQuantityInUnits ?? null,
    resolutionNotes: data.resolutionNotes ?? undefined,
    resolvedAt: timestampToDate(data.resolvedAt),
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
  };
}

export async function listProductionDivergences(options?: {
  planId?: string;
  stageId?: string;
  status?: ProductionDivergenceStatus[];
  types?: ProductionDivergence['type'][];
  from?: Date;
  to?: Date;
  limit?: number;
}): Promise<ProductionDivergence[]> {
  const db = getDb();
  const colRef = getCollection<ProductionDivergenceDocument>(
    db,
    PRODUCTION_DIVERGENCES_COLLECTION,
  );

  const constraints: QueryConstraint[] = [];

  if (options?.planId) {
    constraints.push(where('planId', '==', options.planId));
  }

  if (options?.stageId) {
    constraints.push(where('stageId', '==', options.stageId));
  }

  if (options?.status?.length) {
    if (options.status.length === 1) {
      constraints.push(where('status', '==', options.status[0]));
    } else {
      constraints.push(where('status', 'in', options.status));
    }
  }

  if (options?.types?.length) {
    if (options.types.length === 1) {
      constraints.push(where('type', '==', options.types[0]));
    } else {
      constraints.push(where('type', 'in', options.types.slice(0, 10)));
    }
  }

  if (options?.from) {
    constraints.push(where('createdAt', '>=', Timestamp.fromDate(options.from)));
  }

  if (options?.to) {
    constraints.push(where('createdAt', '<=', Timestamp.fromDate(options.to)));
  }

  constraints.push(orderBy('createdAt', 'desc'));

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const divergencesQuery = query(colRef, ...constraints);
  const snapshot = await getDocs(divergencesQuery);

  return snapshot.docs.map(mapProductionDivergence);
}

export function subscribeToProductionDivergences(
  handlers: FirestoreObserver<ProductionDivergence[]>,
  options?: {
    planId?: string;
    stageId?: string;
    status?: ProductionDivergenceStatus[];
    types?: ProductionDivergence['type'][];
    from?: Date;
    to?: Date;
    limit?: number;
  },
) {
  const db = getDb();
  const colRef = getCollection<ProductionDivergenceDocument>(
    db,
    PRODUCTION_DIVERGENCES_COLLECTION,
  );

  const constraints: QueryConstraint[] = [];

  if (options?.planId) {
    constraints.push(where('planId', '==', options.planId));
  }

  if (options?.stageId) {
    constraints.push(where('stageId', '==', options.stageId));
  }

  if (options?.status?.length) {
    if (options.status.length === 1) {
      constraints.push(where('status', '==', options.status[0]));
    } else {
      constraints.push(where('status', 'in', options.status));
    }
  }

  if (options?.types?.length) {
    if (options.types.length === 1) {
      constraints.push(where('type', '==', options.types[0]));
    } else {
      constraints.push(where('type', 'in', options.types.slice(0, 10)));
    }
  }

  if (options?.from) {
    constraints.push(where('createdAt', '>=', Timestamp.fromDate(options.from)));
  }

  if (options?.to) {
    constraints.push(where('createdAt', '<=', Timestamp.fromDate(options.to)));
  }

  constraints.push(orderBy('createdAt', 'desc'));

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const divergencesQuery = query(colRef, ...constraints);

  return onSnapshot(
    divergencesQuery,
    snapshot => handlers.next(snapshot.docs.map(mapProductionDivergence)),
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}

export async function createProductionDivergence(
  input: ProductionDivergenceCreateInput,
): Promise<ProductionDivergence> {
  const db = getDb();
  const colRef = getCollection<ProductionDivergenceDocument>(
    db,
    PRODUCTION_DIVERGENCES_COLLECTION,
  );

  const now = serverTimestamp();

  const docRef = await addDoc(colRef, {
    planId: input.planId,
    stageId: input.stageId ?? null,
    reportedBy: input.reportedBy,
    resolvedBy: null,
    status: 'open',
    severity: input.severity,
    type: input.type,
    description: input.description,
    expectedQuantityInUnits: input.expectedQuantityInUnits ?? null,
    actualQuantityInUnits: input.actualQuantityInUnits ?? null,
    resolutionNotes: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const snapshot = await getDoc(docRef);
  return mapProductionDivergence(snapshot);
}

export async function updateProductionDivergence(
  divergenceId: string,
  input: ProductionDivergenceUpdateInput,
): Promise<ProductionDivergence> {
  const db = getDb();
  const docRef = getDocument<ProductionDivergenceDocument>(
    db,
    `${PRODUCTION_DIVERGENCES_COLLECTION}/${divergenceId}`,
  );

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Production divergence ${divergenceId} not found`);
  }
  const currentData = currentSnapshot.data();

  const { resolvedAt, ...rest } = input;

  await updateDoc(docRef, {
    ...rest,
    ...(resolvedAt !== undefined
      ? { resolvedAt: serializeDateOrNull(resolvedAt) }
      : null),
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
    updatedAt: serverTimestamp(),
  });

  const snapshot = await getDoc(docRef);
  return mapProductionDivergence(snapshot);
}

export async function deleteProductionDivergence(divergenceId: string): Promise<void> {
  const db = getDb();
  const docRef = getDocument(db, `${PRODUCTION_DIVERGENCES_COLLECTION}/${divergenceId}`);
  await deleteDoc(docRef);
}
