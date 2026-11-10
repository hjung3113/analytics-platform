// #1667 fix round 1 (C1) — the menu permission rules belong to the server instance. Two servers built in one process with
// different contributions never read each other's declarations. Real Postgres (throwaway DB only).

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { uid } from '../../../test-support/ids.js';
import type { MenuDispatchContribution } from '../../menu-dispatch/types.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-two-servers');
const CUSTOM = 'custom:read';

// `explorer.investigate` has no Admin bypass; `knowledge.catalog.manage` has one (CAPABILITY_META.adminModuleBypass).
const withoutBypass: MenuDispatchContribution = { permissions: [{ permission: CUSTOM, capability: 'explorer.investigate' }] };
const withBypass: MenuDispatchContribution = { permissions: [{ permission: CUSTOM, capability: 'knowledge.catalog.manage' }] };

describe.skipIf(!runIntegration)('menu permissions are bound to their server (#1667)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  const apps: FastifyInstance[] = [];
  let adminId = '';
  let cookie = '';

  const build = async (menuDispatch?: MenuDispatchContribution[]) => {
    const app = await buildServer({ config: loadConfig(), dbHandle, ...(menuDispatch ? { menuDispatch } : {}) });
    await app.ready();
    apps.push(app);
    return app;
  };
  const heldOn = async (app: FastifyInstance) => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/bootstrap',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ session: { user: { permissions: string[] } } }>().session.user.permissions;
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    const external = `${PREFIX}-admin`;
    adminId = (await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId: external, displayName: 'Two servers', roleLevel: 'admin' })).id;
    const app = await build();
    cookie = await loginAs(app, external);
  });

  afterAll(async () => {
    for (const app of apps) await app.close();
    for (const [table, column] of [
      ['core.audit_log', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await migrateHandle?.pool.query(`delete from ${table} where ${column} = $1`, [adminId]);
    }
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('each server resolves its own mapping for an Admin without grants, and a later server changes nothing', async () => {
    const a = await build([withoutBypass]);
    expect(await heldOn(a)).not.toContain(CUSTOM);

    const b = await build([withBypass]);
    expect(await heldOn(b)).toContain(CUSTOM);
    expect(await heldOn(a), 'A after B was built').not.toContain(CUSTOM);

    const c = await build();
    expect(await heldOn(c)).not.toContain(CUSTOM);
    expect(await heldOn(b), 'B after C was built').toContain(CUSTOM);
    expect(await heldOn(a), 'A after C was built').not.toContain(CUSTOM);
  });

  it('a server built while another one answers does not change the answer in flight', async () => {
    const b = await build([withBypass]);
    const [held] = await Promise.all([heldOn(b), build([withoutBypass]), build()]);
    expect(held).toContain(CUSTOM);
  });
});
