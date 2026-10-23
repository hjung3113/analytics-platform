// F5 — the requester's create and mine calls go through client.ts, so they honour the platform bridge's `/api/fo` base path.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient } from '../client';
import { createPermissionRequest, fetchPermissionRequestsMine } from '../permission-requests';
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

const CREATED = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  status: 'pending',
  created_at: '2026-10-24T00:00:00.000Z',
};

describe.each([
  [
    'createPermissionRequest',
    () =>
      createPermissionRequest(
        { requested_capability: 'workspace.read', reason: '조회가 필요합니다' },
        { idempotencyKey: '11111111-1111-4111-8111-111111111111' },
      ),
    'POST',
    '/api/fo/permission-requests',
    CREATED,
  ],
  [
    'fetchPermissionRequestsMine',
    () => fetchPermissionRequestsMine({ status: 'all' }),
    'GET',
    '/api/fo/permission-requests/mine?status=all',
    { requests: [] },
  ],
])('%s with a base path', (_name, call, method, url, okBody) => {
  it('requests the prefixed URL with credentials included', async () => {
    const fetchMock = stub(new Response(JSON.stringify(okBody), { status: 200 }));
    await expect(call()).resolves.toEqual(okBody);
    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method, credentials: 'include' }),
    );
  });

  it('turns a 401 into an ApiError and signals the host', async () => {
    stub(
      new Response(JSON.stringify({ code: 'auth.session_invalid', message: 'x' }), { status: 401 }),
    );
    const error = await call().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('keeps the server error code on a 409', async () => {
    stub(
      new Response(
        JSON.stringify({ code: 'conflict.permission_request_duplicate', message: 'x' }),
        {
          status: 409,
        },
      ),
    );
    const error = await call().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'conflict.permission_request_duplicate' });
  });
});

it('fetchPermissionRequestsMine without a status sends no query', async () => {
  const fetchMock = stub(new Response(JSON.stringify({ requests: [] }), { status: 200 }));
  await fetchPermissionRequestsMine();
  expect(fetchMock).toHaveBeenCalledWith('/api/fo/permission-requests/mine', expect.anything());
});
