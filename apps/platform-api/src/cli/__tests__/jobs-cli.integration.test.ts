import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../db/client.js';
import { initBoss, shutdownBoss } from '../../lib/jobs.js';
import { collectInventory, parseInventoryArgs } from '../jobs-inventory.js';
import { parseReplayArgs, replayFailedJobs } from '../jobs-replay.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);
const QUEUE = 'notifications.dispatch';
const SECRET = `SECRET-SUMMARY-${randomUUID()}`;

describe.skipIf(!runIntegration)('jobs inventory and replay CLIs', () => {
  let appDb: DbHandle;
  let migrateDb: DbHandle;
  let boss: Awaited<ReturnType<typeof initBoss>>;
  let since: Date;
  const failedIds: string[] = [];
  let createdId = '';

  async function state(id: string): Promise<string> {
    const r = await migrateDb.pool.query<{ state: string }>(
      'select state::text as state from pgboss.job where id = $1',
      [id],
    );
    return r.rows[0]?.state ?? 'missing';
  }

  beforeAll(async () => {
    appDb = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    boss = await initBoss({ connectionString: APP_URL, log: { info() {}, warn() {}, error() {} } });
    const now = await migrateDb.pool.query<{ now: Date }>('select clock_timestamp() as now');
    since = now.rows[0]?.now ?? new Date();
    for (let i = 0; i < 3; i += 1) {
      const id = await boss.send(QUEUE, { summary: SECRET, correlation_id: `cli-${randomUUID()}` });
      if (!id) throw new Error('send returned no id');
      failedIds.push(id);
      await migrateDb.pool.query(
        `update pgboss.job set state = 'failed', retry_count = $2, created_on = now() + ($3 || ' milliseconds')::interval where id = $1`,
        [id, i + 1, String(i)],
      );
    }
    const created = await boss.send(QUEUE, { summary: SECRET, correlation_id: `cli-${randomUUID()}` });
    if (!created) throw new Error('send returned no id');
    createdId = created;
  });

  afterAll(async () => {
    await migrateDb?.pool.query('delete from pgboss.job where id = any($1::uuid[])', [
      [...failedIds, createdId],
    ]);
    await shutdownBoss(boss).catch(() => {});
    await appDb?.close();
    await migrateDb?.close();
  });

  it('the runtime role holds the pgboss grants the CLIs need', async () => {
    const r = await appDb.pool.query<{ s: boolean; u: boolean }>(
      `select has_table_privilege(current_user, 'pgboss.job', 'SELECT') as s,
              has_table_privilege(current_user, 'pgboss.job', 'UPDATE') as u`,
    );
    expect(r.rows[0]).toEqual({ s: true, u: true });
  });

  it('inventory groups by queue and state and never prints payloads', async () => {
    const rows = await collectInventory(appDb.pool, { queue: QUEUE });
    const failed = rows.find((row) => row.state === 'failed');
    expect(failed?.count).toBeGreaterThanOrEqual(3);
    expect(failed?.max_retry_count).toBeGreaterThanOrEqual(3);
    expect(failed?.oldest_created_on).toEqual(expect.any(String));
    expect(rows.every((row) => row.queue === QUEUE)).toBe(true);
    const onlyFailed = await collectInventory(appDb.pool, { queue: QUEUE, state: 'failed' });
    expect(onlyFailed.map((row) => row.state)).toEqual(['failed']);
    expect(JSON.stringify(rows)).not.toContain(SECRET);
    expect(parseInventoryArgs(['--queue', QUEUE, '--state', 'failed'])).toEqual({
      queue: QUEUE,
      state: 'failed',
    });
    await expect(collectInventory(appDb.pool, { state: 'bogus' })).rejects.toThrow(/--state/);
  });

  it('replay refuses other queues, other states and limits above the cap', async () => {
    const base = { state: 'failed', limit: 100, apply: true };
    await expect(
      replayFailedJobs(appDb.pool, boss, { ...base, queue: 'voc.autogen' }),
    ).rejects.toThrow(/not replay-safe/);
    await expect(
      replayFailedJobs(appDb.pool, boss, { ...base, queue: QUEUE, state: 'completed' }),
    ).rejects.toThrow(/failed/);
    await expect(
      replayFailedJobs(appDb.pool, boss, { ...base, queue: QUEUE, limit: 501 }),
    ).rejects.toThrow(/between 1 and 500/);
    expect(parseReplayArgs(['--queue', QUEUE, '--state', 'failed']).limit).toBe(100);
  });

  it('dry run changes nothing; --apply re-queues exactly the selected failed ids', async () => {
    const options = { queue: QUEUE, state: 'failed', since, limit: 2, apply: false };
    const dry = await replayFailedJobs(appDb.pool, boss, options);
    expect(dry).toMatchObject({ mode: 'dry-run', selected: 2, retried: 0 });
    expect(dry.job_ids).toEqual(failedIds.slice(0, 2));
    expect(await Promise.all(failedIds.map(state))).toEqual(['failed', 'failed', 'failed']);

    const applied = await replayFailedJobs(appDb.pool, boss, { ...options, apply: true });
    expect(applied).toMatchObject({ mode: 'apply', selected: 2, retried: 2 });
    expect(applied.job_ids).toEqual(failedIds.slice(0, 2));
    expect(await Promise.all(failedIds.map(state))).toEqual(['retry', 'retry', 'failed']);
    expect(await state(createdId)).toBe('created');
    expect(JSON.stringify(applied)).not.toContain(SECRET);
  });
});
