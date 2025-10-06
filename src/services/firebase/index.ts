import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Import Auth component registration for React Native
// This MUST come before any auth usage to register the component
import { appEnv } from '@/utils/env';
import type { Auth } from 'firebase/auth';

// Persist across Fast Refresh to avoid re-initialization races in RN/Expo
const globalScope = globalThis as unknown as Record<string, unknown>;
const AUTH_SINGLETON_KEY = '__firebase_auth_instance__';
const APP_SINGLETON_KEY = '__firebase_app_instance__';
const DB_SINGLETON_KEY = '__firebase_db_instance__';

let firebaseApp: FirebaseApp | null =
  (globalScope[APP_SINGLETON_KEY] as FirebaseApp) ?? null;
let firebaseAuth: Auth | null = (globalScope[AUTH_SINGLETON_KEY] as Auth) ?? null;
let firestoreDb: Firestore | null = (globalScope[DB_SINGLETON_KEY] as Firestore) ?? null;

export function getFirebaseApp(): FirebaseApp {
  console.log('[firebase] getFirebaseApp start');
  if (firebaseApp) {
    console.log('[firebase] getFirebaseApp reuse cached');
    return firebaseApp;
  }

  const existingApp = getApps()[0];
  console.log('[firebase] existingApp?', Boolean(existingApp));

  if (existingApp) {
    firebaseApp = existingApp;
    globalScope[APP_SINGLETON_KEY] = firebaseApp;
    return firebaseApp;
  }

  const config = {
    apiKey: appEnv.firebase.apiKey,
    authDomain: appEnv.firebase.authDomain,
    projectId: appEnv.firebase.projectId,
    storageBucket: appEnv.firebase.storageBucket,
    messagingSenderId: appEnv.firebase.messagingSenderId,
    appId: appEnv.firebase.appId,
    measurementId: appEnv.firebase.measurementId,
  };

  console.log('[firebase] Config to initialize:', {
    apiKey: config.apiKey.slice(0, 10) + '...',
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId.slice(0, 15) + '...',
  });

  validateFirebaseConfig(config);

  firebaseApp = initializeApp(config);
  console.log('[firebase] initialized app successfully');
  globalScope[APP_SINGLETON_KEY] = firebaseApp;

  return firebaseApp;
}

export function getFirebaseAuth(): Auth {
  console.log('[firebase] getFirebaseAuth start');
  if (firebaseAuth) {
    console.log('[firebase] getFirebaseAuth reuse cached');
    return firebaseAuth;
  }

  const app = getFirebaseApp();

  // Use initializeAuth with RN persistence - this registers the Auth component
  console.log('[firebase] Initializing Auth with RN persistence');
  const persistence = getReactNativePersistence(AsyncStorage);

  try {
    firebaseAuth = initializeAuth(app, {
      persistence,
    });
  } catch (error) {
    console.warn(
      '[firebase] initializeAuth failed, falling back to getAuth:',
      (error as Error)?.message ?? error,
    );
    firebaseAuth = getAuth(app);
  }

  console.log('[firebase] Auth initialized successfully');
  globalScope[AUTH_SINGLETON_KEY] = firebaseAuth;

  return firebaseAuth;
}

export function getFirestoreDb(): Firestore {
  if (firestoreDb) {
    return firestoreDb;
  }

  const app = getFirebaseApp();
  firestoreDb = getFirestore(app);
  globalScope[DB_SINGLETON_KEY] = firestoreDb;
  console.log('[firebase] Firestore DB initialized');

  return firestoreDb;
}

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

function validateFirebaseConfig(config: FirebaseConfig) {
  const requiredEntries = Object.entries(config).filter(
    ([key]) => key !== 'measurementId',
  );

  const missingKeys = requiredEntries
    .filter(([, value]) => !value || value.trim().length === 0)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(
      `Firebase configuration is incomplete. Missing keys: ${missingKeys.join(', ')}`,
    );
  }
}
