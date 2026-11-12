import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../db/client.js';
import { routedBundle } from '../modules/menu-dispatch/__tests__/bundle-fixtures.js';
import { loadMenuDeclarationSetup, type MenuDeclarationConfig } from '../menu-declarations.js';
import { DeclarationBundleError, loadDeclarationBundle } from '../modules/menu-dispatch/declarations-file.js';
import type { CheckService } from '../modules/permissions/check-service.js';
import { withMenuSnapshotFile } from '../test-support/menu-snapshot.js';

const empty = { endpoints: [], actions: [], permissions: [], endpointOwners: {} };
const catalog = [{ site: 'SITE-A', label: 'A', rooms: ['RA1'] }];
const handle = createDb('postgres://unused:unused@localhost:1/unused');
let dir: string;
let serial = 0;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'scope-bundle-')); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); await handle.close(); });
async function file(scopeCatalog: unknown) {
  const path = join(dir, `${serial++}.json`);
  await writeFile(path, JSON.stringify({ ...empty, scopeCatalog }));
  return path;
}
const config = (path: string): MenuDeclarationConfig => ({
  MENU_DECLARATIONS_FILE: path, MENU_UPSTREAM_BASE_URL: undefined,
  MENU_IDENTITY_KEY_FILE: undefined, MENU_IDENTITY_KEY_ID: undefined,
  MENU_SCOPE_GRANT_SERVICE_URL: undefined, MENU_RESOLVER_TIMEOUT_MS: 3000, MENU_UPSTREAM_TIMEOUT_MS: 27000,
});
describe('Scope catalog declaration boundary', () => {
  it('loads the parsed catalog in deployment order', async () => {
    const bundle = await loadDeclarationBundle(await file(catalog));
    expect(bundle.scopeCatalog?.sites).toEqual(catalog);
  });
  it.each([
    [{ site: '', label: 'A', rooms: ['RA1'] }],
    [{ site: 'SITE-A', label: 'A', rooms: [] }],
    [{ site: 'SITE-A', label: 'A', rooms: [''] }],
    [...catalog, ...catalog],
    [{ ...catalog[0], rooms: ['RA1', 'RA1'] }],
  ])('refuses invalid catalog %j as DeclarationBundleError', async (...entries) => {
    await expect(loadDeclarationBundle(await file(entries))).rejects.toBeInstanceOf(DeclarationBundleError);
  });
  it('selects the grant-table source for a catalog-only bundle', async () => {
    const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(config(await file(catalog))), { checkService: {} as CheckService, db: handle.db, connectorFactories: { sql: () => ({ async *query() { yield { room: 'RA1' }; } }) } });
    expect(setup?.scopeResolver).toBeDefined();
    expect(setup?.scopeCatalog?.sites).toEqual(catalog);
  });
  it('selects the HTTP source without a catalog', async () => {
    const cfg = { ...config(await file(undefined)), MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test' };
    const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(cfg), { checkService: {} as CheckService,
      fetch: async () => new Response(JSON.stringify([{ site: 'SITE-A', rooms: ['RA1'] }])) });
    expect(setup?.scopeCatalog).toBeUndefined();
    expect(await setup?.scopeResolver?.resolve({ actor_id: 'synthetic', workspace_id: 'synthetic' })).toEqual([{ site: 'SITE-A', rooms: ['RA1'] }]);
  });
  it('checks split-route coverage against the bundle catalog', async () => {
    const secret = join(dir, 'connection');
    await writeFile(secret, 'synthetic-connection');
    const path = join(dir, 'routed.json');
    const base = routedBundle();
    await writeFile(path, JSON.stringify({ ...base,
      targets: { 'tgt-1': { ...base.targets['tgt-1'], connectionFile: secret } },
      scopeCatalog: [{ site: 'SITE-A', label: 'A', rooms: ['RA1', 'RA2'] }],
    }));
    await expect(loadMenuDeclarationSetup(withMenuSnapshotFile(config(path)), { checkService: {} as CheckService, db: handle.db, connectorFactories: { sql: () => ({ async *query() { yield { room: 'RA1' }; } }) } })).rejects.toThrow('room RA2 is not covered by a route');
    await writeFile(path, JSON.stringify({ ...base,
      targets: { 'tgt-1': { ...base.targets['tgt-1'], connectionFile: secret } }, scopeCatalog: catalog,
    }));
    expect((await loadMenuDeclarationSetup(withMenuSnapshotFile(config(path)), { checkService: {} as CheckService, db: handle.db, connectorFactories: { sql: () => ({ async *query() { yield { room: 'RA1' }; } }) } }))?.scopeCatalog?.sites).toEqual(catalog);
  });
  it('refuses both sources and names only the configuration keys', async () => {
    const cfg = { ...config(await file(catalog)), MENU_SCOPE_GRANT_SERVICE_URL: 'https://private-service.test' };
    const failure = loadMenuDeclarationSetup(withMenuSnapshotFile(cfg), { checkService: {} as CheckService });
    await expect(failure).rejects.toThrow(/scopeCatalog.*MENU_SCOPE_GRANT_SERVICE_URL/);
    await expect(failure).rejects.not.toThrow('private-service');
  });
});
