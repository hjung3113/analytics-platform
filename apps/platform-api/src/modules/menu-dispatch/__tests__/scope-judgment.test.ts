import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACTOR, COOKIE, WORKSPACE, stubSessionService, transportApp } from '../../../test-support/platform-route-stubs.js';
import { createHttpScopeResolver } from '../http-scope-resolver.js';
import { judgeQueryShape, runQuery } from '../query.js';
import { createMenuDispatchRegistry } from '../registry.js';
import { menuQueryDispatchRoutes } from '../routes.js';
import type { ScopeResolver } from '../scope-resolver.js';
import { testAction, testEndpoint } from './test-declarations.js';

const grants = [{ site: 'MEM', rooms: ['R1', 'R2'] }];
const actor = { actor_id: ACTOR, workspace_id: WORKSPACE, role_level: 'admin' };
const body = (scopeId: string | null = 'MEM', roomNames: string[] | null = ['R1']) => ({
  endpoint: 'test.rows', context: { scopeId, roomNames }, params: {},
});
let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

const cases = [
  ['no grants', async () => [], body(), 'forbidden'],
  ...[null, [], ['R1'], undefined].flatMap((rooms) =>
    [false, true].map((otherSite) => [
      `empty requested-site rooms (${String(rooms)}), other site ${otherSite}`,
      async () => [{ site: 'MEM', rooms: [] }, ...(otherSite ? [{ site: 'FDRY', rooms: ['R9'] }] : [])],
      { endpoint: 'test.rows', context: { scopeId: 'MEM', ...(rooms === undefined ? {} : { roomNames: rooms }) }, params: {} },
      'forbidden',
    ] as const)),
  ['throws', async () => { throw new Error('private resolver detail'); }, body(), 'forbidden'],
  ['timeout', createHttpScopeResolver({
    baseUrl: 'https://grants.example', timeoutMs: 5,
    fetch: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  }).resolve, body(), 'forbidden'],
  ['granted subset', async () => grants, body(), 'ok'],
  ['outside site', async () => grants, body('OTHER'), 'forbidden'],
  ['outside room', async () => grants, body('MEM', ['R3']), 'forbidden'],
  ['null scope', async () => grants, body(null), 'forbidden'],
] as const;

for (const mode of ['engine', 'route'] as const) {
  describe(`Scope judgment through ${mode}`, () => {
    it.each(cases)('%s', async (_name, resolve, payload, outcome) => {
      const resolver: ScopeResolver = { resolve: vi.fn(resolve) };
      const { declaration } = testEndpoint({ requiresScope: true, context: Object.hasOwn(payload.context, 'roomNames') ? { roomNames: 'apply' } : {} });
      const handle = vi.fn(async () => ({ outcome: 'ok' as const, data: [1] }));
      declaration.handle = handle;
      const registry = createMenuDispatchRegistry([{ endpoints: [declaration] }], { scopeResolver: resolver });
      if (mode === 'engine') {
        const shape = judgeQueryShape(payload, registry);
        expect(shape.ok).toBe(true);
        if (!shape.ok) throw new Error(shape.message);
        const signal = new AbortController().signal;
        expect(await runQuery(shape, actor, 'cid', signal)).toMatchObject({ outcome });
        expect(resolver.resolve).toHaveBeenCalledWith(actor, signal);
      } else {
        app = await transportApp(async (scoped) => {
          await scoped.register(menuQueryDispatchRoutes, {
            prefix: '/api/v1/menu-query', registry, sessionService: stubSessionService(), workspaceId: WORKSPACE,
          });
        }, null);
        const response = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: COOKIE, payload });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ outcome });
        expect(response.body).not.toContain('private');
        expect(resolver.resolve).toHaveBeenCalledWith(actor, expect.any(AbortSignal));
      }
      expect(resolver.resolve).toHaveBeenCalledTimes(1);
      expect(handle).toHaveBeenCalledTimes(outcome === 'ok' ? 1 : 0);
      if (outcome === 'ok') expect(handle).toHaveBeenCalledWith(expect.objectContaining({ scopes: grants }));
    });
  });
}

describe('Scope registry gate', () => {
  it.each(['endpoint', 'action'] as const)('requires a resolver for %s', (kind) => {
    const contribution = kind === 'endpoint'
      ? { endpoints: [testEndpoint({ requiresScope: true }).declaration] }
      : { actions: [testAction({ requiresScope: true }).declaration] };
    expect(() => createMenuDispatchRegistry([contribution])).toThrow('the server has no Scope resolver yet (#1087)');
    expect(() => createMenuDispatchRegistry([contribution], { scopeResolver: { resolve: async () => grants } })).not.toThrow();
  });
  it('keeps mergeTimeDomain refused even with a resolver', () => {
    expect(() => createMenuDispatchRegistry([{ endpoints: [testEndpoint({ mergeTimeDomain: true }).declaration] }], {
      scopeResolver: { resolve: async () => grants },
    })).toThrow('mergeTimeDomain is refused');
  });
});

describe('Scope request lifetime and ordering', () => {
  it('does not resolve grants before permission or for a scope-free endpoint', async () => {
    const resolver = { resolve: vi.fn(async () => grants) };
    for (const [requiresScope, allow] of [[true, false], [false, true]] as const) {
      const { declaration } = testEndpoint({ requiresScope, context: {} }, { allow });
      const handle = vi.fn(async () => ({ outcome: 'ok' as const, data: null }));
      declaration.handle = handle;
      const registry = createMenuDispatchRegistry([{ endpoints: [declaration] }], { scopeResolver: resolver });
      const shape = judgeQueryShape({ endpoint: 'test.rows', context: requiresScope ? { scopeId: 'MEM' } : {}, params: {} }, registry);
      if (!shape.ok) throw new Error(shape.message);
      expect(await runQuery(shape, actor, 'cid')).toMatchObject({ outcome: allow ? 'ok' : 'forbidden' });
      if (allow) expect(handle).toHaveBeenCalledWith(expect.objectContaining({ scopes: [] }));
    }
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('resolves each request so revoked grants deny the next read', async () => {
    const resolver = { resolve: vi.fn().mockResolvedValueOnce(grants).mockResolvedValueOnce([]) };
    const { declaration, calls } = testEndpoint({ requiresScope: true, context: { roomNames: 'apply' } });
    const registry = createMenuDispatchRegistry([{ endpoints: [declaration] }], { scopeResolver: resolver });
    const shape = judgeQueryShape(body(), registry);
    if (!shape.ok) throw new Error(shape.message);
    expect(await runQuery(shape, actor, 'cid1')).toMatchObject({ outcome: 'ok' });
    expect(await runQuery(shape, actor, 'cid2')).toMatchObject({ outcome: 'forbidden' });
    expect(resolver.resolve).toHaveBeenCalledTimes(2);
    expect(calls.handled).toBe(1);
  });
});
