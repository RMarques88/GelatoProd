import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getReportingSummaryBundle,
  type ReportingQueryOptions,
  type ReportingSummaryBundle,
} from '@/services/reportingMetrics';
import type { PeriodGranularity } from '@/services/reportingMetrics';

type UseReportingSummariesOptions = {
  granularity: PeriodGranularity;
  from?: Date;
  to?: Date;
  rangeInDays?: number;
  limitPeriods?: number;
  enabled?: boolean;
};

type UseReportingSummariesResult = {
  summaries: ReportingSummaryBundle;
  isLoading: boolean;
  error: Error | null;
  from: Date;
  to: Date;
  refetch: () => void;
};

const DEFAULT_RANGE_IN_DAYS = 30;

const EMPTY_SUMMARIES: ReportingSummaryBundle = {
  recipeProduction: [],
  ingredientConsumption: [],
  divergenceUsage: [],
};

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function computeFromDate(to: Date, rangeInDays: number): Date {
  const result = startOfDay(to);
  result.setDate(result.getDate() - Math.max(rangeInDays - 1, 0));
  return result;
}

export function useReportingSummaries(
  options: UseReportingSummariesOptions,
): UseReportingSummariesResult {
  const {
    granularity,
    from: explicitFrom,
    to: explicitTo,
    rangeInDays = DEFAULT_RANGE_IN_DAYS,
    limitPeriods,
    enabled = true,
  } = options;

  const normalizedTo = useMemo(() => endOfDay(explicitTo ?? new Date()), [explicitTo]);
  const normalizedFrom = useMemo(() => {
    if (explicitFrom) {
      return startOfDay(explicitFrom);
    }

    return computeFromDate(normalizedTo, rangeInDays);
  }, [explicitFrom, normalizedTo, rangeInDays]);

  const [summaries, setSummaries] = useState<ReportingSummaryBundle>(EMPTY_SUMMARIES);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const fetchOptions = useMemo<ReportingQueryOptions>(
    () => ({
      from: normalizedFrom,
      to: normalizedTo,
      granularity,
      limitPeriods,
    }),
    [granularity, limitPeriods, normalizedFrom, normalizedTo],
  );

  const refetch = useCallback(() => {
    setRefreshToken(previous => previous + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setSummaries(EMPTY_SUMMARIES);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getReportingSummaryBundle(fetchOptions);
        if (!cancelled) {
          setSummaries(data);
        }
      } catch (loadingError) {
        if (!cancelled) {
          setError(loadingError as Error);
          setSummaries(EMPTY_SUMMARIES);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [enabled, fetchOptions, refreshToken]);

  return {
    summaries,
    isLoading,
    error,
    from: normalizedFrom,
    to: normalizedTo,
    refetch,
  };
}
