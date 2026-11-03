import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeatureReadError, fetchAllManagedSystems, fetchSpaceLinks, parseSpaceLinks } from './space-links';

const A = '4f1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const PLATFORM = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
const body = (over: Record<string, unknown> = {}) => ({ items: [{ space_id: 'mars', managed_system_id: A, declared: true }], platform_managed_system_id: PLATFORM, ...over });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const onSessionLost = vi.fn();
const api = { basePath: '/api/features', onSessionLost };

afterEach(() => { vi.unstubAllGlobals(); onSessionLost.mockReset(); });

describe('parseSpaceLinks (strict, like the server schema)', () => {
  it('reads links, disconnected ones included, and the 「플랫폼」 id', () => {
    expect(parseSpaceLinks(body({ items: [{ space_id: 'mars', managed_system_id: A, declared: false }] }))).toEqual({
      links: [{ spaceId: 'mars', managedSystemId: A, declared: false }], platformManagedSystemId: PLATFORM,
    });
  });
  it('accepts a null 「플랫폼」 id', () => {
    expect(parseSpaceLinks(body({ platform_managed_system_id: null })).platformManagedSystemId).toBeNull();
  });
  it.each([
    ['not an object', []],
    ['an unknown top-level key', body({ extra: 1 })],
    ['items missing', { platform_managed_system_id: null }],
    ['a non-uuid system id', body({ items: [{ space_id: 'mars', managed_system_id: 'x', declared: true }] })],
    ['an unknown item key', body({ items: [{ space_id: 'mars', managed_system_id: A, declared: true, scope: 'x' }] })],
    ['a non-boolean declared', body({ items: [{ space_id: 'mars', managed_system_id: A, declared: 'yes' }] })],
    ['an empty space id', body({ items: [{ space_id: '', managed_system_id: A, declared: true }] })],
    ['a non-uuid platform id', body({ platform_managed_system_id: 'x' })],
  ])('rejects %s', (_name, data) => {
    expect(() => parseSpaceLinks(data)).toThrow(FeatureReadError);
  });
});

describe('fetchSpaceLinks', () => {
  it('reads the route with the session cookie under the feature base path', async () => {
    const fetchMock = vi.fn(async () => json(body()));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchSpaceLinks(api);
    expect(result.platformManagedSystemId).toBe(PLATFORM);
    expect(fetchMock).toHaveBeenCalledWith('/api/features/managed-systems/space-links', expect.objectContaining({ method: 'GET', credentials: 'include' }));
  });
  it('a 401 asks the host to sign in again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ code: 'auth.unauthenticated', message: 'x' }, 401)));
    await expect(fetchSpaceLinks(api)).rejects.toMatchObject({ status: 401 });
    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });
  it.each([[500], [403]])('a %s is a failed read without a sign-in redirect', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ code: 'x', message: 'x' }, status)));
    await expect(fetchSpaceLinks(api)).rejects.toMatchObject({ status });
    expect(onSessionLost).not.toHaveBeenCalled();
  });
  it('a network failure is a failed read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(fetchSpaceLinks(api)).rejects.toMatchObject({ status: 0 });
  });
  it('a body that is not the contract is a failed read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ items: 'x' })));
    await expect(fetchSpaceLinks(api)).rejects.toBeInstanceOf(FeatureReadError);
  });
});

describe('fetchAllManagedSystems', () => {
  const system = (n: number, archived = false) => ({ id: `id-${n}`, slug: `s-${n}`, name: `System ${n}`, external_key: n % 2 ? `space:s-${n}` : null, archived_at: archived ? '2026-01-01T00:00:00Z' : null });

  it('walks every page by limit/offset until total, archived rows included', async () => {
    const all = [system(1), system(2, true), system(3), system(4), system(5)];
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      const url = new URL(String(input), 'http://x');
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      return json({ items: all.slice(offset, offset + limit), total: all.length });
    }));
    const rows = await fetchAllManagedSystems(api, undefined, 2);
    expect(rows.map((row) => row.id)).toEqual(['id-1', 'id-2', 'id-3', 'id-4', 'id-5']);
    expect(rows[1]).toMatchObject({ archived: true });
    expect(rows[0]).toMatchObject({ externalKey: 'space:s-1', archived: false });
    expect(urls).toEqual([
      '/api/features/managed-systems?include_archived=true&limit=2&offset=0',
      '/api/features/managed-systems?include_archived=true&limit=2&offset=2',
      '/api/features/managed-systems?include_archived=true&limit=2&offset=4',
    ]);
  });

  it('stops on an empty page even when total is still ahead', async () => {
    const pages = [{ items: [system(1)], total: 5 }, { items: [], total: 5 }];
    vi.stubGlobal('fetch', vi.fn(async () => json(pages.shift())));
    expect((await fetchAllManagedSystems(api, undefined, 1)).map((row) => row.id)).toEqual(['id-1']);
  });

  it('a failed page fails the whole read', async () => {
    const pages = [() => json({ items: [system(1)], total: 2 }), () => json({ code: 'x', message: 'x' }, 500)];
    vi.stubGlobal('fetch', vi.fn(async () => pages.shift()!()));
    await expect(fetchAllManagedSystems(api, undefined, 1)).rejects.toMatchObject({ status: 500 });
  });
});
