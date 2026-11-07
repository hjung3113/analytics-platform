// Daily excerpt retention purge (#1445 d, ADR-0117 decision 7): the BODY of a log excerpt is physically erased once its
// Round has been closed for `excerptRetentionDays` (workspace queue setting, default 90). Rule results, evidence
// locations and hashes stay; the excerpt then reads as deleted. The erasure itself is the migration's definer function
// (`log_lifecycle.erase_excerpts`): the runtime role has no UPDATE on the table.
//
// Idempotent (an erased row is skipped), batch-limited (EXCERPT_ERASE_BATCH rows per statement) and audited with one
// summary row per workspace and run: counts only, never text. The clock is injectable for tests; the cutoff is
// `now - retention days` compared with the Round's `closed_at`. The queue is migration-owned (0108).

import { sql } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';

import type { Db } from '../../db/client.js';
import { type JobLog, JOB_WORK_OPTIONS, withJobLogging } from '../../lib/job-log.js';
import { createAuditService } from '../core/audit/audit-service.js';
import { EXCERPT_ERASE_BATCH, eraseExcerpts, getQueueSettings } from './repositories/queue-write.js';

/** Queue name. Format: `<module>.<action>` per ADR-0009. Pre-created in migration 0108. */
export const EXCERPT_PURGE_QUEUE = 'lifecycle.excerpt_purge';
/** Daily at 03:45 UTC, off the slots of the other purges. */
export const EXCERPT_PURGE_CRON = '45 3 * * *';
/** The `deleted_reason` the job writes. */
export const EXCERPT_RETENTION_REASON = 'retention';

export interface ExcerptPurgePayload {
  correlation_id: string;
}
export interface ExcerptPurgeResult {
  workspaces: number;
  erased: number;
}

export async function purgeExpiredExcerpts(deps: { db: Db; now?: () => Date; batchSize?: number; log?: JobLog }): Promise<ExcerptPurgeResult> {
  const now = deps.now ?? (() => new Date());
  const batch = deps.batchSize ?? EXCERPT_ERASE_BATCH;
  const audit = createAuditService();
  const found = await deps.db.execute(sql`select distinct workspace_id from log_lifecycle.rule_result_excerpt where deleted_at is null`);
  const workspaceIds = (found as unknown as { rows: { workspace_id: string }[] }).rows.map((r) => r.workspace_id);
  let erased = 0;
  let workspaces = 0;
  for (const workspaceId of workspaceIds) {
    const count = await deps.db.transaction(async (tx) => {
      const settings = await getQueueSettings(tx, workspaceId);
      const closedBefore = new Date(now().getTime() - settings.excerptRetentionDays * 86_400_000);
      let total = 0;
      for (;;) {
        const n = await eraseExcerpts(tx, workspaceId, { closedBefore }, EXCERPT_RETENTION_REASON, batch);
        total += n;
        if (n < batch) break;
      }
      if (total === 0) return 0;
      const sys = await tx.execute(sql`select id from core.actors where workspace_id = ${workspaceId} and actor_type = 'system' order by created_at limit 1`);
      const actorId = (sys as unknown as { rows: { id: string }[] }).rows[0]?.id;
      if (!actorId) throw new Error('excerpt purge: the workspace has no system actor to audit as');
      await audit.record(tx, {
        workspace_id: workspaceId,
        actor_id: actorId,
        event_type: 'lifecycle.excerpt.purged',
        subject_type: 'queue_settings',
        subject_id: workspaceId,
        summary: 'log excerpts purged after retention',
        detail: { count: total, retentionDays: settings.excerptRetentionDays },
      });
      return total;
    });
    if (count > 0) workspaces += 1;
    erased += count;
  }
  deps.log?.info('lifecycle.excerpt_purge complete', { workspaces, erased });
  return { workspaces, erased };
}

/** Wire the handler + daily cron into pg-boss (idempotent, same contract as the core purges). */
export async function registerExcerptPurge(boss: PgBoss, deps: { db: Db; log: JobLog }): Promise<void> {
  const queues = await boss.getQueues([EXCERPT_PURGE_QUEUE]);
  if (queues.length === 0) {
    throw new Error(`pg-boss queue '${EXCERPT_PURGE_QUEUE}' is not pre-created. Run migrations (0108).`);
  }
  const handler = async (jobs: Array<{ id: string; data: ExcerptPurgePayload }>) => {
    for (const job of jobs) {
      const result = await purgeExpiredExcerpts({ db: deps.db, log: deps.log });
      deps.log.info('lifecycle.excerpt_purge job', { correlation_id: job.data?.correlation_id ?? job.id, job_id: job.id, ...result });
    }
  };
  await boss.work<ExcerptPurgePayload>(EXCERPT_PURGE_QUEUE, JOB_WORK_OPTIONS, withJobLogging(deps.log, EXCERPT_PURGE_QUEUE, handler));
  await boss.schedule(EXCERPT_PURGE_QUEUE, EXCERPT_PURGE_CRON, { correlation_id: 'cron' });
}
