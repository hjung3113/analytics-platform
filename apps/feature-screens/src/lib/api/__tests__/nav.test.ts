// #761 node r — fetchNavCounts goes through client.ts (bridge-safe) and keeps the standalone error classes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient } from '../client';
import { fetchNavCounts } from '../nav';
import { UnauthenticatedError } from '../unauthenticated';

const originalFetch = global.fetch;
const onUnauthorized = vi.fn();
beforeEach(() => configureApiClient({ basePath: '/api/features', onUnauthorized }));
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

describe('fetchNavCounts with a base path', () => {
  it('requests the prefixed URL with the scope id and credentials included', async () => {
    const body = { counts: { 'voc.inbox': 3 } };
    const fetchMock = stub(new Response(JSON.stringify(body), { status: 200 }));
    await expect(fetchNavCounts({ managedSystemId: 'ms1' })).resolves.toEqual(body);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/features/nav/counts?managed_system_id=ms1');
    expect(init.credentials).toBe('include');
  });

  it('calls onUnauthorized on 401 and rejects with UnauthenticatedError', async () => {
    stub(
      new Response(JSON.stringify({ code: 'auth.unauthenticated', message: 'no' }), {
        status: 401,
      }),
    );
    await expect(fetchNavCounts()).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('maps a non-JSON 401 body to UnauthenticatedError and calls onUnauthorized once', async () => {
    stub(new Response('Unauthorized', { status: 401 }));
    await expect(fetchNavCounts()).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('maps a non-JSON 500 body to the legacy Error message', async () => {
    stub(new Response('<html>Bad gateway</html>', { status: 500 }));
    const error = await fetchNavCounts().catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(UnauthenticatedError);
    expect(error).not.toBeInstanceOf(SyntaxError);
    expect((error as Error).message).toBe('/nav/counts failed: 500');
  });

  it('rejects other failures with the legacy Error message', async () => {
    stub(new Response(JSON.stringify({ code: 'internal', message: 'x' }), { status: 500 }));
    const error = await fetchNavCounts().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnauthenticatedError);
    expect((error as Error).message).toBe('/nav/counts failed: 500');
  });
});
