declare module 'firebase/auth/react-native' {
  import type { Persistence } from 'firebase/auth';

  export function getReactNativePersistence(storage: {
    getItem(key: string): Promise<string | null> | string | null;
    setItem(key: string, value: string): Promise<void> | void;
    removeItem(key: string): Promise<void> | void;
  }): Persistence;
}
