import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

type GlobalLockContextType = {
  isLocked: boolean;
  lock: () => void;
  unlock: () => void;
  runWithLock: <T>(work: Promise<T> | (() => Promise<T>)) => Promise<T>;
};

const GlobalLockContext = createContext<GlobalLockContextType | undefined>(undefined);

export const GlobalLockProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isLocked, setLocked] = useState(false);
  // A ref to synchronously check and set lock state to avoid races where
  // multiple callers call runWithLock at the same time.
  const isLockedRef = useRef(false);

  const lock = useCallback(() => setLocked(true), []);
  const unlock = useCallback(() => setLocked(false), []);

  const lockSync = useCallback(() => {
    isLockedRef.current = true;
    setLocked(true);
  }, []);

  const unlockSync = useCallback(() => {
    isLockedRef.current = false;
    setLocked(false);
  }, []);

  // Diagnostics
  const debugLock = useCallback(() => {
    console.debug('[GlobalLock] lock -> true');
    lockSync();
  }, [lockSync]);

  const debugUnlock = useCallback(() => {
    console.debug('[GlobalLock] lock -> false');
    unlockSync();
  }, [unlockSync]);

  const runWithLock = useCallback(
    async <T,>(work: Promise<T> | (() => Promise<T>)) => {
      // Prevent concurrent runs: do a synchronous check using the ref.
      if (isLockedRef.current) {
        throw new Error('Global lock already acquired');
      }

      debugLock();
      try {
        const result =
          typeof work === 'function' ? await (work as () => Promise<T>)() : await work;
        return result as T;
      } finally {
        debugUnlock();
      }
    },
    [debugLock, debugUnlock],
  );

  return (
    <GlobalLockContext.Provider value={{ isLocked, lock, unlock, runWithLock }}>
      {children}
    </GlobalLockContext.Provider>
  );
};

export function useGlobalLock() {
  const ctx = useContext(GlobalLockContext);
  if (!ctx) throw new Error('useGlobalLock must be used within GlobalLockProvider');
  return ctx;
}

export default GlobalLockContext;
