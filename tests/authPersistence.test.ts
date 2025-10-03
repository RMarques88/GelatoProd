import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';

const mockApp = { name: 'mock-app' } as unknown as FirebaseApp;
const mockAuthInstance = { name: 'mock-auth' } as unknown as Auth;

const mockGetApps = jest.fn(() => []);
const mockInitializeApp = jest.fn(() => mockApp);

jest.mock('firebase/app', () => ({
  getApps: mockGetApps,
  initializeApp: mockInitializeApp,
}));

const mockGetAuth = jest.fn(() => {
  throw new Error('auth/not-initialized');
});
const mockInitializeAuth = jest.fn(() => mockAuthInstance);

jest.mock('firebase/auth', () => ({
  getAuth: mockGetAuth,
  initializeAuth: mockInitializeAuth,
}));

const mockPersistence = { persistence: 'async-storage' };
const mockGetReactNativePersistence = jest.fn(() => mockPersistence);

jest.mock(
  'firebase/auth/react-native',
  () => ({
    getReactNativePersistence: mockGetReactNativePersistence,
  }),
  { virtual: true },
);

describe('getFirebaseAuth', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGetApps.mockReturnValue([]);
    mockGetAuth.mockImplementation(() => {
      throw new Error('auth/not-initialized');
    });
    mockInitializeAuth.mockReturnValue(mockAuthInstance);
    mockGetReactNativePersistence.mockReturnValue(mockPersistence);
  });

  it('configures React Native persistence when initializing auth', async () => {
    const { getFirebaseAuth } = await import('@/services/firebase');
    const auth = getFirebaseAuth();

    expect(auth).toBe(mockAuthInstance);
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockInitializeAuth).toHaveBeenCalledWith(mockApp, {
      persistence: mockPersistence,
    });
    expect(mockGetReactNativePersistence).toHaveBeenCalledTimes(1);
  });

  it('reuses the cached auth instance within the same launch', async () => {
    const { getFirebaseAuth } = await import('@/services/firebase');
    const first = getFirebaseAuth();
    const second = getFirebaseAuth();

    expect(first).toBe(mockAuthInstance);
    expect(second).toBe(first);
    expect(mockInitializeAuth).toHaveBeenCalledTimes(1);
  });

  it('configures persistence again on a new launch (module reload)', async () => {
    const { getFirebaseAuth } = await import('@/services/firebase');
    getFirebaseAuth();

    expect(mockInitializeAuth).toHaveBeenCalledTimes(1);

    jest.resetModules();

    const reloadedModule = await import('@/services/firebase');
    reloadedModule.getFirebaseAuth();

    expect(mockInitializeAuth).toHaveBeenCalledTimes(2);
    expect(mockInitializeAuth).toHaveBeenNthCalledWith(1, mockApp, {
      persistence: mockPersistence,
    });
    expect(mockInitializeAuth).toHaveBeenNthCalledWith(2, mockApp, {
      persistence: mockPersistence,
    });
  });
});
