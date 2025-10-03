import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { getReactNativePersistence } from 'firebase/auth/react-native';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { appEnv } from '@/utils/env';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestoreDb: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (firebaseApp) {
    return firebaseApp;
  }

  const existingApp = getApps()[0];

  if (existingApp) {
    firebaseApp = existingApp;
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

  validateFirebaseConfig(config);

  firebaseApp = initializeApp(config);

  return firebaseApp;
}

export function getFirebaseAuth(): Auth {
  if (firebaseAuth) {
    return firebaseAuth;
  }

  const app = getFirebaseApp();

  try {
    firebaseAuth = getAuth(app);
  } catch (error) {
    firebaseAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }

  if (!firebaseAuth) {
    firebaseAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }

  return firebaseAuth;
}

export function getFirestoreDb(): Firestore {
  if (firestoreDb) {
    return firestoreDb;
  }

  const app = getFirebaseApp();
  firestoreDb = getFirestore(app);

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
