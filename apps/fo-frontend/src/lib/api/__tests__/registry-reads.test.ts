// F4 — the Managed System / Analytics Area list reads go through client.ts, so they honour the platform bridge's `/api/fo` base path.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient } from '../client';
import { fetchAnalyticsAreas, fetchManagedSystems } from '../registry-reads';
import { ApiError } from '../types';

const originalFetch = global.fetch;
const onUnauthorized = vi.fn();
beforeEach(() => configureApiClient({ basePath: '/api/fo', onUnauthorized }));
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ basePath: '' });
  onUnauthorized.mockReset();
});

function stub(res: Response) {
  const fetchMock = vi.fn(async () => res);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe.each([
  [
    'fetchManagedSystems',
    () => fetchManagedSystems({ includeArchived: true }),
    '/api/fo/managed-systems?include_archived=true',
  ],
  [
    'fetchAnalyticsAreas',
    () => fetchAnalyticsAreas({ managedSystemId: 'ms-1', limit: 500 }),
    '/api/fo/analytics-areas?managed_system_id=ms-1&limit=500',
  ],
])('%s with a base path', (_name, call, url) => {
  it('requests the prefixed URL with credentials included', async () => {
    const fetchMock = stub(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }));
    await expect(call()).resolves.toEqual({ items: [], total: 0 });
    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('turns a 401 into an ApiError and signals the host', async () => {
    stub(
      new Response(JSON.stringify({ code: 'auth.unauthenticated', message: 'x' }), { status: 401 }),
    );
    const error = await call().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalled();
  });
});
