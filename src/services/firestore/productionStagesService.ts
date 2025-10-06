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
  ProductionStage,
  ProductionStageCreateInput,
  ProductionStageStatus,
  ProductionStageUpdateInput,
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

export const PRODUCTION_STAGES_COLLECTION = 'productionStages';

type ProductionStageDocument = DocumentData & {
  planId: string;
  name: string;
  description?: string | null;
  sequence: number;
  status: ProductionStageStatus;
  assignedTo?: string | null;
  scheduledStart?: Timestamp | null;
  scheduledEnd?: Timestamp | null;
  startedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  notes?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type ProductionStageSnapshot =
  | DocumentSnapshot<ProductionStageDocument>
  | QueryDocumentSnapshot<ProductionStageDocument>;

export function mapProductionStage(snapshot: ProductionStageSnapshot): ProductionStage {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Etapa de produção ${snapshot.id} não encontrada.`);
  }

  return {
    id: snapshot.id,
    planId: data.planId,
    name: data.name,
    description: data.description ?? undefined,
    sequence: data.sequence,
    status: data.status,
    assignedTo: data.assignedTo ?? null,
    scheduledStart: timestampToDate(data.scheduledStart),
    scheduledEnd: timestampToDate(data.scheduledEnd),
    startedAt: timestampToDate(data.startedAt),
    completedAt: timestampToDate(data.completedAt),
    notes: data.notes ?? undefined,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
  };
}

function buildPlanConstraint(planId?: string) {
  return planId ? where('planId', '==', planId) : null;
}

export async function listProductionStages(options?: {
  planId?: string;
  status?: ProductionStageStatus[];
  limit?: number;
}): Promise<ProductionStage[]> {
  const db = getDb();
  const colRef = getCollection<ProductionStageDocument>(db, PRODUCTION_STAGES_COLLECTION);

  const constraints: QueryConstraint[] = [];

  const planConstraint = buildPlanConstraint(options?.planId);
  if (planConstraint) {
    constraints.push(planConstraint);
  }

  if (options?.status?.length) {
    if (options.status.length === 1) {
      constraints.push(where('status', '==', options.status[0]));
    } else {
      constraints.push(where('status', 'in', options.status));
    }
  }

  constraints.push(orderBy('sequence', 'asc'));

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const stagesQuery = query(colRef, ...constraints);
  const snapshot = await getDocs(stagesQuery);

  return snapshot.docs.map(mapProductionStage);
}

export function subscribeToProductionStages(
  handlers: FirestoreObserver<ProductionStage[]>,
  options?: {
    planId?: string;
    status?: ProductionStageStatus[];
    limit?: number;
  },
) {
  const db = getDb();
  const colRef = getCollection<ProductionStageDocument>(db, PRODUCTION_STAGES_COLLECTION);

  const constraints: QueryConstraint[] = [];

  const planConstraint = buildPlanConstraint(options?.planId);
  if (planConstraint) {
    constraints.push(planConstraint);
  }

  if (options?.status?.length) {
    if (options.status.length === 1) {
      constraints.push(where('status', '==', options.status[0]));
    } else {
      constraints.push(where('status', 'in', options.status));
    }
  }

  constraints.push(orderBy('sequence', 'asc'));

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const stagesQuery = query(colRef, ...constraints);

  return onSnapshot(
    stagesQuery,
    snapshot => handlers.next(snapshot.docs.map(mapProductionStage)),
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}

export async function createProductionStage(
  input: ProductionStageCreateInput,
): Promise<ProductionStage> {
  const db = getDb();
  const colRef = getCollection<ProductionStageDocument>(db, PRODUCTION_STAGES_COLLECTION);

  const now = serverTimestamp();

  const docRef = await addDoc(colRef, {
    planId: input.planId,
    name: input.name,
    description: input.description ?? null,
    sequence: input.sequence,
    status: input.status ?? 'pending',
    assignedTo: input.assignedTo ?? null,
    scheduledStart: serializeDateOrNull(input.scheduledStart),
    scheduledEnd: serializeDateOrNull(input.scheduledEnd),
    startedAt: serializeDateOrNull(input.startedAt),
    completedAt: serializeDateOrNull(input.completedAt),
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const snapshot = await getDoc(docRef);
  return mapProductionStage(snapshot);
}

export async function updateProductionStage(
  stageId: string,
  input: ProductionStageUpdateInput,
): Promise<ProductionStage> {
  const db = getDb();
  const docRef = getDocument<ProductionStageDocument>(
    db,
    `${PRODUCTION_STAGES_COLLECTION}/${stageId}`,
  );

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Production stage ${stageId} not found`);
  }
  const currentData = currentSnapshot.data();

  const { scheduledStart, scheduledEnd, startedAt, completedAt, ...rest } = input;

  await updateDoc(docRef, {
    ...rest,
    ...(scheduledStart !== undefined
      ? { scheduledStart: serializeDateOrNull(scheduledStart) }
      : null),
    ...(scheduledEnd !== undefined
      ? { scheduledEnd: serializeDateOrNull(scheduledEnd) }
      : null),
    ...(startedAt !== undefined ? { startedAt: serializeDateOrNull(startedAt) } : null),
    ...(completedAt !== undefined
      ? { completedAt: serializeDateOrNull(completedAt) }
      : null),
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
    updatedAt: serverTimestamp(),
  });

  const snapshot = await getDoc(docRef);
  return mapProductionStage(snapshot);
}

export async function deleteProductionStage(stageId: string): Promise<void> {
  const db = getDb();
  const docRef = getDocument(db, `${PRODUCTION_STAGES_COLLECTION}/${stageId}`);
  await deleteDoc(docRef);
}
