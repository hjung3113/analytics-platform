import { ApiError } from '@/lib/api/types';
import { describe, expect, it } from 'vitest';
import { createFoQueryClient, shouldRetryQuery } from '../query-client';

describe('shouldRetryQuery', () => {
  it('does not retry permission-denied 403 responses', () => {
    expect(
      shouldRetryQuery(0, new ApiError(403, { code: 'permission.denied', message: 'denied' })),
    ).toBe(false);
  });

  it('retries a 500 response', () => {
    expect(
      shouldRetryQuery(0, new ApiError(500, { code: 'internal.unexpected', message: 'failed' })),
    ).toBe(true);
  });

  it('retries a 429 response but stops after three failures', () => {
    const rateLimited = new ApiError(429, { code: 'rate_limited.actor', message: 'slow down' });
    expect(shouldRetryQuery(2, rateLimited)).toBe(true);
    expect(shouldRetryQuery(3, rateLimited)).toBe(false);
  });
});

describe('createFoQueryClient', () => {
  it('applies the retry policy to every query by default', () => {
    expect(createFoQueryClient().getDefaultOptions().queries?.retry).toBe(shouldRetryQuery);
  });
});
