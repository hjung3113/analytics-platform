import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadMenuDeclarationSetup, type MenuDeclarationConfig } from '../menu-declarations.js';
import type { ConnectorFactories } from '../modules/menu-dispatch/connectors/types.js';
import type { CheckService } from '../modules/permissions/check-service.js';
import { routedBundle } from '../modules/menu-dispatch/__tests__/bundle-fixtures.js';

let dir: string;
let serial = 0;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'syn-runtime-boot-')); await writeFile(join(dir, 'secret'), 'syn-secret'); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
const factories: ConnectorFactories = { sql: () => ({ async *query() { yield { room: 'RA1' }; } }) };
async function setup(over: Record<string, unknown> = {}, deps: { connectorFactories?: ConnectorFactories; scopeCatalog?: Readonly<Record<string, readonly string[]>> } = { connectorFactories: factories }) {
  const base = routedBundle();
  const bundle = { ...base, targets: { 'tgt-1': { ...base.targets['tgt-1'], connectionFile: join(dir, 'secret') }, 'tgt-2': { ...base.targets['tgt-1'], connectionFile: join(dir, 'secret') } }, ...over };
  const file = join(dir, `${serial++}.json`); await writeFile(file, JSON.stringify(bundle));
  const config: MenuDeclarationConfig = { MENU_DECLARATIONS_FILE: file, MENU_UPSTREAM_BASE_URL: undefined, MENU_IDENTITY_KEY_FILE: undefined, MENU_IDENTITY_KEY_ID: undefined, MENU_SCOPE_GRANT_SERVICE_URL: undefined, MENU_RESOLVER_TIMEOUT_MS: 3000, MENU_UPSTREAM_TIMEOUT_MS: 27000 };
  return loadMenuDeclarationSetup(config, { checkService: {} as CheckService, ...deps });
}
it('serves validated single-target routing with an injected factory', async () => {
  expect((await setup())?.menuDispatch[0]?.endpoints?.[0]?.spec.limits).toEqual({ maxRows: 100 });
});
it('refuses a missing connector with its exact boot message', async () => {
  await expect(setup({}, {})).rejects.toMatchObject({ problems: ['connector kind sql is not available'] });
});
it('retains the d1 boot gate for multi-target routes', async () => {
  const owner = routedBundle().endpointOwners['syn.rows'];
  await expect(setup({ endpointOwners: { 'syn.rows': { ...owner, routes: [{ sites: ['SITE-A'], rooms: ['RA1'], targets: ['tgt-1', 'tgt-2'] }] } } })).rejects.toMatchObject({ problems: ['fan-out merge is not available yet (ADR-0153 node 1839d1)'] });
});
it.each(['partial', 'paged'])('retains the d2 boot gate for %s', async (variant) => {
  const base = routedBundle();
  const endpoint = base.endpoints[0];
  await expect(setup(variant === 'partial' ? { endpointOwners: { 'syn.rows': { ...base.endpointOwners['syn.rows'], merge: { partial: 'coverage' } } } } : {
    endpoints: [{ ...endpoint, limits: undefined, paramKeys: ['q', 'page', 'pageSize'] }], endpointOwners: { 'syn.rows': { ...base.endpointOwners['syn.rows'], merge: { maxWindow: 100 } } },
  })).rejects.toMatchObject({ problems: ['fan-out merge is not available yet (ADR-0153 node 1839d2)'] });
});
it('checks every catalog room of a split site when provided', async () => {
  await expect(setup({}, { connectorFactories: factories, scopeCatalog: { 'SITE-A': ['RA1', 'RA2'] } })).rejects.toMatchObject({ problems: ['endpoint syn.rows: site SITE-A: room RA2 is not covered by a route'] });
  await expect(setup({}, { connectorFactories: factories, scopeCatalog: { 'SITE-A': ['RA1'] } })).resolves.toBeDefined();
});
it('skips catalog coverage when absent or explicitly skipped', async () => {
  await expect(setup()).resolves.toBeDefined();
  await expect(setup({ endpointOwners: { 'syn.rows': { ...routedBundle().endpointOwners['syn.rows'], unroutedRooms: 'skip' } } }, { connectorFactories: factories, scopeCatalog: { 'SITE-A': ['RA2'] } })).resolves.toBeDefined();
});
