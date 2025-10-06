import { useCallback } from 'react';

import { subscribeToPricingSettings, updatePricingSettings } from '@/services/firestore';

import { useFirestoreSubscription } from './useFirestoreSubscription';
import type { PricingSettings, PricingSettingsUpdateInput } from '@/domain';

type UsePricingSettingsOptions = {
  enabled?: boolean;
  suspense?: boolean;
};

type UsePricingSettingsResult = {
  settings: PricingSettings | null;
  isLoading: boolean;
  error: Error | null;
  update: (input: PricingSettingsUpdateInput) => Promise<PricingSettings>;
  retry: () => void;
};

export function usePricingSettings(
  options: UsePricingSettingsOptions = {},
): UsePricingSettingsResult {
  const { enabled = true, suspense } = options;

  const subscribe = useCallback(
    ({
      next,
      error,
    }: {
      next: (value: PricingSettings) => void;
      error?: (err: Error) => void;
    }) => subscribeToPricingSettings({ next, error }),
    [],
  );

  const { data, error, isLoading, mutate, retry } =
    useFirestoreSubscription<PricingSettings | null>({
      subscribe,
      initialValue: null,
      enabled,
      suspense,
    });

  const handleUpdate = useCallback(
    async (input: PricingSettingsUpdateInput) => {
      const updated = await updatePricingSettings(input);
      mutate(updated);
      return updated;
    },
    [mutate],
  );

  return {
    settings: data,
    isLoading,
    error,
    update: handleUpdate,
    retry,
  };
}
