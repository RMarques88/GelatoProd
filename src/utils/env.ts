type FirebaseEnv = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

type AppEnv = {
  firebase: FirebaseEnv;
  debug: {
    showFirestoreIndexHelper: boolean;
  };
};

function readEnv(value: string | undefined, key: string, fallback = ''): string {
  const resolvedValue = value ?? fallback;

  if (!resolvedValue) {
    console.warn(`[env] Missing environment variable: ${key}`);
  }

  const masked = resolvedValue
    ? `***${resolvedValue.slice(Math.max(resolvedValue.length - 4, 0))}`
    : 'UNDEFINED';
  console.log(`[env] ${key} = ${masked}`);

  return resolvedValue;
}

const firebaseConfig = {
  apiKey: readEnv(
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    'EXPO_PUBLIC_FIREBASE_API_KEY',
  ),
  authDomain: readEnv(
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  ),
  projectId: readEnv(
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  ),
  storageBucket: readEnv(
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  ),
  messagingSenderId: readEnv(
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  ),
  appId: readEnv(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, 'EXPO_PUBLIC_FIREBASE_APP_ID'),
  measurementId:
    readEnv(
      process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
      'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
    ) || undefined,
} as const satisfies FirebaseEnv;

export const appEnv: AppEnv = {
  firebase: firebaseConfig,
  debug: {
    showFirestoreIndexHelper:
      readEnv(
        process.env.EXPO_PUBLIC_DEBUG_FIRESTORE_INDEX_HELPER,
        'EXPO_PUBLIC_DEBUG_FIRESTORE_INDEX_HELPER',
        'false',
      ) === 'true',
  },
};

console.log('[env] Firebase config loaded:', {
  hasApiKey: !!appEnv.firebase.apiKey,
  hasAuthDomain: !!appEnv.firebase.authDomain,
  hasProjectId: !!appEnv.firebase.projectId,
  hasStorageBucket: !!appEnv.firebase.storageBucket,
  hasMessagingSenderId: !!appEnv.firebase.messagingSenderId,
  hasAppId: !!appEnv.firebase.appId,
});
