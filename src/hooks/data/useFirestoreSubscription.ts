import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import type { Unsubscribe } from 'firebase/firestore';

export type FirestoreSubscriptionHandlers<T> = {
  next: (value: T) => void;
  error?: (error: Error) => void;
};

export type FirestoreSubscription<T> = (
  handlers: FirestoreSubscriptionHandlers<T>,
) => Unsubscribe;

interface UseFirestoreSubscriptionOptions<T> {
  subscribe: FirestoreSubscription<T>;
  initialValue: T;
  suspense?: boolean;
  dependencies?: DependencyList;
}

interface FirestoreSubscriptionState<T> {
  data: T;
  error: Error | null;
  isLoading: boolean;
}

type MutateFn<T> = (updater: T | ((previous: T) => T)) => void;

type RetryFn = () => void;

type Result<T> = FirestoreSubscriptionState<T> & {
  mutate: MutateFn<T>;
  retry: RetryFn;
};

export function useFirestoreSubscription<T>(
  options: UseFirestoreSubscriptionOptions<T>,
): Result<T> {
  const { subscribe, initialValue, suspense = false, dependencies = [] } = options;

  const [state, setState] = useState<FirestoreSubscriptionState<T>>({
    data: initialValue,
    error: null,
    isLoading: true,
  });
  const [version, setVersion] = useState(0);
  const suspendRef = useRef<Promise<void> | null>(null);
  const suspendCallbacks = useRef<{
    resolve?: () => void;
    reject?: (error: Error) => void;
  }>({});

  const resetSuspense = useCallback(() => {
    suspendCallbacks.current = {};
    suspendRef.current = null;
  }, []);

  const safeResolveSuspense = useCallback(() => {
    suspendCallbacks.current.resolve?.();
    resetSuspense();
  }, [resetSuspense]);

  const safeRejectSuspense = useCallback(
    (error: Error) => {
      suspendCallbacks.current.reject?.(error);
      resetSuspense();
    },
    [resetSuspense],
  );

  useEffect(() => {
    let isMounted = true;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    const unsubscribe = subscribe({
      next: value => {
        if (!isMounted) {
          return;
        }

        setState({
          data: value,
          error: null,
          isLoading: false,
        });
        safeResolveSuspense();
      },
      error: subscriptionError => {
        if (!isMounted) {
          return;
        }

        setState(prev => ({
          data: prev.data,
          error: subscriptionError,
          isLoading: false,
        }));
        safeRejectSuspense(subscriptionError);
      },
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [subscribe, safeRejectSuspense, safeResolveSuspense, version, dependencies]);

  const mutate: MutateFn<T> = useCallback(updater => {
    setState(prev => {
      const nextValue =
        typeof updater === 'function'
          ? (updater as (previous: T) => T)(prev.data)
          : updater;

      return {
        data: nextValue,
        error: prev.error,
        isLoading: prev.isLoading,
      };
    });
  }, []);

  const retry: RetryFn = useCallback(() => {
    setVersion(current => current + 1);
    resetSuspense();
    setState(prev => ({ ...prev, isLoading: true, error: null }));
  }, [resetSuspense]);

  if (suspense && state.isLoading) {
    if (!suspendRef.current) {
      suspendRef.current = new Promise<void>((resolve, reject) => {
        suspendCallbacks.current = { resolve, reject };
      });
    }

    throw suspendRef.current;
  }

  if (suspense && state.error) {
    throw state.error;
  }

  return {
    data: state.data,
    error: state.error,
    isLoading: state.isLoading,
    mutate,
    retry,
  };
}
