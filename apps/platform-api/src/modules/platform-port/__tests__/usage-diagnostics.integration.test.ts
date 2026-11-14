import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pino } from 'pino';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadMenuDeclarationSetup } from '../../../menu-declarations.js';
import * as eqv from '../../eqv/index.js';
import { menuSnapshot } from '../../../test-support/menu-snapshot.js';
import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { uid } from '../../../test-support/ids.js';
import type { CheckService } from '../../permissions/check-service.js';
import { undeclaredMenuPermissions } from '../../menu-dispatch/undeclared-menu-permissions.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const PREFIX = uid('synthetic-diag');
const menus = [{ id: 'synthetic-menu', permission: 'synthetic:missing' }];

describe.skipIf(!(APP_URL && MIGRATE_URL && WORKSPACE_ID))('usage summary diagnostics (#1846)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  const apps: FastifyInstance[] = [];
  const actorIds: string[] = [];

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
  });
  afterAll(async () => {
    for (const app of apps) await app.close();
    for (const [table, column] of [['core.audit_log', 'actor_id'], ['core.sessions', 'actor_id'], ['core.actors', 'id']]) {
      await migrateHandle.pool.query(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await dbHandle.close();
    await migrateHandle.close();
  });

  it.each([
    { name: 'undeclared', findings: undeclaredMenuPermissions(menus, []), role: 'admin' as const },
    { name: 'declared', findings: undeclaredMenuPermissions(menus, ['synthetic:missing']), role: 'admin' as const },
    { name: 'no snapshot', findings: undefined, role: 'admin' as const },
    { name: 'permission denied', findings: undeclaredMenuPermissions(menus, []), role: 'user' as const },
  ])('$name', async ({ name, findings, role }) => {
    const app = await buildServer({ config: loadConfig(), dbHandle, ...(findings ? { menuRequirements: menus } : {}), ...(name === 'declared' ? { menuDispatch: [{ permissions: [{ permission: 'synthetic:missing', capability: 'workspace.read' as const }] }] } : {}) });
    apps.push(app);
    await app.ready();
    const externalId = `${PREFIX}-${name}`;
    const actor = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, displayName: 'Synthetic actor', roleLevel: role });
    actorIds.push(actor.id);
    const cookie = await loginAs(app, externalId);
    const response = await app.inject({ method: 'GET', url: '/api/v1/platform/usage-summary?preset=all', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    if (role === 'user') {
      expect(body.outcome).toBe('forbidden');
      expect(body.data).toBeNull();
    } else {
      expect(body.outcome).toBe('ok');
      if (findings?.length) expect(body.data.undeclaredMenuPermissions).toEqual(findings);
      else expect(body.data).not.toHaveProperty('undeclaredMenuPermissions');
    }
  });

  it('compares snapshot requirements against built-in and bundle declarations at server assembly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'synthetic-diag-'));
    const warnings: string[] = [];
    const logger = pino({ level: 'warn' }, { write(line) { warnings.push(JSON.parse(line).msg); } });
    const builtin = vi.spyOn(eqv, 'eqvContribution').mockReturnValue({ permissions: [{ permission: 'synthetic:builtin', capability: 'workspace.read' }] });
    try {
      const config = loadConfig();
      const snapshotMenus = [
        { id: 'synthetic-builtin', permission: 'synthetic:builtin', requiresScope: false, context: {} },
        { id: 'synthetic-bundle', permission: 'synthetic:bundle', requiresScope: false, context: {} },
        { id: 'synthetic-missing', permission: 'synthetic:missing', requiresScope: false, context: {} },
      ];
      const bundleFile = join(dir, 'bundle.json');
      const snapshotFile = join(dir, 'snapshot.json');
      await writeFile(bundleFile, JSON.stringify({ endpoints: [], actions: [], endpointOwners: {}, permissions: [{ permission: 'synthetic:bundle', capability: 'workspace.read' }] }));
      await writeFile(snapshotFile, JSON.stringify(menuSnapshot({ menus: snapshotMenus, permissions: snapshotMenus.map(row => row.permission), endpoints: [], actions: [] })));
      const setup = await loadMenuDeclarationSetup({ ...config, MENU_DECLARATIONS_FILE: bundleFile, MENU_DECLARATIONS_SNAPSHOT_FILE: snapshotFile }, { checkService: {} as CheckService });
      if (!setup) throw new Error('synthetic declaration setup missing');
      const app = await buildServer({ config, dbHandle, logger, menuDispatch: setup.menuDispatch, menuRequirements: setup.menuRequirements });
      apps.push(app);
      await app.ready();
      const externalId = `${PREFIX}-assembled`;
      const actor = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, displayName: 'Synthetic actor', roleLevel: 'admin' });
      actorIds.push(actor.id);
      const cookie = await loginAs(app, externalId);
      const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
      const summary = await app.inject({ method: 'GET', url: '/api/v1/platform/usage-summary?preset=all', headers });
      expect(summary.statusCode).toBe(200);
      expect(summary.json().data.undeclaredMenuPermissions).toEqual(undeclaredMenuPermissions([{ id: 'synthetic-missing', permission: 'synthetic:missing' }], []));
      expect(warnings.filter(line => line.startsWith('menu '))).toEqual(undeclaredMenuPermissions([{ id: 'synthetic-missing', permission: 'synthetic:missing' }], []).map(row => `menu ${row.menuId}: ${row.reason}`));
      const bootstrap = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers });
      expect(bootstrap.statusCode).toBe(200);
      expect(bootstrap.json().session.user.permissions).toEqual(expect.arrayContaining(['synthetic:builtin', 'synthetic:bundle']));
      expect(bootstrap.json().session.user.permissions).not.toContain('synthetic:missing');
    } finally {
      builtin.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

});
