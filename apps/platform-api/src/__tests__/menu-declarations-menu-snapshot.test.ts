import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadMenuDeclarationSetup, type MenuDeclarationConfig } from '../menu-declarations.js';
import { DeclarationBundleError } from '../modules/menu-dispatch/declarations-file.js';
import type { SnapshotEndpoint } from '../modules/menu-dispatch/menu-snapshot.js';
import { routedBundle } from '../modules/menu-dispatch/__tests__/bundle-fixtures.js';
import type { CheckService } from '../modules/permissions/check-service.js';
import { menuSnapshot } from '../test-support/menu-snapshot.js';

// #1900: the core server must refuse a declaration bundle that differs from the menu declarations it serves
// (a hand copy that weakens a permission, drops a Scope requirement or names an unknown menu).
// The menu declarations reach the server as the snapshot file the app build writes (`MENU_DECLARATIONS_SNAPSHOT_FILE`,
// ADR-0156); `boot` is the only place that knows how the snapshot is handed over.

const checkService = {} as CheckService;
let dir: string;
let secretFile: string;
let serial = 0;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'boot-menu-snapshot-'));
  secretFile = join(dir, 'secret');
  await writeFile(secretFile, 'secret-content-never-in-errors');
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

function config(over: Record<string, unknown>): MenuDeclarationConfig {
  return {
    MENU_DECLARATIONS_FILE: undefined, MENU_UPSTREAM_BASE_URL: undefined, MENU_IDENTITY_KEY_FILE: undefined, MENU_IDENTITY_KEY_ID: undefined,
    MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test', MENU_RESOLVER_TIMEOUT_MS: 3000, MENU_UPSTREAM_TIMEOUT_MS: 27000, ...over,
  } as MenuDeclarationConfig;
}
async function boot(bundle: unknown, snapshot: unknown) {
  const bundleFile = join(dir, `bundle-${serial}.json`);
  const snapshotFile = join(dir, `snapshot-${serial++}.json`);
  await writeFile(bundleFile, JSON.stringify(bundle));
  await writeFile(snapshotFile, JSON.stringify(snapshot));
  return loadMenuDeclarationSetup(config({ MENU_DECLARATIONS_FILE: bundleFile, MENU_DECLARATIONS_SNAPSHOT_FILE: snapshotFile }), { checkService });
}
async function problems(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    expect(error).toBeInstanceOf(DeclarationBundleError);
    expect((error as Error).message).not.toContain('secret-content-never-in-errors');
    return (error as DeclarationBundleError).problems;
  }
  throw new Error('setup accepted a bundle that differs from the menu declarations');
}

function first<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('fixture has no endpoint');
  return row;
}
const bundle = () => ({ ...routedBundle(), targets: { 'tgt-1': { ...routedBundle().targets['tgt-1'], connectionFile: secretFile } } });
/** The menu side as the app assembly declares it (synthetic): menu `syn`, endpoint `syn.rows`. */
function snapshot() {
  const { limits: _limits, paramTypes: _paramTypes, ...endpoint } = first(routedBundle().endpoints);
  return menuSnapshot({
    menus: [{ id: 'syn', permission: 'syn:view', requiresScope: true, context: { time: 'apply' } }],
    permissions: ['syn:view'],
    endpoints: [endpoint as SnapshotEndpoint],
    actions: [],
  });
}

describe('declaration bundle is checked against the menu declarations at boot (#1900)', () => {
  it('boots when the bundle matches the menu declarations', async () => {
    await expect(boot(bundle(), snapshot())).resolves.toBeDefined();
  });

  it('H5: refuses an endpoint whose permission is weaker than the menu declaration', async () => {
    const weak = bundle();
    first(weak.endpoints).permission = 'platform:view';
    const found = await problems(boot(weak, snapshot()));
    expect(found.some((problem) => problem.includes('syn.rows') && problem.includes('permission') && problem.includes('platform:view') && problem.includes('syn:view'))).toBe(true);
  });

  it('H3: refuses an endpoint that drops the Scope requirement the menu declares', async () => {
    const open = bundle();
    first(open.endpoints).requiresScope = false;
    const found = await problems(boot(open, snapshot()));
    expect(found.some((problem) => problem.includes('syn.rows') && problem.includes('requiresScope'))).toBe(true);
  });

  it('refuses to boot a bundle without a menu declaration snapshot (no switch turns the check off)', async () => {
    const bundleFile = join(dir, `bundle-${serial++}.json`);
    await writeFile(bundleFile, JSON.stringify(bundle()));
    const found = await problems(loadMenuDeclarationSetup(config({ MENU_DECLARATIONS_FILE: bundleFile }), { checkService }));
    expect(found).toEqual(['MENU_DECLARATIONS_SNAPSHOT_FILE is required when MENU_DECLARATIONS_FILE is set']);
  });

  it('H1: refuses an endpoint whose menuId the menu declarations do not have', async () => {
    const stray = bundle();
    first(stray.endpoints).menuId = 'no-such-menu';
    const found = await problems(boot(stray, snapshot()));
    expect(found.some((problem) => problem.includes('syn.rows') && problem.includes('no-such-menu'))).toBe(true);
  });
});
