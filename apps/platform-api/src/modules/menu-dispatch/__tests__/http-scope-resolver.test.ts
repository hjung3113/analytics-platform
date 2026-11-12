import { describe, expect, it, vi } from 'vitest';

import { createHttpScopeResolver, type ScopeResolverFetch } from '../http-scope-resolver.js';

const actor = { actor_id: 'alice', workspace_id: 'w1' };
const grants = [{ site: 'site-a', rooms: ['PHOTO', 'ETCH'] }];
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async (): Promise<unknown> => body,
});
const create = (fetch: ScopeResolverFetch, baseUrl = 'https://grants.example/internal/') =>
  createHttpScopeResolver({ baseUrl, timeoutMs: 20, fetch });

describe('HTTP Scope resolver', () => {
  it.each(['https://grants.example/internal', 'https://grants.example/internal/'])(
    'posts actor and workspace under base URL %s and parses grants', async (baseUrl) => {
      const fetch = vi.fn<ScopeResolverFetch>().mockResolvedValue(response(grants));
      await expect(create(fetch, baseUrl).resolve(actor)).resolves.toEqual(grants);
      expect(fetch).toHaveBeenCalledWith('https://grants.example/internal/scopes/resolve', {
        method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actor), signal: expect.any(AbortSignal),
      });
    },
  );

  it('preserves an empty grant set for the caller to deny', async () => {
    await expect(create(async () => response([])).resolve(actor)).resolves.toEqual([]);
  });

  it.each([302, 401, 500])('rejects status %s without reading upstream body', async (status) => {
    const json = vi.fn().mockRejectedValue(new Error('private upstream body'));
    await expect(create(async () => ({ ok: false, status, json })).resolve(actor))
      .rejects.toThrow('Scope resolution failed');
    expect(json).not.toHaveBeenCalled();
  });

  it.each([null, {}, { grants }, [{ site: 'a' }], [{ site: '', rooms: [] }],
    [{ site: 'a', rooms: [1] }], [{ site: 'a', rooms: [''] }]])(
    'rejects malformed grants %j', async (body) => {
      await expect(create(async () => response(body)).resolve(actor))
        .rejects.toThrow('Scope resolution failed');
    },
  );

  it.each(['network', 'json'])('sanitizes %s errors', async (phase) => {
    const fetch: ScopeResolverFetch = async () => {
      if (phase === 'network') throw new Error('private upstream body');
      return { ok: true, status: 200, json: async () => { throw new Error('private upstream body'); } };
    };
    await expect(create(fetch).resolve(actor)).rejects.toThrow(/^Scope resolution failed$/);
  });

  it('aborts transport on timeout', async () => {
    const fetch: ScopeResolverFetch = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('private timeout')), { once: true });
    });
    await expect(create(fetch).resolve(actor)).rejects.toThrow(/^Scope resolution failed$/);
  });

  it('propagates caller cancellation and refuses an already aborted request', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<ScopeResolverFetch>(async (_url, init) => {
      controller.abort();
      expect(init.signal?.aborted).toBe(true);
      throw new Error('private abort');
    });
    await expect(create(fetch).resolve(actor, controller.signal)).rejects.toThrow('Scope resolution failed');
    fetch.mockClear();
    await expect(create(fetch).resolve(actor, controller.signal)).rejects.toThrow('Scope resolution failed');
    expect(fetch).not.toHaveBeenCalled();
  });
});
