import { QueryClient, type Query } from '@tanstack/react-query';

import { registerSurveyQueryDefaults } from '../../features/surveys/policy/resultsReadDenial';
import { ApiError } from '../api/types';

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429
  ) {
    return false;
  }
  return failureCount < 3;
}

/** How old data may be before a tab return reads it again (#2819). */
export const FOCUS_REFETCH_AFTER_MS = 30_000;

/**
 * Tab-return policy (#2819, owner 2026-11-23): on a tab return, a query reads again only when its last successful data is 30
 * seconds old or older, or a write invalidated it. Mount, remount and invalidation after a write still read as before
 * (`staleTime` stays 0), so my own writes are never shown stale; another user's change can show up to 30 seconds later on a
 * tab return. A query's own `refetchOnWindowFocus` still wins: permission-sensitive reads (Evidence, Survey evidence
 * candidates) keep `true`. The global `focusManager` is untouched: FO shares the module (as ADR-0086 left `notifyManager`).
 */
export function shouldRefetchOnFocus(query: Query): boolean {
  return query.state.isInvalidated || Date.now() - query.state.dataUpdatedAt >= FOCUS_REFETCH_AFTER_MS;
}

export function createFeatureQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetryQuery, refetchOnWindowFocus: shouldRefetchOnFocus } },
  });
  // Sticky Survey results-read denial markers must never be garbage-collected
  // while the payloads they protect stay cached; see registerSurveyQueryDefaults.
  registerSurveyQueryDefaults(queryClient);
  return queryClient;
}
