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
  ProductionPlan,
  ProductionPlanCreateInput,
  ProductionPlanUpdateInput,
  ProductionStatus,
} from '@/domain';

import { formatSequenceCode, getNextSequence } from './sequenceService';
import {
  FirestoreObserver,
  getCollection,
  getDocument,
  getDb,
  normalizeFirestoreError,
  serializeDateOrNull,
  timestampToDate,
} from './utils';

const PRODUCTION_PLANS_COLLECTION = 'productionPlans';

type ProductionPlanDocument = DocumentData & {
  recipeId: string;
  recipeName: string;
  sequenceNumber: number;
  code: string;
  scheduledFor: Timestamp;
  quantityInUnits: number;
  unitOfMeasure: string;
  notes?: string | null;
  status: ProductionStatus;
  requestedBy: string;
  startedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  actualQuantityInUnits?: number | null;
  estimatedProductionCostInBRL?: number | null;
  actualProductionCostInBRL?: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp | null;
};

type ProductionPlanSnapshot =
  | DocumentSnapshot<ProductionPlanDocument>
  | QueryDocumentSnapshot<ProductionPlanDocument>;

function mapProductionPlan(snapshot: ProductionPlanSnapshot): ProductionPlan {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Plano de produção ${snapshot.id} não encontrado.`);
  }

  return {
    id: snapshot.id,
    recipeId: data.recipeId,
    recipeName: data.recipeName,
    sequenceNumber: data.sequenceNumber ?? 0,
    code: data.code ?? '',
    scheduledFor: timestampToDate(data.scheduledFor) ?? new Date(),
    quantityInUnits: data.quantityInUnits,
    unitOfMeasure: data.unitOfMeasure as ProductionPlan['unitOfMeasure'],
    notes: data.notes ?? undefined,
    status: data.status,
    requestedBy: data.requestedBy,
    startedAt: timestampToDate(data.startedAt),
    completedAt: timestampToDate(data.completedAt),
    actualQuantityInUnits: data.actualQuantityInUnits ?? null,
    estimatedProductionCostInBRL: data.estimatedProductionCostInBRL ?? null,
    actualProductionCostInBRL: data.actualProductionCostInBRL ?? null,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    archivedAt: timestampToDate(data.archivedAt),
  };
}

function buildStatusConstraint(statuses?: ProductionStatus[]): QueryConstraint | null {
  if (!statuses || statuses.length === 0) {
    return null;
  }

  if (statuses.length === 1) {
    return where('status', '==', statuses[0]);
  }

  return where('status', 'in', statuses);
}

export async function listProductionPlans(options?: {
  status?: ProductionStatus[];
  from?: Date;
  to?: Date;
  includeArchived?: boolean;
  limit?: number;
}): Promise<ProductionPlan[]> {
  const db = getDb();
  const colRef = getCollection<ProductionPlanDocument>(db, PRODUCTION_PLANS_COLLECTION);

  const constraints: QueryConstraint[] = [];

  if (!options?.includeArchived) {
    constraints.push(where('archivedAt', '==', null));
  }

  const statusConstraint = buildStatusConstraint(options?.status);
  if (statusConstraint) {
    constraints.push(statusConstraint);
  }

  if (options?.from) {
    constraints.push(where('scheduledFor', '>=', Timestamp.fromDate(options.from)));
  }

  if (options?.to) {
    constraints.push(where('scheduledFor', '<=', Timestamp.fromDate(options.to)));
  }

  constraints.push(orderBy('scheduledFor', 'asc'));

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const plansQuery = query(colRef, ...constraints);
  const snapshot = await getDocs(plansQuery);

  return snapshot.docs.map(mapProductionPlan);
}

export function subscribeToProductionPlans(
  handlers: FirestoreObserver<ProductionPlan[]>,
  options?: {
    status?: ProductionStatus[];
    from?: Date;
    to?: Date;
    includeArchived?: boolean;
    limit?: number;
  },
) {
  const db = getDb();
  const colRef = getCollection<ProductionPlanDocument>(db, PRODUCTION_PLANS_COLLECTION);

  const constraints: QueryConstraint[] = [];

  if (!options?.includeArchived) {
    constraints.push(where('archivedAt', '==', null));
  }

  const statusConstraint = buildStatusConstraint(options?.status);
  if (statusConstraint) {
    constraints.push(statusConstraint);
  }

  if (options?.from) {
    constraints.push(where('scheduledFor', '>=', Timestamp.fromDate(options.from)));
  }

  if (options?.to) {
    constraints.push(where('scheduledFor', '<=', Timestamp.fromDate(options.to)));
  }

  constraints.push(orderBy('scheduledFor', 'asc'));

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const plansQuery = query(colRef, ...constraints);

  return onSnapshot(
    plansQuery,
    snapshot => {
      handlers.next(snapshot.docs.map(mapProductionPlan));
    },
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}

export async function createProductionPlan(
  input: ProductionPlanCreateInput,
): Promise<ProductionPlan> {
  const db = getDb();
  const colRef = getCollection<ProductionPlanDocument>(db, PRODUCTION_PLANS_COLLECTION);

  const now = serverTimestamp();
  const sequenceNumber =
    input.sequenceNumber ?? (await getNextSequence(PRODUCTION_PLANS_COLLECTION));
  const code = input.code ?? formatSequenceCode('KG', sequenceNumber);

  const docRef = await addDoc(colRef, {
    recipeId: input.recipeId,
    recipeName: input.recipeName,
    sequenceNumber,
    code,
    scheduledFor: Timestamp.fromDate(input.scheduledFor),
    quantityInUnits: input.quantityInUnits,
    unitOfMeasure: input.unitOfMeasure,
    notes: input.notes ?? null,
    status: input.status ?? 'scheduled',
    requestedBy: input.requestedBy,
    startedAt: serializeDateOrNull(input.startedAt),
    completedAt: serializeDateOrNull(input.completedAt),
    actualQuantityInUnits: input.actualQuantityInUnits ?? null,
    estimatedProductionCostInBRL: input.estimatedProductionCostInBRL ?? null,
    actualProductionCostInBRL: input.actualProductionCostInBRL ?? null,
    createdAt: now,
    updatedAt: now,
    archivedAt: serializeDateOrNull(input.archivedAt),
  });

  const snapshot = await getDoc(docRef);
  return mapProductionPlan(snapshot);
}

export async function updateProductionPlan(
  planId: string,
  input: ProductionPlanUpdateInput,
): Promise<ProductionPlan> {
  const db = getDb();
  const docRef = getDocument<ProductionPlanDocument>(
    db,
    `${PRODUCTION_PLANS_COLLECTION}/${planId}`,
  );

  // Get current document to preserve createdAt
  const currentSnapshot = await getDoc(docRef);
  if (!currentSnapshot.exists()) {
    throw new Error(`Production plan ${planId} not found`);
  }
  const currentData = currentSnapshot.data();

  const { scheduledFor, archivedAt, startedAt, completedAt, ...rest } = input;

  const sanitizedRest = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );

  await updateDoc(docRef, {
    ...sanitizedRest,
    ...(scheduledFor ? { scheduledFor: Timestamp.fromDate(scheduledFor) } : null),
    ...(startedAt !== undefined ? { startedAt: serializeDateOrNull(startedAt) } : null),
    ...(completedAt !== undefined
      ? { completedAt: serializeDateOrNull(completedAt) }
      : null),
    ...(archivedAt !== undefined
      ? { archivedAt: serializeDateOrNull(archivedAt) }
      : null),
    createdAt: currentData.createdAt, // Preserve createdAt for Firestore rules
    updatedAt: serverTimestamp(),
  });

  const snapshot = await getDoc(docRef);
  return mapProductionPlan(snapshot);
}

export async function updateProductionPlanStatus(
  planId: string,
  status: ProductionStatus,
): Promise<ProductionPlan> {
  return updateProductionPlan(planId, { status });
}

export async function archiveProductionPlan(planId: string): Promise<ProductionPlan> {
  return updateProductionPlan(planId, { archivedAt: new Date(), status: 'cancelled' });
}

export async function deleteProductionPlan(planId: string): Promise<void> {
  const db = getDb();
  const docRef = getDocument(db, `${PRODUCTION_PLANS_COLLECTION}/${planId}`);
  await deleteDoc(docRef);
}

export async function getProductionPlanById(planId: string): Promise<ProductionPlan> {
  const db = getDb();
  const docRef = getDocument<ProductionPlanDocument>(
    db,
    `${PRODUCTION_PLANS_COLLECTION}/${planId}`,
  );
  const snapshot = await getDoc(docRef);
  return mapProductionPlan(snapshot);
}

export function subscribeToProductionPlan(
  planId: string,
  handlers: FirestoreObserver<ProductionPlan>,
) {
  const db = getDb();
  const docRef = getDocument<ProductionPlanDocument>(
    db,
    `${PRODUCTION_PLANS_COLLECTION}/${planId}`,
  );

  return onSnapshot(
    docRef,
    document => handlers.next(mapProductionPlan(document)),
    error => handlers.error?.(normalizeFirestoreError(error)),
  );
}

export { PRODUCTION_PLANS_COLLECTION, mapProductionPlan };
