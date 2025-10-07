import {
  DocumentData,
  DocumentSnapshot,
  Timestamp,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import {
  FirestoreObserver,
  getDb,
  normalizeFirestoreError,
  timestampToDate,
} from './utils';
import type {
  AccessorySettings,
  PricingSettings,
  PricingSettingsUpdateInput,
} from '@/domain';

const APP_SETTINGS_COLLECTION = 'appSettings';
const PRICING_SETTINGS_DOCUMENT_ID = 'pricing';

type PricingSettingsDocument = DocumentData & {
  sellingPricePer100gInBRL: number;
  sellingPricePerKilogramInBRL: number;
  extraCostPer100gInBRL?: number;
  extraCostPerKilogramInBRL?: number;
  accessories?: AccessorySettings;
  updatedBy?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

function mapPricingSettings(
  snapshot: DocumentSnapshot<PricingSettingsDocument>,
): PricingSettings {
  const data = snapshot.data();

  if (!data) {
    return {
      id: snapshot.id,
      sellingPricePer100gInBRL: 0,
      sellingPricePerKilogramInBRL: 0,
      extraCostPer100gInBRL: 0,
      extraCostPerKilogramInBRL: 0,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  return {
    id: snapshot.id,
    sellingPricePer100gInBRL: data.sellingPricePer100gInBRL ?? 0,
    sellingPricePerKilogramInBRL: data.sellingPricePerKilogramInBRL ?? 0,
    extraCostPer100gInBRL: data.extraCostPer100gInBRL ?? 0,
    extraCostPerKilogramInBRL: data.extraCostPerKilogramInBRL ?? 0,
    accessories: data.accessories ?? { items: [] },
    updatedBy: data.updatedBy ?? null,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
  };
}

async function ensurePricingSettingsDocument() {
  const db = getDb();
  const docRef = doc(db, APP_SETTINGS_COLLECTION, PRICING_SETTINGS_DOCUMENT_ID);
  const snapshot = await getDoc(docRef);

  if (snapshot.exists()) {
    return { db, docRef, snapshot } as const;
  }

  await setDoc(docRef, {
    sellingPricePer100gInBRL: 0,
    sellingPricePerKilogramInBRL: 0,
    extraCostPer100gInBRL: 0,
    extraCostPerKilogramInBRL: 0,
    accessories: { items: [] },
    updatedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const createdSnapshot = await getDoc(docRef);
  return { db, docRef, snapshot: createdSnapshot } as const;
}

export async function getPricingSettings(): Promise<PricingSettings> {
  const { snapshot } = await ensurePricingSettingsDocument();
  return mapPricingSettings(snapshot as DocumentSnapshot<PricingSettingsDocument>);
}

export async function updatePricingSettings(
  input: PricingSettingsUpdateInput,
): Promise<PricingSettings> {
  const { docRef, snapshot } = await ensurePricingSettingsDocument();
  const currentData = snapshot.data() as PricingSettingsDocument | undefined;

  const pricePer100g =
    input.sellingPricePer100gInBRL ??
    (input.sellingPricePerKilogramInBRL !== undefined
      ? input.sellingPricePerKilogramInBRL / 10
      : undefined);

  const pricePerKilogram =
    input.sellingPricePerKilogramInBRL ??
    (input.sellingPricePer100gInBRL !== undefined
      ? input.sellingPricePer100gInBRL * 10
      : undefined);

  const extraPer100g =
    input.extraCostPer100gInBRL ??
    (input.extraCostPerKilogramInBRL !== undefined
      ? input.extraCostPerKilogramInBRL / 10
      : undefined);

  const extraPerKilogram =
    input.extraCostPerKilogramInBRL ??
    (input.extraCostPer100gInBRL !== undefined
      ? input.extraCostPer100gInBRL * 10
      : undefined);

  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    createdAt: currentData?.createdAt ?? serverTimestamp(),
  };

  if (pricePer100g !== undefined) {
    payload.sellingPricePer100gInBRL = Number(pricePer100g);
  }

  if (pricePerKilogram !== undefined) {
    payload.sellingPricePerKilogramInBRL = Number(pricePerKilogram);
  }

  if (extraPer100g !== undefined) {
    payload.extraCostPer100gInBRL = Number(extraPer100g);
  }

  if (extraPerKilogram !== undefined) {
    payload.extraCostPerKilogramInBRL = Number(extraPerKilogram);
  }

  if (input.updatedBy !== undefined) {
    payload.updatedBy = input.updatedBy ?? null;
  }

  if (input.accessories !== undefined) {
    // Persist the full accessories object; callers should send the full list to keep.
    payload.accessories = (input.accessories ?? { items: [] }) as AccessorySettings;
  }

  await updateDoc(docRef, payload);

  const updatedSnapshot = await getDoc(docRef);
  return mapPricingSettings(updatedSnapshot as DocumentSnapshot<PricingSettingsDocument>);
}

export function subscribeToPricingSettings(observer: FirestoreObserver<PricingSettings>) {
  const db = getDb();
  const docRef = doc(db, APP_SETTINGS_COLLECTION, PRICING_SETTINGS_DOCUMENT_ID);

  return onSnapshot(
    docRef,
    snapshot => {
      if (!snapshot.exists()) {
        observer.next({
          id: snapshot.id,
          sellingPricePer100gInBRL: 0,
          sellingPricePerKilogramInBRL: 0,
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        return;
      }

      observer.next(
        mapPricingSettings(snapshot as DocumentSnapshot<PricingSettingsDocument>),
      );
    },
    error => observer.error?.(normalizeFirestoreError(error)),
  );
}
