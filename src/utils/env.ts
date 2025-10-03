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
};

function readEnv(key: string, fallback = ''): string {
  const value = process.env[key];

  if (!value && !fallback) {
    console.warn(`[env] Missing environment variable: ${key}`);
  }

  return value ?? fallback;
}

export const appEnv: AppEnv = {
  firebase: {
    apiKey: readEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: readEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: readEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: readEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: readEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
    measurementId: readEnv('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID') || undefined,
  },
};
