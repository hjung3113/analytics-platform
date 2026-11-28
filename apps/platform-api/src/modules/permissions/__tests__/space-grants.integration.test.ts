import {
  listPermissionGrantsResponseSchema,
  permissionGrantAdminItemSchema,
  permissionGrantBatchResultSchema,
} from '@ap/feature-shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { runAsToken } from '../../../lib/auth-context.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs, SESSION_COOKIE_NAME } from '../../../test-support/auth.js';
import { defined } from '../../../test-support/defined.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { randomUUID, uid } from '../../../test-support/ids.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { createCheckService } from '../check-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE = process.env.WORKSPACE_ID ?? '';
const PREFIX = uid('it-space-grants');
const CAPABILITY = 'saved_view.approve';
const SPACE = 'approval-test';
const OTHER_SPACE = 'approval-other';
const GRANTS = '/permissions/grants';

describe.skipIf(!APP_URL || !MIGRATE_URL || !WORKSPACE)('Saved View approval Space grants (#2765)', () => {
  let db: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let admin: { id: string; cookie: string };
  let recipient: { id: string; cookie: string };
  let systemId: string;
  const actorIds: string[] = [];

  async function account(role: 'admin' | 'user') {
    const externalId = `${PREFIX}-${role}-${randomUUID()}`;
    const { id } = await insertActorRow(db, { workspaceId: WORKSPACE, externalId, roleLevel: role });
    actorIds.push(id);
    return { id, cookie: await loginAs(app, externalId) };
  }

  beforeAll(async () => {
    db = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({
      config: loadConfig(),
      dbHandle: db,
      menuSpaces: new Map([['test-menu', SPACE], ['other-menu', OTHER_SPACE]]),
    });
    await app.ready();
    systemId = await insertMsDirectly(db, WORKSPACE, `${PREFIX}-system`, 'Space grant test system');
  });

  async function clearPermissionFixtures() {
    if (actorIds.length === 0) return;
    await migrate.pool.query('delete from core.notifications where actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from core.audit_log where actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from permission.permission_requests where requester_actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from permission.permission_denies where actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from permission.permission_grants where actor_id = any($1::uuid[])', [actorIds]);
  }

  beforeEach(async () => {
    await clearPermissionFixtures();
    admin = await account('admin');
    recipient = await account('user');
  });
  afterAll(async () => {
    try {
      if (migrate) {
        await clearPermissionFixtures();
        if (systemId) await deleteRecoveryFixtureParents(migrate, 'delete from core.managed_systems where id = $1', [systemId]);
        await migrate.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [actorIds]);
        await migrate.pool.query('delete from core.actors where id = any($1::uuid[])', [actorIds]);
      }
    } finally {
      await app?.close();
      await db?.close();
      await migrate?.close();
    }
  });

  const headers = (account = admin) => ({ cookie: `${SESSION_COOKIE_NAME}=${account.cookie}` });
  const post = (url: string, payload: Record<string, unknown>, account = admin) =>
    app.inject({ method: 'POST', url, headers: headers(account), payload });
  const target = (space: string) => ({ capability: CAPABILITY, scope_kind: 'space', scope_space: space });
  const direct = (space: string, fields: Record<string, unknown> = {}) =>
    post(GRANTS, { actor_id: recipient.id, reason: 'Synthetic approval delegation', ...target(space), ...fields });

  async function grant(space = SPACE) {
    const response = await direct(space);
    expect(response.statusCode, response.body).toBe(201);
    const item = permissionGrantAdminItemSchema.parse(response.json());
    expect(item).toMatchObject({ ...target(space), actor_id: recipient.id, managed_system_id: null });
    return item;
  }

  async function list(query: string) {
    const response = await app.inject({ method: 'GET', url: `${GRANTS}?${query}`, headers: headers() });
    expect(response.statusCode, response.body).toBe(200);
    return listPermissionGrantsResponseSchema.parse(response.json()).items;
  }

  async function audit(id: string, event: string) {
    const result = await migrate.pool.query<{ detail: unknown }>(
      'select detail from core.audit_log where subject_id = $1 and event_type = $2 and actor_id = $3',
      [id, event, admin.id],
    );
    expect(result.rows).toHaveLength(1);
    return defined(result.rows[0]).detail;
  }

  const revoke = (id: string) => post(`${GRANTS}/${id}/revoke`, { reason: 'Delegation ended' });

  it('grants and lists two known Spaces independently and revokes exactly one with both audit coordinates', async () => {
    const first = await grant();
    const batch = await post(`${GRANTS}/batch`, {
      actor_id: recipient.id,
      reason: 'Synthetic batch delegation',
      items: [target(OTHER_SPACE)],
    });
    expect(batch.statusCode, batch.body).toBe(201);
    const second = defined(permissionGrantBatchResultSchema.parse(batch.json()).items[0]);
    expect(second).toMatchObject(target(OTHER_SPACE));
    const listBoth = () => list('scope_kind=space');
    expect((await listBoth()).map((item) => item.id).sort()).toEqual([first.id, second.id].sort());
    expect(await list(`scope_kind=space&scope_space=${SPACE}`)).toEqual([
      expect.objectContaining({ id: first.id, ...target(SPACE), in_catalog: true }),
    ]);
    for (const [id, space] of [[first.id, SPACE], [second.id, OTHER_SPACE]] as const) {
      expect(await audit(id, 'permission_granted')).toMatchObject({ grant_id: id, ...target(space) });
    }

    const revoked = await revoke(first.id);
    expect(revoked.statusCode, revoked.body).toBe(200);
    expect(await audit(first.id, 'permission_revoked')).toMatchObject({ grant_id: first.id, ...target(SPACE) });
    expect((await listBoth()).map((item) => item.id)).toEqual([second.id]);
  });

  it('refuses unknown and mixed-scope coordinates and rolls back an invalid batch', async () => {
    const unknown = await direct('unknown-space');
    expect(unknown.statusCode, unknown.body).toBe(422);
    expect(unknown.json()).toMatchObject({
      code: 'validation.failed',
      detail: { fields: [expect.objectContaining({ path: ['scope_space'] })] },
    });
    const mixed = await direct(SPACE, { managed_system_id: systemId });
    expect(mixed.statusCode, mixed.body).toBe(422);
    expect(mixed.json()).toMatchObject({
      code: 'validation.failed',
      detail: { fields: [expect.objectContaining({ path: ['scope_kind'] })] },
    });
    const batch = await post(`${GRANTS}/batch`, {
      actor_id: recipient.id,
      reason: 'Synthetic batch delegation',
      items: [target(SPACE), target('unknown-space')],
    });
    expect(batch.statusCode, batch.body).toBe(422);
    expect(await list('scope_kind=space')).toEqual([]);
    const result = await migrate.pool.query(
      "select id from core.audit_log where actor_id = $1 and event_type = 'permission_granted'",
      [admin.id],
    );
    expect(result.rows).toEqual([]);
  });

  it('lists a Space no longer in the snapshot and allows revoking it by ID', async () => {
    const result = await db.pool.query<{ id: string }>(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, granted_by_actor_id, scope_kind, scope_space)
       values ($1, $2, $3, $4, 'space', 'removed-space') returning id`,
      [WORKSPACE, recipient.id, CAPABILITY, admin.id],
    );
    const id = defined(result.rows[0]).id;
    expect(await list('scope_space=removed-space')).toEqual([
      expect.objectContaining({ id, ...target('removed-space'), in_catalog: false }),
    ]);
    expect((await revoke(id)).statusCode).toBe(200);
    expect(await list('scope_space=removed-space')).toEqual([]);
  });

  it('enforces exact-space uniqueness and refuses malformed grant rows in PostgreSQL', async () => {
    const insert = (space: string | null, site: string | null = null, capability: string = CAPABILITY) =>
      db.pool.query(
        `insert into permission.permission_grants (workspace_id, actor_id, capability, granted_by_actor_id, scope_kind, scope_space, scope_site)
         values ($1, $2, $3, $4, 'space', $5, $6)`,
        [WORKSPACE, recipient.id, capability, admin.id, space, site],
      );
    await expect(insert(SPACE)).resolves.toMatchObject({ rowCount: 1 });
    await expect(insert(OTHER_SPACE)).resolves.toMatchObject({ rowCount: 1 });
    await expect(insert(SPACE)).rejects.toMatchObject({ code: '23505', constraint: 'permission_grants_active_uq' });
    for (const malformed of [null, '', ' ']) {
      await expect(insert(malformed)).rejects.toMatchObject({ code: '23514', constraint: 'permission_grants_scope_kind_check' });
    }
    await expect(insert(OTHER_SPACE, 'SITE-A')).rejects.toMatchObject({ code: '23514', constraint: 'permission_grants_scope_kind_check' });
    await expect(insert(OTHER_SPACE, null, 'voc.read')).rejects.toMatchObject({ code: '23514', constraint: 'permission_grants_scope_kind_check' });
  });

  it('rejects an ordinary request for the capability without creating a request or grant', async () => {
    const response = await post('/permission-requests', { requested_capability: CAPABILITY, reason: 'Request delegation' }, recipient);
    expect(response.statusCode, response.body).toBe(422);
    expect(response.json()).toMatchObject({
      code: 'validation.failed',
      detail: { fields: [expect.objectContaining({ path: ['requested_capability'] })] },
    });
    const result = await migrate.pool.query(
      'select id from permission.permission_requests where requester_actor_id = $1 union all select id from permission.permission_grants where actor_id = $1',
      [recipient.id],
    );
    expect(result.rows).toEqual([]);
  });

  const actor = () => ({ actor_id: recipient.id, workspace_id: WORKSPACE, role_level: 'user' });
  const resolve = () => db.db.transaction((tx) => createCheckService({ db: db.db }).savedViewApprovalSpaces(actor(), tx));

  it('accepts a session grant and ignores the same grant in token and generic permission checks', async () => {
    await grant();
    expect(await resolve()).toEqual(new Set([SPACE]));
    expect(await runAsToken('space-test-token', [CAPABILITY], resolve)).toEqual(new Set());
    const service = createCheckService({ db: db.db });
    const scope = { workspace_id: WORKSPACE };
    expect((await service.checkCapability(actor(), CAPABILITY, scope)).allow).toBe(false);
    expect((await service.checkCapability(actor(), CAPABILITY, { ...scope, managed_system_id: systemId })).allow).toBe(false);
    expect((await service.checkCapabilityAcross(actor(), CAPABILITY, [systemId])).get(systemId)?.allow).toBe(false);
  });

  it('applies a workspace deny to all held Spaces and confines a Managed System deny to its own scope', async () => {
    await grant();
    await grant(OTHER_SPACE);
    const deny = (managedSystemId: string | null) => db.pool.query(
      `insert into permission.permission_denies (workspace_id, actor_id, capability, reason, created_by_actor_id, managed_system_id)
       values ($1, $2, $3, 'Synthetic deny', $4, $5)`,
      [WORKSPACE, recipient.id, CAPABILITY, admin.id, managedSystemId],
    );
    await deny(systemId);
    expect(await resolve()).toEqual(new Set([SPACE, OTHER_SPACE]));
    await deny(null);
    expect(await resolve()).toEqual(new Set());
  });

  it('ignores expired and superseded rows and observes a completed revoke on the next read', async () => {
    const first = await grant();
    const second = await grant(OTHER_SPACE);
    expect(await resolve()).toEqual(new Set([SPACE, OTHER_SPACE]));
    await db.pool.query('update permission.permission_grants set expires_at = now() - interval \'1 second\' where id = $1', [first.id]);
    expect(await resolve()).toEqual(new Set([OTHER_SPACE]));
    const replacement = await grant();
    // Expired reissue supersedes the predecessor. Make expiry alone insufficient to hide it.
    await db.pool.query('update permission.permission_grants set expires_at = null where id = $1', [first.id]);
    expect((await revoke(replacement.id)).statusCode).toBe(200);
    expect(await resolve()).toEqual(new Set([OTHER_SPACE]));
    expect((await revoke(second.id)).statusCode).toBe(200);
    expect(await resolve()).toEqual(new Set());
  });
});
