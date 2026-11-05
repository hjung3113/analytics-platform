// Platform port `recordUsage` + `usageSummary` (ADR-0069 decisions 1, 2, 4; #622). The module
// writes its own `platform.usage_events` table. Validation mirrors the reference server
// (`packages/adapters/mock-server/src/server.ts` recordUsage) and the binding UsageEvent rule of
// http-adapter-contract §1: identity fields only, the whole batch or nothing.

import { and, count, countDistinct, eq, gte, inArray, isNotNull, lt, max, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { usageEvents } from '../../db/schema/platform.js';
import type { CheckService } from '../permissions/check-service.js';
import type { AuditJudgement } from './audit-service.js';
import { type PlatformActor, holdsPlatformPermission } from './permissions.js';

/** `UsageVia` of the root `packages/sdk/contracts/src/adapter.ts`; `usage-vocabulary.test.ts` pins it. */
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
  'paneOpen',
  'paneReplace',
] as const;
const PANE_VIA: readonly string[] = ['paneOpen', 'paneReplace'];

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

/**
 * A `fromMenuId`: the Registry's own id rule (`createRegistry` accepts any non-empty id without whitespace and without `? # & /`) plus the leak
 * shapes a usage field must not carry: `=` (so no `key=value`) and control characters, at most 80 code points. Trade-off: a Registry id that
 * contains `=` is rejected here. Kept in step with `MENU_ID_PATTERN` in the reference server (`packages/adapters/mock-server/src/server.ts`);
 * `apps/platform-web/src/server-conformance.test.ts` proves the app's menu ids, and ids the public Registry accepts, match.
 */
export const MENU_ID_PATTERN = /^[^\s?#&/=\p{C}]{1,80}$/u;

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

  // Binding §1 rule: `via` / `fromMenuId` only on an entry, each optional; `via` in the closed set and
  // matching the source (main: an old value, board: paneOpen/paneReplace); `fromMenuId` a menu id or null.
  let via: string | null = null;
  let fromMenuId: string | null = null;
  if ('via' in raw || 'fromMenuId' in raw) {
    if (name !== 'entry') return null;
    if ('via' in raw) {
      if (!(PLATFORM_USAGE_VIA as readonly unknown[]).includes(raw.via)) return null;
      if (PANE_VIA.includes(raw.via as string) !== (source === 'board')) return null;
      via = raw.via as string;
    }
    if ('fromMenuId' in raw && raw.fromMenuId !== null) {
      if (typeof raw.fromMenuId !== 'string' || !MENU_ID_PATTERN.test(raw.fromMenuId)) return null;
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
  /** Main-screen entries (`source = 'main'`); #605. */
  entries: number;
  /** Share of `entries` whose next main entry came via history/return; null under the mask or with 0 entries. */
  backRate: number | null;
  /** Share of `entries` with via palette; null under the mask or with 0 entries. */
  searchEntryRate: number | null;
}

/** Mask k: a number built from fewer distinct people never leaves the server (ADR-0020 supplement, #605). */
export const USAGE_MASK_K = 3;
const BACK_VIAS = ['history', 'return'];
const USAGE_NEXT_LIMIT = 20;

export interface UsageNextScreensData {
  menuId: string;
  entries: number;
  masked: boolean;
  summary: { moved: number; sameMenu: number; backOrReturn: number; noMove: number };
  next: {
    menuId: string;
    count: number;
    distinctUsers: number;
    vias: Record<string, number>;
  }[];
  hiddenDestinations: number;
}

/** Exactly `{ menuId }` or `{ menuId, includeBack }`; `menuId` matches `MENU_ID_PATTERN`, `includeBack` a boolean. */
export function parseUsageNextQuery(body: unknown): { menuId: string; includeBack: boolean } | null {
  if (!isPlainObject(body)) return null;
  const keys = Object.keys(body);
  if (keys.some((k) => k !== 'menuId' && k !== 'includeBack')) return null;
  const { menuId, includeBack } = body;
  if (typeof menuId !== 'string' || !MENU_ID_PATTERN.test(menuId)) return null;
  if ('includeBack' in body && typeof includeBack !== 'boolean') return null;
  return { menuId, includeBack: includeBack === true };
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
        entries: sql<number>`count(*) filter (where ${usageEvents.source} = 'main')`.mapWith(Number),
        mainUsers:
          sql<number>`count(distinct ${usageEvents.actorId}) filter (where ${usageEvents.source} = 'main')`.mapWith(
            Number,
          ),
        palette:
          sql<number>`count(*) filter (where ${usageEvents.source} = 'main' and ${usageEvents.via} = 'palette')`.mapWith(
            Number,
          ),
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
    // Numerator of 「뒤로 나감」: main entries elsewhere that name menu M in `from_menu_id` and carry history/return (same range).
    const backRows = await deps.db
      .select({ menuId: usageEvents.fromMenuId, back: count() })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.workspaceId, actor.workspace_id),
          eq(usageEvents.name, 'entry'),
          eq(usageEvents.source, 'main'),
          isNotNull(usageEvents.fromMenuId),
          inArray(usageEvents.via, BACK_VIAS),
          inRange,
        ),
      )
      .groupBy(usageEvents.fromMenuId);
    const backFrom = new Map(backRows.map((r) => [r.menuId, r.back]));
    return {
      outcome: 'ok',
      data: {
        preset: 'preset' in range ? 'all' : 'range',
        menus: rows.map((row) => {
          const shown = row.entries > 0 && row.mainUsers >= USAGE_MASK_K;
          return {
            menuId: row.menuId,
            visits: row.visits,
            distinctUsers: row.distinctUsers,
            lastUsedAt: (row.lastUsedAt as Date).getTime(),
            entries: row.entries,
            backRate: shown ? Math.min(1, (backFrom.get(row.menuId) ?? 0) / row.entries) : null,
            searchEntryRate: shown ? row.palette / row.entries : null,
          };
        }),
      },
    };
  }

  /**
   * Where people went right after `menuId` (#605; reference semantics: mock `aggregateUsageNext`). Same permission as `usageSummary`,
   * read-only, no range (all stored time). Main source only; a "next" entry is a main entry whose `from_menu_id` is M, split into
   * disjoint kinds: back/return (via history/return, any destination), else same menu, else moved. The < 3 mask is applied here: a menu
   * with < 3 distinct main-entry users is `masked` with empty lists; destinations with < 3 distinct users are only counted.
   */
  async function usageNextScreens(
    actor: PlatformActor,
    query: unknown,
  ): Promise<AuditJudgement<UsageNextScreensData>> {
    if (!(await holdsPlatformPermission(deps.checkService, actor, 'console:access'))) {
      return { outcome: 'forbidden', message: 'No permission console:access' };
    }
    const parsed = parseUsageNextQuery(query);
    if (!parsed) return { outcome: 'error', message: 'Invalid usage next-screens query' };
    const { menuId, includeBack } = parsed;
    const mainEntry = and(
      eq(usageEvents.workspaceId, actor.workspace_id),
      eq(usageEvents.name, 'entry'),
      eq(usageEvents.source, 'main'),
    );
    const [own] = await deps.db
      .select({ entries: count(), users: countDistinct(usageEvents.actorId) })
      .from(usageEvents)
      .where(and(mainEntry, eq(usageEvents.menuId, menuId)));
    const masked: UsageNextScreensData = {
      menuId,
      entries: 0,
      masked: true,
      summary: { moved: 0, sameMenu: 0, backOrReturn: 0, noMove: 0 },
      next: [],
      hiddenDestinations: 0,
    };
    if (!own || own.entries === 0 || own.users < USAGE_MASK_K) return { outcome: 'ok', data: masked };

    // One pass over the next entries: per destination and kind, the count, the distinct people and the via split (a via-less row is `link`).
    const kind = sql<string>`case when ${usageEvents.via} in ('history', 'return') then 'back' when ${usageEvents.menuId} = ${menuId} then 'same' else 'moved' end`;
    const via = sql<string>`coalesce(${usageEvents.via}, 'link')`;
    const nextWhere = and(mainEntry, eq(usageEvents.fromMenuId, menuId));
    const kindRows = await deps.db
      .select({ kind, n: count() })
      .from(usageEvents)
      .where(nextWhere)
      .groupBy(kind);
    const summary = { moved: 0, sameMenu: 0, backOrReturn: 0, noMove: 0 };
    for (const r of kindRows) {
      if (r.kind === 'back') summary.backOrReturn = r.n;
      else if (r.kind === 'same') summary.sameMenu = r.n;
      else summary.moved = r.n;
    }
    summary.noMove = Math.max(0, own.entries - summary.moved - summary.sameMenu - summary.backOrReturn);

    // The ranked set: moved only, or with includeBack everything that left the screen (also back/return and same menu).
    const ranked = includeBack ? nextWhere : and(nextWhere, sql`${kind} = 'moved'`);
    const destRows = await deps.db
      .select({
        menuId: usageEvents.menuId,
        n: count(),
        users: countDistinct(usageEvents.actorId),
      })
      .from(usageEvents)
      .where(ranked)
      .groupBy(usageEvents.menuId);
    const shown = destRows
      .filter((d) => d.users >= USAGE_MASK_K)
      .sort((a, b) => b.n - a.n || (a.menuId < b.menuId ? -1 : a.menuId > b.menuId ? 1 : 0))
      .slice(0, USAGE_NEXT_LIMIT);
    const viaRows =
      shown.length === 0
        ? []
        : await deps.db
            .select({ menuId: usageEvents.menuId, via, n: count() })
            .from(usageEvents)
            .where(
              and(
                ranked,
                inArray(
                  usageEvents.menuId,
                  shown.map((d) => d.menuId),
                ),
              ),
            )
            .groupBy(usageEvents.menuId, via);
    const viasOf = new Map<string, Record<string, number>>();
    for (const r of viaRows) viasOf.set(r.menuId, { ...viasOf.get(r.menuId), [r.via]: r.n });
    return {
      outcome: 'ok',
      data: {
        menuId,
        entries: own.entries,
        masked: false,
        summary,
        next: shown.map((d) => ({
          menuId: d.menuId,
          count: d.n,
          distinctUsers: d.users,
          vias: viasOf.get(d.menuId) ?? {},
        })),
        hiddenDestinations: destRows.length - destRows.filter((d) => d.users >= USAGE_MASK_K).length,
      },
    };
  }

  return { recordUsage, usageSummary, usageNextScreens };
}
