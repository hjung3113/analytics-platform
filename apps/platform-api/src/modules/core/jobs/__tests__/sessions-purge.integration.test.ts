// Integration tests for the daily sessions purge (#1266 b5a, SEC-06 / OPS-11).
// The handler is called directly; cron wiring is covered in boot.integration.test.ts.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import { insertActorRow } from '../../../../test-support/actor-fixtures.js';
import { purgeDeadSessions } from '../sessions-purge.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('core.sessions_purge handler', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let actorId = '';
  const prefix = `sp-${randomUUID()}-`;

  const seed = async (
    name: string,
    expires: string,
    revoked: string | null,
  ): Promise<string> => {
    const id = `${prefix}${name}`;
    await migrateHandle.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, revoked_at)
       values ($1, $2, $3, now() + $4::interval, now(), now(), case when $5::text is null then null else now() + $5::interval end)`,
      [id, actorId, WORKSPACE_ID, expires, revoked],
    );
    return id;
  };
  const remaining = async (): Promise<string[]> => {
    const res = await migrateHandle.pool.query<{ id: string }>(
      'select id from core.sessions where id like $1 order by id',
      [`${prefix}%`],
    );
    return res.rows.map((r) => r.id);
  };

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    ({ id: actorId } = await insertActorRow(appHandle, {
      workspaceId: WORKSPACE_ID,
      externalId: `${prefix}actor`,
      roleLevel: 'user',
    }));
  });

  afterAll(async () => {
    await migrateHandle?.pool
      .query('delete from core.sessions where id like $1', [`${prefix}%`])
      .catch(() => {});
    await migrateHandle?.pool.query('delete from core.actors where id = $1', [actorId]).catch(() => {});
    await appHandle?.close();
    await migrateHandle?.close();
  });

  it('deletes only sessions dead for more than 7 days; keeps active and recently dead ones', async () => {
    const oldExpired = await seed('old-expired', '-8 days', null);
    const oldRevoked = await seed('old-revoked', '1 day', '-8 days');
    const activeLong = await seed('active', '1 day', null);
    const recentExpired = await seed('recent-expired', '-6 days', null);
    const recentRevoked = await seed('recent-revoked', '1 day', '-6 days');
    // revoked long ago but expiry far in the future still counts as dead: revocation is the signal.
    const result = await purgeDeadSessions({ db: appHandle.db });
    expect(result.deleted).toBeGreaterThanOrEqual(2);
    const left = await remaining();
    expect(left).toEqual([activeLong, recentExpired, recentRevoked].sort());
    expect(left).not.toContain(oldExpired);
    expect(left).not.toContain(oldRevoked);
  });

  it('deletes in batches when more rows than the batch size are dead, and a rerun is a no-op', async () => {
    await migrateHandle.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at)
       select $1 || 'bulk-' || g, $2, $3, now() - interval '30 days', now(), now() - interval '40 days'
         from generate_series(1, 25) g`,
      [prefix, actorId, WORKSPACE_ID],
    );
    const keep = await seed('keep-after-bulk', '1 hour', null);
    const first = await purgeDeadSessions({ db: appHandle.db, batchSize: 10 });
    expect(first.deleted).toBeGreaterThanOrEqual(25);
    expect(first.batches).toBeGreaterThanOrEqual(3);
    expect(await remaining()).toContain(keep);
    expect((await remaining()).filter((id) => id.includes('bulk-'))).toEqual([]);

    const second = await purgeDeadSessions({ db: appHandle.db, batchSize: 10 });
    expect(second.deleted).toBe(0);
    expect(second.batches).toBe(1);
    expect(await remaining()).toContain(keep);
  });
});
