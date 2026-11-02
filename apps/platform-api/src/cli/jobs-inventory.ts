// Read-only pg-boss job inventory: queue x state counts.
//
// Usage:
//   node dist/cli/jobs-inventory.js [--queue <name>] [--state <state>]
//   pnpm --filter @ap/platform-api exec tsx src/cli/jobs-inventory.ts [...]
//
// Environment: DATABASE_URL (the runtime role; it has SELECT on pgboss.*).
// Output: one JSON document on stdout with queue, state, count, oldest/newest
// creation timestamps and the maximum retry count. Job `data` payloads are
// never selected or printed (they hold actor ids and summaries).
// Exit codes: 0 ok, 1 failure, 2 usage error.

import pg from 'pg';

export const JOB_STATES = [
  'created',
  'retry',
  'active',
  'completed',
  'cancelled',
  'failed',
] as const;

export interface InventoryRow {
  queue: string;
  state: string;
  count: number;
  oldest_created_on: string | null;
  newest_created_on: string | null;
  max_retry_count: number;
}

export interface InventoryFilter {
  queue?: string;
  state?: string;
}

export interface Queryable {
  query<R extends pg.QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

export class UsageError extends Error {}

export async function collectInventory(
  db: Queryable,
  filter: InventoryFilter = {},
): Promise<InventoryRow[]> {
  if (filter.state !== undefined && !(JOB_STATES as readonly string[]).includes(filter.state)) {
    throw new UsageError(`--state must be one of ${JOB_STATES.join(', ')}.`);
  }
  const result = await db.query<{
    queue: string;
    state: string;
    count: number;
    oldest: Date | null;
    newest: Date | null;
    max_retry: number;
  }>(
    `select name as queue, state::text as state, count(*)::int as count,
            min(created_on) as oldest, max(created_on) as newest,
            coalesce(max(retry_count), 0)::int as max_retry
       from pgboss.job
      where ($1::text is null or name = $1)
        and ($2::text is null or state::text = $2)
      group by name, state
      order by name, state`,
    [filter.queue ?? null, filter.state ?? null],
  );
  return result.rows.map((row) => ({
    queue: row.queue,
    state: row.state,
    count: row.count,
    oldest_created_on: row.oldest ? row.oldest.toISOString() : null,
    newest_created_on: row.newest ? row.newest.toISOString() : null,
    max_retry_count: row.max_retry,
  }));
}

export function parseInventoryArgs(argv: string[]): InventoryFilter {
  const filter: InventoryFilter = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag === '--queue' || flag === '--state') && value !== undefined && !value.startsWith('--')) {
      filter[flag === '--queue' ? 'queue' : 'state'] = value;
      i += 1;
    } else {
      throw new UsageError(`Unknown or incomplete argument '${flag}'.`);
    }
  }
  return filter;
}

async function main(): Promise<void> {
  const filter = parseInventoryArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new UsageError('DATABASE_URL is required.');
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const rows = await collectInventory(pool, filter);
    console.info(JSON.stringify({ filter, groups: rows }, null, 2));
  } finally {
    await pool.end();
  }
}

const invokedAsScript =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('jobs-inventory.ts') === true ||
  process.argv[1]?.endsWith('jobs-inventory.js') === true;

if (invokedAsScript) {
  main().catch((err: unknown) => {
    if (err instanceof UsageError) {
      console.error(`jobs-inventory: ${err.message}`);
      process.exit(2);
    }
    const name = err instanceof Error ? err.name : typeof err;
    console.error(`jobs-inventory failed: ${name}`);
    process.exit(1);
  });
}
