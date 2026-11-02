// Guarded replay of failed pg-boss jobs.
//
// Usage:
//   node dist/cli/jobs-replay.js --queue notifications.dispatch --state failed \
//     [--since <iso>] [--limit <1..500>] [--apply]
//
// Dry run by default: prints the job ids it WOULD retry. `--apply` calls
// `boss.retry(queue, ids)`. Only `notifications.dispatch` is allowlisted (its
// handler is idempotent on the inbox conflict target and on `email_sent_at`);
// other queues are not proven replay-safe and are refused with exit 2.
//
// Environment: DATABASE_URL (the runtime role). It holds SELECT/UPDATE on all
// pgboss tables (migration 0002), which is all `retry` needs: no DDL.
// Output: JSON with queue, state, selected ids and counts. Job `data` payloads
// are never selected or printed.
// Exit codes: 0 ok, 1 failure, 2 usage error or refused queue.

import pg from 'pg';
import { PgBoss } from 'pg-boss';

import type { Queryable } from './jobs-inventory.js';
import { UsageError } from './jobs-inventory.js';

export const REPLAY_ALLOWLIST: readonly string[] = ['notifications.dispatch'];
export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

export interface ReplayOptions {
  queue: string;
  state: string;
  since?: Date | undefined;
  limit: number;
  apply: boolean;
}

export interface ReplaySummary {
  queue: string;
  state: 'failed';
  mode: 'dry-run' | 'apply';
  since: string | null;
  limit: number;
  selected: number;
  retried: number;
  job_ids: string[];
}

export interface RetryTarget {
  retry(name: string, ids: string[]): Promise<unknown>;
}

export function parseReplayArgs(argv: string[]): ReplayOptions {
  let queue: string | undefined;
  let state: string | undefined;
  let since: Date | undefined;
  let limit = DEFAULT_LIMIT;
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--apply') {
      apply = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`Unknown or incomplete argument '${flag}'.`);
    }
    i += 1;
    if (flag === '--queue') queue = value;
    else if (flag === '--state') state = value;
    else if (flag === '--since') {
      since = new Date(value);
      if (Number.isNaN(since.getTime())) throw new UsageError('--since must be an ISO timestamp.');
    } else if (flag === '--limit') {
      if (!/^\d+$/.test(value)) throw new UsageError('--limit must be a positive integer.');
      limit = Number(value);
    } else throw new UsageError(`Unknown argument '${flag}'.`);
  }
  if (!queue) throw new UsageError('--queue is required.');
  if (!state) throw new UsageError('--state is required (only "failed" is supported).');
  return { queue, state, since, limit, apply };
}

export async function replayFailedJobs(
  db: Queryable,
  boss: RetryTarget,
  options: ReplayOptions,
): Promise<ReplaySummary> {
  if (!REPLAY_ALLOWLIST.includes(options.queue)) {
    throw new UsageError(
      `Queue '${options.queue}' is not replay-safe; allowed: ${REPLAY_ALLOWLIST.join(', ')}.`,
    );
  }
  if (options.state !== 'failed') throw new UsageError('Only --state failed can be replayed.');
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > MAX_LIMIT) {
    throw new UsageError(`--limit must be between 1 and ${MAX_LIMIT}.`);
  }
  const selected = await db.query<{ id: string }>(
    `select id from pgboss.job
      where name = $1 and state = 'failed'
        and ($2::timestamptz is null or created_on >= $2)
      order by created_on, id
      limit $3`,
    [options.queue, options.since ?? null, options.limit],
  );
  const ids = selected.rows.map((row) => row.id);
  if (options.apply && ids.length > 0) await boss.retry(options.queue, ids);
  return {
    queue: options.queue,
    state: 'failed',
    mode: options.apply ? 'apply' : 'dry-run',
    since: options.since ? options.since.toISOString() : null,
    limit: options.limit,
    selected: ids.length,
    retried: options.apply ? ids.length : 0,
    job_ids: ids,
  };
}

async function main(): Promise<void> {
  const options = parseReplayArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new UsageError('DATABASE_URL is required.');
  // Refuse before opening any connection when the queue is not allowlisted.
  if (!REPLAY_ALLOWLIST.includes(options.queue)) {
    throw new UsageError(
      `Queue '${options.queue}' is not replay-safe; allowed: ${REPLAY_ALLOWLIST.join(', ')}.`,
    );
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const boss = new PgBoss({
    connectionString: url,
    schema: 'pgboss',
    migrate: false,
    createSchema: false,
    supervise: false,
    schedule: false,
  });
  boss.on('error', () => {});
  try {
    if (options.apply) await boss.start();
    const summary = await replayFailedJobs(pool, boss, options);
    console.info(JSON.stringify(summary, null, 2));
  } finally {
    if (options.apply) await boss.stop({ graceful: false, close: true }).catch(() => {});
    await pool.end();
  }
}

const invokedAsScript =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('jobs-replay.ts') === true ||
  process.argv[1]?.endsWith('jobs-replay.js') === true;

if (invokedAsScript) {
  main().catch((err: unknown) => {
    if (err instanceof UsageError) {
      console.error(`jobs-replay: ${err.message}`);
      process.exit(2);
    }
    const name = err instanceof Error ? err.name : typeof err;
    console.error(`jobs-replay failed: ${name}`);
    process.exit(1);
  });
}
