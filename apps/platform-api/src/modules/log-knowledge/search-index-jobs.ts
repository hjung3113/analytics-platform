// pg-boss jobs of the search index (#1506 S-c, design log-knowledge-search §5.1–5.2). `knowledge.search.drain` (cron, every minute)
// keeps draining the outbox for most of the minute so a published Item is searchable within seconds, not a cron period; the cadence
// is a hypothesis until measured. `knowledge.search.backfill` (cron every 10 minutes and once at registration) enqueues `reindex`
// notifications for all published Items and resumes after an interruption. Both queues are pre-created by migration 0120.
// `JOBS_DISABLED` is honoured by the caller (`registerJobsUnlessDisabled`): nothing is registered, so neither runs.

import type { PgBoss } from 'pg-boss';

import type { Db } from '../../db/client.js';
import { type JobLog, JOB_WORK_OPTIONS, withJobLogging } from '../../lib/job-log.js';
import { BACKFILL_BATCH, DRAIN_BATCH, type DrainResult, backfillWorkspace, drainBatch, ensureBackfill, pruneDone, purgeRetiredGenerations, workspaceIds } from './repositories/search-index.js';

export const SEARCH_DRAIN_QUEUE = 'knowledge.search.drain';
export const SEARCH_BACKFILL_QUEUE = 'knowledge.search.backfill';
export const SEARCH_DRAIN_CRON = '* * * * *';
export const SEARCH_BACKFILL_CRON = '*/10 * * * *';

export interface DrainLoopOptions {
  batchSize?: number;
  /** How long one run keeps polling (default 55 s: the next cron run starts at 60 s). */
  maxMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Drains until the outbox has nothing due, then polls again until `maxMs` is used up. Returns the summed counts. */
export async function drainLoop(db: Db, options: DrainLoopOptions = {}): Promise<DrainResult> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + (options.maxMs ?? 55_000);
  const total: DrainResult = { claimed: 0, done: 0, failed: 0, dead: 0 };
  for (;;) {
    const batch = await drainBatch(db, { batchSize: options.batchSize ?? DRAIN_BATCH });
    total.claimed += batch.claimed;
    total.done += batch.done;
    total.failed += batch.failed;
    total.dead += batch.dead;
    if (now() >= deadline) break;
    if (batch.claimed >= (options.batchSize ?? DRAIN_BATCH)) continue; // a full batch: more is probably due
    if (now() + (options.pollMs ?? 2000) >= deadline) break;
    await sleep(options.pollMs ?? 2000);
  }
  return total;
}

/** One backfill pass over every workspace (resumes where a workspace stopped; a finished one costs two reads). */
export async function backfillAll(db: Db, batchSize = BACKFILL_BATCH): Promise<{ workspaces: number; enqueued: number }> {
  let enqueued = 0;
  const ids = await workspaceIds(db);
  for (const id of ids) {
    await db.transaction((tx) => ensureBackfill(tx, id));
    enqueued += (await backfillWorkspace(db, id, batchSize)).enqueued;
    await purgeRetiredGenerations(db, id);
  }
  return { workspaces: ids.length, enqueued };
}

export async function registerSearchIndexJobs(boss: PgBoss, deps: { db: Db; log: JobLog }): Promise<void> {
  const queues = await boss.getQueues([SEARCH_DRAIN_QUEUE, SEARCH_BACKFILL_QUEUE]);
  for (const name of [SEARCH_DRAIN_QUEUE, SEARCH_BACKFILL_QUEUE]) {
    if (!queues.some((q) => q.name === name)) throw new Error(`pg-boss queue '${name}' is not pre-created. Run migrations (0120).`);
  }
  await boss.work<Record<string, unknown>>(
    SEARCH_DRAIN_QUEUE,
    JOB_WORK_OPTIONS,
    withJobLogging(deps.log, SEARCH_DRAIN_QUEUE, async () => {
      const result = await drainLoop(deps.db);
      await pruneDone(deps.db);
      deps.log.info('knowledge.search.drain run', { ...result });
    }),
  );
  await boss.work<Record<string, unknown>>(
    SEARCH_BACKFILL_QUEUE,
    JOB_WORK_OPTIONS,
    withJobLogging(deps.log, SEARCH_BACKFILL_QUEUE, async () => {
      const result = await backfillAll(deps.db);
      deps.log.info('knowledge.search.backfill run', { ...result });
    }),
  );
  await boss.schedule(SEARCH_DRAIN_QUEUE, SEARCH_DRAIN_CRON, { correlation_id: 'cron' });
  await boss.schedule(SEARCH_BACKFILL_QUEUE, SEARCH_BACKFILL_CRON, { correlation_id: 'cron' });
  // The first pass right after the migration is deployed; the singleton key keeps restarts from stacking runs.
  await boss.send(SEARCH_BACKFILL_QUEUE, { correlation_id: 'boot' }, { singletonKey: 'boot' });
}
