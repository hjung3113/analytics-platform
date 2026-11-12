import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadMenuDeclarationSetup, type MenuDeclarationConfig } from '../menu-declarations.js';
import type { ConnectorFactories } from '../modules/menu-dispatch/connectors/types.js';
import { DeclarationBundleError } from '../modules/menu-dispatch/declarations-file.js';
import { declaredContribution } from '../modules/menu-dispatch/declared-endpoints.js';
import type { DeclarationBundle } from '../modules/menu-dispatch/declarations-file.js';
import type { MenuForwarder } from '../modules/menu-dispatch/forwarder.js';
import { routedBundle } from '../modules/menu-dispatch/__tests__/bundle-fixtures.js';
import type { CheckService } from '../modules/permissions/check-service.js';

const checkService = {} as CheckService;
let dir: string;
let secretFile: string;
let serial = 0;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'boot-routing-'));
  secretFile = join(dir, 'secret');
  await writeFile(secretFile, 'secret-content-never-in-errors');
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
function config(over: Partial<MenuDeclarationConfig> = {}): MenuDeclarationConfig {
  return {
    MENU_DECLARATIONS_FILE: undefined, MENU_UPSTREAM_BASE_URL: undefined, MENU_IDENTITY_KEY_FILE: undefined, MENU_IDENTITY_KEY_ID: undefined,
    MENU_SCOPE_GRANT_SERVICE_URL: undefined, MENU_RESOLVER_TIMEOUT_MS: 3000, MENU_UPSTREAM_TIMEOUT_MS: 27000, ...over,
  };
}
async function setup(bundle: unknown, over: Partial<MenuDeclarationConfig> = {}, connectorFactories?: ConnectorFactories) {
  const file = join(dir, `${serial++}.json`);
  await writeFile(file, JSON.stringify(bundle));
  return loadMenuDeclarationSetup(config({ MENU_DECLARATIONS_FILE: file, ...over }), { checkService, ...(connectorFactories ? { connectorFactories } : {}) });
}
const emptyBundle = () => ({ endpoints: [], actions: [], permissions: [], endpointOwners: {} });
const routed = () => ({ ...routedBundle(), targets: { 'tgt-1': { ...routedBundle().targets['tgt-1'], connectionFile: secretFile } } });
const legacy = () => ({ ...emptyBundle(), endpoints: [{ id: 'syn.rows', menuId: 'syn', permission: 'platform:view', paramKeys: [], requiresScope: false, context: {}, mergeTimeDomain: false }], endpointOwners: { 'syn.rows': '/rows' } });

async function problems(promise: Promise<unknown>) {
  try { await promise; throw new Error('setup accepted'); } catch (error) {
    expect(error).toBeInstanceOf(DeclarationBundleError);
    expect((error as Error).message).not.toContain('secret-content-never-in-errors');
    return (error as DeclarationBundleError).problems;
  }
}

describe('declaration boot gates (ADR-0153 a1)', () => {
  it('accepts an empty bundle without envelope-only environment', async () => {
    expect(await setup(emptyBundle())).toEqual({ menuDispatch: [{ permissions: [], endpoints: [] }] });
  });
  it('refuses SQL without a connector factory, without requiring envelope env', async () => {
    expect(await problems(setup(routed(), {}, {}))).toEqual(['connector kind sql is not available']);
  });
  it('checks the bundle before connector availability checks or any secret reads', async () => {
    const bundle = routed();
    bundle.targets['tgt-1'].connectionFile = join(dir, 'not-read.secret');
    bundle.endpointOwners['syn.rows'].routes[0] = { sites: ['SITE-A'], rooms: ['RA1'], targets: ['absent'] };
    expect(await problems(setup(bundle))).toContain('endpoint syn.rows: route 0: unknown target id absent');
  });
  it('guards programmatic routed contributions as well as file loading', () => {
    expect(() => declaredContribution({ bundle: routed() as unknown as DeclarationBundle, forwarder: {} as MenuForwarder, checkService, connectorFactories: {} }))
      .toThrow('connector kind sql is not available');
  });
  it.each(['MENU_UPSTREAM_BASE_URL', 'MENU_IDENTITY_KEY_FILE', 'MENU_IDENTITY_KEY_ID'] as const)('requires %s for a string owner', async (missing) => {
    const env = { MENU_UPSTREAM_BASE_URL: 'https://upstream.test', MENU_IDENTITY_KEY_FILE: secretFile, MENU_IDENTITY_KEY_ID: 'syn-key', [missing]: undefined };
    expect(await problems(setup(legacy(), env))).toContain(`${missing} is required when the bundle has an envelope destination`);
  });
  it('requires envelope environment for a routed envelope call', async () => {
    const bundle = routedBundle();
    const value = { ...bundle, endpoints: bundle.endpoints.map(({ limits: _limits, ...row }) => row), targets: { 'tgt-1': { kind: 'http', baseUrl: 'https://target.test' } }, endpointOwners: { 'syn.rows': { routes: [{ sites: ['SITE-A'], targets: ['tgt-1'] }], call: { mode: 'envelope' } } } };
    expect(await problems(setup(value))).toEqual([
      'MENU_UPSTREAM_BASE_URL is required when the bundle has an envelope destination',
      'MENU_IDENTITY_KEY_FILE is required when the bundle has an envelope destination',
      'MENU_IDENTITY_KEY_ID is required when the bundle has an envelope destination',
    ]);
  });
  it.each(['sql', 'http'] as const)('reads %s target secrets at boot and returns opaque values only', async (kind) => {
    const target = kind === 'sql' ? { kind, dialect: 'postgres', connectionFile: secretFile } : { kind, baseUrl: 'https://target.test', headers: { authorization: { file: secretFile } } };
    const result = await setup({ ...emptyBundle(), targets: { 'tgt-1': target } });
    expect(result?.menuDispatch).toEqual([{ permissions: [], endpoints: [] }]);
    expect(JSON.stringify(result)).not.toContain('secret-content-never-in-errors');
    const secrets = result?.targetSecrets?.['tgt-1'];
    if (!secrets) throw new Error('target secrets missing');
    expect(secrets.kind).toBe(kind);
    expect(secrets.kind === 'sql' ? secrets.connection.reveal() : secrets.headers.authorization?.reveal()).toBe('secret-content-never-in-errors');
  });
  it.each(['sql', 'http'] as const)('fails closed on unreadable %s target secret, naming only its path', async (kind) => {
    const path = join(dir, 'absent.secret');
    const target = kind === 'sql' ? { kind, dialect: 'mssql', connectionFile: path } : { kind, baseUrl: 'https://target.test', headers: { authorization: { file: path } } };
    expect(await problems(setup({ ...emptyBundle(), targets: { 'tgt-1': target } }))).toEqual([`target secret file at ${path} cannot be read or is empty`]);
  });
  it('fails closed on an empty target secret', async () => {
    const path = join(dir, 'empty.secret');
    await writeFile(path, '  \n');
    expect(await problems(setup({ ...emptyBundle(), targets: { 'tgt-1': { kind: 'sql', dialect: 'postgres', connectionFile: path } } }))).toEqual([`target secret file at ${path} cannot be read or is empty`]);
  });

});

it('keeps the configured ScopeResolver available without an envelope destination', async () => {
  const result = await setup(emptyBundle(), { MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test' });
  expect(result?.scopeResolver).toBeDefined();
});

// Boot refusals must agree before either assembly path reaches connectors or secrets.
it.each(['file', 'programmatic'] as const)('refuses unstable core paging at boot through %s assembly', async (assembly) => {
  for (const targets of [['tgt-1'], ['tgt-1', 'tgt-2']]) {
    for (const sort of [undefined, [{ field: 'id', direction: 'asc' }]]) {
      const base = routed();
      const value = {
        ...base,
        endpoints: base.endpoints.map(({ limits: _limits, ...row }) => ({ ...row, paramKeys: ['q', 'page', 'pageSize'] })),
        targets: { ...base.targets, 'tgt-2': base.targets['tgt-1'] },
        endpointOwners: { 'syn.rows': { ...base.endpointOwners['syn.rows'], routes: [{ sites: ['SITE-A'], rooms: ['RA1'], targets }], merge: { maxWindow: 100, ...(sort ? { sort } : {}) } } },
      };
      const boot = assembly === 'file' ? setup(value) : Promise.resolve().then(() => declaredContribution({ bundle: value as unknown as DeclarationBundle, checkService }));
      expect(await problems(boot)).toEqual([sort ? 'endpoint syn.rows: merge.sort last field must declare unique: true' : 'endpoint syn.rows: paged core-answered endpoint needs merge.sort with a unique final field']);
    }
  }
});
it.each(['file', 'programmatic'] as const)('refuses duplicate kinds at boot through %s assembly', async (assembly) => {
  const base = routed();
  const value = {
    ...base,
    endpoints: base.endpoints.map((row) => ({ ...row, kinds: ['coverage', 'coverage', 'collection'] })),
    endpointOwners: { 'syn.rows': { ...base.endpointOwners['syn.rows'], merge: { partial: 'coverage' } } },
  };
  const boot = assembly === 'file' ? setup(value) : Promise.resolve().then(() => declaredContribution({ bundle: value as unknown as DeclarationBundle, checkService }));
  expect(await problems(boot)).toEqual(['endpoint syn.rows: kinds must not contain duplicates']);
});
