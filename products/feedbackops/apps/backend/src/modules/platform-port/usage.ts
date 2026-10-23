// Platform port `recordUsage` + `usageSummary` (ADR-0069 decisions 1, 2, 4; #622). The module
// writes its own `platform.usage_events` table. Validation mirrors the reference server
// (`packages/mock-server/src/server.ts` recordUsage) and the binding UsageEvent rule of
// http-adapter-contract §1: identity fields only, the whole batch or nothing.

import { and, count, countDistinct, eq, gte, lt, max, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { usageEvents } from '../../db/schema/platform.js';
import type { CheckService } from '../permissions/check-service.js';
import type { AuditJudgement } from './audit-service.js';
import { type PlatformActor, holdsPlatformPermission } from './permissions.js';

/** `UsageVia` of the root `packages/contracts/src/adapter.ts`; `usage-vocabulary.test.ts` pins it. */
export const PLATFORM_USAGE_VIA = [
  'sidebar',
  'switcher',
  'palette',
  'board',
  'return',
  'crossLink',
  'drill',
  'history',
  'direct',
  'link',
] as const;

const MAX_BATCH = 20;
const REQUIRED_KEYS = ['name', 'menuId', 'spaceId', 'path', 'at', 'sessionId'] as const;
const DWELL_KEYS = ['dwellMs', 'enteredAt'] as const;
const OPTIONAL_KEYS = ['source', 'stayId', 'via', 'fromMenuId'] as const;

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** False for anything but a string without `? # &` or whitespace, non-empty and within `max`. */
export function validIdentifier(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[?#&\s]/.test(value)
  );
}

/** A space id is null (a global menu) or an identifier like a menu id: this server does not know the app's spaces (ADR-0072), so it judges the shape only. */
export function validSpaceId(value: unknown): value is string | null {
  return value === null || validIdentifier(value, 80);
}

export interface ParsedUsageEvent {
  name: 'entry' | 'dwell';
  menuId: string;
  spaceId: string | null;
  path: string;
  clientAt: number;
  sessionId: string;
  dwellMs: number | null;
  enteredAt: number | null;
  source: 'main' | 'board';
  stayId: string | null;
  via: string | null;
  fromMenuId: string | null;
}

function parseUsageEvent(raw: unknown): ParsedUsageEvent | null {
  if (!isPlainObject(raw)) return null;
  const { name } = raw;
  if (name !== 'entry' && name !== 'dwell') return null;
  const required: readonly string[] =
    name === 'dwell' ? [...REQUIRED_KEYS, ...DWELL_KEYS] : REQUIRED_KEYS;
  const keys = Object.keys(raw);
  if (
    keys.some((k) => !required.includes(k) && !(OPTIONAL_KEYS as readonly string[]).includes(k))
  ) {
    return null;
  }
  if (required.some((k) => !keys.includes(k))) return null;

  const { menuId, spaceId, path, at, sessionId } = raw;
  if (!validIdentifier(menuId, 80) || !validIdentifier(path, 200)) return null;
  if (typeof sessionId !== 'string' || !validSpaceId(spaceId)) return null;
  // Client epoch ms land in bigint columns: a non-integer or unsafe number is a bad shape.
  if (typeof at !== 'number' || !Number.isSafeInteger(at)) return null;

  let source: 'main' | 'board' = 'main';
  if ('source' in raw) {
    if (raw.source !== 'main' && raw.source !== 'board') return null;
    source = raw.source;
  }
  let stayId: string | null = null;
  if ('stayId' in raw) {
    if (source !== 'board' || !validIdentifier(raw.stayId, 80)) return null;
    stayId = raw.stayId;
  }

  // Binding §1 rule: `via` / `fromMenuId` only on a main-screen entry; `via` in the closed set,
  // `fromMenuId` a menu id or null.
  let via: string | null = null;
  let fromMenuId: string | null = null;
  if ('via' in raw || 'fromMenuId' in raw) {
    if (name !== 'entry' || source !== 'main') return null;
    if ('via' in raw) {
      if (!(PLATFORM_USAGE_VIA as readonly unknown[]).includes(raw.via)) return null;
      via = raw.via as string;
    }
    if ('fromMenuId' in raw && raw.fromMenuId !== null) {
      if (!validIdentifier(raw.fromMenuId, 80)) return null;
      fromMenuId = raw.fromMenuId;
    }
  }

  let dwellMs: number | null = null;
  let enteredAt: number | null = null;
  if (name === 'dwell') {
    if (typeof raw.enteredAt !== 'number' || !Number.isSafeInteger(raw.enteredAt)) return null;
    // `dwell_ms` is a 32-bit column; ten days of dwell is far beyond any real stay.
    if (
      typeof raw.dwellMs !== 'number' ||
      !Number.isInteger(raw.dwellMs) ||
      raw.dwellMs < 0 ||
      raw.dwellMs > 2_147_483_647
    ) {
      return null;
    }
    dwellMs = raw.dwellMs;
    enteredAt = raw.enteredAt;
  }

  return {
    name,
    menuId,
    spaceId,
    path,
    clientAt: at,
    sessionId,
    dwellMs,
    enteredAt,
    source,
    stayId,
    via,
    fromMenuId,
  };
}

/** `{ events: UsageEvent[] }` → the parsed batch, or null when anything about it is invalid. */
export function parseUsageBatch(body: unknown): ParsedUsageEvent[] | null {
  if (!isPlainObject(body)) return null;
  if (Object.keys(body).length !== 1 || !('events' in body)) return null;
  const { events } = body;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_BATCH) return null;
  const parsed: ParsedUsageEvent[] = [];
  for (const raw of events) {
    const event = parseUsageEvent(raw);
    if (!event) return null;
    parsed.push(event);
  }
  return parsed;
}

export type UsageRangeQuery = { preset: 'all' } | { from: number; to: number };

const NON_NEGATIVE_INTEGER = /^\d+$/;

function parseBound(value: unknown): number | null {
  if (typeof value !== 'string' || !NON_NEGATIVE_INTEGER.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Exactly `preset=all`, or exactly `from` and `to` (ms, `from < to`); anything else is null. */
export function parseUsageRange(query: unknown): UsageRangeQuery | null {
  if (!isPlainObject(query)) return null;
  const keys = Object.keys(query);
  if (keys.length === 1 && query.preset === 'all') return { preset: 'all' };
  if (keys.length !== 2 || !('from' in query) || !('to' in query)) return null;
  const from = parseBound(query.from);
  const to = parseBound(query.to);
  // 8.64e15 ms is the largest instant a JS Date (and so the range filter) can represent.
  if (from === null || to === null || from >= to || to > 8_640_000_000_000_000) return null;
  return { from, to };
}

export interface UsageMenuSummary {
  menuId: string;
  visits: number;
  distinctUsers: number;
  lastUsedAt: number;
}

export interface UsageSummaryData {
  preset: 'all' | 'range';
  menus: UsageMenuSummary[];
}

export interface PlatformUsageServiceDeps {
  db: Db;
  checkService: CheckService;
}

export function createPlatformUsageService(deps: PlatformUsageServiceDeps) {
  /**
   * Whole batch in one transaction. The server stamps actor and `received_at`; the client's
   * `at` / `enteredAt` are stored but never read back. A dwell replaces the earlier dwell of the
   * same stay (real-server-checklist l.130): keyed by `stayId` when present, else by `enteredAt`.
   * Postgres takes one conflict target per INSERT, so the two keys are two statements.
   */
  async function recordUsage(actor: PlatformActor, events: ParsedUsageEvent[]): Promise<void> {
    await deps.db.transaction(async (tx) => {
      for (const event of events) {
        const row = {
          workspaceId: actor.workspace_id,
          actorId: actor.actor_id,
          name: event.name,
          menuId: event.menuId,
          spaceId: event.spaceId,
          path: event.path,
          clientAt: event.clientAt,
          sessionId: event.sessionId,
          dwellMs: event.dwellMs,
          enteredAt: event.enteredAt,
          source: event.source,
          stayId: event.stayId,
          via: event.via,
          fromMenuId: event.fromMenuId,
        };
        if (event.name === 'entry') {
          await tx.insert(usageEvents).values(row);
          continue;
        }
        const replace = {
          dwellMs: event.dwellMs,
          clientAt: event.clientAt,
          receivedAt: sql`now()`,
        };
        // `targetWhere` restates the matching partial index's predicate (unqualified columns).
        const insert = tx.insert(usageEvents).values(row);
        if (event.stayId !== null) {
          await insert.onConflictDoUpdate({
            target: [
              usageEvents.workspaceId,
              usageEvents.actorId,
              usageEvents.sessionId,
              usageEvents.menuId,
              usageEvents.stayId,
            ],
            targetWhere: sql`name = 'dwell' and stay_id is not null`,
            set: replace,
          });
        } else {
          await insert.onConflictDoUpdate({
            target: [
              usageEvents.workspaceId,
              usageEvents.actorId,
              usageEvents.sessionId,
              usageEvents.menuId,
              usageEvents.enteredAt,
            ],
            targetWhere: sql`name = 'dwell' and stay_id is null`,
            set: replace,
          });
        }
      }
    });
  }

  /** `console:access` before the query is read, as the reference server does. */
  async function usageSummary(
    actor: PlatformActor,
    query: unknown,
  ): Promise<AuditJudgement<UsageSummaryData>> {
    if (!(await holdsPlatformPermission(deps.checkService, actor, 'console:access'))) {
      return { outcome: 'forbidden', message: 'No permission console:access' };
    }
    const range = parseUsageRange(query);
    if (!range) return { outcome: 'error', message: 'Invalid usage range' };
    const inRange =
      'preset' in range
        ? undefined
        : and(
            gte(usageEvents.receivedAt, new Date(range.from)),
            lt(usageEvents.receivedAt, new Date(range.to)),
          );
    const rows = await deps.db
      .select({
        menuId: usageEvents.menuId,
        visits: count(),
        distinctUsers: countDistinct(usageEvents.actorId),
        lastUsedAt: max(usageEvents.receivedAt),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.workspaceId, actor.workspace_id),
          eq(usageEvents.name, 'entry'),
          inRange,
        ),
      )
      .groupBy(usageEvents.menuId)
      .orderBy(usageEvents.menuId);
    return {
      outcome: 'ok',
      data: {
        preset: 'preset' in range ? 'all' : 'range',
        menus: rows.map((row) => ({
          menuId: row.menuId,
          visits: row.visits,
          distinctUsers: row.distinctUsers,
          lastUsedAt: (row.lastUsedAt as Date).getTime(),
        })),
      },
    };
  }

  return { recordUsage, usageSummary };
}
