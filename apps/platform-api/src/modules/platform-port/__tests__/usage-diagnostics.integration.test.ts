import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { uid } from '../../../test-support/ids.js';
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
    const app = await buildServer({ config: loadConfig(), dbHandle, ...(findings ? { undeclaredMenuPermissions: findings } : {}) });
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
});
