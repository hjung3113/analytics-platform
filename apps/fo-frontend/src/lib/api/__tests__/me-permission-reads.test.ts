// #759 c0 — the bridge-safe `/me`, scope and check reads go through client.ts (R1, R2) and import nothing the bridge
// graph bans (R4).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient } from '../client';
import {
  ME_QUERY_KEY,
  MeRequestError,
  fetchMeViaClient,
  meBridgeQueryOptions,
  parseMeResponse,
} from '../me';
import { fetchCapabilityScopeViaClient, fetchPermissionCheckViaClient } from '../permission-reads';
import { UnauthenticatedError } from '../unauthenticated';

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

const ME = {
  actor: { id: 'a', external_id: 'e', email: 'a@x.io', display_name: 'A', role_level: 'member' },
  workspace_id: 'w',
};

const READS = [
  ['fetchMeViaClient', () => fetchMeViaClient(), '/api/fo/me', ME],
  [
    'fetchCapabilityScopeViaClient',
    () => fetchCapabilityScopeViaClient('voc.read'),
    '/api/fo/me/permissions/scope?capability=voc.read',
    { scope: { kind: 'all' } },
  ],
  [
    'fetchPermissionCheckViaClient',
    () => fetchPermissionCheckViaClient('voc.read', { managedSystemId: 'ms1' }),
    '/api/fo/me/permissions/check?capability=voc.read&managed_system_id=ms1',
    { state: 'approved', decision: { allow: true } },
  ],
] as const;

describe.each(READS)('%s with a base path', (_name, call, url, okBody) => {
  it('requests the prefixed URL with credentials included', async () => {
    const fetchMock = stub(new Response(JSON.stringify(okBody), { status: 200 }));
    await expect(call()).resolves.toEqual(okBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(url);
    expect(init.credentials).toBe('include');
  });

  it('calls onUnauthorized on 401 and rejects with UnauthenticatedError', async () => {
    stub(
      new Response(JSON.stringify({ code: 'auth.unauthenticated', message: 'no' }), {
        status: 401,
      }),
    );
    await expect(call()).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe('/me retry (R2)', () => {
  it('maps 429 to MeRequestError carrying retry-after, which meBridgeQueryOptions retries', async () => {
    stub(
      new Response(JSON.stringify({ code: 'rate_limit.exceeded', message: 'slow' }), {
        status: 429,
        headers: { 'retry-after': '3' },
      }),
    );
    const error = await fetchMeViaClient().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MeRequestError);
    expect(error).toMatchObject({ status: 429, retryAfter: '3' });
    const { retry, retryDelay } = meBridgeQueryOptions();
    expect(retry(0, error)).toBe(true);
    expect(retry(2, error)).toBe(false);
    expect(retryDelay(0, error)).toBe(3000);
  });

  it('does not retry a 500', async () => {
    stub(
      new Response(JSON.stringify({ code: 'internal.unexpected', message: 'x' }), { status: 500 }),
    );
    const error = await fetchMeViaClient().catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'MeRequestError', status: 500 });
    expect(meBridgeQueryOptions().retry(0, error)).toBe(false);
  });

  it('shares the single [me] cache key with the standalone guards', () => {
    expect(meBridgeQueryOptions().queryKey).toBe(ME_QUERY_KEY);
    expect(JSON.stringify(meBridgeQueryOptions().queryKey)).toBe('["me"]');
  });

  it('rejects a malformed /me body', () => {
    expect(() => parseMeResponse({ actor: {}, workspace_id: 'w' })).toThrow('Malformed /me');
    expect(() => parseMeResponse({ ...ME, platform_return_origins: [1] })).toThrow('Malformed /me');
    expect(parseMeResponse({ ...ME, platform_return_origins: ['https://p'] })).toBeTruthy();
  });
});

describe('bridge-safe imports (R4)', () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const LIB = path.resolve(HERE, '..', '..');
  const FILES = [
    'api/me.ts',
    'api/permission-reads.ts',
    'cross-system/usePermissionCheckBridge.ts',
  ];
  const BANNED =
    /from\s+['"](?:@\/lib\/api|@\/lib\/api\/index|@\/lib\/auth(?:\/[^'"]*)?|@\/lib\/api\/auth|\.\/auth|\.\.\/auth|\.\.\/api|\.\/index|\.\.\/api\/auth)['"]/;

  it.each(FILES)(
    '%s imports neither lib/auth, lib/api/auth.ts nor the @/lib/api barrel',
    (file) => {
      const source = fs.readFileSync(path.join(LIB, file), 'utf8');
      expect(source).not.toMatch(BANNED);
      expect(source).not.toMatch(/\bfetch\(/);
    },
  );
});
