// Daily purge of long-dead sessions (#1266 b5a, SEC-06 / OPS-11).
//
// `core.sessions` rows are checked for expiry and revocation on read
// (session-service.ts) but nothing deleted them, so the table grew without
// bound. This job deletes a session once its `expires_at` or `revoked_at`
// is older than the retention window (7 days). A session that is still
// active, or that died more recently, is never touched. Nothing references
// `core.sessions` (audit_log carries no session FK), so deleting is safe and
// no audit row is removed.
//
// Deletes run in batches so no single statement approaches the DB statement
// budget (`DB_STATEMENT_TIMEOUT_MS`, default 15 s); the loop ends when a
// batch comes back short, so a re-run on a clean table is a no-op.
//
// There is no index on `expires_at` / `revoked_at`: ADR-0015 requires every
// workspace-scoped index to start with `workspace_id`, and this cross-workspace
// query cannot use one. With 7-day retention the table stays in the low
// thousands of rows, so the batched delete is cheap without an index.

import { sql } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';
import { JOB_WORK_OPTIONS, type JobLog, withJobLogging } from '../../../lib/job-log.js';

/** Queue name. Format: `<module>.<action>` per ADR-0009. Pre-created in migration 0084. */
export const SESSIONS_PURGE_QUEUE = 'core.sessions_purge';

/** Daily at 03:30 UTC, off the :00/:15 slots used by the hourly purges. */
export const SESSIONS_PURGE_CRON = '30 3 * * *';

/** Days a session stays after it expired or was revoked. */
export const SESSIONS_RETENTION_DAYS = 7;

/** Rows per DELETE statement. */
export const SESSIONS_PURGE_BATCH_SIZE = 1000;

export interface SessionsPurgePayload {
  correlation_id: string;
}

export interface SessionsPurgeResult {
  deleted: number;
  batches: number;
}

/**
 * Pure handler — invoked by the pg-boss worker and directly from tests.
 * `batchSize` is injectable so tests can seed past it cheaply.
 */
export async function purgeDeadSessions(deps: {
  db: Db;
  batchSize?: number;
}): Promise<SessionsPurgeResult> {
  const batchSize = deps.batchSize ?? SESSIONS_PURGE_BATCH_SIZE;
  let deleted = 0;
  let batches = 0;
  for (;;) {
    const result = await deps.db.execute(sql`
      DELETE FROM core.sessions
       WHERE id IN (
         SELECT id FROM core.sessions
          WHERE expires_at < now() - make_interval(days => ${SESSIONS_RETENTION_DAYS})
             OR revoked_at < now() - make_interval(days => ${SESSIONS_RETENTION_DAYS})
          LIMIT ${batchSize}
       )
    `);
    const count = (result as { rowCount?: number }).rowCount ?? 0;
    deleted += count;
    batches += 1;
    if (count < batchSize) break;
  }
  return { deleted, batches };
}

/**
 * Wire the handler + daily cron into pg-boss. Queue is migration-owned
 * (0084): the runtime role cannot do pg-boss DDL.
 */
export async function registerSessionsPurge(
  boss: PgBoss,
  deps: { db: Db; log: JobLog },
): Promise<void> {
  const queues = await boss.getQueues([SESSIONS_PURGE_QUEUE]);
  if (queues.length === 0) {
    throw new Error(
      `pg-boss queue '${SESSIONS_PURGE_QUEUE}' is not pre-created. Run migrations (0084).`,
    );
  }

  const handler = async (jobs: Array<{ id: string; data: SessionsPurgePayload }>) => {
    for (const job of jobs) {
      const correlationId = job.data?.correlation_id ?? job.id;
      const { deleted, batches } = await purgeDeadSessions({ db: deps.db });
      deps.log?.info('core.sessions_purge complete', {
        correlation_id: correlationId,
        deleted,
        batches,
        job_id: job.id,
      });
    }
  };

  await boss.work<SessionsPurgePayload>(
    SESSIONS_PURGE_QUEUE,
    JOB_WORK_OPTIONS,
    withJobLogging(deps.log, SESSIONS_PURGE_QUEUE, handler),
  );

  await boss.schedule(SESSIONS_PURGE_QUEUE, SESSIONS_PURGE_CRON, {
    correlation_id: 'cron',
  });
}
