// Read-only health of scheduled pg-boss queues. Never selects job/schedule payloads.
// Usage: node dist/cli/jobs-health.js [--queue <name>]
// Environment: DATABASE_URL (runtime role). Exit 0: all ok; 1: unhealthy/error; 2: usage.
import pg from 'pg';

import { type Queryable, UsageError, parseInventoryArgs } from './jobs-inventory.js';

// Include queues with missing cron registrations: absence must not silently pass health checks.
export const SCHEDULED_QUEUES = [
  'core.attachments_purge',
  'core.idempotency_purge',
  'core.rate_limits_purge',
  'core.sessions_purge',
  'dashboard.recovery_reconcile',
  'knowledge.search.backfill',
  'knowledge.search.drain',
  'lifecycle.excerpt_purge',
  'voc.cluster_autogen_shadow',
  'voc.cluster_suggestions',
  'voc.embedding_backfill',
  'voc.similarity_preview_cleanup',
] as const;

export interface HealthRow {
  queue: string;
  cron: string | null;
  lastCompletedAt: string | null;
  failures24h: number;
  verdict: 'ok' | 'stale' | 'failing';
}

// All current schedules recur every day with fixed/stepped minute and hour fields.
// Use the largest gap across a day (including midnight), rather than assuming a
// stepped expression divides evenly into 60. Unsupported calendar expressions
// fail closed instead of silently inventing a period. No new runtime dependency.
export function cronPeriodMs(cron: string): number {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5 || fields.slice(2).some((field) => field !== '*')) {
    throw new Error('Unsupported health-check cron cadence');
  }
  function matches(field: string, value: number, maximum: number): boolean {
    if (field === '*') return true;
    if (/^\*\/[1-9]\d*$/.test(field)) {
      const step = Number(field.slice(2));
      if (step <= maximum + 1) return value % step === 0;
    } else if (/^\d+$/.test(field) && Number(field) <= maximum) {
      return value === Number(field);
    }
    throw new Error('Unsupported health-check cron field');
  }
  const minutes = fields[0] ?? '';
  const hours = fields[1] ?? '';
  const times: number[] = [];
  for (let minute = 0; minute < 1440; minute += 1) {
    if (matches(minutes, minute % 60, 59) && matches(hours, Math.floor(minute / 60), 23)) {
      times.push(minute);
    }
  }
  const first = times[0];
  const last = times[times.length - 1];
  if (first === undefined || last === undefined) throw new Error('Empty health-check cron cadence');
  let gap = 1440 + first - last;
  for (let i = 1; i < times.length; i += 1) {
    gap = Math.max(gap, (times[i] ?? 0) - (times[i - 1] ?? 0));
  }
  return gap * 60_000;
}

export async function collectHealth(db: Queryable, queue?: string): Promise<HealthRow[]> {
  const result = await db.query<{
    queue: string;
    cron: string | null;
    last_completed: Date | null;
    failures: number;
    as_of: Date;
  }>(
    `with queues as (
       select unnest($1::text[]) as name
       union select name from pgboss.schedule
     ), history as (
       select name, max(completed_on) filter (where state = 'completed') as last_completed,
              count(*) filter (where state = 'failed' and completed_on >= now() - interval '24 hours')::int as failures
         from pgboss.job
        where ($2::text is null or name = $2)
        group by name
     )
     select q.name as queue, s.cron, h.last_completed, coalesce(h.failures, 0)::int as failures, now() as as_of
       from queues q
       left join pgboss.schedule s on s.name = q.name and s.key = ''
       left join history h on h.name = q.name
      where ($2::text is null or q.name = $2)
      order by q.name`,
    [SCHEDULED_QUEUES, queue ?? null],
  );
  return result.rows.map((row) => {
    const period = row.cron ? cronPeriodMs(row.cron) : null;
    const stale = !row.last_completed || period === null ||
      row.as_of.getTime() - row.last_completed.getTime() > 2 * period;
    return {
      queue: row.queue,
      cron: row.cron,
      lastCompletedAt: row.last_completed?.toISOString() ?? null,
      failures24h: row.failures,
      verdict: row.failures > 0 ? 'failing' : stale ? 'stale' : 'ok',
    };
  });
}

async function main(): Promise<void> {
  const filter = parseInventoryArgs(process.argv.slice(2));
  if (filter.state !== undefined) throw new UsageError('Only --queue is supported.');
  const url = process.env.DATABASE_URL;
  if (!url) throw new UsageError('DATABASE_URL is required.');
  const pool = new pg.Pool({ connectionString: url, max: 1, statement_timeout: 30_000, connectionTimeoutMillis: 10_000 });
  try {
    const rows = await collectHealth(pool, filter.queue);
    console.info(JSON.stringify(rows, null, 2));
    process.exitCode = rows.length > 0 && rows.every((row) => row.verdict === 'ok') ? 0 : 1;
  } finally {
    await pool.end();
  }
}

const invokedAsScript = import.meta.url === `file://${process.argv[1]}` ||
  /(?:^|\/)jobs-health\.(?:ts|js)$/.test(process.argv[1] ?? '');
if (invokedAsScript) {
  main().catch((err: unknown) => {
    if (err instanceof UsageError) {
      console.error(`jobs-health: ${err.message}`);
      process.exitCode = 2;
    } else {
      console.error(`jobs-health failed: ${err instanceof Error ? err.name : typeof err}`);
      process.exitCode = 1;
    }
  });
}
