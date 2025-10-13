const requiredEnvVars = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    process.env[key] = 'test-value';
  }
}

if (!process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID) {
  process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID = 'test-measurement-id';
}

jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map<string, string>();

  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        storage.delete(key);
      }),
      getAllKeys: jest.fn(async () => Array.from(storage.keys())),
      clear: jest.fn(async () => storage.clear()),
    },
  };
});

jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockReact = require('react');

  return {
    Ionicons: ({ name }: { name: string }) => mockReact.createElement('Icon', { name }),
  };
});

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  (console.warn as jest.Mock).mockRestore?.();
});

// Optionally install the interactive visual helper for E2E runs.
(async () => {
  try {
    const visual = await import('./e2e/e2eVisualHelper');
    if (visual && typeof visual.installVisualHooks === 'function') {
      visual.installVisualHooks();
    }
  } catch {
    // ignore — helper is optional
  }
})();
