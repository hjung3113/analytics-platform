// Platform port `recordUsage` + `usageSummary` (platform ADR-0069 decisions 1, 2, 4; #622). The module
// writes its own `platform.usage_events` table. Validation mirrors the reference server
// (`packages/adapters/mock-server/src/server.ts` recordUsage) and the binding UsageEvent rule of
// http-adapter-contract §1: identity fields only, the whole batch or nothing.

import { and, count, countDistinct, eq, gte, inArray, isNotNull, lt, max, or, sql } from 'drizzle-orm';
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
 * `apps/platform-web/src/__tests__/query/server-conformance.test.ts` proves the app's menu ids, and ids the public Registry accepts, match.
 */
export const MENU_ID_PATTERN = /^[^\s?#&/=\p{C}]{1,80}$/u;

/** A space id is null (a global menu) or an identifier like a menu id: this server does not know the app's spaces (platform ADR-0072), so it judges the shape only. */
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
  /** Main-screen entries (`source = 'main'`); #605. null under the mask (main-entry users < 3, including none). */
  entries: number | null;
  /** Share of `entries` whose next main entry came via history/return (cells of < 3 people count 0); null under the mask. */
  backRate: number | null;
  /** Share of `entries` with via palette ; null under the mask or when either side of the palette split has 1–2 people. */
  searchEntryRate: number | null;
}

/** Mask k: a number built from fewer distinct people never leaves the server (platform ADR-0020 supplement, #605). */
export const USAGE_MASK_K = 3;
const BACK_VIAS = ['history', 'return'];
const USAGE_NEXT_LIMIT = 20;
/** One side of a split is safe to show when nobody is on it or at least k distinct people are. */
const splitOpen = (users: number): boolean => users === 0 || users >= USAGE_MASK_K;
/** Merge order of a destination's cells in a next-screens row (the first open cell is the base). */
const USAGE_KIND_ORDER = ['moved', 'same', 'back'];

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
  undeclaredMenuPermissions?: { menuId: string; permission: string; reason: string }[];
}

export interface PlatformUsageServiceDeps {
  undeclaredMenuPermissions?: readonly { menuId: string; permission: string; reason: string }[];
  db: Db;
  checkService: CheckService;
}

/** `uncovered(M)` = entries(M) - events of open inflow cells into M; 1 or 2 would be recovered by subtracting the visible inflow, so M is masked then. */
const uncoveredOpen = (uncovered: number): boolean => uncovered === 0 || uncovered >= USAGE_MASK_K;
/** Kind of an inflow cell, relative to the origin menu: same definition as the outflow `kind` of `usageNextScreens`. */
const INFLOW_KIND = sql<string>`case when ${usageEvents.via} in ('history', 'return') then 'back' when ${usageEvents.menuId} = ${usageEvents.fromMenuId} then 'same' else 'moved' end`;

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
    // One read-only REPEATABLE READ snapshot for both SELECTs: the numerators (back, palette) and the denominators (entries) come from one set of rows.
    const { rows, backRows, inflowRows } = await deps.db.transaction(
      async (tx) => {
        const rows = await tx
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
            paletteUsers:
              sql<number>`count(distinct ${usageEvents.actorId}) filter (where ${usageEvents.source} = 'main' and ${usageEvents.via} = 'palette')`.mapWith(
                Number,
              ),
            otherUsers:
              sql<number>`count(distinct ${usageEvents.actorId}) filter (where ${usageEvents.source} = 'main' and ${usageEvents.via} is distinct from 'palette')`.mapWith(
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
        // Numerator of 「뒤로 나감」: main entries elsewhere that name menu M in `from_menu_id` and carry history/return (same range),
        // one cell per destination; only cells of >= 3 distinct people are summed (a smaller group counts as 0, never differenced back out).
        const backRows = await tx
          .select({
            menuId: usageEvents.fromMenuId,
            back: count(),
            users: countDistinct(usageEvents.actorId),
          })
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
          .groupBy(usageEvents.fromMenuId, usageEvents.menuId);
        // Open inflow cells (cross-menu subtraction): per destination M, (from menu X, kind) groups with their events and distinct people, same range.
        // `uncovered(M) = entries(M) - events of open inflow cells into M` must be 0 or >= 3, else M is masked. Reads every main entry that carries a
        // `from_menu_id` (workspace + range, grouped by destination and origin); unmeasured cost.
        const inflowRows = await tx
          .select({ kind: INFLOW_KIND, menuId: usageEvents.menuId, n: count(), users: countDistinct(usageEvents.actorId) })
          .from(usageEvents)
          .where(
            and(
              eq(usageEvents.workspaceId, actor.workspace_id),
              eq(usageEvents.name, 'entry'),
              eq(usageEvents.source, 'main'),
              isNotNull(usageEvents.fromMenuId),
              inRange,
            ),
          )
          .groupBy(sql`1`, usageEvents.menuId, usageEvents.fromMenuId);
        return { rows, backRows, inflowRows };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    const backFrom = new Map<string, number>();
    for (const r of backRows) {
      if (r.menuId !== null && r.users >= USAGE_MASK_K) backFrom.set(r.menuId, (backFrom.get(r.menuId) ?? 0) + r.back);
    }
    const coveredBy = new Map<string, number>();
    for (const r of inflowRows) if (r.users >= USAGE_MASK_K) coveredBy.set(r.menuId, (coveredBy.get(r.menuId) ?? 0) + r.n);
    return {
      outcome: 'ok',
      data: {
        preset: 'preset' in range ? 'all' : 'range',
        ...(deps.undeclaredMenuPermissions?.length
          ? { undeclaredMenuPermissions: deps.undeclaredMenuPermissions.map(row => ({ ...row })) }
          : {}),
        menus: rows.map((row) => {
          // The mask is the menu's main-entry users (1–2, or none, answer null); a numerator of < 3 people counts as 0.
          // Also masked when 1–2 entries are covered by no open inflow cell (`uncoveredOpen`).
          const shown = row.mainUsers >= USAGE_MASK_K && uncoveredOpen(row.entries - (coveredBy.get(row.menuId) ?? 0));
          return {
            menuId: row.menuId,
            visits: row.visits,
            distinctUsers: row.distinctUsers,
            lastUsedAt: (row.lastUsedAt as Date).getTime(),
            entries: shown ? row.entries : null,
            backRate: shown ? Math.min(1, (backFrom.get(row.menuId) ?? 0) / row.entries) : null,
            // Both sides of the split (palette / not palette) must be empty or >= 3 people, else `entries x (1 - rate)` would give a small group's size.
            searchEntryRate:
              shown && splitOpen(row.paletteUsers) && splitOpen(row.otherUsers) ? row.palette / row.entries : null,
          };
        }),
      },
    };
  }

  /**
   * Where people went right after `menuId` (#605; reference semantics: mock `aggregateUsageNext`). Same permission as `usageSummary`,
   * read-only, no range (all stored time). Main source only; a "next" entry is a main entry whose `from_menu_id` is M, split into
   * disjoint kinds: back/return (via history/return, any destination), else same menu, else moved. The < 3 mask works on cells (one kind at one
   * destination): every number is a sum of cells with >= 3 distinct people, so no difference of two numbers (summary vs rows, includeBack on vs
   * off) isolates a smaller group. `masked` = the menu has 1–2 distinct main-entry users, or 1–2 entries covered by no open inflow cell (`uncoveredOpen`); no main entry at all is an empty, unmasked answer.
   * All SELECTs run in one read-only REPEATABLE READ transaction, so count, users and vias come from one snapshot.
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
    const empty = { moved: 0, sameMenu: 0, backOrReturn: 0, noMove: 0 };
    const answer = (masked: boolean): AuditJudgement<UsageNextScreensData> => ({
      outcome: 'ok',
      data: { menuId, entries: 0, masked, summary: { ...empty }, next: [], hiddenDestinations: 0 },
    });
    const kind = sql<string>`case when ${usageEvents.via} in ('history', 'return') then 'back' when ${usageEvents.menuId} = ${menuId} then 'same' else 'moved' end`;
    const via = sql<string>`coalesce(${usageEvents.via}, 'link')`;
    const nextWhere = and(mainEntry, eq(usageEvents.fromMenuId, menuId));
    const rankedKinds = includeBack ? ['moved', 'back', 'same'] : ['moved'];
    return deps.db.transaction(
      async (tx) => {
        const [own] = await tx
          .select({ entries: count(), users: countDistinct(usageEvents.actorId) })
          .from(usageEvents)
          .where(and(mainEntry, eq(usageEvents.menuId, menuId)));
        if (!own || own.entries === 0) return answer(false);
        if (own.users < USAGE_MASK_K) return answer(true);
        // Cross-menu subtraction: entries(M) minus the events of the open inflow cells into M (one cell per origin menu and kind, >= 3 people)
        // must be 0 or >= 3; else M is masked as for 1–2 people. Reads the main entries of M that carry a `from_menu_id` (menu index).
        const inflow = await tx
          .select({ kind: INFLOW_KIND, n: count(), users: countDistinct(usageEvents.actorId) })
          .from(usageEvents)
          .where(and(mainEntry, eq(usageEvents.menuId, menuId), isNotNull(usageEvents.fromMenuId)))
          .groupBy(sql`1`, usageEvents.fromMenuId);
        const covered = inflow.reduce((sum, c) => sum + (c.users >= USAGE_MASK_K ? c.n : 0), 0);
        if (!uncoveredOpen(own.entries - covered)) return answer(true);

        // Cells: per kind and destination, the count and the distinct people. Everything below is built from the cells with >= 3 people.
        const cellRows = await tx
          .select({ kind, menuId: usageEvents.menuId, n: count(), users: countDistinct(usageEvents.actorId) })
          .from(usageEvents)
          .where(nextWhere)
          // By position: the case expression carries bound parameters, so a second copy in GROUP BY is a different expression to Postgres.
          .groupBy(sql`1`, usageEvents.menuId);
        const summary = { ...empty };
        const destinations = new Map<string, { open: Map<string, { n: number; users: number }> }>();
        for (const c of cellRows) {
          const open = c.users >= USAGE_MASK_K;
          if (open) {
            if (c.kind === 'back') summary.backOrReturn += c.n;
            else if (c.kind === 'same') summary.sameMenu += c.n;
            else summary.moved += c.n;
          }
          if (!rankedKinds.includes(c.kind)) continue;
          const d = destinations.get(c.menuId) ?? { open: new Map() };
          if (open) d.open.set(c.kind, { n: c.n, users: c.users });
          destinations.set(c.menuId, d);
        }
        summary.noMove = Math.max(0, own.entries - summary.moved - summary.sameMenu - summary.backOrReturn);

        // A row merges its open cells in the order moved, same, back; a later cell joins only if it adds >= 3 people the row does not yet have
        // (the "new people" test), so the user-count difference between includeBack on and off is never 1 or 2. Rows with one open cell need no people.
        const multi = [...destinations.entries()].filter(([, d]) => d.open.size > 1);
        const peopleRows =
          multi.length === 0
            ? []
            : await tx
                .select({ kind, menuId: usageEvents.menuId, actorId: usageEvents.actorId })
                .from(usageEvents)
                .where(
                  and(
                    nextWhere,
                    or(...multi.map(([id, d]) => and(eq(usageEvents.menuId, id), inArray(kind, [...d.open.keys()])))),
                  ),
                )
                .groupBy(sql`1`, usageEvents.menuId, usageEvents.actorId);
        const people = new Map<string, Set<string>>();
        for (const r of peopleRows) {
          const key = `${r.kind}\u0000${r.menuId}`;
          const set = people.get(key) ?? new Set<string>();
          set.add(r.actorId);
          people.set(key, set);
        }
        const merged = new Map<string, { n: number; users: number; kinds: string[] }>();
        for (const [id, d] of destinations) {
          if (d.open.size === 0) continue;
          const ordered = USAGE_KIND_ORDER.flatMap((k) => {
            const cell = d.open.get(k);
            return cell ? [{ k, cell }] : [];
          });
          const only = ordered.length === 1 ? ordered[0] : undefined;
          if (only) {
            merged.set(id, { n: only.cell.n, users: only.cell.users, kinds: [only.k] });
            continue;
          }
          const users = new Set<string>();
          const row = { n: 0, users: 0, kinds: [] as string[] };
          for (const { k, cell } of ordered) {
            const cellPeople = people.get(`${k}\u0000${id}`) ?? new Set<string>();
            const fresh = [...cellPeople].filter((u) => !users.has(u)).length;
            if (row.kinds.length > 0 && fresh < USAGE_MASK_K) continue;
            for (const u of cellPeople) users.add(u);
            row.n += cell.n;
            row.kinds.push(k);
          }
          row.users = users.size;
          merged.set(id, row);
        }

        const named = [...merged.entries()]
          .sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
          .slice(0, USAGE_NEXT_LIMIT);
        const hiddenDestinations = [...destinations.values()].filter((d) => d.open.size === 0).length;
        const shownIds = named.map(([id]) => id);

        // Vias of the shown rows, per (kind, destination, via): kept only from merged cells, and only when every via present has >= 3 people.
        const viaRows =
          shownIds.length === 0
            ? []
            : await tx
                .select({ kind, menuId: usageEvents.menuId, via, n: count(), users: countDistinct(usageEvents.actorId) })
                .from(usageEvents)
                .where(and(nextWhere, inArray(usageEvents.menuId, shownIds)))
                .groupBy(sql`1`, usageEvents.menuId, sql`3`);
        const viaOf = new Map<string, { vias: Record<string, number>; allOpen: boolean }>();
        for (const r of viaRows) {
          const d = merged.get(r.menuId);
          if (!d || !d.kinds.includes(r.kind)) continue;
          const acc = viaOf.get(r.menuId) ?? { vias: {}, allOpen: true };
          acc.vias[r.via] = (acc.vias[r.via] ?? 0) + r.n;
          if (r.users < USAGE_MASK_K) acc.allOpen = false;
          viaOf.set(r.menuId, acc);
        }
        return {
          outcome: 'ok',
          data: {
            menuId,
            entries: own.entries,
            masked: false,
            summary,
            next: named.map(([id, d]) => ({
              menuId: id,
              count: d.n,
              distinctUsers: d.users,
              vias: viaOf.get(id)?.allOpen ? (viaOf.get(id)?.vias ?? {}) : {},
            })),
            hiddenDestinations,
          },
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  return { recordUsage, usageSummary, usageNextScreens };
}
