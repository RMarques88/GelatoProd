import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  // This function exists at runtime in React Native but isn't in the type definitions
  export function getReactNativePersistence(storage: {
    getItem(key: string): Promise<string | null> | string | null;
    setItem(key: string, value: string): Promise<void> | void;
    removeItem(key: string): Promise<void> | void;
  }): Persistence;
}
