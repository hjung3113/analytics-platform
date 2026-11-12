import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadMenuDeclarationSetup, type MenuDeclarationConfig } from '../menu-declarations.js';
import { DeclarationBundleError } from '../modules/menu-dispatch/declarations-file.js';
import { declaredContribution } from '../modules/menu-dispatch/declared-endpoints.js';
import { routedBundle } from '../modules/menu-dispatch/__tests__/bundle-fixtures.js';
import { createMenuDispatchRegistry } from '../modules/menu-dispatch/registry.js';
import { menuQueryDispatchRoutes } from '../modules/menu-dispatch/routes.js';
import type { ScopeResolver } from '../modules/menu-dispatch/scope-resolver.js';
import type { MenuDispatchContribution } from '../modules/menu-dispatch/types.js';
import { defined } from '../test-support/defined.js';
import { menuSnapshot } from '../test-support/menu-snapshot.js';
import { COOKIE, WORKSPACE, stubCheckService, stubSessionService, transportApp } from '../test-support/platform-route-stubs.js';

// #1900 node 1900b (ADR-0156): a bundle endpoint row may carry only `id` (plus deployment-owned `paramTypes`/`limits`);
// every menu-owned field it leaves out comes from the menu declaration snapshot, and a field it carries must equal the
// snapshot. Both assembly paths fill through one function. Synthetic identifiers only.

const { privateKey } = generateKeyPairSync('ed25519');
let dir: string;
let keyFile: string;
let secretFile: string;
let serial = 0;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'snapshot-fill-'));
  keyFile = join(dir, 'identity.pem');
  await writeFile(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
  secretFile = join(dir, 'secret');
  await writeFile(secretFile, 'secret-content-never-in-errors');
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

/** The menu side as the app build declares it: menu `fill` with two endpoints, both Scope-bound. */
const declarations = () => menuSnapshot({
  menus: [{ id: 'fill', permission: 'fill:view', requiresScope: true, context: { metric: 'apply' } }],
  permissions: ['fill:view'],
  endpoints: [
    { id: 'fill.rows', menuId: 'fill', paramKeys: ['q'], permission: 'fill:view', requiresScope: true, context: { metric: 'apply' }, kinds: [], mergeTimeDomain: false },
    { id: 'fill.totals', menuId: 'fill', paramKeys: [], permission: 'fill:view', requiresScope: true, context: {}, kinds: [], mergeTimeDomain: false },
  ],
  actions: [],
});
const fullRow = (id: string) => {
  const { limits: _limits, ...row } = defined(declarations().endpoints.find((endpoint) => endpoint.id === id));
  return row;
};
const envelopeBundle = (endpoints: Record<string, unknown>[]) => ({
  endpoints,
  actions: [],
  permissions: [{ permission: 'fill:view', capability: 'workspace.read' }],
  endpointOwners: Object.fromEntries(endpoints.map((row) => [row.id, `/upstream/${String(row.id).replace('.', '/')}`])),
});

const fetchStub = () => vi.fn(async (_url: string, init: { headers: Record<string, string> }) => ({
  ok: true, status: 200,
  json: async () => ({ outcome: 'ok', data: [], assessments: [], trust: null, correlationId: init.headers['x-correlation-id'] }),
}));

async function boot(bundle: unknown, { allowed = true, snapshot = declarations() as unknown } = {}) {
  const bundleFile = join(dir, `bundle-${serial}.json`);
  const snapshotFile = join(dir, `snapshot-${serial++}.json`);
  await writeFile(bundleFile, JSON.stringify(bundle));
  await writeFile(snapshotFile, JSON.stringify(snapshot));
  const fetch = fetchStub();
  const checkService = stubCheckService(allowed);
  const check = vi.spyOn(checkService, 'checkCapability');
  const config = {
    MENU_DECLARATIONS_FILE: bundleFile, MENU_DECLARATIONS_SNAPSHOT_FILE: snapshotFile,
    MENU_UPSTREAM_BASE_URL: 'http://synthetic.test', MENU_IDENTITY_KEY_FILE: keyFile, MENU_IDENTITY_KEY_ID: 'fill-test',
    MENU_SCOPE_GRANT_SERVICE_URL: undefined, MENU_RESOLVER_TIMEOUT_MS: 3000, MENU_UPSTREAM_TIMEOUT_MS: 27000,
  } as MenuDeclarationConfig;
  const setup = await loadMenuDeclarationSetup(config, { checkService, fetch: fetch as unknown as typeof globalThis.fetch, log: () => {} });
  return { contribution: defined(setup?.menuDispatch[0]), fetch, check };
}
async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (thrown: unknown) => thrown);
  expect(error).toBeInstanceOf(DeclarationBundleError);
  expect((error as Error).message).not.toContain('secret-content-never-in-errors');
  return (error as DeclarationBundleError).problems;
}
/** The data part of each assembled endpoint (functions dropped), by id. */
const specs = (contribution: MenuDispatchContribution) =>
  Object.fromEntries((contribution.endpoints ?? []).map((endpoint) => [endpoint.spec.id, endpoint.spec]));

const grant: ScopeResolver = { resolve: async () => [{ site: 'synthetic', rooms: ['r1'] }] };
async function query(contribution: MenuDispatchContribution, context: Record<string, unknown>, params: unknown = { q: 'x' }, scopeResolver = grant) {
  const registry = createMenuDispatchRegistry([contribution], { scopeResolver });
  app = await transportApp(async (instance) => {
    await instance.register(menuQueryDispatchRoutes, { sessionService: stubSessionService(), workspaceId: WORKSPACE, registry, sessionVersionOf: async () => 'sv-1' });
  }, null);
  const response = await app.inject({ method: 'POST', url: '/', headers: COOKIE, payload: { endpoint: 'fill.rows', context, params } });
  return response.json() as { outcome: string; message?: string };
}
const fullContext = { scopeId: 'synthetic', metricId: 'm-1', metricVersion: 'v1' };

describe('bundle endpoint rows filled from the menu declaration snapshot (#1900 node 1900b)', () => {
  it('an { id } row boots and assembles exactly like the full row', async () => {
    const short = await boot(envelopeBundle([{ id: 'fill.rows' }]));
    const full = await boot(envelopeBundle([fullRow('fill.rows')]));
    expect(specs(short.contribution)).toEqual(specs(full.contribution));
    expect(specs(short.contribution)['fill.rows']).toMatchObject({ menuId: 'fill', permission: 'fill:view', requiresScope: true, paramKeys: ['q'], context: { metric: 'apply' } });
  });

  it('enforces the filled permission, Scope, Context and paramKeys on a request', async () => {
    const permitted = await boot(envelopeBundle([{ id: 'fill.rows' }]));
    expect(await query(permitted.contribution, fullContext)).toMatchObject({ outcome: 'ok' });
    expect(permitted.check).toHaveBeenCalledWith(expect.anything(), 'workspace.read', { workspace_id: WORKSPACE }, {});
    expect(permitted.fetch).toHaveBeenCalledOnce();

    const denied = await boot(envelopeBundle([{ id: 'fill.rows' }]), { allowed: false });
    expect(await query(denied.contribution, fullContext)).toMatchObject({ outcome: 'forbidden' });
    expect(denied.fetch).not.toHaveBeenCalled();

    const scoped = await boot(envelopeBundle([{ id: 'fill.rows' }]));
    expect(await query(scoped.contribution, fullContext, { q: 'x' }, { resolve: async () => [] })).toMatchObject({ outcome: 'forbidden' });
    expect(await query(scoped.contribution, { metricId: 'm-1', metricVersion: 'v1' })).toMatchObject({ outcome: 'error', message: expect.stringMatching(/needs context scopeId/) });
    expect(await query(scoped.contribution, { scopeId: 'synthetic' })).toMatchObject({ outcome: 'error', message: expect.stringMatching(/needs context metricId/) });
    expect(await query(scoped.contribution, fullContext, { undeclared: 1 })).toMatchObject({ outcome: 'error' });
    expect(scoped.fetch).not.toHaveBeenCalled();
  });

  it('an { id, paramTypes } row keeps its deployment-owned fields and takes the rest from the snapshot', async () => {
    const { endpoints: [declared] } = routedBundle();
    const { limits: _limits, paramTypes: _paramTypes, ...menuOwned } = defined(declared);
    const snapshot = menuSnapshot({
      menus: [{ id: 'syn', permission: 'syn:view', requiresScope: true, context: { time: 'apply' } }],
      permissions: ['syn:view'],
      endpoints: [menuOwned as never],
      actions: [],
    });
    const bundle = { ...routedBundle(), endpoints: [{ id: 'syn.rows', paramTypes: { q: { type: 'string', maxLength: 20 } }, limits: { maxRows: 100 } }], targets: { 'tgt-1': { ...routedBundle().targets['tgt-1'], connectionFile: secretFile } } };
    const { contribution } = await boot(bundle, { snapshot });
    expect(specs(contribution)['syn.rows']).toMatchObject({
      menuId: 'syn', permission: 'syn:view', requiresScope: true, paramKeys: ['q'], context: { time: 'apply' }, kinds: ['coverage'],
      paramTypes: { q: { type: 'string', maxLength: 20 } }, limits: { maxRows: 100 },
    });
  });

  it('a mixed bundle (one full row, one { id } row) boots with both rows complete', async () => {
    const { contribution } = await boot(envelopeBundle([fullRow('fill.rows'), { id: 'fill.totals' }]));
    expect(specs(contribution)['fill.totals']).toMatchObject({ menuId: 'fill', permission: 'fill:view', requiresScope: true, paramKeys: [], context: {} });
    expect(specs(contribution)['fill.rows']).toMatchObject({ paramKeys: ['q'], context: { metric: 'apply' } });
  });

  it('refuses a partial row whose one carried field differs from the snapshot, with the 1900a problem line', async () => {
    const found = await refusal(boot(envelopeBundle([{ id: 'fill.rows', requiresScope: false }])));
    expect(found).toContain('endpoint fill.rows: requiresScope is false in the bundle, true in the menu declarations');
  });

  it('refuses an { id } row the snapshot does not have, naming the endpoint', async () => {
    const found = await refusal(boot(envelopeBundle([{ id: 'fill.rows' }, { id: 'fill.nope' }])));
    expect(found).toEqual(['endpoint fill.nope: not in the menu declarations']);
  });

  it('programmatic assembly fills identically (one shared function)', async () => {
    const { contribution: fromFile } = await boot(envelopeBundle([fullRow('fill.rows'), { id: 'fill.totals' }]));
    const forwarder = { forward: vi.fn() };
    const programmatic = (endpoints: Record<string, unknown>[]) => declaredContribution({
      bundle: envelopeBundle(endpoints) as never, snapshot: declarations(), forwarder: forwarder as never, checkService: stubCheckService(true),
    });
    expect(specs(programmatic([fullRow('fill.rows'), { id: 'fill.totals' }]))).toEqual(specs(fromFile));
    expect(() => programmatic([{ id: 'fill.nope' }])).toThrow(/endpoint fill\.nope: not in the menu declarations/);
    expect(() => programmatic([{ id: 'fill.rows', permission: 'platform:view' }])).toThrow(/endpoint fill\.rows: permission is platform:view in the bundle, fill:view in the menu declarations/);
  });
});
