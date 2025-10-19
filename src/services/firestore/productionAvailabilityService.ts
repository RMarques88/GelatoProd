import {
  QueryConstraint,
  addDoc,
  DocumentData,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  Timestamp,
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
  FirestoreObserver,
  getCollection,
  getDocument,
  getDb,
  normalizeFirestoreError,
  serializeDateOrNull,
  timestampToDate,
} from './utils';
import type {
  ProductionPlanAvailabilityRecord,
  ProductionPlanAvailabilityRecordCreateInput,
  ProductionPlanAvailabilityStatus,
} from '@/domain';

export type ProductionPlanAvailabilityRecordUpdateInput = Partial<
  Omit<
    ProductionPlanAvailabilityRecord,
    'id' | 'planId' | 'planCode' | 'recipeId' | 'recipeName' | 'createdAt' | 'updatedAt'
  >
> & {
  status?: ProductionPlanAvailabilityRecord['status'];
};

export const PRODUCTION_PLAN_AVAILABILITY_COLLECTION = 'productionPlanAvailability';

type ProductionPlanAvailabilityRecordDocument = DocumentData & {
  planId: string;
  planCode: string;
  recipeId: string;
  recipeName: string;
  scheduledFor: Timestamp;
  quantityInUnits: number;
  unitOfMeasure: string;
  status: string;
  confirmedBy?: string | null;
  confirmedAt?: Timestamp | null;
  shortages: ProductionPlanAvailabilityRecord['shortages'];
  totalRequiredInGrams: number;
  totalAvailableInGrams: number;
  totalShortageInGrams: number;
  notes?: string | null;
  executionStartedAt?: Timestamp | null;
  executionCompletedAt?: Timestamp | null;
  actualConsumedInGrams?: number | null;
  actualShortageInGrams?: number | null;
  estimatedCostInBRL?: number | null;
  actualCostInBRL?: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type ProductionPlanAvailabilitySnapshot =
  | DocumentSnapshot<ProductionPlanAvailabilityRecordDocument>
  | QueryDocumentSnapshot<ProductionPlanAvailabilityRecordDocument>;

type SanitizedShortage = {
  productId: string;
  requiredQuantityInGrams: number;
  availableQuantityInGrams: number;
  shortageInGrams: number;
  minimumQuantityInGrams?: number;
  averageUnitCostInBRL: number | null;
  estimatedCostInBRL: number | null;
};

function mapProductionPlanAvailabilityRecord(
  snapshot: ProductionPlanAvailabilitySnapshot,
): ProductionPlanAvailabilityRecord {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Registro de disponibilidade ${snapshot.id} não encontrado.`);
  }

  return {
    id: snapshot.id,
    planId: data.planId,
    planCode: data.planCode,
    recipeId: data.recipeId,
    recipeName: data.recipeName,
    scheduledFor: timestampToDate(data.scheduledFor) ?? new Date(),
    quantityInUnits: data.quantityInUnits,
    unitOfMeasure:
      data.unitOfMeasure as ProductionPlanAvailabilityRecord['unitOfMeasure'],
    status: data.status as ProductionPlanAvailabilityRecord['status'],
    confirmedBy: data.confirmedBy ?? null,
    confirmedAt: timestampToDate(data.confirmedAt),
    shortages: data.shortages ?? [],
    totalRequiredInGrams: data.totalRequiredInGrams ?? 0,
    totalAvailableInGrams: data.totalAvailableInGrams ?? 0,
    totalShortageInGrams: data.totalShortageInGrams ?? 0,
    notes: data.notes ?? null,
    executionStartedAt: timestampToDate(data.executionStartedAt),
    executionCompletedAt: timestampToDate(data.executionCompletedAt),
    actualConsumedInGrams: data.actualConsumedInGrams ?? null,
    actualShortageInGrams: data.actualShortageInGrams ?? null,
    estimatedCostInBRL: data.estimatedCostInBRL ?? null,
    actualCostInBRL: data.actualCostInBRL ?? null,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    archivedAt: null,
  };
}

export async function createProductionPlanAvailabilityRecord(
  input: ProductionPlanAvailabilityRecordCreateInput,
): Promise<ProductionPlanAvailabilityRecord> {
  const db = getDb();
  const colRef = getCollection<ProductionPlanAvailabilityRecordDocument>(
    db,
    PRODUCTION_PLAN_AVAILABILITY_COLLECTION,
  );

  const now = serverTimestamp();
  // Sanitize shortages: Firestore rejects `undefined` anywhere in the object tree.
  const sanitizedShortages: SanitizedShortage[] = (input.shortages ?? []).map(s => {
    const base: SanitizedShortage = {
      productId: s.productId,
      requiredQuantityInGrams: s.requiredQuantityInGrams ?? 0,
      availableQuantityInGrams: s.availableQuantityInGrams ?? 0,
      shortageInGrams: s.shortageInGrams ?? 0,
      averageUnitCostInBRL: s.averageUnitCostInBRL ?? null,
      estimatedCostInBRL: s.estimatedCostInBRL ?? null,
    };

    if (s.minimumQuantityInGrams !== undefined && s.minimumQuantityInGrams !== null) {
      base.minimumQuantityInGrams = s.minimumQuantityInGrams;
    }

    return base;
  });

  // Build payload and remove any `undefined` values recursively. Firestore
  // rejects `undefined` anywhere in the document tree.
  const payload = {
    planId: input.planId,
    planCode: input.planCode,
    recipeId: input.recipeId,
    recipeName: input.recipeName,
    scheduledFor: Timestamp.fromDate(input.scheduledFor),
    quantityInUnits: input.quantityInUnits,
    unitOfMeasure: input.unitOfMeasure,
    status: input.status,
    confirmedBy: input.confirmedBy ?? null,
    confirmedAt: serializeDateOrNull(input.confirmedAt),
    shortages: sanitizedShortages,
    totalRequiredInGrams: input.totalRequiredInGrams ?? 0,
    totalAvailableInGrams: input.totalAvailableInGrams ?? 0,
    totalShortageInGrams: input.totalShortageInGrams ?? 0,
    notes: input.notes ?? null,
    executionStartedAt: serializeDateOrNull(input.executionStartedAt),
    executionCompletedAt: serializeDateOrNull(input.executionCompletedAt),
    actualConsumedInGrams: input.actualConsumedInGrams ?? null,
    actualShortageInGrams: input.actualShortageInGrams ?? null,
    estimatedCostInBRL: input.estimatedCostInBRL ?? null,
    actualCostInBRL: input.actualCostInBRL ?? null,
    createdAt: now,
    updatedAt: now,
  } as Record<string, unknown>;

  type UnknownRecord = Record<string, unknown>;

  function removeUndefined<T>(value: T): T {
    if (value === undefined) return value;
    if (value === null) return value;
    if (Array.isArray(value)) {
      return value.map(v => removeUndefined(v)) as unknown as T;
    }
    if (typeof value === 'object') {
      // Preserve non-plain objects such as Firestore Timestamp and FieldValue
      const ctor = (value as UnknownRecord)?.constructor as unknown;
      if (ctor && ctor !== Object) {
        return value;
      }

      const out: UnknownRecord = {};
      for (const [k, v] of Object.entries(value as UnknownRecord)) {
        if (v === undefined) continue;
        out[k] = removeUndefined(v as unknown) as unknown;
      }
      return out as unknown as T;
    }

    return value;
  }

  const cleanedPayload = removeUndefined(payload);
  console.debug('[productionAvailability] creating record payload:', cleanedPayload);

  const docRef = await addDoc(colRef, cleanedPayload);

  const snapshot = (await getDoc(docRef)) as ProductionPlanAvailabilitySnapshot;
  return mapProductionPlanAvailabilityRecord(snapshot);
}

export async function findProductionPlanAvailabilityRecordByPlanId(
  planId: string,
): Promise<ProductionPlanAvailabilityRecord | null> {
  const db = getDb();
  const colRef = getCollection<ProductionPlanAvailabilityRecordDocument>(
    db,
    PRODUCTION_PLAN_AVAILABILITY_COLLECTION,
  );

  const availabilityQuery = query(
    colRef,
    where('planId', '==', planId),
    orderBy('createdAt', 'desc'),
    limit(1),
  );

  const snapshot = await getDocs(availabilityQuery);
  const document = snapshot.docs[0];

  return document ? mapProductionPlanAvailabilityRecord(document) : null;
}

export function subscribeToProductionPlanAvailabilityRecord(
  planId: string,
  observer: FirestoreObserver<ProductionPlanAvailabilityRecord | null>,
) {
  const db = getDb();
  const colRef = getCollection<ProductionPlanAvailabilityRecordDocument>(
    db,
    PRODUCTION_PLAN_AVAILABILITY_COLLECTION,
  );

  const availabilityQuery = query(
    colRef,
    where('planId', '==', planId),
    orderBy('createdAt', 'desc'),
    limit(1),
  );

  return onSnapshot(
    availabilityQuery,
    snapshot => {
      const document = snapshot.docs[0];
      observer.next(document ? mapProductionPlanAvailabilityRecord(document) : null);
    },
    error => observer.error?.(normalizeFirestoreError(error)),
  );
}

type AvailabilityRecordQueryOptions = {
  status?: ProductionPlanAvailabilityStatus[];
  from?: Date;
  to?: Date;
  limit?: number;
};

function buildAvailabilityStatusConstraint(
  statuses?: ProductionPlanAvailabilityStatus[],
): QueryConstraint | null {
  if (!statuses || statuses.length === 0) {
    return null;
  }

  if (statuses.length === 1) {
    return where('status', '==', statuses[0]);
  }

  return where('status', 'in', statuses);
}

function buildAvailabilityQueryConstraints(
  options?: AvailabilityRecordQueryOptions,
): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];

  const statusConstraint = buildAvailabilityStatusConstraint(options?.status);
  if (statusConstraint) {
    constraints.push(statusConstraint);
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

  return constraints;
}

export async function listProductionPlanAvailabilityRecords(
  options?: AvailabilityRecordQueryOptions,
): Promise<ProductionPlanAvailabilityRecord[]> {
  const db = getDb();
  const colRef = getCollection<ProductionPlanAvailabilityRecordDocument>(
    db,
    PRODUCTION_PLAN_AVAILABILITY_COLLECTION,
  );

  const recordsQuery = query(colRef, ...buildAvailabilityQueryConstraints(options));
  const snapshot = await getDocs(recordsQuery);

  return snapshot.docs.map(mapProductionPlanAvailabilityRecord);
}

export function subscribeToProductionPlanAvailabilityRecords(
  observer: FirestoreObserver<ProductionPlanAvailabilityRecord[]>,
  options?: AvailabilityRecordQueryOptions,
) {
  const db = getDb();
  const colRef = getCollection<ProductionPlanAvailabilityRecordDocument>(
    db,
    PRODUCTION_PLAN_AVAILABILITY_COLLECTION,
  );

  const recordsQuery = query(colRef, ...buildAvailabilityQueryConstraints(options));

  return onSnapshot(
    recordsQuery,
    snapshot => {
      observer.next(snapshot.docs.map(mapProductionPlanAvailabilityRecord));
    },
    error => observer.error?.(normalizeFirestoreError(error)),
  );
}

export async function updateProductionPlanAvailabilityRecord(
  recordId: string,
  input: ProductionPlanAvailabilityRecordUpdateInput,
): Promise<ProductionPlanAvailabilityRecord> {
  const db = getDb();
  const docRef = getDocument<ProductionPlanAvailabilityRecordDocument>(
    db,
    `${PRODUCTION_PLAN_AVAILABILITY_COLLECTION}/${recordId}`,
  );

  const currentSnapshot = await getDoc(docRef);

  if (!currentSnapshot.exists()) {
    throw new Error(`Registro de disponibilidade ${recordId} não encontrado.`);
  }

  const currentData = currentSnapshot.data();
  const { confirmedAt, executionStartedAt, executionCompletedAt, ...rest } = input;

  const sanitizedRest = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );

  await updateDoc(docRef, {
    ...sanitizedRest,
    ...(confirmedAt !== undefined
      ? { confirmedAt: serializeDateOrNull(confirmedAt) }
      : null),
    ...(executionStartedAt !== undefined
      ? { executionStartedAt: serializeDateOrNull(executionStartedAt) }
      : null),
    ...(executionCompletedAt !== undefined
      ? { executionCompletedAt: serializeDateOrNull(executionCompletedAt) }
      : null),
    createdAt: currentData.createdAt,
    updatedAt: serverTimestamp(),
  });

  const updatedSnapshot = await getDoc(docRef);
  return mapProductionPlanAvailabilityRecord(updatedSnapshot);
}
