// Step 7 through the deployment bundle (#2544, ADR-0172): Site-wide `timeDomainAssertions` → setup → registry → query.
// Synthetic Site and domain ids only (#1700).

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadMenuDeclarationSetup, type MenuDeclarationConfig } from '../menu-declarations.js';
import { routedBundle } from '../modules/menu-dispatch/__tests__/bundle-fixtures.js';
import type { ConnectorFactories } from '../modules/menu-dispatch/connectors/types.js';
import { DeclarationBundleError, loadDeclarationBundle } from '../modules/menu-dispatch/declarations-file.js';
import { judgeQueryShape, runQuery } from '../modules/menu-dispatch/query.js';
import { MenuDispatchRegistrationError, createMenuDispatchRegistry } from '../modules/menu-dispatch/registry.js';
import type { CheckService } from '../modules/permissions/check-service.js';
import { withMenuSnapshotFile } from '../test-support/menu-snapshot.js';

const OPEN = '2099-01-01T00:00:00';
const FULL = '2020-01-01T00:00:00';
const CHANGE = '2026-09-20T00:00:00';
const row = (site: string, timeDomainId: string, validFrom = FULL, validTo = OPEN) => ({ site, timeDomainId, validFrom, validTo });

let dir: string;
let serial = 0;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'syn-time-domain-')); await writeFile(join(dir, 'secret'), 'syn-secret'); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

const factories: ConnectorFactories = { sql: () => ({ async *query() { yield { room: 'RA1' }; } }) };
const grants = [{ site: 'SITE-A', rooms: ['RA1'] }, { site: 'SITE-B', rooms: ['RB1'] }];

/** The routed fixture with a merging endpoint on SITE-A and SITE-B, plus the given top-level fields. */
async function bundleFile(over: Record<string, unknown>) {
  const base = routedBundle();
  const endpoint = { ...base.endpoints[0], mergeTimeDomain: true };
  const owner = { ...base.endpointOwners['syn.rows'], routes: [{ sites: ['SITE-A'], targets: ['tgt-1'] }, { sites: ['SITE-B'], targets: ['tgt-2'] }] };
  const bundle = {
    ...base, endpoints: [endpoint], endpointOwners: { 'syn.rows': owner },
    targets: {
      'tgt-1': { ...base.targets['tgt-1'], connectionFile: join(dir, 'secret') },
      'tgt-2': { ...base.targets['tgt-1'], connectionFile: join(dir, 'secret') },
    }, ...over,
  };
  const file = join(dir, `${serial++}.json`);
  await writeFile(file, JSON.stringify(bundle));
  return file;
}

async function boot(over: Record<string, unknown>) {
  const config: MenuDeclarationConfig = {
    MENU_DECLARATIONS_FILE: await bundleFile(over), MENU_UPSTREAM_BASE_URL: undefined, MENU_IDENTITY_KEY_FILE: undefined,
    MENU_IDENTITY_KEY_ID: undefined, MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test', MENU_RESOLVER_TIMEOUT_MS: 3000,
    MENU_UPSTREAM_TIMEOUT_MS: 27000,
  };
  const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(config), {
    checkService: { checkCapability: async () => ({ allow: true }) } as unknown as CheckService,
    connectorFactories: factories,
    fetch: async () => new Response(JSON.stringify(grants)),
  });
  if (!setup) throw new Error('no setup');
  // The same two options `index.ts` passes to `buildServer`, which hands them to the registry.
  const registry = createMenuDispatchRegistry(setup.menuDispatch, {
    ...(setup.scopeResolver ? { scopeResolver: setup.scopeResolver } : {}),
    ...(setup.timeDomainAssertions ? { timeDomainAssertions: setup.timeDomainAssertions } : {}),
  });
  // Step 7 is the subject: the routed connector handler is replaced by a recorder (its own suites cover it).
  const declaration = registry.endpoint('syn.rows');
  if (!declaration) throw new Error('syn.rows not registered');
  const handled: (string | undefined)[] = [];
  declaration.handle = async ({ timeDomainId }) => { handled.push(timeDomainId); return { outcome: 'ok', data: [] }; };
  return { setup, registry, handled };
}

const actor = { actor_id: 'syn-actor', workspace_id: 'syn-ws', role_level: 'admin' };
async function query(registry: Awaited<ReturnType<typeof boot>>['registry'], scopeId: string, from: string, to: string) {
  const shape = judgeQueryShape({ endpoint: 'syn.rows', context: { scopeId, from, to }, params: { q: 'x' } }, registry);
  if (!shape.ok) throw new Error(shape.message);
  return runQuery(shape, actor, 'cid');
}

describe('timeDomainAssertions in the declaration bundle', () => {
  it('boots a merging endpoint with Site-wide guarantees, each Site judged with its own domain', async () => {
    const { setup, registry, handled } = await boot({ timeDomainAssertions: [row('SITE-A', 'DOMAIN-1'), row('SITE-B', 'DOMAIN-2')] });
    expect(setup.timeDomainAssertions).toHaveLength(2);
    expect(await query(registry, 'SITE-A', '2026-09-19T09:00:00', '2026-09-26T09:00:00')).toMatchObject({ outcome: 'ok' });
    expect(await query(registry, 'SITE-B', '2026-09-19T09:00:00', '2026-09-26T09:00:00')).toMatchObject({ outcome: 'ok' });
    expect(handled).toEqual(['DOMAIN-1', 'DOMAIN-2']);
  });

  it.each([
    ['without the field', {}],
    ['with an empty list', { timeDomainAssertions: [] }],
  ])('refuses the same deployment %s at registration', async (_name, over) => {
    await expect(boot(over)).rejects.toBeInstanceOf(MenuDispatchRegistrationError);
    await expect(boot(over)).rejects.toThrow(/mergeTimeDomain is refused — step 7/);
  });

  it('does not let one Site\'s guarantee prove another, nor a narrower window a wider request', async () => {
    const { registry, handled } = await boot({ timeDomainAssertions: [row('SITE-A', 'DOMAIN-1', '2026-09-22T00:00:00')] });
    expect(await query(registry, 'SITE-B', '2026-09-25T09:00:00', '2026-09-26T09:00:00')).toMatchObject({ outcome: 'error', message: 'time_domain_unverified' });
    expect(await query(registry, 'SITE-A', '2026-09-21T23:59:59', '2026-09-26T09:00:00')).toMatchObject({ outcome: 'error', message: 'time_domain_unverified' });
    expect(handled).toEqual([]);
    expect(await query(registry, 'SITE-A', '2026-09-22T00:00:00', '2026-09-26T09:00:00')).toMatchObject({ outcome: 'ok' });
    expect(handled).toEqual(['DOMAIN-1']);
  });

  it('stitches abutting windows, rejects a one-second gap, and rejects a request across a declared domain change', async () => {
    const { registry, handled } = await boot({ timeDomainAssertions: [
      row('SITE-A', 'DOMAIN-1', FULL, CHANGE), row('SITE-A', 'DOMAIN-1', CHANGE, OPEN),
      row('SITE-B', 'DOMAIN-2', FULL, CHANGE), row('SITE-B', 'DOMAIN-3', CHANGE, OPEN),
    ] });
    expect(await query(registry, 'SITE-A', '2026-09-19T09:00:00', '2026-09-26T09:00:00')).toMatchObject({ outcome: 'ok' });
    expect(await query(registry, 'SITE-B', '2026-09-19T09:00:00', '2026-09-26T09:00:00')).toMatchObject({ outcome: 'error', message: 'time_domain_mismatch' });
    expect(await query(registry, 'SITE-B', CHANGE, '2026-09-26T09:00:00')).toMatchObject({ outcome: 'ok' });
    expect(handled).toEqual(['DOMAIN-1', 'DOMAIN-3']);
    const gap = await boot({ timeDomainAssertions: [row('SITE-A', 'DOMAIN-1', FULL, CHANGE), row('SITE-A', 'DOMAIN-1', '2026-09-20T00:00:01', OPEN)] });
    expect(await query(gap.registry, 'SITE-A', '2026-09-19T09:00:00', '2026-09-26T09:00:00')).toMatchObject({ outcome: 'error', message: 'time_domain_unverified' });
    expect(gap.handled).toEqual([]);
  });

  it.each([
    ['a non-calendar time', [row('SITE-A', 'DOMAIN-1', FULL, '2026-02-30T00:00:00')], /calendar times/],
    ['an offset time', [row('SITE-A', 'DOMAIN-1', '2020-01-01T00:00:00+09:00')], /calendar times/],
    ['a reversed window', [row('SITE-A', 'DOMAIN-1', OPEN, FULL)], /validFrom must be before validTo/],
    ['an empty window', [row('SITE-A', 'DOMAIN-1', CHANGE, CHANGE)], /validFrom must be before validTo/],
    ['a blank site', [row(' ', 'DOMAIN-1')], /non-blank/],
    ['a blank domain', [row('SITE-A', '  ')], /non-blank/],
    ['contradicting windows of one Site', [row('SITE-A', 'DOMAIN-1'), row('SITE-A', 'DOMAIN-2', CHANGE)], /site SITE-A has overlapping windows/],
    ['a duplicate window of one Site', [row('SITE-A', 'DOMAIN-1'), row('SITE-A', 'DOMAIN-1')], /site SITE-A has overlapping windows/],
  ])('refuses %s at load', async (_name, timeDomainAssertions, message) => {
    const error = await loadDeclarationBundle(await bundleFile({ timeDomainAssertions })).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DeclarationBundleError);
    expect((error as DeclarationBundleError).problems.join('\n')).toMatch(message);
  });

  it('refuses an unknown key and a Site outside the bundle scopeCatalog', async () => {
    await expect(loadDeclarationBundle(await bundleFile({ timeDomainAssertions: [{ ...row('SITE-A', 'DOMAIN-1'), equipmentId: 'E1' }] })))
      .rejects.toBeInstanceOf(DeclarationBundleError);
    const error = await loadDeclarationBundle(await bundleFile({
      scopeCatalog: [{ site: 'SITE-A', label: 'A', rooms: ['RA1'] }],
      timeDomainAssertions: [row('SITE-A', 'DOMAIN-1'), row('SITE-X', 'DOMAIN-1')],
    })).catch((caught: unknown) => caught);
    expect((error as DeclarationBundleError).problems).toEqual(['timeDomainAssertions.1: site SITE-X is not in the scopeCatalog']);
  });

  it('keeps a bundle without merging endpoints unchanged and adds no proof source', async () => {
    const base = routedBundle();
    const file = join(dir, `${serial++}.json`);
    await writeFile(file, JSON.stringify({ ...base, targets: { 'tgt-1': { ...base.targets['tgt-1'], connectionFile: join(dir, 'secret') } } }));
    const loaded = await loadDeclarationBundle(file);
    expect(loaded).not.toHaveProperty('timeDomainAssertions');
  });
});
