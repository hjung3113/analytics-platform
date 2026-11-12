import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { defined } from '../../../test-support/defined.js';
import { ACTOR, COOKIE, WORKSPACE, stubCheckService, stubSessionService, transportApp } from '../../../test-support/platform-route-stubs.js';
import { declaredContribution } from '../declared-endpoints.js';
import { DeclarationBundleError, loadDeclarationBundle, type DeclarationBundle } from '../declarations-file.js';
import { createMenuForwarder } from '../forwarder.js';
import { createIdentityTokenSigner } from '../identity-token.js';
import { createMenuDispatchRegistry } from '../registry.js';
import { menuQueryDispatchRoutes } from '../routes.js';
import type { ScopeResolver } from '../scope-resolver.js';

const fixture = fileURLToPath(new URL('./fixtures/declaration-bundle.json', import.meta.url));
const { privateKey } = generateKeyPairSync('ed25519');
const signer = createIdentityTokenSigner({
  privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  keyId: 'declared-test',
});
const ASSESSMENT = {
  kind: 'collection', state: 'confirmed', statusSource: 'owner', observedAt: '2026-11-12T00:00:00Z',
  reason: 'check_failed', explainsEmpty: false, detail: 'owner assessment',
} as const;
const TRUST = {
  updatedAt: '2026-11-12T00:00:00Z', dataThrough: null, coverage: 0, metricVersion: 'v1',
  sourceLogicVersions: ['owner-v1'], provisional: false, source: 'owner',
};
/** The owner's complete wire envelope (the forwarder validates it strictly); its correlation id echoes the forwarded one. */
const envelope = { outcome: 'ok', data: [{ id: 'row-1' }], assessments: [ASSESSMENT], trust: TRUST, message: 'owner answer' };
const actor = { actor_id: ACTOR, workspace_id: WORKSPACE, role_level: 'admin' };
const resolver: ScopeResolver = { resolve: async () => [{ site: 'synthetic', rooms: ['r1'] }] };

function assemble(bundle: DeclarationBundle, allowed = true) {
  const fetch = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => ({ ok: true, status: 200, json: async () => ({ ...envelope, correlationId: init.headers['x-correlation-id'] }) }));
  const forwarder = createMenuForwarder({ baseUrl: 'http://synthetic.test', timeoutMs: 5000, signer, fetch });
  const checkService = stubCheckService(allowed);
  const check = vi.spyOn(checkService, 'checkCapability');
  return { contribution: declaredContribution({ bundle, forwarder, checkService }), fetch, check };
}

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

async function query(bundle: DeclarationBundle, allowed = true, scopeResolver = resolver, params: unknown = { q: { arbitrary: [1, null] } }) {
  const assembled = assemble(bundle, allowed);
  const registry = createMenuDispatchRegistry([assembled.contribution], { scopeResolver });
  app = await transportApp(async (instance) => {
    await instance.register(menuQueryDispatchRoutes, {
      sessionService: stubSessionService(), workspaceId: WORKSPACE, registry, sessionVersionOf: async () => 'sv-1',
    });
  }, null);
  const response = await app.inject({
    method: 'POST', url: '/', headers: COOKIE,
    payload: { endpoint: 'synthetic.rows', context: bundle.endpoints[0]?.requiresScope ? { scopeId: 'synthetic' } : {}, params },
  });
  return { ...assembled, response };
}

async function scopedBundle(): Promise<DeclarationBundle> {
  const bundle = await loadDeclarationBundle(fixture);
  return { ...bundle, endpoints: bundle.endpoints.map((row) => ({ ...row, requiresScope: true })) };
}

describe('declared endpoint contribution (1729g)', () => {
  it('forwards a permitted query to its owner and preserves the upstream envelope', async () => {
    const { response, fetch, check, contribution } = await query(await loadDeclarationBundle(fixture));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...envelope, correlationId: expect.any(String) });
    expect(contribution.permissions).toEqual([{ permission: 'synthetic:view', capability: 'workspace.read' }]);
    expect(check).toHaveBeenCalledWith(actor, 'workspace.read', { workspace_id: WORKSPACE }, {});
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]).toEqual([
      'http://synthetic.test/upstream/synthetic/rows',
      expect.objectContaining({ body: JSON.stringify({ endpoint: 'synthetic.rows', context: {}, params: { q: { arbitrary: [1, null] } } }) }),
    ]);
  });

  it('denies an actor without the declared capability before calling upstream', async () => {
    const { response, fetch, check } = await query(await loadDeclarationBundle(fixture), false);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ outcome: 'forbidden', data: null });
    expect(check).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses kernel permission rules as well as declared permission rows', async () => {
    const bundle = await loadDeclarationBundle(fixture);
    const kernel = { ...bundle, endpoints: bundle.endpoints.map((row) => ({ ...row, permission: 'console:access' })) };
    const { response, fetch } = await query(kernel, false);
    expect(response.json()).toMatchObject({ outcome: 'forbidden' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires a Scope resolver at registry build', async () => {
    const { contribution } = assemble(await scopedBundle());
    expect(() => createMenuDispatchRegistry([contribution])).toThrow(/no Scope resolver/);
  });

  it('denies an empty Scope grant before calling upstream', async () => {
    const { response, fetch } = await query(await scopedBundle(), true, { resolve: async () => [] });
    expect(response.json()).toMatchObject({ outcome: 'forbidden' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards a scoped query when its grant covers the requested site', async () => {
    const { response, fetch } = await query(await scopedBundle());
    expect(response.json()).toMatchObject(envelope);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([null, [], 'value', { undeclared: 1 }])('refuses malformed params or undeclared keys: %j', async (params) => {
    const { response, fetch } = await query(await loadDeclarationBundle(fixture), true, resolver, params);
    expect(response.json()).toMatchObject({ outcome: 'error' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('leaves optional parameter values to the owner', async () => {
    const { response, fetch } = await query(await loadDeclarationBundle(fixture), true, resolver, {});
    expect(response.json()).toMatchObject(envelope);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing owner', (bundle: DeclarationBundle) => ({ ...bundle, endpointOwners: {} }), /no owner-table row/],
    ['orphan owner', (bundle: DeclarationBundle) => ({ ...bundle, endpointOwners: { ...bundle.endpointOwners, orphan: '/orphan' } }), /not declared/],
    ['duplicate endpoint', (bundle: DeclarationBundle) => ({ ...bundle, endpoints: [...bundle.endpoints, ...bundle.endpoints] }), /declared 2 times/],
    ['unknown permission', (bundle: DeclarationBundle) => ({ ...bundle, endpoints: bundle.endpoints.map((row) => ({ ...row, permission: 'unknown:view' })) }), /neither declared.*nor a kernel permission/],
    ['actions', (bundle: DeclarationBundle) => ({ ...bundle, actions: [{ id: 'synthetic.write', menuId: 'synthetic', inputKeys: [], permission: 'synthetic:view', requiresScope: false, concurrency: 'none' as const, invalidates: [] }] }), /actions.*menu-query only/],
  ] as const)('fails closed at assembly: %s', async (_label, change, message) => {
    const bundle = change(await loadDeclarationBundle(fixture));
    expect(() => assemble(bundle)).toThrow(DeclarationBundleError);
    expect(() => assemble(bundle)).toThrow(message);
  });

  it('leaves collisions with existing contribution ids to the real registry', async () => {
    const { contribution } = assemble(await loadDeclarationBundle(fixture));
    const endpoint = defined(contribution.endpoints?.[0]);
    expect(() => createMenuDispatchRegistry([{ endpoints: [endpoint] }, contribution])).toThrow(/synthetic.rows: registered twice/);
  });
});
