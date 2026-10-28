import { QueryClient } from '@tanstack/react-query';

import { registerSurveyQueryDefaults } from '@/features/surveys/policy/resultsReadDenial';
import { ApiError } from '@/lib/api/types';

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

export function createFeatureQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetryQuery } },
  });
  // Sticky Survey results-read denial markers must never be garbage-collected
  // while the payloads they protect stay cached; see registerSurveyQueryDefaults.
  registerSurveyQueryDefaults(queryClient);
  return queryClient;
}
