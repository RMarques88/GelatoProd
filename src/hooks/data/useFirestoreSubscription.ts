import { DependencyList, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  enabled?: boolean;
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

function serializeDependency(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  const valueType = typeof value;

  if (valueType === 'undefined') {
    return 'undefined';
  }

  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return `${valueType}:${String(value)}`;
  }

  if (value instanceof Date) {
    return `date:${value.toISOString()}`;
  }

  if (Array.isArray(value)) {
    return `array:[${value.map(serializeDependency).join(',')}]`;
  }

  if (valueType === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    return `function:${fn.name ?? 'anonymous'}`;
  }

  try {
    return `object:${JSON.stringify(value)}`;
  } catch {
    return `object:${Object.prototype.toString.call(value)}`;
  }
}

function createDependenciesKey(list: DependencyList): string {
  if (!list || list.length === 0) {
    return '[]';
  }

  return list.map(serializeDependency).join('|');
}

export function useFirestoreSubscription<T>(
  options: UseFirestoreSubscriptionOptions<T>,
): Result<T> {
  const {
    subscribe,
    initialValue,
    suspense = false,
    dependencies = [],
    enabled = true,
  } = options;

  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    initialValueRef.current = initialValue;
  }, [initialValue]);

  const [state, setState] = useState<FirestoreSubscriptionState<T>>({
    data: initialValueRef.current,
    error: null,
    isLoading: Boolean(enabled),
  });
  const [version, setVersion] = useState(0);
  const suspendRef = useRef<Promise<void> | null>(null);
  const suspendCallbacks = useRef<{
    resolve?: () => void;
    reject?: (error: Error) => void;
  }>({});

  const resetSuspenseRef = useRef(() => {
    suspendCallbacks.current = {};
    suspendRef.current = null;
  });

  const safeResolveSuspenseRef = useRef(() => {
    suspendCallbacks.current.resolve?.();
    resetSuspenseRef.current();
  });

  const safeRejectSuspenseRef = useRef((error: Error) => {
    suspendCallbacks.current.reject?.(error);
    resetSuspenseRef.current();
  });

  const subscribeRef = useRef(subscribe);

  useEffect(() => {
    subscribeRef.current = subscribe;
  }, [subscribe]);

  const dependenciesKey = useMemo(
    () => createDependenciesKey(dependencies),
    [dependencies],
  );

  useEffect(() => {
    if (!enabled) {
      setState({
        data: initialValueRef.current,
        error: null,
        isLoading: false,
      });
      resetSuspenseRef.current();
      return;
    }

    let isMounted = true;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    const unsubscribe = subscribeRef.current({
      next: value => {
        if (!isMounted) {
          return;
        }

        setState({
          data: value,
          error: null,
          isLoading: false,
        });
        safeResolveSuspenseRef.current();
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
        safeRejectSuspenseRef.current(subscriptionError);
      },
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [version, enabled, dependenciesKey]);

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
    if (!enabled) {
      return;
    }
    setVersion(current => current + 1);
    resetSuspenseRef.current();
    setState(prev => ({ ...prev, isLoading: true, error: null }));
  }, [enabled]);

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
