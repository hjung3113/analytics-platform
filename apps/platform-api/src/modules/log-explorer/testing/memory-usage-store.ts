// In-memory `UsageStore` for DB-free tests (dev/test only; the production entry never imports `testing/`). Same rules as the `core.rate_limits`
// store: per UTC day, conditional add, saturating, one lease per subject that a test can expire.
import { dayOf, type UsageEntry, type UsageKind, type UsageMetric, type UsageStore, type UsageSubject } from '../usage-store.js';

export interface MemoryUsageStore extends UsageStore {
  counters: Map<string, number>;
  leases: Map<string, number>;
  /** Test seam: forget every live lease (a crashed export whose lease ran out). */
  expireLeases(): void;
}

export function createMemoryUsageStore(clock: () => Date): MemoryUsageStore {
  const counters = new Map<string, number>();
  const leases = new Map<string, number>();
  let nextLease = 0;
  const key = (ws: string, s: UsageSubject, metric: string, day: string) => `${ws}|${s.kind}|${s.id}|${metric}|${day}`;
  const today = () => dayOf(clock());
  return {
    counters,
    leases,
    expireLeases: () => leases.clear(),
    today,
    async add(ws, subject, metric, amount, limit, day) {
      if (limit !== undefined && amount > limit) return false;
      const k = key(ws, subject, metric, day ?? today());
      const next = Math.max(0, (counters.get(k) ?? 0) + amount);
      if (limit !== undefined && (counters.get(k) ?? 0) + amount > limit) return false;
      counters.set(k, Math.min(next, 2_147_483_647));
      return true;
    },
    async get(ws, subject, metric) {
      return counters.get(key(ws, subject, metric, today())) ?? 0;
    },
    async acquireLease(ws, subject) {
      const k = key(ws, subject, 'lease', '');
      if (leases.has(k)) return null;
      nextLease += 1;
      leases.set(k, nextLease);
      return nextLease;
    },
    async releaseLease(ws, subject, leaseId) {
      const k = key(ws, subject, 'lease', '');
      if (leases.get(k) === leaseId) leases.delete(k);
    },
    async list(ws, day) {
      const entries: UsageEntry[] = [];
      for (const [k, counter] of counters) {
        const [w, kind, id, metric, d] = k.split('|');
        if (w === ws && d === day) entries.push({ kind: kind as UsageKind, id: id as string, metric: metric as UsageMetric, counter });
      }
      return entries;
    },
  };
}
