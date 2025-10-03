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
  scheduledFor: Timestamp;
  quantityInUnits: number;
  unitOfMeasure: string;
  notes?: string | null;
  status: ProductionStatus;
  requestedBy: string;
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
    scheduledFor: timestampToDate(data.scheduledFor) ?? new Date(),
    quantityInUnits: data.quantityInUnits,
    unitOfMeasure: data.unitOfMeasure as ProductionPlan['unitOfMeasure'],
    notes: data.notes ?? undefined,
    status: data.status,
    requestedBy: data.requestedBy,
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

  const docRef = await addDoc(colRef, {
    recipeId: input.recipeId,
    recipeName: input.recipeName,
    scheduledFor: Timestamp.fromDate(input.scheduledFor),
    quantityInUnits: input.quantityInUnits,
    unitOfMeasure: input.unitOfMeasure,
    notes: input.notes ?? null,
    status: input.status ?? 'scheduled',
    requestedBy: input.requestedBy,
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

  const { scheduledFor, archivedAt, ...rest } = input;

  await updateDoc(docRef, {
    ...rest,
    ...(scheduledFor ? { scheduledFor: Timestamp.fromDate(scheduledFor) } : null),
    ...(archivedAt !== undefined
      ? { archivedAt: serializeDateOrNull(archivedAt) }
      : null),
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

export { PRODUCTION_PLANS_COLLECTION, mapProductionPlan };
