import React, { createContext, useCallback, useContext, useState } from 'react';

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

  const lock = useCallback(() => setLocked(true), []);
  const unlock = useCallback(() => setLocked(false), []);

  const runWithLock = useCallback(
    async <T,>(work: Promise<T> | (() => Promise<T>)) => {
      lock();
      try {
        const result = typeof work === 'function' ? await (work as any)() : await work;
        return result as T;
      } finally {
        unlock();
      }
    },
    [lock, unlock],
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
