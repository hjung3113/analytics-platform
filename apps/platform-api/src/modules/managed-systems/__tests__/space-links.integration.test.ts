// Integration tests for GET /managed-systems/space-links (#1289 node j, ADR-0110 decision 5): every link row of the
// workspace (declared or not) plus the workspace's 「플랫폼」 system id, readable by any signed-in session, scoped to
// the session's workspace. The link is navigation/default metadata; no permission decision reads it (ADR-0068).
//
// Needs migration 0086 (core.space_links).

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { spaceLinksResponseSchema } from '@ap/feature-shared';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { createManagedSystemService } from '../managed-system-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

async function loginAs(app: FastifyInstance, externalId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/mock-login',
    headers: { 'user-agent': 'integration-test' },
    payload: { external_id: externalId },
  });
  const header = res.headers['set-cookie'];
  const arr = Array.isArray(header) ? header : header ? [header] : [];
  for (const c of arr) {
    const m = c.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (m?.[1]) return m[1];
  }
  throw new Error(`mock-login failed: ${res.statusCode}`);
}

describe.skipIf(!runIntegration)('GET /managed-systems/space-links', () => {
  let appHandle: DbHandle;
  let ops: DbHandle;
  let app: FastifyInstance;
  const otherWorkspace = randomUUID();
  const SPACES = ['it-link-live', 'it-link-gone'];
  const ids: Record<string, string> = {};
  let otherSystemId = '';

  async function insertSystem(workspaceId: string, slug: string, externalKey: string | null): Promise<string> {
    const res = await ops.pool.query<{ id: string }>(
      'insert into core.managed_systems (workspace_id, slug, name, external_key) values ($1, $2, $3, $4) returning id',
      [workspaceId, slug, `Name ${slug}`, externalKey],
    );
    return res.rows[0]?.id ?? '';
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();

    ids['it-link-live'] = await insertSystem(WORKSPACE_ID, 'it-link-live', 'tableau:it-link-live');
    ids['it-link-gone'] = await insertSystem(WORKSPACE_ID, 'it-link-gone', 'tableau:it-link-gone');
    await ops.pool.query(
      `insert into core.space_links (workspace_id, space_id, managed_system_id, declared)
       values ($1, 'it-link-live', $2, true), ($1, 'it-link-gone', $3, false)`,
      [WORKSPACE_ID, ids['it-link-live'], ids['it-link-gone']],
    );

    await ops.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [otherWorkspace, 'space-links isolation']);
    otherSystemId = await insertSystem(otherWorkspace, 'it-link-other', 'platform');
    await ops.pool.query(
      `insert into core.space_links (workspace_id, space_id, managed_system_id, declared) values ($1, 'it-link-other', $2, true)`,
      [otherWorkspace, otherSystemId],
    );
  });

  afterAll(async () => {
    await ops.pool.query('delete from core.space_links where workspace_id = any($1::uuid[])', [[WORKSPACE_ID, otherWorkspace]]);
    await ops.pool.query('delete from core.managed_systems where id = any($1::uuid[])', [[ids['it-link-live'], ids['it-link-gone'], otherSystemId]]);
    await ops.pool.query('delete from core.workspaces where id = $1', [otherWorkspace]);
    await app?.close();
    await appHandle?.close();
    await ops?.close();
  });

  const platformIdOf = async (workspaceId: string) =>
    (
      await ops.pool.query<{ id: string }>(
        `select id from core.managed_systems where workspace_id = $1 and external_key = 'platform' and archived_at is null`,
        [workspaceId],
      )
    ).rows[0]?.id ?? null;

  it.each(['mock-admin-1', 'mock-user-1'])('answers a signed-in session (%s) with its workspace links, declared or not', async (externalId) => {
    const cookie = await loginAs(app, externalId);
    const res = await app.inject({ method: 'GET', url: '/managed-systems/space-links', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    expect(res.statusCode).toBe(200);
    const body = spaceLinksResponseSchema.parse(res.json());
    const mine = body.items.filter((l) => SPACES.includes(l.space_id));
    expect(mine).toEqual([
      { space_id: 'it-link-gone', managed_system_id: ids['it-link-gone'], declared: false },
      { space_id: 'it-link-live', managed_system_id: ids['it-link-live'], declared: true },
    ]);
    expect(body.platform_managed_system_id).toBe(await platformIdOf(WORKSPACE_ID));
  });

  it('refuses a request without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/managed-systems/space-links' });
    expect(res.statusCode).toBe(401);
  });

  it('is scoped to the actor workspace: another workspace sees only its own links and its own 「플랫폼」 id', async () => {
    const service = createManagedSystemService({ db: appHandle.db } as never);
    const other = await service.listSpaceLinks({ actor_id: randomUUID(), workspace_id: otherWorkspace, role_level: 'user' } as never);
    expect(other).toEqual({
      items: [{ space_id: 'it-link-other', managed_system_id: otherSystemId, declared: true }],
      platform_managed_system_id: otherSystemId,
    });
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({ method: 'GET', url: '/managed-systems/space-links', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    const body = spaceLinksResponseSchema.parse(res.json());
    expect(body.items.some((l) => l.space_id === 'it-link-other')).toBe(false);
    expect(body.platform_managed_system_id).not.toBe(otherSystemId);
  });
});
