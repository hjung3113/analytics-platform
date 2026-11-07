// `logExplorer.usage` (#1472, design log-explorer §4.1 «관리자 집계»): per token and per Actor, the response-body bytes, reads, exports and
// export bytes of one UTC day, from the counters (usage-store.ts). Admin only: the entry right is `console:access` (the `workspace.admin`
// capability, session-only, so an API token can never call it). Counters carry no body, filter value or file reference.

import { EXPORT_DAILY_MAX, TOKEN_DAILY_BODY_BUDGET_BYTES, usageResponseSchema } from '@ap/contract-schemas';

import type { EndpointResult, MenuEndpointDeclaration } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import type { LogExplorerReadDeps } from './deps.js';
import { createUsageStore, dayOf, type UsageEntry, USAGE_RETENTION_DAYS } from './usage-store.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ROWS_MAX = 500;

export function logExplorerUsageEndpoint(deps: LogExplorerReadDeps, menuId: string): MenuEndpointDeclaration {
  const usage = deps.usage ?? createUsageStore(deps.db, deps.clock);

  /** The requested day, or the refusal message. A day older than the retention is refused, not answered empty. */
  function dayOfParams(params: Record<string, unknown>): { ok: true; day: string } | { ok: false; message: string } {
    const today = dayOf(deps.clock());
    const asked = params.day ?? today;
    if (typeof asked !== 'string' || !DAY.test(asked) || Number.isNaN(Date.parse(`${asked}T00:00:00Z`))) return { ok: false, message: 'invalid params: day: must be yyyy-mm-dd' };
    const ageDays = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${asked}T00:00:00Z`)) / 86_400_000;
    if (ageDays < 0 || ageDays > USAGE_RETENTION_DAYS) return { ok: false, message: `invalid params: day: within the last ${USAGE_RETENTION_DAYS} days` };
    return { ok: true, day: asked };
  }

  return {
    spec: {
      id: 'logExplorer.usage',
      menuId,
      paramKeys: ['day'],
      permission: 'console:access',
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'console:access', tx ? { tx } : {}),
    validate: (params) => {
      const day = dayOfParams(params);
      return day.ok ? { ok: true } : day;
    },
    async handle(args): Promise<EndpointResult> {
      const day = dayOfParams(args.params);
      if (!day.ok) return { outcome: 'error', data: null, message: day.message };
      const byKey = new Map<string, { kind: UsageEntry['kind']; id: string; counters: Partial<Record<UsageEntry['metric'], number>> }>();
      for (const entry of await usage.list(args.actor.workspace_id, day.day)) {
        const key = `${entry.kind}:${entry.id}`;
        const row = byKey.get(key) ?? { kind: entry.kind, id: entry.id, counters: {} };
        row.counters[entry.metric] = entry.counter;
        byKey.set(key, row);
      }
      const rows = [...byKey.values()]
        .map(({ kind, id, counters }) => {
          const bytes = counters.bytes ?? 0;
          const exportBytes = counters.exportBytes ?? 0;
          const exports = counters.exports ?? 0;
          return {
            kind,
            id,
            day: day.day,
            bytes,
            readBytes: Math.max(0, bytes - exportBytes),
            exportBytes,
            reads: counters.reads ?? 0,
            exports,
            atLimit: (kind !== 'session' && bytes >= TOKEN_DAILY_BODY_BUDGET_BYTES) || exports >= EXPORT_DAILY_MAX,
          };
        })
        .sort((a, b) => b.bytes - a.bytes || a.id.localeCompare(b.id))
        .slice(0, ROWS_MAX);
      const data = usageResponseSchema.parse({ day: day.day, limits: { dailyBodyBytes: TOKEN_DAILY_BODY_BUDGET_BYTES, dailyExports: EXPORT_DAILY_MAX }, rows });
      return { outcome: 'ok', data };
    },
  };
}
