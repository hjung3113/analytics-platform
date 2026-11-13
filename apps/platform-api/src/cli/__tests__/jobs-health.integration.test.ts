import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../db/client.js';
import { initBoss, shutdownBoss } from '../../lib/jobs.js';

const runIntegration = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL_MIGRATE);
const queue = `synthetic.health.${randomUUID()}`;
const secret = `synthetic-payload-${randomUUID()}`;

describe.skipIf(!runIntegration)('jobs-health CLI', () => {
  let db: DbHandle;
  let boss: Awaited<ReturnType<typeof initBoss>>;
  let jobId: string;

  beforeAll(async () => {
    db = createDb(process.env.DATABASE_URL_MIGRATE ?? '');
    boss = await initBoss({
      connectionString: process.env.DATABASE_URL ?? '',
      jobsDisabled: true,
      log: { info() {}, warn() {}, error() {} },
    });
    await boss.createQueue(queue);
    await boss.schedule(queue, '*/5 * * * *', { summary: secret });
    const id = await boss.send(queue, { summary: secret });
    if (!id) throw new Error('No synthetic job created');
    jobId = id;
  });

  afterAll(async () => {
    await db?.pool.query('delete from pgboss.job where name = $1', [queue]);
    await db?.pool.query('delete from pgboss.schedule where name = $1', [queue]);
    await db?.pool.query('delete from pgboss.queue where name = $1', [queue]);
    await shutdownBoss(boss).catch(() => {});
    await db?.close();
  });

  function run() {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/jobs-health.ts', '--queue', queue], {
      encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on' },
    });
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain(secret);
    return { code: result.status, rows: JSON.parse(result.stdout) };
  }

  it('reports a just-completed job as ok and exits 0 using the runtime role', async () => {
    await db.pool.query("update pgboss.job set state = 'completed', completed_on = now() where id = $1", [jobId]);
    expect(run()).toEqual({ code: 0, rows: [{ queue, cron: '*/5 * * * *', lastCompletedAt: expect.any(String), failures24h: 0, verdict: 'ok' }] });
  });

  it.each([
    ['*/5 * * * *', '11 minutes'],
    ['* * * * *', '3 minutes'],
    ['15 * * * *', '121 minutes'],
    ['30 3 * * *', '49 hours'],
  ])('reports a completion older than twice %s as stale and exits 1', async (cron, age) => {
    await db.pool.query('update pgboss.schedule set cron = $2 where name = $1', [queue, cron]);
    await db.pool.query("update pgboss.job set state = 'completed', completed_on = now() - $2::interval where id = $1", [jobId, age]);
    expect(run()).toMatchObject({ code: 1, rows: [{ queue, cron, failures24h: 0, verdict: 'stale' }] });
  });

  it('keeps daily queues ok between daily completions', async () => {
    await db.pool.query("update pgboss.schedule set cron = '45 3 * * *' where name = $1", [queue]);
    await db.pool.query("update pgboss.job set state = 'completed', completed_on = now() - interval '47 hours' where id = $1", [jobId]);
    expect(run()).toMatchObject({ code: 0, rows: [{ verdict: 'ok' }] });
  });

  it('counts recent terminal failures, takes precedence over stale, and exits 1', async () => {
    await db.pool.query("update pgboss.job set state = 'failed', completed_on = now() where id = $1", [jobId]);
    expect(run()).toEqual({ code: 1, rows: [{ queue, cron: '45 3 * * *', lastCompletedAt: null, failures24h: 1, verdict: 'failing' }] });
  });

  it('excludes failures older than 24h and treats no completion as stale', async () => {
    await db.pool.query("update pgboss.job set completed_on = now() - interval '25 hours' where id = $1", [jobId]);
    expect(run()).toMatchObject({ code: 1, rows: [{ lastCompletedAt: null, failures24h: 0, verdict: 'stale' }] });
  });


  it('reports missing schedule registrations as stale and lists all 12 expected queues', async () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/jobs-health.ts'], {
      encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on' },
    });
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(1);
    const rows = JSON.parse(result.stdout) as Array<{ queue: string }>;
    expect(rows.map((row) => row.queue)).toEqual(expect.arrayContaining([
      'core.attachments_purge', 'core.idempotency_purge', 'core.rate_limits_purge', 'core.sessions_purge',
      'dashboard.recovery_reconcile', 'knowledge.search.backfill', 'knowledge.search.drain', 'lifecycle.excerpt_purge',
      'voc.cluster_autogen_shadow', 'voc.cluster_suggestions', 'voc.embedding_backfill', 'voc.similarity_preview_cleanup',
    ]));
    await boss.unschedule(queue);
    // The synthetic queue is not in the expected list, so an unknown filter returns no health evidence, exit 1.
    expect(run()).toEqual({ code: 1, rows: [] });
  });

});
