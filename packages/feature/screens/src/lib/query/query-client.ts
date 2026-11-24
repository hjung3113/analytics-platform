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

/** How old data may be before a tab return reads it again, for a query that opts in with `shouldRefetchOnFocus` (#2819). */
export const FOCUS_REFETCH_AFTER_MS = 30_000;

/**
 * Opt-in tab-return policy (#2819) for a query's `refetchOnWindowFocus`: on a tab return, read again only when the last
 * successful data is 30 seconds old or older, or a write invalidated it (judged at the moment of the return). The default
 * stays TanStack's (every tab return reads stale data again), because some reads rely on it to drop content after a
 * permission is withdrawn elsewhere. Opt in only for a costly read that shows no permission-gated content, with that
 * reason next to it, and on every observer of the same key (TanStack refetches when any observer asks to).
 */
export function shouldRefetchOnFocus(query: { state: Pick<Query['state'], 'isInvalidated' | 'dataUpdatedAt'> }): boolean {
  return query.state.isInvalidated || Date.now() - query.state.dataUpdatedAt >= FOCUS_REFETCH_AFTER_MS;
}

export function createFeatureQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetryQuery } },
  });
  // Sticky Survey results-read denial markers must never be garbage-collected
  // while the payloads they protect stay cached; see registerSurveyQueryDefaults.
  registerSurveyQueryDefaults(queryClient);
  return queryClient;
}
