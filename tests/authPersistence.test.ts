/* eslint-disable @typescript-eslint/no-require-imports */
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

const mockGetAuth = jest.fn(() => mockAuthInstance);
const mockInitializeAuth = jest.fn(() => mockAuthInstance);

const mockPersistence = { persistence: 'async-storage' };
const mockGetReactNativePersistence = jest.fn(() => mockPersistence);

jest.mock('firebase/auth', () => ({
  getAuth: mockGetAuth,
  initializeAuth: mockInitializeAuth,
  getReactNativePersistence: mockGetReactNativePersistence,
}));

describe('getFirebaseAuth', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGetApps.mockReturnValue([]);
    mockGetAuth.mockReturnValue(mockAuthInstance);
    mockInitializeAuth.mockReturnValue(mockAuthInstance);
    mockGetReactNativePersistence.mockReturnValue(mockPersistence);

    const globalScope = globalThis as Record<string, unknown>;
    delete globalScope.__firebase_auth_instance__;
    delete globalScope.__firebase_app_instance__;
    delete globalScope.__firebase_db_instance__;
  });

  it('configures React Native persistence when initializing auth', () => {
    // Use synchronous require to avoid dynamic import which requires experimental vm modules
    // in Node/Jest environment.
    const { getFirebaseAuth } = require('@/services/firebase');
    const auth = getFirebaseAuth();

    expect(auth).toBe(mockAuthInstance);
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockInitializeAuth).toHaveBeenCalledWith(mockApp, {
      persistence: mockPersistence,
    });
    expect(mockGetReactNativePersistence).toHaveBeenCalledTimes(1);
    expect(mockGetAuth).not.toHaveBeenCalled();
  });

  it('reuses the cached auth instance within the same launch', () => {
    const { getFirebaseAuth } = require('@/services/firebase');
    const first = getFirebaseAuth();
    const second = getFirebaseAuth();

    expect(first).toBe(mockAuthInstance);
    expect(second).toBe(first);
    expect(mockInitializeAuth).toHaveBeenCalledTimes(1);
  });

  it('configures persistence again on a new launch (module reload)', async () => {
    // initial load via require
    const { getFirebaseAuth } = require('@/services/firebase');
    getFirebaseAuth();

    expect(mockInitializeAuth).toHaveBeenCalledTimes(1);

    const globalScope = globalThis as Record<string, unknown>;
    delete globalScope.__firebase_auth_instance__;
    delete globalScope.__firebase_app_instance__;
    delete globalScope.__firebase_db_instance__;

    jest.resetModules();

    // reload module after resetting modules
    const reloadedModule = require('@/services/firebase');
    reloadedModule.getFirebaseAuth();

    expect(mockInitializeAuth).toHaveBeenCalledTimes(2);
    expect(mockInitializeAuth).toHaveBeenNthCalledWith(1, mockApp, {
      persistence: mockPersistence,
    });
    expect(mockInitializeAuth).toHaveBeenNthCalledWith(2, mockApp, {
      persistence: mockPersistence,
    });
  });

  it('falls back to getAuth when initializeAuth throws', () => {
    mockInitializeAuth.mockImplementation(() => {
      throw new Error('already-initialized');
    });

    const { getFirebaseAuth } = require('@/services/firebase');
    const auth = getFirebaseAuth();

    expect(mockInitializeAuth).toHaveBeenCalledTimes(1);
    expect(mockGetAuth).toHaveBeenCalledTimes(1);
    expect(auth).toBe(mockAuthInstance);
  });
});
