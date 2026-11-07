// Counters of the log explorer's token budget, export count and admin usage read (#1472, design log-explorer §4.1). COUNTERS ONLY: a key and
// an integer, never a body, a filter value or a file reference. They live in the existing `core.rate_limits` table (key, route_group, counter,
// expires_at; the app role already has DML on it and `rate-limits-purge` removes expired rows), so there is no migration. Every counter is
// per UTC day: the day is in the key, and the row expires `USAGE_RETENTION_DAYS` after that day so the admin read can look back.
//
// Key: `<workspace>:<t|a|s>:<id>:<metric>:<yyyy-mm-dd>`   t = API token, a = Actor (token calls only), s = Actor (session calls).
//   metrics: `bytes` (all response bodies, the budget basis), `exportBytes` (the export part of `bytes`), `reads`, `exports`.
// Export leases (1 concurrent export per token and per Actor) are rows of another route group that expire on their own after a crash.

import { randomInt } from 'node:crypto';

import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';

export const USAGE_GROUP = 'explorer_usage';
export const LEASE_GROUP = 'explorer_export_lease';
/** The day's row stays this long after the day ends, so the admin usage read can look back a week. */
export const USAGE_RETENTION_DAYS = 7;
/** An export's lease; the export itself is stopped before this (`EXPORT_TOTAL_MS`). */
export const EXPORT_LEASE_MS = 150_000;
const COUNTER_MAX = 2_147_483_647;
const DAY_MS = 86_400_000;

export type UsageKind = 'token' | 'actor' | 'session';
export interface UsageSubject {
  kind: UsageKind;
  id: string;
}
export type UsageMetric = 'bytes' | 'exportBytes' | 'reads' | 'exports';
export interface UsageEntry {
  kind: UsageKind;
  id: string;
  metric: UsageMetric;
  counter: number;
}

const KIND_CODE: Record<UsageKind, string> = { token: 't', actor: 'a', session: 's' };
const CODE_KIND: Record<string, UsageKind> = { t: 'token', a: 'actor', s: 'session' };
const METRICS: ReadonlySet<string> = new Set<UsageMetric>(['bytes', 'exportBytes', 'reads', 'exports']);

export interface UsageStore {
  /** The UTC day (`yyyy-mm-dd`) counters are written to now. */
  today(): string;
  /**
   * Adds `amount` (may be negative to undo). With `limit`, adds nothing and answers false when the counter would pass it.
   * `day` pins the UTC day to write to (a reservation takes it once, so its writes and refunds meet one set of counters across midnight);
   * absent = today.
   */
  add(workspaceId: string, subject: UsageSubject, metric: UsageMetric, amount: number, limit?: number, day?: string): Promise<boolean>;
  get(workspaceId: string, subject: UsageSubject, metric: UsageMetric): Promise<number>;
  /** A lease id when this subject had no live export (the lease expires by itself), else null. */
  acquireLease(workspaceId: string, subject: UsageSubject): Promise<number | null>;
  /** Deletes the lease only while it is still the one `leaseId` names: a late cleanup never frees a replacement lease. */
  releaseLease(workspaceId: string, subject: UsageSubject, leaseId: number): Promise<void>;
  /** Every counter of one day in a workspace. */
  list(workspaceId: string, day: string): Promise<UsageEntry[]>;
}

export const dayOf = (instant: Date): string => instant.toISOString().slice(0, 10);

const keyOf = (workspaceId: string, subject: UsageSubject, metric: string, day: string) =>
  `${workspaceId}:${KIND_CODE[subject.kind]}:${subject.id}:${metric}:${day}`;

export function createUsageStore(db: Db, clock: () => Date): UsageStore {
  const today = () => dayOf(clock());
  const expiryOf = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + (1 + USAGE_RETENTION_DAYS) * DAY_MS);

  return {
    today,

    async add(workspaceId, subject, metric, amount, limit, pinnedDay) {
      if (limit !== undefined && amount > limit) return false;
      const day = pinnedDay ?? today();
      const key = keyOf(workspaceId, subject, metric, day);
      const max = limit ?? COUNTER_MAX;
      // One statement: insert, or add and refuse (no row returned) when the limit would be passed. The counter saturates instead of overflowing.
      const result = await db.execute(sql`
        insert into core.rate_limits (key, route_group, counter, expires_at)
        values (${key}, ${USAGE_GROUP}, greatest(${amount}::bigint, 0)::int, ${expiryOf(day)})
        on conflict (key, route_group) do update
          set counter = least(greatest(core.rate_limits.counter::bigint + ${amount}::bigint, 0), ${COUNTER_MAX}::bigint)::int
          where core.rate_limits.counter::bigint + ${amount}::bigint <= ${max}::bigint
        returning counter`);
      return ((result as { rows?: unknown[] }).rows?.length ?? 0) > 0;
    },

    async get(workspaceId, subject, metric) {
      const key = keyOf(workspaceId, subject, metric, today());
      const result = await db.execute(sql`select counter from core.rate_limits where key = ${key} and route_group = ${USAGE_GROUP}`);
      const row = (result as unknown as { rows?: Array<{ counter: number }> }).rows?.[0];
      return row ? Number(row.counter) : 0;
    },

    async acquireLease(workspaceId, subject) {
      const key = `${workspaceId}:${KIND_CODE[subject.kind]}:${subject.id}`;
      const leaseId = randomInt(1, COUNTER_MAX);
      const result = await db.execute(sql`
        insert into core.rate_limits (key, route_group, counter, expires_at)
        values (${key}, ${LEASE_GROUP}, ${leaseId}::int, now() + (${EXPORT_LEASE_MS}::text || ' milliseconds')::interval)
        on conflict (key, route_group) do update
          set counter = ${leaseId}::int, expires_at = now() + (${EXPORT_LEASE_MS}::text || ' milliseconds')::interval
          where core.rate_limits.expires_at <= now()
        returning counter`);
      return ((result as { rows?: unknown[] }).rows?.length ?? 0) > 0 ? leaseId : null;
    },

    async releaseLease(workspaceId, subject, leaseId) {
      const key = `${workspaceId}:${KIND_CODE[subject.kind]}:${subject.id}`;
      // The lease id is the row's counter: a replacement lease has another id, so this delete matches nothing.
      await db.execute(sql`delete from core.rate_limits where key = ${key} and route_group = ${LEASE_GROUP} and counter = ${leaseId}::int`);
    },

    async list(workspaceId, day) {
      const pattern = `${workspaceId}:%:${day}`;
      const result = await db.execute(sql`select key, counter from core.rate_limits where route_group = ${USAGE_GROUP} and key like ${pattern}`);
      const rows = (result as unknown as { rows?: Array<{ key: string; counter: number }> }).rows ?? [];
      const entries: UsageEntry[] = [];
      for (const row of rows) {
        const [, code, id, metric] = row.key.split(':');
        const kind = code ? CODE_KIND[code] : undefined;
        if (kind && id && metric && METRICS.has(metric)) entries.push({ kind, id, metric: metric as UsageMetric, counter: Number(row.counter) });
      }
      return entries;
    },
  };
}
