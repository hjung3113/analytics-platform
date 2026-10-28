import { optionSamples, referenceSelectionPorts } from './selection-ports.test-support';
import { describe, expect, it } from 'vitest';
import { defineAction, defineEndpoint, emptyGlobal, projectContext, type ActionResponse, type ApiResponse, type Assessment, type AuditEvent, type ChartAnnotation, type EntityAuditPage, type GroupMember, type JsonValue, type Notice, type PreferencesSnapshot, type ClientErrorReport, type GlobalContext, type MenuAction, type MenuQuery, type Permission, type PlatformAdapter, type Session, type Trust, type UsageEvent, type UsageRange, type UsageSummary, menuPermission, spaceId } from '@ap/contracts';
import { planServerConformance, runServerConformance, type ActionCase, type ConformanceResult, type ConformanceCase, type PortSamples, type ServerConformanceHarness } from '../index';

const SELECTION_PORT_SKIP_IDS = [
      'selection ports · global lineNames options',
      'selection ports · global prcGroups options',
      'selection ports · options paging',
      'selection ports · search paging',
      'selection ports · options query',
      'selection ports · search query',
      'selection ports · dependent options',
      'selection ports · denied-room options',
      'selection ports · options lower clamp',
      'selection ports · search lower clamp',
      'selection ports · options upper clamp',
      'selection ports · search upper clamp',
      'selection ports · options authorization',
      'selection ports · search authorization',
      'selection ports · resolution authorization',
      'selection ports · explicit denied-room filter',
      'selection ports · resolve authorized',
      'selection ports · resolve forbidden no detail',
      'selection ports · resolve cross-site absent',
      'selection ports · resolve order and duplicates',
      'selection ports · options invalid input',
      'selection ports · search invalid input',
      'selection ports · resolution invalid input',
      'selection ports · options cursor identity',
      'selection ports · search cursor identity',
      'selection ports · global metadata needs no equipment permission',
];
const spec = defineEndpoint<{ page: number }, { rows: number }>({
  id: 'fixture.list',
  menuId: 'fixture',
  paramKeys: { page: true },
  permission: menuPermission('analytics:view'),
  requiresScope: true,
  context: { time: 'apply', roomNames: 'apply', selection: 'apply', metric: 'apply' },
  kinds: ['collection', 'coverage'],
  mergeTimeDomain: false,
});

const actionSpec = defineAction<{ text: string }, { id: number }>({
  id: 'fixture.save', menuId: 'fixture', inputKeys: { text: true }, permission: menuPermission('analytics:view'),
  requiresScope: true, concurrency: 'version', invalidates: [spec],
});
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const err = (message: string): ApiResponse<never> => ({ outcome: 'error', message, data: null, assessments: [], trust: null, correlationId: 'ref' });
const forbidden: ApiResponse<unknown> = { outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'ref' };

// Well-formed 06 §19/§18 shapes the reference answers successful reads with (mirrors the contract, not the mock).
const OBSERVED = '2026-09-26T08:58:00';
const REF_ASSESSMENTS: Assessment[] = [
  { kind: 'collection', state: 'unknown', reason: 'source_unavailable' },
  { kind: 'processing_delay', state: 'clear', statusSource: 'mart-watermark', observedAt: OBSERVED },
  { kind: 'coverage', state: 'clear', statusSource: 'coverage-service', observedAt: OBSERVED },
];
const REF_TRUST: Trust = { updatedAt: '2026-09-26T09:02:00', dataThrough: '2026-09-26T08:00:00', coverage: 0.987, provisional: false, source: 'mart.productivity_hourly' };
const REF_EVENT: AuditEvent = {
  id: 'equipment:MEM-PHOTO-0103:create', at: '2026-01-01T00:00:00.000Z', actor: 'master-sync', action: 'create', source: 'system',
  target: { type: 'equipment', id: 'MEM-PHOTO-0103', scopeId: 'MEM' }, changes: {},
};

// The granted actor holds only PHOTO in MEM; the room re-check sample (06 §22) sits in DIFF.
const GRANTED_ROOMS = ['PHOTO'];
const ROOM_OF: Record<string, string> = { 'MEM-PHOTO-0103': 'PHOTO', 'MEM-DIFF-0176': 'DIFF' };
// The reference evaluator's world (the kit judges any adapter, so no mock import): two PHOTO rows and one
// DIFF row the granted actor does not hold.
const REF_EQUIPMENT = [
  { equipmentId: 'MEM-PHOTO-0103', room: 'PHOTO', model: 'HX-1' },
  { equipmentId: 'MEM-PHOTO-0107', room: 'PHOTO', model: 'HX-2' },
  { equipmentId: 'MEM-DIFF-0176', room: 'DIFF', model: 'DF-9' },
];

/** Granted actor: every case/entity permission, grants at MEM + FDRY, no console:access; `console` flips under asConsole. */
type RefState = { permissions: Set<Permission>; console: boolean; /** The action target's version, read by `currentVersion`; starts at 1. */ targetVersion?: number };

/**
 * A full-`PlatformAdapter` reference server that follows every contract rule the kit checks — so the unbroken
 * reference must pass everything — and a `break` switch that drops exactly one rule, so the matching check must fail.
 */
function referenceAdapter(state: RefState, breaks: ReadonlySet<string> = new Set()): PlatformAdapter {
  const listeners = new Set<() => void>();
  const envelope = { correlationId: 'ref', data: null, assessments: [] as Assessment[], trust: null };
  const consoleGate = <T>(method: string, okData: T): ApiResponse<T> =>
    (state.console
      ? { ...envelope, outcome: breaks.has(`console-${method}-ok`) ? 'forbidden' : 'ok', data: okData }
      : { ...envelope, outcome: breaks.has(`console-${method}-permission`) ? 'ok' : 'forbidden', data: breaks.has(`console-${method}-permission`) ? okData : null });
  let session: Session | null = null;
  // Server-owned in-memory stores (06 §16, checklist §5): annotations keyed by (chartId, scopeId), usage rows
  // stamped with the receive time — both live as long as this reference adapter instance.
  const annotationRows: (Omit<ChartAnnotation, 'mine'> & { authorId: string })[] = [];
  let annotationSeq = 0;
  // The reference stamps the actual actor: the console account is a different user from the granted one (#399).
  const actor = () => (state.console ? 'admin' : 'engineer');
  const usageRows: (UsageEvent & { userId: string; receivedAt: number })[] = [];
  const actionRecords = new Map<string, { hash: string; response: ActionResponse<unknown> }>();
  // Preferences, people and notices (ADR-0098): per-actor server state, one break per rule.
  const prefStores = new Map<string, { values: Record<string, JsonValue>; importedAt: string | null }>();
  const prefsOf = () => {
    const key = breaks.has('prefs-shared') ? 'everyone' : actor();
    if (!prefStores.has(key)) prefStores.set(key, { values: {}, importedAt: null });
    return prefStores.get(key)!;
  };
  const prefsAnswer = (store: { values: Record<string, JsonValue>; importedAt: string | null }): ApiResponse<PreferencesSnapshot> =>
    ({ ...envelope, outcome: 'ok', data: { values: { ...store.values }, importedAt: store.importedAt } });
  const PREF_KEY = /^(?:favorites|recents|lastScope|lang|columns:[A-Za-z0-9_.-]{1,100})$/;
  type StoredNotice = Notice & { n: number };
  const noticeRows: StoredNotice[] = [];
  let noticeSeq = 0;
  const noticeReplays = new Map<string, ActionResponse<Notice>>();
  const noticeAnswer = <T,>(outcome: ActionResponse<T>['outcome'], over: Partial<ActionResponse<T>> = {}): ActionResponse<T> =>
    ({ outcome, data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'ref', ...over });
  const noticeWriter = () => state.console || breaks.has('notice-forbidden');
  const toNotice = ({ n: _n, ...notice }: StoredNotice): Notice => notice;
  return {
    ...referenceSelectionPorts(),
    session: () => {
      if (session === null || breaks.has('session-identity')) {
        session = {
          user: { id: 'engineer', name: 'Engineer', title: { ko: '엔지니어', en: 'Engineer' }, permissions: [...state.permissions] },
          scopes: (breaks.has('session-scopes') ? ['MEM'] : [...(breaks.has('session-foreign') ? ['XIA'] : []), 'MEM', 'FDRY']).map(id => ({ id, label: id, grantedRooms: 1, totalRooms: 4 })),
        };
      }
      return session;
    },
    subscribe: onChange => {
      if (breaks.has('subscribe-unsubscribe')) return undefined as unknown as () => void;
      listeners.add(onChange);
      // The cleanup need not be idempotent (adapter.ts requires only that subscribe return one) — this
      // reference is one-shot: a second call throws, which is conforming. 'unsubscribe-throws' breaks the
      // first call instead, and the check must catch that.
      let unsubscribed = false;
      return () => {
        if (breaks.has('unsubscribe-throws') || unsubscribed) throw new Error('already unsubscribed');
        unsubscribed = true;
        listeners.delete(onChange);
      };
    },
    validateScope: async scopeId => {
      if (scopeId === 'MEM') {
        return { status: 'valid', grantedRooms: breaks.has('validate-granted') ? [] : ['PHOTO'] };
      }
      if (scopeId === 'FDRY') {
        // 'validate-other' answers forbidden for the second granted site — the second-site check must catch it.
        return { status: breaks.has('validate-other') ? 'forbidden' : 'valid', grantedRooms: ['PHOTO'] };
      }
      if (scopeId === 'XIA') {
        return { status: 'forbidden', grantedRooms: breaks.has('validate-foreign') ? ['ETCH'] : [] };
      }
      return { status: breaks.has('validate-unknown') ? 'forbidden' : 'unknown_scope', grantedRooms: breaks.has('validate-unknown-rooms') ? ['PHOTO'] : [] };
    },
    getEntity: async ref => {
      if (ref.type !== 'equipment') {
        return breaks.has('entity-unknown-type') ? { ...envelope, outcome: 'forbidden', message: 'Unknown entity type' } : err('Unknown entity type');
      }
      if (!state.permissions.has(menuPermission('equipment:view'))) {
        // 'entity-permission' smuggles the row into the rejection — the no-data-on-rejection rule must catch it.
        return breaks.has('entity-permission')
          ? { ...envelope, outcome: 'forbidden', message: 'No permission equipment:view', data: { equipmentId: ref.id } }
          : { ...envelope, outcome: 'forbidden', message: 'No permission equipment:view' };
      }
      if (ref.scopeId === null) {
        return breaks.has('entity-null-scope')
          ? { ...envelope, outcome: 'ok', data: { equipmentId: ref.id }, assessments: REF_ASSESSMENTS, trust: REF_TRUST }
          : { ...envelope, outcome: 'forbidden', message: 'No grant for scope null' };
      }
      if (ref.scopeId !== 'MEM') {
        return breaks.has('entity-foreign')
          ? { ...envelope, outcome: 'ok', data: { equipmentId: ref.id }, assessments: REF_ASSESSMENTS, trust: REF_TRUST }
          : { ...envelope, outcome: 'forbidden', message: `No grant for scope ${ref.scopeId}` };
      }
      // 06 §22 room re-check: the site is granted but this destination's room is not — 'entity-room' serves it anyway.
      if (!GRANTED_ROOMS.includes(ROOM_OF[ref.id] ?? 'PHOTO')) {
        return breaks.has('entity-room')
          ? { ...envelope, outcome: 'ok', data: { equipmentId: ref.id }, assessments: REF_ASSESSMENTS, trust: REF_TRUST }
          : { ...envelope, outcome: 'forbidden', message: 'No grant for equipment' };
      }
      return {
        ...envelope,
        outcome: 'ok',
        data: breaks.has('entity-ok') ? null : { equipmentId: ref.id, room: 'PHOTO' },
        assessments: breaks.has('entity-assessments')
          ? [{ kind: 'coverage', state: 'clear' }] // clear with no statusSource/observedAt — 06 §19 violation
          : REF_ASSESSMENTS,
        trust: breaks.has('entity-trust') ? { ...REF_TRUST, coverage: '98%' as unknown as number | null } : REF_TRUST,
      };
    },
    menuQuery: async (raw: MenuQuery) => {
      const req = raw as MenuQuery & Record<string, unknown>;
      if (Object.keys(req).some(k => !['endpoint', 'context', 'params'].includes(k)) && !breaks.has('top-level')) return err('unexpected key');
      if (req.endpoint !== spec.id) {
        // 'unknown-endpoint-data' smuggles data into the error envelope — rejections carry no row fields.
        return breaks.has('unknown-endpoint-data')
          ? { outcome: 'error', message: 'unknown endpoint', data: {}, assessments: [], trust: null, correlationId: 'ref' }
          : err('unknown endpoint');
      }
      const params = req.params as Record<string, unknown>;
      if (Object.keys(params).some(k => k !== 'page') && !breaks.has('params')) return err('unknown params key');
      const expected = Object.keys(projectContext(spec, emptyGlobal));
      const context = req.context as Partial<GlobalContext>;
      const extra = Object.keys(context).filter(k => !expected.includes(k));
      // 'non-applied-first-only' rejects only the first undeclared key a lazy server happens to check.
      if (extra.length > 0 && !breaks.has('non-applied') && !(breaks.has('non-applied-first-only') && !extra.includes('condition'))) return err('non-applied key');
      const missing = expected.filter(k => !(k in context));
      // 'missing-last-only' notices only the last projected key going missing.
      if (missing.length > 0 && !(breaks.has('missing-last-only') && !missing.includes(expected[expected.length - 1]))) return err('missing applied key');
      if (typeof context.from !== 'string' || typeof context.to !== 'string') return err('period');
      if (context.metricVersion != null && context.metricId == null) return err('metric pair');
      if (!state.permissions.has(spec.permission) && !breaks.has('permission')) {
        // 'permission-reject-data' smuggles rows into the forbidden envelope — rejections carry no data.
        return breaks.has('permission-reject-data')
          ? { ...forbidden, message: 'No permission analytics:view', data: { rows: 1 } }
          : forbidden;
      }
      if (context.scopeId !== 'MEM' && !breaks.has('scope')) return forbidden;
      const emptySets = (['roomNames', 'selection'] as const).filter(k => Array.isArray(context[k]) && (context[k] as unknown[]).length === 0);
      const honoured = breaks.has('explicit-empty-roomNames-only') ? emptySets.filter(k => k === 'roomNames') : emptySets;
      if (honoured.length > 0 && !breaks.has('explicit-empty')) {
        const empty: ApiResponse<unknown> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'ref' };
        // A key omitted is not null — the kit must name the missing key instead of throwing on undefined.
        const omittable = empty as { assessments?: Assessment[] };
        if (breaks.has('explicit-empty-missing-assessments') && emptySets.includes('selection')) delete omittable.assessments;
        return empty;
      }
      const assessments: Assessment[] = breaks.has('kinds')
        ? [{ kind: 'collection', state: 'unknown', reason: 'source_unavailable' }]
        : breaks.has('assessments-wellformed')
          ? spec.kinds.map(kind => kind === 'coverage' ? { kind, state: 'clear' as const } : { kind, state: 'unknown' as const, reason: 'source_unavailable' as const })
          : spec.kinds.map(kind => ({ kind, state: 'unknown' as const, reason: 'source_unavailable' as const }));
      // One break per remaining 06 §19 branch: a duplicate kind, an unknown without a reason, explainsEmpty on ok.
      if (breaks.has('assessments-duplicate-kind')) {
        assessments[assessments.length - 1] = { kind: assessments[0].kind, state: 'unknown', reason: 'source_unavailable' };
      }
      // Deliberate break shape: the first assessment carrying no reason key (unknown without a reason).
      const firstAssessment = assessments[0] as { reason?: string };
      if (breaks.has('assessments-unknown-no-reason')) delete firstAssessment.reason;
      if (breaks.has('assessments-explains-empty')) assessments[0].explainsEmpty = true;
      // One break per remaining 06 §18 branch (the trust fields the kit shape-checks).
      const trust: Trust | null =
        breaks.has('trust-incomplete') ? { ...REF_TRUST, coverage: '98%' as unknown as number }
          : breaks.has('trust-updated-at-number') ? { ...REF_TRUST, updatedAt: 123 as unknown as string }
          : breaks.has('trust-provisional-string') ? { ...REF_TRUST, provisional: 'no' as unknown as boolean }
          : breaks.has('trust-source-missing') ? { ...REF_TRUST, source: undefined as unknown as string }
          : breaks.has('trust-data-through-number') ? { ...REF_TRUST, dataThrough: 123 as unknown as string }
          : breaks.has('trust-metric-version-number') ? { ...REF_TRUST, metricVersion: 3 as unknown as string }
          : null;
      const response: ApiResponse<{ rows: number }> = { outcome: 'ok', data: { rows: 1 }, assessments, trust, correlationId: 'ref' };
      // A key omitted is not null — the kit must name the missing key instead of throwing on undefined.
      // Deliberate break shape: the same envelope with `trust`/`assessments` deleted rather than null/[].
      const omittable = response as { trust?: Trust | null; assessments?: Assessment[] };
      if (breaks.has('envelope-missing-trust')) delete omittable.trust;
      if (breaks.has('envelope-missing-assessments')) delete omittable.assessments;
      return response;
    },
    entityAudit: async (ref): Promise<ApiResponse<EntityAuditPage>> => {
      if (ref.type !== 'equipment' && ref.type !== 'metric') {
        return breaks.has('entity-audit-unknown-type')
          ? { ...envelope, outcome: 'forbidden', message: 'Unknown entity type' }
          : err('Unknown entity type');
      }
      if (!state.permissions.has(menuPermission('equipment:view'))) {
        return breaks.has('entity-audit-permission') && ref.cursor === undefined
          ? { ...envelope, outcome: 'ok', data: { events: [REF_EVENT], nextCursor: null } }
          : { ...envelope, outcome: 'forbidden', message: 'No permission equipment:view' };
      }
      if (ref.scopeId !== 'MEM') {
        // 'entity-audit-null' answers ok for a null Scope — the getEntity gate must catch it (adapter.ts).
        if (ref.scopeId === null && breaks.has('entity-audit-null')) {
          return { ...envelope, outcome: 'ok', data: { events: [REF_EVENT], nextCursor: null } };
        }
        return ref.scopeId !== null && breaks.has('entity-audit-foreign') && ref.cursor === undefined
          ? { ...envelope, outcome: 'ok', data: { events: [REF_EVENT], nextCursor: null } }
          : { ...envelope, outcome: 'forbidden', message: `No grant for scope ${ref.scopeId}` };
      }
      // Same room re-check on the audit read (adapter.ts: same gates as getEntity) — 'entity-audit-room' serves it anyway.
      if (!GRANTED_ROOMS.includes(ROOM_OF[ref.id] ?? 'PHOTO')) {
        return breaks.has('entity-audit-room')
          ? { ...envelope, outcome: 'ok', data: { events: [REF_EVENT], nextCursor: null } }
          : { ...envelope, outcome: 'forbidden', message: 'No grant for equipment' };
      }
      // A one-page paging server: it never issues a cursor, so any cursor is malformed — read only after the gates above.
      if (ref.cursor !== undefined) return err('Invalid cursor');
      if (breaks.has('entity-audit-ok')) return { ...envelope, outcome: 'ok', data: {} as unknown as EntityAuditPage }; // data.events is not an array
      // adapter.ts zero rule: a zero is outcome `empty` — 'entity-audit-ok-zero' answers ok with no events.
      if (breaks.has('entity-audit-ok-zero')) return { ...envelope, outcome: 'ok', data: { events: [], nextCursor: null } };
      // 'entity-audit-trust' ships a malformed trust on the ok answer — the envelope shape check must catch it.
      return {
        ...envelope,
        outcome: 'ok',
        data: { events: [REF_EVENT], nextCursor: null },
        trust: breaks.has('entity-audit-trust') ? { ...REF_TRUST, coverage: '98%' as unknown as number | null } : null,
      };
    },
    auditTrail: async () => {
      // adapter.ts zero rule: a zero is outcome `empty`. 'console-auditTrail-empty' empties the audit store
      // (still conforming); 'console-auditTrail-ok-zero' answers ok with an empty page — the kit must refuse it.
      if (breaks.has('console-auditTrail-ok-zero')) return consoleGate('auditTrail', { items: [], total: 0 });
      const r = consoleGate('auditTrail', { items: [REF_EVENT], total: 1 });
      const answered = breaks.has('console-auditTrail-empty') && r.outcome === 'ok'
        ? { ...r, outcome: 'empty' as const, data: null }
        : r;
      // 'console-auditTrail-missing-assessments' omits the key entirely on the ok answer — a key omitted is
      // not null, and the envelope shape check must name it.
      if (breaks.has('console-auditTrail-missing-assessments') && answered.outcome === 'ok') {
        const omittable = answered as { assessments?: Assessment[] };
        delete omittable.assessments;
      }
      return answered;
    },
    accessDirectory: async () => {
      // The reference directory holds no principals: a zero is outcome `empty` (adapter.ts) — the kit must
      // accept it. 'console-accessDirectory-mart' dresses a non-mart read up as mart data — the kit must refuse that.
      const r = consoleGate('accessDirectory', { items: [], total: 0 });
      const zero = r.outcome === 'ok' ? { ...r, outcome: 'empty' as const, data: null } : r;
      // A key omitted is not null — the kit must name the missing key instead of throwing on undefined.
      const omittable = zero as { assessments?: Assessment[] };
      if (breaks.has('console-accessDirectory-missing-assessments')) delete omittable.assessments;
      return breaks.has('console-accessDirectory-mart') && zero.outcome === 'empty'
        ? { ...zero, assessments: REF_ASSESSMENTS, trust: REF_TRUST }
        : zero;
    },
    usageSummary: async (range: UsageRange) => {
      // §5: aggregation counts entries by the server receive time — 'usage-aggregates-by-client-at' stamps the
      // client at instead, and the receive-time check must catch it.
      const stamp = (e: UsageEvent & { receivedAt: number }) => (breaks.has('usage-aggregates-by-client-at') ? e.at : e.receivedAt);
      const from = 'preset' in range ? Number.NEGATIVE_INFINITY : range.from;
      const to = 'preset' in range ? Number.POSITIVE_INFINITY : range.to;
      const byMenu = new Map<string, { visits: number; users: Set<string>; last: number }>();
      for (const e of usageRows.filter(x => x.name === 'entry' && stamp(x) >= from && stamp(x) < to)) {
        const agg = byMenu.get(e.menuId) ?? { visits: 0, users: new Set<string>(), last: 0 };
        agg.visits += 1;
        agg.users.add(e.userId);
        agg.last = Math.max(agg.last, stamp(e));
        byMenu.set(e.menuId, agg);
      }
      const r = consoleGate<UsageSummary>('usageSummary', {
        preset: 'preset' in range ? 'all' : 'range',
        menus: [...byMenu.entries()].map(([menuId, agg]) => ({ menuId, visits: agg.visits, distinctUsers: agg.users.size, lastUsedAt: agg.last })),
      });
      // 'console-usageSummary-empty' answers empty on a zero — the kit must refuse it (adapter.ts: ok with menus: []).
      const answered = breaks.has('console-usageSummary-empty') && r.outcome === 'ok'
        ? { ...r, outcome: 'empty' as const, data: null }
        : r;
      // 'console-usageSummary-clear-no-source' asserts a clear assessment with no statusSource — the ok
      // answer's envelope shape check must catch it (06 §19).
      return breaks.has('console-usageSummary-clear-no-source') && answered.outcome === 'ok'
        ? { ...answered, assessments: [{ kind: 'coverage' as const, state: 'clear' as const }] }
        : answered;
    },
    recordUsage: async (events) => {
      // 'usage-epoch-throws' rejects only the epoch-0 event — the receive-time check must report recordUsage
      // throwing, not a missing envelope.
      if (breaks.has('usage-epoch-throws') && events.some(e => e.at === 0)) throw new Error('telemetry down');
      // A console-only actor that cannot record is conforming (the harness guarantees only the granted actor
      // may record ports.usage) — the receive-time probe must therefore record as the granted actor.
      if (breaks.has('usage-granted-only-record') && state.console) return { accepted: 0 };
      const USAGE_KEYS = ['name', 'menuId', 'spaceId', 'path', 'at', 'sessionId'];
      const token = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max
        && (breaks.has('usage-allows-query') ? !/[#&\s]/.test(v) : !/[?#&\s]/.test(v));
      const invalid = (e: UsageEvent) => {
        const allowed = e.name === 'dwell' ? [...USAGE_KEYS, 'dwellMs', 'enteredAt', 'source', 'stayId'] : [...USAGE_KEYS, 'source', 'stayId', 'via', 'fromMenuId'];
        // #605: via/fromMenuId belong to a main entry only and `via` is a closed set ('usage-accepts-bad-via' lets any string through).
        const VIA = ['sidebar', 'switcher', 'palette', 'board', 'return', 'crossLink', 'drill', 'history', 'direct', 'link'];
        const badNavigation = (e.via !== undefined && !breaks.has('usage-accepts-bad-via') && !VIA.includes(e.via))
          || (e.via !== undefined && typeof e.via !== 'string')
          || (e.fromMenuId !== undefined && e.fromMenuId !== null && !token(e.fromMenuId, 80));
        const badProvenance = (!breaks.has('usage-accepts-bad-source') && e.source !== undefined && e.source !== 'main' && e.source !== 'board')
          || (!breaks.has('usage-accepts-orphan-stay') && e.stayId !== undefined && (e.source !== 'board' || !token(e.stayId, 80)));
        return Object.keys(e).some(k => !allowed.includes(k) && !(breaks.has('usage-client-user') && k === 'userId'))
          || badProvenance || badNavigation
          || (breaks.has('usage-rejects-board') && e.source === 'board')
          || !token(e.menuId, 80) || !token(e.path, 200)
          || typeof e.sessionId !== 'string'
          || (breaks.has('usage-rejects-null') && e.spaceId === null)
          || !(e.spaceId === null || (typeof e.spaceId === 'string' && (token(e.spaceId, 80) || breaks.has('usage-accepts-malformed-space'))))
          || (e.name !== 'entry' && e.name !== 'dwell')
          || (!breaks.has('usage-allows-any-at') && (typeof e.at !== 'number' || !Number.isFinite(e.at)))
          || (e.name === 'dwell' && (!breaks.has('usage-allows-any-entered-at') && (typeof e.enteredAt !== 'number' || !Number.isFinite(e.enteredAt))
            || typeof e.dwellMs !== 'number' || !Number.isInteger(e.dwellMs) || (!breaks.has('usage-allows-negative-dwell') && e.dwellMs < 0)))
          || (breaks.has('usage-drops-dwell') && e.name === 'dwell' && e.source !== 'board');
      };
      const store = (rows: readonly UsageEvent[]) => {
        const userId = state.console ? 'admin' : 'engineer';
        const receivedAt = Date.now();
        for (const e of rows) {
          if (e.name === 'dwell') {
            // §5: the same (userId, sessionId, menuId, enteredAt) dwell replaces the previous one — the final dwell wins.
            // A board dwell with a stayId keys on (source, stayId) instead of enteredAt.
            const previous = usageRows.findIndex(x => x.name === 'dwell' && x.userId === userId && x.sessionId === e.sessionId && x.menuId === e.menuId
              && (e.stayId !== undefined ? x.source === e.source && x.stayId === e.stayId : x.stayId === undefined && x.enteredAt === e.enteredAt));
            if (previous >= 0) usageRows.splice(previous, 1);
          }
          usageRows.push({ ...e, userId, receivedAt });
        }
      };
      if (events.length > 20) return { accepted: 0 };
      // 'usage-partial-accept' stores the valid subset — the whole-call reject rule must catch it.
      if (breaks.has('usage-partial-accept')) {
        const good = events.filter(e => !invalid(e));
        store(good);
        return { accepted: good.length };
      }
      if (events.some(invalid)) return { accepted: 0 };
      store(events);
      return { accepted: events.length };
    },
    reportClientError: async (report) => {
      const CLIENT_ERROR_KEYS = ['correlationId', 'menuId', 'spaceId', 'path', 'name'];
      const token = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max
        && (breaks.has('client-error-allows-query') ? !/[#&\s]/.test(v) : !/[?#&\s]/.test(v));
      // 'client-error-allows-missing' fills a missing name in instead of rejecting the report.
      const name: unknown = breaks.has('client-error-allows-missing') && typeof report.name !== 'string' ? 'Error' : report.name;
      const appRelative = (v: string) => breaks.has('client-error-allows-absolute-path') || /^\/(?!\/)/.test(v);
      const invalidReport = breaks.has('client-error-rejects-all')
        || (!breaks.has('client-error-ignores-unknown') && Object.keys(report).some(k => !CLIENT_ERROR_KEYS.includes(k)))
        || typeof report.correlationId !== 'string' || !report.correlationId.startsWith('client-')
        || !token(report.menuId, 80)
        || typeof report.path !== 'string' || !token(report.path, 200) || !appRelative(report.path)
        || (breaks.has('client-error-rejects-null') && report.spaceId === null)
        || !(report.spaceId === null || (typeof report.spaceId === 'string' && (token(report.spaceId, 80) || breaks.has('client-error-accepts-malformed-space'))))
        || typeof name !== 'string' || (!breaks.has('client-error-allows-any-name') && !/^[A-Za-z_$][\w$]{0,79}$/.test(name));
      return invalidReport ? { accepted: false } : { accepted: true };
    },
    listAnnotations: async (ref) => {
      if (!state.permissions.has(menuPermission('analytics:view'))) {
        return breaks.has('annotation-list-permission')
          ? { ...envelope, outcome: 'ok', data: { items: [] } }
          : { ...envelope, outcome: 'forbidden', message: 'No permission analytics:view' };
      }
      if (ref.scopeId === null) {
        return breaks.has('annotation-list-null')
          ? { ...envelope, outcome: 'empty' }
          : { ...envelope, outcome: 'forbidden', message: 'No grant for scope null' };
      }
      if (ref.scopeId !== 'MEM' && ref.scopeId !== 'FDRY') {
        return breaks.has('annotation-list-foreign')
          ? { ...envelope, outcome: 'empty' }
          : { ...envelope, outcome: 'forbidden', message: `No grant for scope ${ref.scopeId}` };
      }
      // 'annotation-keyed-by-chart' selects by chartId alone — a note crosses the site boundary.
      const items = annotationRows
        .filter(r => r.chartId === ref.chartId && (breaks.has('annotation-keyed-by-chart') || r.scopeId === ref.scopeId))
        .map(({ authorId, ...row }) => ({ ...row, mine: authorId === actor() }));
      if (items.length === 0) return { ...envelope, outcome: 'empty' };
      // 'annotation-list-mart' taints only the list — 'annotation-mart' taints save and list together.
      return breaks.has('annotation-mart') || breaks.has('annotation-list-mart')
        ? { ...envelope, outcome: 'ok', data: { items }, assessments: REF_ASSESSMENTS, trust: REF_TRUST }
        : { ...envelope, outcome: 'ok', data: { items } };
    },
    saveAnnotation: async (input) => {
      if (!state.permissions.has(menuPermission('analytics:view'))) {
        return breaks.has('annotation-save-permission')
          ? { ...envelope, outcome: 'ok', data: { id: 'ann-0', chartId: input.chartId, scopeId: input.scopeId ?? 'MEM', from: input.from, to: input.to, text: input.text, at: '2026-09-26T09:00:00', mine: true } }
          : { ...envelope, outcome: 'forbidden', message: 'No permission analytics:view' };
      }
      // A user/at/id in the input is an unknown key and rejects the call (adapter.ts) — 'annotation-accepts-at'
      // takes only `at`, 'annotation-accepts-id-user' takes only id/user, so each break fails exactly one check.
      // 'annotation-error-stores' answers error but persists the row — the "nothing stored" half must catch it.
      const extraInputKeys = Object.keys(input).filter(k => !['chartId', 'scopeId', 'from', 'to', 'text'].includes(k));
      const acceptsExtraKeys = extraInputKeys.every(k =>
        (breaks.has('annotation-accepts-at') && k === 'at') || (breaks.has('annotation-accepts-id-user') && (k === 'id' || k === 'user')));
      if (extraInputKeys.length > 0 && !acceptsExtraKeys) {
        if (breaks.has('annotation-error-stores')) {
          annotationRows.push({ id: `ann-${++annotationSeq}`, chartId: input.chartId, scopeId: input.scopeId ?? 'MEM', from: input.from, to: input.to, text: input.text, at: '2026-09-26T09:00:00', authorId: actor() });
        }
        return err('Invalid annotation input');
      }
      if (input.scopeId === null) {
        return breaks.has('annotation-save-null')
          ? { ...envelope, outcome: 'ok', data: { id: 'ann-0', chartId: input.chartId, scopeId: 'MEM', from: input.from, to: input.to, text: input.text, at: '2026-09-26T09:00:00', mine: true } }
          : { ...envelope, outcome: 'forbidden', message: 'No grant for scope null' };
      }
      if (input.scopeId !== 'MEM' && input.scopeId !== 'FDRY') {
        return breaks.has('annotation-save-foreign')
          ? { ...envelope, outcome: 'ok', data: { id: 'ann-0', chartId: input.chartId, scopeId: input.scopeId, from: input.from, to: input.to, text: input.text, at: '2026-09-26T09:00:00', mine: true } }
          : { ...envelope, outcome: 'forbidden', message: `No grant for scope ${input.scopeId}` };
      }
      // 'annotation-echo' saves a different text than the input — the saved row must echo it. 'annotation-
      // row-author' leaks the stamped author into the returned row (adapter.ts: never sent, never returned).
      const stored = { id: `ann-${++annotationSeq}`, chartId: input.chartId, scopeId: input.scopeId, from: input.from, to: input.to, text: breaks.has('annotation-echo') ? `${input.text} (edited)` : input.text, at: '2026-09-26T09:00:00', authorId: actor() };
      // 'annotation-not-stored' answers ok without persisting — the same-site list must notice.
      if (!breaks.has('annotation-not-stored')) annotationRows.push(stored);
      const { authorId: _author, ...rest } = stored;
      const row = { ...rest, mine: !breaks.has('annotation-save-not-mine') };
      if (breaks.has('annotation-row-author')) return { ...envelope, outcome: 'ok', data: { ...row, authorId: 'engineer' } };
      const okRow: ApiResponse<ChartAnnotation> = breaks.has('annotation-mart')
        ? { ...envelope, outcome: 'ok', data: row, assessments: REF_ASSESSMENTS, trust: REF_TRUST }
        : { ...envelope, outcome: 'ok', data: row };
      // A key omitted is not null — the kit must name the missing key instead of throwing on undefined.
      const omittable = okRow as { trust?: Trust | null };
      if (breaks.has('annotation-save-missing-trust')) delete omittable.trust;
      return okRow;
    },
    deleteAnnotation: async ref => {
      if (!state.permissions.has(menuPermission('analytics:view'))) {
        return breaks.has('annotation-delete-permission')
          ? { ...envelope, outcome: 'ok', data: { id: ref.id } }
          : { ...envelope, outcome: 'forbidden', message: 'No permission analytics:view' };
      }
      if (ref.scopeId === null || (ref.scopeId !== 'MEM' && ref.scopeId !== 'FDRY')) {
        return breaks.has(ref.scopeId === null ? 'annotation-delete-null' : 'annotation-delete-foreign')
          ? { ...envelope, outcome: 'ok', data: { id: ref.id } }
          : { ...envelope, outcome: 'forbidden', message: `No grant for scope ${ref.scopeId}` };
      }
      const index = annotationRows.findIndex(r => r.id === ref.id && r.chartId === ref.chartId && r.scopeId === ref.scopeId);
      if (index < 0) {
        return breaks.has('annotation-delete-unknown-ok')
          ? { ...envelope, outcome: 'ok', data: { id: ref.id } }
          : { ...envelope, outcome: 'empty' };
      }
      // 'annotation-delete-any-author' lets anyone delete; 'annotation-delete-not-removed' answers ok but keeps the row.
      if (annotationRows[index].authorId !== actor() && !breaks.has('annotation-delete-any-author')) return { ...envelope, outcome: 'forbidden', message: 'Only the author can delete a note' };
      if (!breaks.has('annotation-delete-not-removed')) annotationRows.splice(index, 1);
      return { ...envelope, outcome: 'ok', data: { id: ref.id } };
    },
    // The write port (ADR-0054): judgment order shape → key → permission → scope → replay → input → version → handler, one break per rule.
    menuAction: async raw => {
      const req = raw as MenuAction & { input: Record<string, unknown> };
      const answer = (outcome: ActionResponse<unknown>['outcome'], rest: Partial<ActionResponse<unknown>> = {}): ActionResponse<unknown> =>
        ({ outcome, data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'ref', ...rest });
      const key = req.idempotencyKey;
      if (!UUID_PATTERN.test(String(key)) && !breaks.has('action-key')) {
        return answer('invalid', { fieldErrors: [{ path: ['idempotencyKey'], code: key === undefined ? 'required' : 'malformed' }] });
      }
      const slot = `${actor()}\n${key}`;
      const hash = JSON.stringify([req.input, req.context, req.expectedVersion]);
      const replay = (): ActionResponse<unknown> | null => {
        const stored = actionRecords.get(slot);
        if (!stored || breaks.has('action-no-replay')) return null;
        if (stored.hash !== hash && !breaks.has('action-reuse')) return answer('error', { message: 'idempotency_key_reuse' });
        return { ...stored.response, replayed: true };
      };
      if (breaks.has('action-replay-first')) { const stored = replay(); if (stored) return stored; }
      if (!state.permissions.has(actionSpec.permission)) return answer('forbidden');
      if (req.context.scopeId !== 'MEM' && req.context.scopeId !== 'FDRY' && !breaks.has('action-scope')) return answer('forbidden');
      const stored = replay();
      if (stored) return stored;
      const extra = Object.keys(req.input).filter(k => k !== 'text');
      if (extra.length > 0 && !breaks.has('action-unexpected')) {
        const invalid = answer('invalid', { fieldErrors: extra.map(k => ({ path: [k], code: 'unexpected_field' })) });
        if (breaks.has('action-record-invalid')) actionRecords.set(slot, { hash, response: invalid });
        return invalid;
      }
      const current = String(state.targetVersion ??= 1);
      if (req.expectedVersion !== current && !breaks.has('action-conflict-ignored')) {
        return answer('conflict', { version: breaks.has('action-conflict-no-version') ? null : current });
      }
      state.targetVersion += 1;
      const ok = answer('ok', { data: { id: state.targetVersion }, version: String(state.targetVersion) });
      actionRecords.set(slot, { hash, response: ok });
      return ok;
    },
    readPreferences: async () => prefsAnswer(prefsOf()),
    patchPreferences: async patch => {
      const body = patch as Record<string, unknown>;
      const set = (patch.set ?? {}) as Record<string, JsonValue>;
      const remove = patch.remove ?? [];
      const keys = [...Object.keys(set), ...remove];
      const identity = Object.keys(body).some(k => k !== 'set' && k !== 'remove');
      const overlap = remove.some(k => k in set);
      if ((identity && !breaks.has('prefs-identity')) || (overlap && !breaks.has('prefs-overlap')) || keys.some(k => !PREF_KEY.test(k))) return err('invalid patch');
      const store = prefsOf();
      if (breaks.has('prefs-overwrite')) store.values = {};
      for (const k of remove) delete store.values[k];
      Object.assign(store.values, set);
      return prefsAnswer(store);
    },
    importPreferences: async input => {
      const body = input as Record<string, unknown>;
      if (Object.keys(body).some(k => k !== 'values') && !breaks.has('prefs-identity')) return err('invalid import');
      if (Object.keys(input.values).some(k => !PREF_KEY.test(k))) return err('invalid import');
      const store = prefsOf();
      if (store.importedAt === null || breaks.has('prefs-import-repeat')) {
        for (const [k, v] of Object.entries(input.values)) if (!(k in store.values) || breaks.has('prefs-import-overwrite')) store.values[k] = v;
        store.importedAt ??= '2026-09-26T09:00:00Z';
      }
      return prefsAnswer(store);
    },
    lookupPeople: async ids => {
      const directory: Record<string, GroupMember> = { engineer: { userId: 'engineer', displayName: 'Engineer', affiliation: 'MEM' } };
      return ids.flatMap(id => {
        const person = directory[id];
        if (!person) return breaks.has('people-echo') ? [{ userId: id, displayName: id, affiliation: '' }] : [];
        return [breaks.has('people-console-data') ? ({ ...person, role: 'admin' } as GroupMember) : person];
      });
    },
    listNotices: async () => ({ ...envelope, outcome: 'ok', data: { items: noticeRows.map(toNotice) } }),
    saveNotice: async input => {
      if (!noticeWriter()) return noticeAnswer('forbidden');
      const body = input as Record<string, unknown>;
      const update = 'id' in body || 'expectedVersion' in body;
      const allowed = ['title', 'content', 'scopeId', 'until', 'idempotencyKey', ...(update ? ['id', 'expectedVersion'] : [])];
      if (Object.keys(body).some(k => !allowed.includes(k)) && !breaks.has('notice-author')) return noticeAnswer('invalid', { fieldErrors: [{ path: ['body'], code: 'unknown_key' }] });
      const replay = noticeReplays.get(`${actor()}:${input.idempotencyKey}`);
      if (replay && !breaks.has('notice-replay')) return { ...replay, replayed: true };
      let result: ActionResponse<Notice>;
      const draft = { title: input.title, content: input.content, scopeId: input.scopeId, until: input.until };
      if ('id' in input) {
        const row = noticeRows.find(r => r.id === input.id);
        if (!row) return noticeAnswer('not_found');
        if (row.version !== input.expectedVersion && !breaks.has('notice-stale')) return noticeAnswer('conflict', { version: row.version });
        row.n += 1;
        Object.assign(row, draft, { version: `v${row.n}` });
        result = noticeAnswer('ok', { data: toNotice(row), version: row.version });
      } else {
        const row: StoredNotice = { ...draft, id: `N-${++noticeSeq}`, version: 'v1', n: 1 };
        noticeRows.push(row);
        result = noticeAnswer('ok', { data: toNotice(row), version: row.version });
      }
      noticeReplays.set(`${actor()}:${input.idempotencyKey}`, result);
      return result;
    },
    deleteNotice: async input => {
      if (!noticeWriter()) return noticeAnswer('forbidden');
      const index = noticeRows.findIndex(r => r.id === input.id);
      if (index < 0) return noticeAnswer('not_found');
      if (noticeRows[index]!.version !== input.expectedVersion) return noticeAnswer('conflict', { version: noticeRows[index]!.version });
      noticeRows.splice(index, 1);
      return noticeAnswer('ok', { data: { id: input.id }, version: input.expectedVersion });
    },
    // The ports round D exercises (#152): contract-shaped answers, one break each.
    publishedMetrics: () => breaks.has('published-metrics')
      ? [{ metricId: '', publishedVersion: 3 as unknown as string | null }] // empty id, non-string version
      : [{ metricId: 'cycle_time', publishedVersion: '4' }, { metricId: 'scrap_rate', publishedVersion: null }],
    // 'default-range' answers with a Z suffix — a zone the naive wall-clock of 06 §6.3 forbids.
    // 'null-anchor' = a server with no anchor (valid); 'default-range' answers with a Z suffix.
    defaultRangeTo: () => (breaks.has('null-anchor') ? null : breaks.has('default-range') ? '2026-09-26T09:00:00Z' : breaks.has('default-range-number') ? (5 as unknown as string) : '2026-09-26T09:00:00'),
    contextOptions: async scopeId => {
      if (scopeId !== 'MEM') return { stgroup: [], team: [], makerModel: [] };
      // 'context-options' answers stgroup as a plain string and model as a number.
      return breaks.has('context-options')
        ? { stgroup: 'photo' as unknown as string[], team: [], makerModel: [{ maker: 'Canon', model: 3 as unknown as string }] }
        : { stgroup: ['photo', 'etch'], team: ['shift-a', 'shift-b'], makerModel: [{ maker: 'Canon', model: 'HX-1' }] };
    },
    evaluateSelection: async input => {
      // Grants come from the session (adapter.ts): MEM/PHOTO only. 'selection-ignores-grants' also serves
      // the ungranted DIFF room; 'selection-foreign' lists equipment even at the ungranted site XIA.
      const grantedRooms = input.scopeId === 'MEM'
        ? (breaks.has('selection-ignores-grants') ? ['PHOTO', 'DIFF'] : ['PHOTO'])
        : input.scopeId === 'XIA' && breaks.has('selection-foreign') ? ['DIFF'] : [];
      const inCondition = REF_EQUIPMENT
        .filter(e => grantedRooms.includes(e.room) && (input.roomNames === null || input.roomNames.includes(e.room)))
        .map(e => ({ equipmentId: e.equipmentId, room: e.room, model: e.model }));
      return { inCondition, outOfCondition: (input.selection ?? []).filter(id => !inCondition.some(e => e.equipmentId === id)) };
    },
  };
}

const CONTEXT = { scopeId: 'MEM', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };
const PORTS: PortSamples = {
  entity: {
    ref: { type: 'equipment', id: 'MEM-PHOTO-0103', scopeId: 'MEM' },
    permission: menuPermission('equipment:view'),
    // DIFF is a real MEM room the granted actor does not hold — the room re-check sample (06 §22).
    ungrantedRoomRef: { type: 'equipment', id: 'MEM-DIFF-0176', scopeId: 'MEM' },
  },
  annotation: { chartId: 'fixture-chart', from: '2026-09-25T10:00:00', to: '2026-09-25T11:00:00', permission: menuPermission('analytics:view') },
  usage: { name: 'entry', menuId: 'fixture', spaceId: spaceId('mars'), path: '/fixture', at: 0, sessionId: 'tab' },
  clientError: { correlationId: 'client-ref', menuId: 'fixture', spaceId: spaceId('mars'), path: '/fixture', name: 'Error' },
  otherGrantedScopeId: 'FDRY',
};

function actors(state: RefState) {
  return {
    asGranted: <T>(fn: () => Promise<T>): Promise<T> => fn(),
    withoutPermission: async <T>(permission: Permission, fn: () => Promise<T>): Promise<T> => {
      state.permissions.delete(permission);
      try { return await fn(); } finally { state.permissions.add(permission); }
    },
    asConsole: async <T>(fn: () => Promise<T>): Promise<T> => {
      state.console = true;
      try { return await fn(); } finally { state.console = false; }
    },
    // A different user from the granted one who keeps the chart permission (and the site grants the reference gives everyone).
    asOtherAnnotator: async <T>(fn: () => Promise<T>): Promise<T> => {
      state.console = true;
      try { return await fn(); } finally { state.console = false; }
    },
  };
}

function harness(breaks: ReadonlySet<string> = new Set(), cases: readonly ConformanceCase[] = [{ spec, params: { page: 0 } }]): ServerConformanceHarness {
  const state: RefState = { permissions: new Set<Permission>([menuPermission('analytics:view'), menuPermission('equipment:view')]), console: false };
  return { adapter: referenceAdapter(state, breaks), cases, context: CONTEXT, foreignScopeId: 'XIA', ports: PORTS, ...actors(state) };
}

function actionHarness(breaks: ReadonlySet<string> = new Set(), over: Partial<ServerConformanceHarness> = {}): ServerConformanceHarness {
  const state: RefState = { permissions: new Set<Permission>([menuPermission('analytics:view'), menuPermission('equipment:view')]), console: false };
  const actions: ActionCase[] = [{ spec: actionSpec, input: { text: 'hello' }, currentVersion: async () => String(state.targetVersion ??= 1) }];
  return { adapter: referenceAdapter(state, breaks), cases: [], context: CONTEXT, foreignScopeId: 'XIA', ports: PORTS, actions, ...actors(state), ...over };
}

async function failing(breaks: string[]): Promise<string[]> {
  return (await runServerConformance(harness(new Set(breaks)))).filter(r => r.failure !== null).map(r => r.id);
}

describe('server conformance kit (#145)', () => {
  it('derives the checks from the declaration', () => {
    expect(planServerConformance(harness()).map(c => c.id)).toEqual([
      'unknown endpoint → error',
      'fixture.list · granted request succeeds with exactly the declared assessment kinds',
      'fixture.list · granted response assessments are well-formed (06 §19)',
      'fixture.list · granted response trust is null or complete (06 §18)',
      'fixture.list · unknown top-level request key → error',
      'fixture.list · unknown params key → error',
      'fixture.list · non-applied Context key condition → error',
      'fixture.list · non-applied Context key lineNames → error',
      'fixture.list · non-applied Context key prcGroups → error',
      'fixture.list · non-applied Context key membershipBasis → error',
      'fixture.list · non-applied Context key lotIds → error',
      'fixture.list · non-applied Context key ppid → error',
      'fixture.list · non-applied Context key recipeIds → error',
      'fixture.list · missing applied Context key scopeId → error',
      'fixture.list · missing applied Context key from → error',
      'fixture.list · missing applied Context key to → error',
      'fixture.list · missing applied Context key roomNames → error',
      'fixture.list · missing applied Context key selection → error',
      'fixture.list · missing applied Context key metricId → error',
      'fixture.list · missing applied Context key metricVersion → error',
      'fixture.list · time applied with a null from → error',
      'fixture.list · metricVersion without metricId → error',
      'fixture.list · a site without a grant → forbidden',
      'fixture.list · a null Scope → forbidden',
      'fixture.list · explicit empty roomNames: [] → empty with no assessments and no trust',
      'fixture.list · explicit empty selection: [] → empty with no assessments and no trust',
      'fixture.list · without analytics:view → forbidden',
      'port · session() returns the same object until the session changes',
      'port · session lists the granted sites and not the foreign one',
      'port · subscribe returns an unsubscribe function',
      'port · validateScope(granted site) → valid with its rooms',
      'port · validateScope(second granted site) → valid',
      'port · validateScope(foreign site) → forbidden with no rooms',
      'port · validateScope(unknown site) → unknown_scope',
      'port · publishedMetrics() returns well-formed pointers',
      'port · defaultRangeTo() is a naive wall-clock',
      'port · contextOptions(granted site) returns the option lists',
      'port · evaluateSelection lists only equipment in granted rooms',
      'port · evaluateSelection at a site without a grant lists no equipment',
      'port · getEntity(sample) → ok with the row',
      'port · getEntity of an unregistered type → error',
      'port · getEntity at a site without a grant → forbidden',
      'port · getEntity with a null Scope → forbidden',
      'port · getEntity of a destination in an ungranted room → forbidden',
      'port · getEntity without equipment:view → forbidden',
      'port · entityAudit(sample) → events',
      'port · entityAudit of an unregistered type → error',
      'port · entityAudit at a site without a grant → forbidden',
      'port · entityAudit with a null Scope → forbidden',
      'port · entityAudit of a destination in an ungranted room → forbidden',
      'port · entityAudit page holds at most 50 events',
      'port · entityAudit nextCursor walks every event once, in order, to a null cursor',
      'port · entityAudit with a malformed cursor → error',
      'port · entityAudit with a cursor at a site without a grant → forbidden',
      'port · entityAudit with a cursor without equipment:view → forbidden',
      'port · entityAudit with an issued cursor on another destination → error',
      'port · entityAudit with an issued cursor at a site without a grant → forbidden',
      'port · entityAudit with an issued cursor without equipment:view → forbidden',
      'port · entityAudit with an issued cursor in an ungranted room → forbidden',
      'port · entityAudit without equipment:view → forbidden',
      'port · auditTrail as a console actor → ok',
      'port · auditTrail without console:access → forbidden',
      'port · accessDirectory as a console actor → ok',
      'port · accessDirectory without console:access → forbidden',
      'port · usageSummary as a console actor → ok',
      'port · usageSummary without console:access → forbidden',
      'port · accessDirectory is not mart data: no assessments, null trust',
      'port · saveAnnotation then listAnnotations at the same site returns the note',
      'port · a note saved at one site is not listed at another',
      'port · listAnnotations at a site without a grant → forbidden',
      'port · saveAnnotation at a site without a grant → forbidden',
      'port · listAnnotations with a null Scope → forbidden',
      'port · saveAnnotation with a null Scope → forbidden',
      'port · saveAnnotation carrying an at → error, nothing stored',
      'port · saveAnnotation carrying an id or a user → error',
      'port · annotations are not mart data: no assessments, null trust',
      'port · listAnnotations without analytics:view → forbidden',
      'port · saveAnnotation without analytics:view → forbidden',
      'port · deleteAnnotation by the author removes the note',
      'port · deleteAnnotation by another user → forbidden and the note stays',
      'port · deleteAnnotation of an id not at this site → empty',
      'port · deleteAnnotation at a site without a grant → forbidden',
      'port · deleteAnnotation with a null Scope → forbidden',
      'port · deleteAnnotation without analytics:view → forbidden',
      'port · recordUsage accepts a valid entry and dwell',
      'port · recordUsage accepts a board entry and dwell (source, stayId)',
      'port · recordUsage accepts an explicit main source and a legacy event without one',
      'port · recordUsage: an unknown source is rejected',
      'port · recordUsage accepts via and fromMenuId on a main entry',
      'port · recordUsage: a via outside the closed set is rejected',
      'port · recordUsage: a stayId without board source is rejected',
      'port · recordUsage: an unknown key next to source is rejected',
      'port · recordUsage accepts a global menu (spaceId null)',
      'port · recordUsage: a malformed spaceId is rejected',
      'port · recordUsage: one bad event rejects the whole call',
      'port · recordUsage: a client userId is rejected',
      'port · recordUsage: a concrete path with a query is rejected',
      'port · recordUsage: a non-numeric at is rejected',
      'port · recordUsage: a non-numeric enteredAt is rejected',
      'port · recordUsage: a negative dwellMs is rejected',
      'port · usageSummary counts by receive time, not the client at',
      'port · reportClientError accepts the sample',
      'port · reportClientError accepts a global menu (spaceId null)',
      'port · reportClientError: a malformed spaceId is rejected',
      'port · reportClientError: an unknown key (free-text message) is rejected',
      'port · reportClientError: an absolute URL path is rejected',
      'port · reportClientError: a path with a query is rejected',
      'port · reportClientError: a free-text name is rejected',
      'port · reportClientError: a missing field is rejected',
      'port · patchPreferences stores, merges and removes keys; null is a value',
      'port · patchPreferences rejects overlapping set/remove, bad keys and a forged identity, and writes nothing',
      'port · importPreferences keeps server values, saves missing keys once, and is a no-op afterwards',
      'port · preferences are per session user: a second user neither reads nor is changed by them',
      'port · lookupPeople answers exact ids with GroupMember fields only; unknown ids are absent',
      'port · notices: create, update under the version, stale update conflicts, delete, delete again not_found',
      'port · saveNotice with the same idempotency key replays without a second write',
      'port · saveNotice rejects a supplied author, id on create and unknown keys',
      'port · saveNotice without console:access → forbidden',
      'port · deleteNotice without console:access → forbidden',
      'actions: no sample',
      'condition: no sample',
      ...SELECTION_PORT_SKIP_IDS,
    ]);
  });

  it('passes every check on a conforming server', async () => {
    expect(await failing([])).toEqual([]);
  });

  it.each([
    ['top-level', 'fixture.list · unknown top-level request key → error'],
    ['params', 'fixture.list · unknown params key → error'],

    ['permission', 'fixture.list · without analytics:view → forbidden'],

    ['kinds', 'fixture.list · granted request succeeds with exactly the declared assessment kinds'],
  ])('fails exactly the matching check when the server drops the %s rule', async (broken, check) => {
    expect(await failing([broken])).toEqual([check]);
  });

  // #146 review: one sampled key per rule let a server that checks only that key pass. Every key is a check now.
  it.each([
    ['non-applied', ['condition', 'lineNames', 'prcGroups', 'membershipBasis', 'lotIds', 'ppid', 'recipeIds'].map(k => `fixture.list · non-applied Context key ${k} → error`)],
    ['non-applied-first-only', ['lineNames', 'prcGroups', 'membershipBasis', 'lotIds', 'ppid', 'recipeIds'].map(k => `fixture.list · non-applied Context key ${k} → error`)],
    // from/to stay caught by the reference server's separate absolute-period rule.
    ['missing-last-only', ['scopeId', 'roomNames', 'selection', 'metricId'].map(k => `fixture.list · missing applied Context key ${k} → error`)],
    ['explicit-empty', ['roomNames', 'selection'].map(k => `fixture.list · explicit empty ${k}: [] → empty with no assessments and no trust`)],
    ['explicit-empty-roomNames-only', ['fixture.list · explicit empty selection: [] → empty with no assessments and no trust']],
  ])('catches a server that drops the %s rule on any declared key', async (broken, checks) => {
    expect(await failing([broken])).toEqual(checks);
  });

  // ADR-0098: one break per preferences/people/notices rule; each must fail its own check(s).
  it.each([
    ['prefs-overwrite', ['port · patchPreferences stores, merges and removes keys; null is a value']],
    ['prefs-overlap', ['port · patchPreferences rejects overlapping set/remove, bad keys and a forged identity, and writes nothing']],
    ['prefs-identity', ['port · patchPreferences rejects overlapping set/remove, bad keys and a forged identity, and writes nothing', 'port · importPreferences keeps server values, saves missing keys once, and is a no-op afterwards']],
    ['prefs-import-overwrite', ['port · importPreferences keeps server values, saves missing keys once, and is a no-op afterwards']],
    ['prefs-import-repeat', ['port · importPreferences keeps server values, saves missing keys once, and is a no-op afterwards']],
    ['prefs-shared', ['port · preferences are per session user: a second user neither reads nor is changed by them']],
    ['people-echo', ['port · lookupPeople answers exact ids with GroupMember fields only; unknown ids are absent']],
    ['people-console-data', ['port · lookupPeople answers exact ids with GroupMember fields only; unknown ids are absent']],
    ['notice-replay', ['port · saveNotice with the same idempotency key replays without a second write']],
    ['notice-stale', ['port · notices: create, update under the version, stale update conflicts, delete, delete again not_found']],
    ['notice-author', ['port · saveNotice rejects a supplied author, id on create and unknown keys']],
    ['notice-forbidden', ['port · saveNotice without console:access → forbidden', 'port · deleteNotice without console:access → forbidden']],
  ])('catches a server that breaks %s', async (broken, expected) => {
    expect(await failing([broken])).toEqual(expect.arrayContaining(expected));
  });

  it('defaultRangeTo: a null anchor and a valid naive wall-clock pass; a zoned or non-string anchor fails', async () => {
    const id = 'port · defaultRangeTo() is a naive wall-clock';
    expect(await failing(['null-anchor'])).not.toContain(id);
    expect(await failing([])).not.toContain(id);
    expect(await failing(['default-range'])).toContain(id);
    expect(await failing(['default-range-number'])).toContain(id);
  });

  it('fails both Scope checks when the server ignores the site grant', async () => {
    expect(await failing(['scope'])).toEqual([
      'fixture.list · a site without a grant → forbidden',
      'fixture.list · a null Scope → forbidden',
    ]);
  });

  // #152: one break per port rule (and per envelope-shape rule) — each must fail exactly its own check.
  it.each([
    ['session-identity', 'port · session() returns the same object until the session changes'],
    ['session-scopes', 'port · session lists the granted sites and not the foreign one'],
    ['session-foreign', 'port · session lists the granted sites and not the foreign one'],
    ['subscribe-unsubscribe', 'port · subscribe returns an unsubscribe function'],
    ['unsubscribe-throws', 'port · subscribe returns an unsubscribe function'],
    // #152 round D: the four ports the kit now exercises — one break each.
    ['published-metrics', 'port · publishedMetrics() returns well-formed pointers'],
    ['default-range', 'port · defaultRangeTo() is a naive wall-clock'],
    ['context-options', 'port · contextOptions(granted site) returns the option lists'],
    ['selection-ignores-grants', 'port · evaluateSelection lists only equipment in granted rooms'],
    ['selection-foreign', 'port · evaluateSelection at a site without a grant lists no equipment'],
    ['validate-granted', 'port · validateScope(granted site) → valid with its rooms'],
    ['validate-other', 'port · validateScope(second granted site) → valid'],
    ['validate-foreign', 'port · validateScope(foreign site) → forbidden with no rooms'],
    ['validate-unknown', 'port · validateScope(unknown site) → unknown_scope'],
    ['validate-unknown-rooms', 'port · validateScope(unknown site) → unknown_scope'],
    ['entity-ok', 'port · getEntity(sample) → ok with the row'],
    ['entity-unknown-type', 'port · getEntity of an unregistered type → error'],
    ['entity-foreign', 'port · getEntity at a site without a grant → forbidden'],
    ['entity-null-scope', 'port · getEntity with a null Scope → forbidden'],
    ['entity-room', 'port · getEntity of a destination in an ungranted room → forbidden'],
    ['entity-permission', 'port · getEntity without equipment:view → forbidden'],
    // Three ways the getEntity success check can fail: no row, malformed assessments, incomplete trust.
    ['entity-assessments', 'port · getEntity(sample) → ok with the row'],
    ['entity-trust', 'port · getEntity(sample) → ok with the row'],
    ['entity-audit-ok', 'port · entityAudit(sample) → events'],
    ['entity-audit-ok-zero', 'port · entityAudit(sample) → events'],
    ['entity-audit-unknown-type', 'port · entityAudit of an unregistered type → error'],
    ['entity-audit-foreign', 'port · entityAudit at a site without a grant → forbidden'],
    ['entity-audit-null', 'port · entityAudit with a null Scope → forbidden'],
    ['entity-audit-room', 'port · entityAudit of a destination in an ungranted room → forbidden'],
    ['entity-audit-permission', 'port · entityAudit without equipment:view → forbidden'],
    // Round D: every successful port envelope answers the full 06 §19/§18 shape.
    ['entity-audit-trust', 'port · entityAudit(sample) → events'],
    ['console-auditTrail-missing-assessments', 'port · auditTrail as a console actor → ok'],
    ['console-usageSummary-clear-no-source', 'port · usageSummary as a console actor → ok'],
    ['console-auditTrail-ok', 'port · auditTrail as a console actor → ok'],
    // adapter.ts zero rule: ok with an empty page is a violation (a zero is outcome empty).
    ['console-auditTrail-ok-zero', 'port · auditTrail as a console actor → ok'],
    ['console-accessDirectory-ok', 'port · accessDirectory as a console actor → ok'],
    ['console-auditTrail-permission', 'port · auditTrail without console:access → forbidden'],
    ['console-accessDirectory-permission', 'port · accessDirectory without console:access → forbidden'],
    ['console-usageSummary-permission', 'port · usageSummary without console:access → forbidden'],
    ['console-accessDirectory-mart', 'port · accessDirectory is not mart data: no assessments, null trust'],
    // #152 step 2: one break per new port rule — each must fail exactly its own check.
    // Two more ways the save shape check fails: the row does not echo the input, or leaks the stamped author.
    ['annotation-not-stored', 'port · saveAnnotation then listAnnotations at the same site returns the note'],
    ['annotation-echo', 'port · saveAnnotation then listAnnotations at the same site returns the note'],
    ['annotation-row-author', 'port · saveAnnotation then listAnnotations at the same site returns the note'],
    ['annotation-keyed-by-chart', 'port · a note saved at one site is not listed at another'],
    ['annotation-list-foreign', 'port · listAnnotations at a site without a grant → forbidden'],
    ['annotation-save-foreign', 'port · saveAnnotation at a site without a grant → forbidden'],
    ['annotation-list-null', 'port · listAnnotations with a null Scope → forbidden'],
    ['annotation-save-null', 'port · saveAnnotation with a null Scope → forbidden'],
    ['annotation-accepts-at', 'port · saveAnnotation carrying an at → error, nothing stored'],
    // 'annotation-accepts-id-user' takes id/user but still rejects at — only the new check fails.
    ['annotation-accepts-id-user', 'port · saveAnnotation carrying an id or a user → error'],
    // The other half of the same check: answering error but persisting the row anyway.
    ['annotation-error-stores', 'port · saveAnnotation carrying an at → error, nothing stored'],
    // 'annotation-mart' taints save and list; 'annotation-list-mart' taints the list only.
    ['annotation-mart', 'port · annotations are not mart data: no assessments, null trust'],
    ['annotation-list-mart', 'port · annotations are not mart data: no assessments, null trust'],
    ['annotation-save-not-mine', 'port · saveAnnotation then listAnnotations at the same site returns the note'],
    ['annotation-delete-any-author', 'port · deleteAnnotation by another user → forbidden and the note stays'],
    ['annotation-delete-not-removed', 'port · deleteAnnotation by the author removes the note'],
    ['annotation-delete-unknown-ok', 'port · deleteAnnotation of an id not at this site → empty'],
    ['annotation-delete-foreign', 'port · deleteAnnotation at a site without a grant → forbidden'],
    ['annotation-delete-null', 'port · deleteAnnotation with a null Scope → forbidden'],
    ['annotation-delete-permission', 'port · deleteAnnotation without analytics:view → forbidden'],
    ['annotation-list-permission', 'port · listAnnotations without analytics:view → forbidden'],
    ['annotation-save-permission', 'port · saveAnnotation without analytics:view → forbidden'],
    ['usage-drops-dwell', 'port · recordUsage accepts a valid entry and dwell'],
    ['usage-partial-accept', 'port · recordUsage: one bad event rejects the whole call'],
    ['usage-client-user', 'port · recordUsage: a client userId is rejected'],
    ['usage-allows-query', 'port · recordUsage: a concrete path with a query is rejected'],
    ['usage-allows-any-at', 'port · recordUsage: a non-numeric at is rejected'],
    ['usage-allows-any-entered-at', 'port · recordUsage: a non-numeric enteredAt is rejected'],
    ['usage-allows-negative-dwell', 'port · recordUsage: a negative dwellMs is rejected'],
    ['usage-rejects-board', 'port · recordUsage accepts a board entry and dwell (source, stayId)'],
    ['usage-accepts-bad-source', 'port · recordUsage: an unknown source is rejected'],
    ['usage-accepts-bad-via', 'port · recordUsage: a via outside the closed set is rejected'],
    ['usage-accepts-orphan-stay', 'port · recordUsage: a stayId without board source is rejected'],
    ['usage-aggregates-by-client-at', 'port · usageSummary counts by receive time, not the client at'],
    // client-error-rejects-all fails every positive report, including the global-menu sample — asserted below.
    ['client-error-ignores-unknown', 'port · reportClientError: an unknown key (free-text message) is rejected'],
    ['client-error-allows-absolute-path', 'port · reportClientError: an absolute URL path is rejected'],
    ['client-error-allows-query', 'port · reportClientError: a path with a query is rejected'],
    ['client-error-allows-any-name', 'port · reportClientError: a free-text name is rejected'],
    ['client-error-allows-missing', 'port · reportClientError: a missing field is rejected'],
    ['assessments-wellformed', 'fixture.list · granted response assessments are well-formed (06 §19)'],
    ['trust-incomplete', 'fixture.list · granted response trust is null or complete (06 §18)'],
    // One break per remaining 06 §19/§18 shape branch (duplicate kind gets its own two-check test below).
    ['assessments-unknown-no-reason', 'fixture.list · granted response assessments are well-formed (06 §19)'],
    ['assessments-explains-empty', 'fixture.list · granted response assessments are well-formed (06 §19)'],
    ['trust-updated-at-number', 'fixture.list · granted response trust is null or complete (06 §18)'],
    ['trust-provisional-string', 'fixture.list · granted response trust is null or complete (06 §18)'],
    ['trust-source-missing', 'fixture.list · granted response trust is null or complete (06 §18)'],
    ['trust-data-through-number', 'fixture.list · granted response trust is null or complete (06 §18)'],
    ['trust-metric-version-number', 'fixture.list · granted response trust is null or complete (06 §18)'],
    ['envelope-missing-trust', 'fixture.list · granted response trust is null or complete (06 §18)'],
    // Rejections carry no data (checklist §2): demonstrated on one error path and one forbidden path.
    ['unknown-endpoint-data', 'unknown endpoint → error'],
    ['permission-reject-data', 'fixture.list · without analytics:view → forbidden'],
  ])('fails exactly the matching check when the server drops the %s rule', async (broken, check) => {
    expect(await failing([broken])).toEqual([check]);
  });

  // F1 (#399): the author check must not pass because the second actor was refused before authorship was tested.
  // A console-only second actor (no chart permission) is refused at the permission gate whatever the server does with authors.
  const AUTHOR_CHECK = 'port · deleteAnnotation by another user → forbidden and the note stays';
  async function failingWithConsoleOnlyOther(breaks: string[]): Promise<{ id: string; failure: string | null }[]> {
    const state: RefState = { permissions: new Set<Permission>([menuPermission('analytics:view'), menuPermission('equipment:view')]), console: false };
    const consoleOnly = async <T>(fn: () => Promise<T>): Promise<T> => {
      state.console = true;
      state.permissions.delete(menuPermission('analytics:view'));
      try { return await fn(); } finally { state.console = false; state.permissions.add(menuPermission('analytics:view')); }
    };
    const h: ServerConformanceHarness = { adapter: referenceAdapter(state, new Set(breaks)), cases: [{ spec, params: { page: 0 } }], context: CONTEXT, foreignScopeId: 'XIA', ports: PORTS, ...actors(state), asConsole: consoleOnly, asOtherAnnotator: consoleOnly };
    return (await runServerConformance(h)).filter(r => r.id === AUTHOR_CHECK);
  }

  it.each([[[]], [['annotation-delete-any-author']]])('does not report an author pass when the second actor cannot annotate (breaks: %j)', async breaks => {
    const [result] = await failingWithConsoleOnlyOther(breaks);
    expect(result.failure).toMatch(/second actor .*cannot annotate/);
  });

  it('reports the permissive-author server with an annotation-capable second actor', async () => {
    const [result] = (await runServerConformance(harness(new Set(['annotation-delete-any-author'])))).filter(r => r.id === AUTHOR_CHECK);
    expect(result.failure).toMatch(/not the author: expected forbidden, got ok/);
  });

  // Rejecting every report fails both positive controls: the harness sample and the cloned global menu.
  it('fails both positive reportClientError checks when the server rejects every report', async () => {
    expect(await failing(['client-error-rejects-all'])).toEqual([
      'port · reportClientError accepts the sample',
      'port · reportClientError accepts a global menu (spaceId null)',
    ]);
  });

  // A console actor the usageSummary read refuses cannot run the receive-time sequence either — both fail.
  it('fails the console read and the receive-time check when usageSummary refuses the console actor', async () => {
    expect(await failing(['console-usageSummary-ok'])).toEqual([
      'port · usageSummary as a console actor → ok',
      'port · usageSummary counts by receive time, not the client at',
    ]);
  });

  // adapter.ts zero rule: usageSummary answering `empty` on a zero breaks both console checks — a zero is
  // `ok` with `menus: []` (the console left-joins zero-visit menus).
  it('fails the console read and the receive-time check when usageSummary answers empty on a zero', async () => {
    expect(await failing(['console-usageSummary-empty'])).toEqual([
      'port · usageSummary as a console actor → ok',
      'port · usageSummary counts by receive time, not the client at',
    ]);
  });

  // The same rule's positive half: auditTrail/accessDirectory answering `empty` on a zero pass every check
  // (accessDirectory answers empty in every harness already — this adds auditTrail).
  it('passes every check when the console paged reads answer empty on a zero', async () => {
    expect(await failing(['console-auditTrail-empty'])).toEqual([]);
  });

  // A duplicate kind breaks both the kinds check (sameKinds) and the well-formed check — asserted honestly.
  it('fails the kinds and well-formed checks when an assessment kind appears twice', async () => {
    expect(await failing(['assessments-duplicate-kind'])).toEqual([
      'fixture.list · granted request succeeds with exactly the declared assessment kinds',
      'fixture.list · granted response assessments are well-formed (06 §19)',
    ]);
  });

  // An omitted envelope key is not null: the check names the missing key instead of the runner reporting a throw.
  it('names the missing trust key instead of throwing on undefined', async () => {
    const results = await runServerConformance(harness(new Set(['envelope-missing-trust'])));
    expect(results.filter(r => r.failure !== null).map(r => r.id)).toEqual([
      'fixture.list · granted response trust is null or complete (06 §18)',
    ]);
    expect(results.find(r => r.id === 'fixture.list · granted response trust is null or complete (06 §18)')?.failure)
      .toBe('`trust` is missing — send null for non-mart data (06 §18)');
  });

  it('names the missing assessments key instead of throwing on undefined', async () => {
    const results = await runServerConformance(harness(new Set(['envelope-missing-assessments'])));
    expect(results.filter(r => r.failure !== null).map(r => r.id)).toEqual([
      'fixture.list · granted request succeeds with exactly the declared assessment kinds',
      'fixture.list · granted response assessments are well-formed (06 §19)',
    ]);
    expect(results.find(r => r.id === 'fixture.list · granted response assessments are well-formed (06 §19)')?.failure)
      .toBe('`assessments` is missing');
  });

  // P3-B: every envelope reader names the missing key — checklist §4's "누락된 envelope 키 지적" is universal.
  it('names the missing assessments key on the explicit-empty answer instead of throwing', async () => {
    const results = await runServerConformance(harness(new Set(['explicit-empty-missing-assessments'])));
    expect(results.filter(r => r.failure !== null).map(r => r.id)).toEqual([
      'fixture.list · explicit empty selection: [] → empty with no assessments and no trust',
    ]);
    expect(results.find(r => r.id === 'fixture.list · explicit empty selection: [] → empty with no assessments and no trust')?.failure)
      .toBe('`assessments` is missing');
  });

  it('names the missing assessments key on the accessDirectory answer instead of throwing', async () => {
    const results = await runServerConformance(harness(new Set(['console-accessDirectory-missing-assessments'])));
    expect(results.filter(r => r.failure !== null).map(r => r.id)).toEqual([
      'port · accessDirectory is not mart data: no assessments, null trust',
    ]);
    expect(results.find(r => r.id === 'port · accessDirectory is not mart data: no assessments, null trust')?.failure)
      .toBe('`assessments` is missing');
  });

  it('names the missing trust key on the saved annotation answer instead of throwing', async () => {
    const results = await runServerConformance(harness(new Set(['annotation-save-missing-trust'])));
    // Round D: the save/list success check now reads the envelope too, so both it and the mart rule fail.
    expect(results.filter(r => r.failure !== null).map(r => r.id)).toEqual([
      'port · saveAnnotation then listAnnotations at the same site returns the note',
      'port · annotations are not mart data: no assessments, null trust',
    ]);
    expect(results.find(r => r.id === 'port · annotations are not mart data: no assessments, null trust')?.failure)
      .toBe('saveAnnotation: `trust` is missing — send null for non-mart data (06 §18)');
  });

  // recordUsage may reject (fire-and-forget): inside the receive-time check that is reported as recordUsage
  // throwing, never as a missing envelope.
  it('reports a recordUsage rejection inside the receive-time check as recordUsage throwing', async () => {
    const results = await runServerConformance(harness(new Set(['usage-epoch-throws'])));
    expect(results.filter(r => r.failure !== null).map(r => r.id)).toEqual([
      'port · usageSummary counts by receive time, not the client at',
    ]);
    expect(results.find(r => r.id === 'port · usageSummary counts by receive time, not the client at')?.failure)
      .toBe('recordUsage threw/rejected: Error: telemetry down');
  });

  // Round D (subscribe): adapter.ts requires subscribe to return a cleanup function, not an idempotent one —
  // a one-shot unsubscribe that throws on its second call is conforming and must pass every check.
  it('passes every check when the unsubscribe throws on its second call', async () => {
    const h = harness();
    let unsubscribed = false;
    const adapter: PlatformAdapter = {
      ...h.adapter,
      subscribe: () => () => {
        if (unsubscribed) throw new Error('already unsubscribed');
        unsubscribed = true;
      },
    };
    const results = await runServerConformance({ ...h, adapter });
    expect(results.filter(r => r.failure !== null)).toEqual([]);
  });

  // Round D (receive-time probe): the harness guarantees only the granted actor may record ports.usage, so a
  // console-only actor that cannot record is conforming — the probe records as granted and reads as console.
  it('passes every check when only the granted actor can record usage', async () => {
    expect(await failing(['usage-granted-only-record'])).toEqual([]);
  });

  // ports.usage may arrive dwell-shaped: the kit derives the entry from the identity fields, so a dwell sample
  // must not fail the usage checks.
  it('passes every check when ports.usage is a dwell-shaped sample', async () => {
    const h = harness();
    const usage = {
      name: 'dwell' as const, menuId: 'fixture', spaceId: spaceId('mars'), path: '/fixture',
      at: 1_000, sessionId: 'tab', dwellMs: 1200, enteredAt: 500,
    };
    const results = await runServerConformance({ ...h, ports: { ...h.ports, usage } });
    expect(results.filter(r => r.failure !== null)).toEqual([]);
  });

  // No ungrantedRoomRef sample: the room re-checks must surface as skipped, never silently dropped (#175 pattern).
  it('plans visible skipped room re-checks when the harness has no ungrantedRoomRef sample', () => {
    const h = harness();
    const ports = { ...h.ports, entity: { ref: PORTS.entity.ref, permission: PORTS.entity.permission } };
    expect(planServerConformance({ ...h, ports }).filter(c => c.mode === 'skipped').map(c => c.id)).toEqual([
      'port · getEntity of a destination in an ungranted room → forbidden',
      'port · entityAudit of a destination in an ungranted room → forbidden',
      'port · entityAudit with an issued cursor in an ungranted room → forbidden',
      'actions: no sample',
      'condition: no sample',
      ...SELECTION_PORT_SKIP_IDS,
    ]);
  });

  it('reports an adapter that throws instead of answering an envelope', async () => {
    const h = harness();
    const results = await runServerConformance({ ...h, adapter: { ...h.adapter, menuQuery: async () => { throw new Error('boom'); } } });
    const menuQueryChecks = results.filter(r => !r.id.startsWith('port · ') && r.status !== 'skipped');
    expect(menuQueryChecks.every(r => r.failure?.includes('threw'))).toBe(true);
    // The port checks do not go through menuQuery — the reference keeps passing them.
    expect(results.filter(r => r.id.startsWith('port · ')).every(r => r.failure === null)).toBe(true);
  });

  it('reports a non-envelope method that throws as the method throwing, not as a missing envelope', async () => {
    const h = harness();
    const results = await runServerConformance({
      ...h,
      adapter: { ...h.adapter, validateScope: async () => { throw new Error('boom'); } },
    });
    expect(results.find(r => r.id === 'port · validateScope(granted site) → valid with its rooms')?.failure)
      .toBe('the adapter threw: Error: boom');
  });
});

// #175: the maxRows check is derived only for a case that provides an oversize sample, and it must fail a
// server that ignores the declared cap (answers ok with the oversized rows) while passing a compliant one.
describe('declared maxRows oversize check (#175)', () => {
  const exportSpec = defineEndpoint<{ tail: string }, string[]>({
    id: 'fixture.export',
    menuId: 'fixture',
    paramKeys: { tail: true },
    permission: menuPermission('analytics:view'),
    requiresScope: true,
    context: { time: 'apply', roomNames: 'apply', selection: 'apply', metric: 'apply' },
    kinds: ['collection', 'coverage'],
    mergeTimeDomain: false,
    limits: { maxRows: 2 },
  });
  const CHECK_ID = `${exportSpec.id} · oversize result over the declared maxRows → too_large with no data`;

  const OK_ENVELOPE = {
    outcome: 'ok' as const,
    data: ['r1', 'r2', 'r3'],
    assessments: exportSpec.kinds.map(kind => ({ kind, state: 'unknown' as const, reason: 'source_unavailable' as const })),
    trust: null,
    correlationId: 'ref',
  };
  const ENVELOPE: Record<'too_large' | 'ok' | 'too_large with data', ApiResponse<unknown>> = {
    'too_large': { outcome: 'too_large', message: 'Result has 3 rows, over the declared maxRows 2', data: null, assessments: [], trust: null, correlationId: 'ref' },
    'ok': OK_ENVELOPE,
    'too_large with data': { ...OK_ENVELOPE, outcome: 'too_large', message: 'Result has 3 rows, over the declared maxRows 2' },
  };

  function oversizeHarness(answers: 'too_large' | 'ok' | 'too_large with data'): ServerConformanceHarness {
    const state: RefState = { permissions: new Set<Permission>([menuPermission('analytics:view'), menuPermission('equipment:view')]), console: false };
    return {
      adapter: { ...referenceAdapter(state), menuQuery: async () => ENVELOPE[answers] },
      cases: [{ spec: exportSpec, params: { tail: 'p95' }, oversizeParams: { tail: 'all' } }],
      context: CONTEXT,
      foreignScopeId: 'XIA',
      ports: PORTS,
      ...actors(state),
    };
  }

  it('derives the check only when the case provides oversizeParams', () => {
    expect(planServerConformance(oversizeHarness('too_large')).map(c => c.id)).toContain(CHECK_ID);
    const cases = [{ spec: exportSpec, params: { tail: 'p95' } }];
    expect(planServerConformance({ ...oversizeHarness('too_large'), cases }).map(c => c.id)).not.toContain(CHECK_ID);
  });

  // #175 review P2-3: a maxRows declaration with no oversize sample must not vanish — it plans a skipped check
  // that runServerConformance reports and describeServerConformance registers as `it.skip`.
  it('plans a visible not-covered check when the case has no oversizeParams', async () => {
    const cases = [{ spec: exportSpec, params: { tail: 'p95' } }];
    const h = { ...oversizeHarness('too_large'), cases };
    expect(planServerConformance(h).filter(c => c.mode === 'skipped').map(c => c.id))
      .toEqual([`${exportSpec.id} · declares maxRows but has no oversizeParams sample — oversize check not run`, 'actions: no sample', 'condition: no sample', ...SELECTION_PORT_SKIP_IDS]);
    const skipped = (await runServerConformance(h)).find(r => r.id === `${exportSpec.id} · declares maxRows but has no oversizeParams sample — oversize check not run`);
    // #175 follow-up P2-A: a check that did not run is reported as skipped, never as a pass.
    expect(skipped).toEqual({ id: `${exportSpec.id} · declares maxRows but has no oversizeParams sample — oversize check not run`, status: 'skipped', failure: null });
  });

  it('flags an oversize sample on an endpoint that declares no maxRows (P3-B)', async () => {
    const { limits: _limits, ...uncapped } = exportSpec;
    const h = { ...oversizeHarness('too_large'), cases: [{ spec: uncapped as typeof exportSpec, params: { tail: 'p95' }, oversizeParams: { tail: 'p50' } }] };
    const result = (await runServerConformance(h)).find(r => r.id.endsWith('oversizeParams given but the endpoint declares no maxRows'));
    expect(result?.status).toBe('failed');
  });

  it('plans no skipped check when the case provides oversizeParams', () => {
    expect(planServerConformance(oversizeHarness('too_large')).filter(c => c.mode === 'skipped').map(c => c.id)).toEqual(['actions: no sample', 'condition: no sample', ...SELECTION_PORT_SKIP_IDS]);
  });

  it('passes on a server that answers too_large with no data', async () => {
    const h = oversizeHarness('too_large');
    const check = planServerConformance(h).find(c => c.id === CHECK_ID)!;
    expect(await h.asGranted(check.run)).toBeNull();
  });

  it('fails on a server that ignores the declared maxRows', async () => {
    const h = oversizeHarness('ok');
    const check = planServerConformance(h).find(c => c.id === CHECK_ID)!;
    expect(await h.asGranted(check.run)).toContain('too_large');
  });

  // #175 review P3-2b: pins the `data !== null` assertion — a too_large that smuggles the rows through is a failure.
  it('fails on a server that answers too_large with data', async () => {
    const h = oversizeHarness('too_large with data');
    const check = planServerConformance(h).find(c => c.id === CHECK_ID)!;
    expect(await h.asGranted(check.run)).toContain('carries no data');
  });
});

describe('global utility spaceId (06 §9.1)', () => {
  const entry = { name: 'entry' as const, menuId: 'notices', path: '/notices', at: 1, sessionId: 'tab' };
  const report = { correlationId: 'client-1', menuId: 'notices', path: '/notices', name: 'Error' };

  it.each([
    ['null', null, 1],
    ['metrics', 'metrics', 1],
    ['an app space the server was not told about', 'nowhere', 1],
    ['a space id with whitespace', 'a b', 0],
  ] as const)('recordUsage accepts %s as %s', async (_label, spaceId, accepted) => {
    const h = harness();
    expect((await h.adapter.recordUsage([{ ...entry, spaceId } as UsageEvent])).accepted).toBe(accepted);
  });

  it.each([
    ['null', null, true],
    ['metrics', 'metrics', true],
    ['an app space the server was not told about', 'nowhere', true],
    ['a space id with whitespace', 'a b', false],
  ] as const)('reportClientError accepts %s as %s', async (_label, spaceId, accepted) => {
    const h = harness();
    expect((await h.adapter.reportClientError({ ...report, spaceId } as ClientErrorReport)).accepted).toBe(accepted);
  });

  it.each([
    ['usage-rejects-null', 'port · recordUsage accepts a global menu (spaceId null)'],
    ['client-error-rejects-null', 'port · reportClientError accepts a global menu (spaceId null)'],
  ])('the public plan fails %s when the adapter rejects spaceId null', async (broken, id) => {
    expect(await failing([broken])).toEqual([id]);
  });

  it.each([
    ['usage-accepts-malformed-space', 'port · recordUsage: a malformed spaceId is rejected'],
    ['client-error-accepts-malformed-space', 'port · reportClientError: a malformed spaceId is rejected'],
  ])('the public plan fails %s when the adapter accepts a malformed space id', async (broken, id) => {
    expect(await failing([broken])).toEqual([id]);
  });
});

// The write port checks (ADR-0054, checklist §3–§4): each derived check fails a server breaking its rule.
describe('menuAction conformance (#501)', () => {
  const actionFailures = async (breaks: string[]) =>
    (await runServerConformance(actionHarness(new Set(breaks)))).filter(r => r.id.startsWith('fixture.save · ') && r.failure !== null).map(r => r.id);

  it('plans one visible skipped check when the harness has no action samples', async () => {
    const h = { ...actionHarness(), actions: undefined };
    expect(planServerConformance(h).filter(c => c.id.startsWith('actions')).map(c => [c.id, c.mode])).toEqual([['actions: no sample', 'skipped']]);
    expect((await runServerConformance(h)).find(r => r.id === 'actions: no sample')).toEqual({ id: 'actions: no sample', status: 'skipped', failure: null });
  });

  it('plans a skipped check for a version action without a currentVersion sample', () => {
    const h = actionHarness();
    const noVersion = { ...h, actions: [{ spec: actionSpec, input: { text: 'hello' } }] };
    expect(planServerConformance(noVersion).filter(c => c.mode === 'skipped').map(c => c.id))
      .toEqual(['fixture.save · declares version concurrency but has no currentVersion sample — action checks not run', 'condition: no sample', ...SELECTION_PORT_SKIP_IDS]);
  });

  it('passes the reference adapter', async () => {
    const results = await runServerConformance(actionHarness());
    expect(results.filter(r => r.failure !== null)).toEqual([]);
    expect(results.filter(r => r.id.startsWith('fixture.save · '))).toHaveLength(10);
  });

  it.each([
    ['action-no-replay', 'ok, then the same key and input → the stored answer with replayed: true'],
    ['action-reuse', 'the same key with a different input → error'],
    ['action-key', 'idempotencyKey omitted → invalid at idempotencyKey'],
    ['action-key', 'idempotencyKey empty → invalid at idempotencyKey'],
    ['action-key', 'idempotencyKey not a UUID → invalid at idempotencyKey'],
    ['action-unexpected', 'an input key outside inputKeys → invalid with unexpected_field'],
    ['action-conflict-ignored', 'a stale expectedVersion → conflict with the current version'],
    ['action-conflict-no-version', 'a stale expectedVersion → conflict with the current version'],
    ['action-replay-first', 'permission precedes replay: without analytics:view the same key → forbidden'],
    ['action-scope', 'a site without a grant → forbidden'],
    ['action-record-invalid', 'an invalid answer is not recorded: the same key then succeeds'],
  ])('%s fails %s', async (rule, check) => {
    expect(await actionFailures([rule])).toContain(`fixture.save · ${check}`);
  });

  // The ambient actor lacks the action permission: every granted request and currentVersion read must run inside asGranted.
  it('wraps every granted request in asGranted', async () => {
    const state: RefState = { permissions: new Set<Permission>([menuPermission('equipment:view')]), console: false };
    const base = actionHarness();
    const h: ServerConformanceHarness = {
      ...base,
      adapter: referenceAdapter(state),
      actions: [{ spec: actionSpec, input: { text: 'hello' }, currentVersion: async () => {
        if (!state.permissions.has(menuPermission('analytics:view'))) throw new Error('currentVersion read outside asGranted');
        return String(state.targetVersion ??= 1);
      } }],
      asGranted: async fn => {
        state.permissions.add(menuPermission('analytics:view'));
        try { return await fn(); } finally { state.permissions.delete(menuPermission('analytics:view')); }
      },
      withoutPermission: async (_permission, fn) => fn(),
    };
    const results = (await runServerConformance(h)).filter(r => r.id.startsWith('fixture.save · '));
    expect(results.filter(r => r.status !== 'passed')).toEqual([]);
  });
});

describe('Condition conformance samples (#552)', () => {
  it('plans a visible skipped check when the server supplies no axis sample', () => {
    const check = planServerConformance(harness()).find(c => c.id === 'condition: no sample');
    expect(check?.mode).toBe('skipped');
  });
  it.each(['malformed map', 'empty axis array', 'scalar axis', 'blank axis ID', 'scalar Line', 'scalar PRC', 'invalid basis', 'orphan basis'])('pins rejection of %s at both server entry points', async label => {
    const h = harness();
    const conditionSpec = defineEndpoint({ ...spec, context: { condition: 'apply', line: 'apply', prcGroup: 'apply' } });
    h.cases = [{ spec: conditionSpec, params: { page: 0 } }];
    h.ports.condition = { endpoint: spec.id, axisA: { id: 'alpha', values: ['a1', 'a2'] }, axisB: { id: 'beta', value: 'b1' }, nonHistoryAxisId: 'alpha' };
    h.adapter.menuQuery = async () => err('invalid context');
    h.adapter.evaluateSelection = async () => { throw new Error('invalid context'); };
    const checks = planServerConformance(h);
    for (const entry of ['menuQuery', 'evaluateSelection']) {
      const id = `condition · ${entry} rejects ${label}`;
      const check = checks.find(c => c.id === id);
      expect(check, id).toBeDefined();
      expect(await check!.run(), id).toBeNull();
    }
    h.adapter.menuQuery = async () => ({ ...err(''), outcome: 'ok' });
    h.adapter.evaluateSelection = async () => ({ inCondition: [], outOfCondition: [] });
    for (const entry of ['menuQuery', 'evaluateSelection']) {
      const check = checks.find(c => c.id === `condition · ${entry} rejects ${label}`)!;
      expect(await check.run()).toBeTruthy();
    }
  });
  it('passes AND, OR and legacy equivalence for custom axis IDs', async () => {
    const h = harness();
    h.ports.condition = { endpoint: spec.id, axisA: { id: 'alpha', values: ['a1', 'a2'] }, axisB: { id: 'beta', value: 'b1' }, nonHistoryAxisId: 'alpha' };
    const rows = [
      { equipmentId: 'E1', room: 'R', model: 'M', alpha: 'a1', beta: 'b1' },
      { equipmentId: 'E2', room: 'R', model: 'M', alpha: 'a1', beta: 'b2' },
      { equipmentId: 'E3', room: 'R', model: 'M', alpha: 'a2', beta: 'b1' },
    ];
    h.adapter.evaluateSelection = async ({ condition }) => ({
      inCondition: rows.filter(row => Object.entries(condition ?? {}).every(([axis, values]) => values.includes(row[axis as 'alpha' | 'beta']))),
      outOfCondition: [],
    });
    for (const id of ['condition · AND narrows across axes', 'condition · OR includes each value', 'condition · v1 single axis is equivalent']) {
      const check = planServerConformance(h).find(c => c.id === id);
      expect(check, id).toBeDefined();
      expect(await check!.run(), id).toBeNull();
    }
  });
  it('detects an evaluator that ignores the second axis', async () => {
    const h = harness();
    h.ports.condition = { endpoint: spec.id, axisA: { id: 'stgroup', values: ['A', 'B'] }, axisB: { id: 'model', value: 'M' }, nonHistoryAxisId: 'stgroup' };
    h.adapter.evaluateSelection = async () => ({ inCondition: [{ equipmentId: 'E1', room: 'R', model: 'M' }, { equipmentId: 'E2', room: 'R', model: 'N' }], outOfCondition: [] });
    const check = planServerConformance(h).find(c => c.id === 'condition · AND narrows across axes');
    expect(await check?.run()).toBeTruthy();
  });
});

describe('required Context samples (#553)', () => {
  const required = { ...spec, requiredContext: ['selection'] as const };
  it.each([
    ['selection', 'selection'], ['roomNames', 'roomNames'], ['line', 'lineNames'],
    ['prcGroup', 'prcGroups'], ['lot', 'lotIds'], ['recipe', 'recipeIds'],
  ] as const)('accepts a valid explicit-empty required %s baseline in the planner and runner', async (capability, field) => {
    const emptySpec = { ...spec, context: { ...spec.context, [capability]: 'apply' as const }, requiredContext: [capability] };
    const h = harness(new Set(), [{ spec: emptySpec, params: { page: 0 }, context: { [field]: [] } }]);
    const received: MenuQuery[] = [];
    h.adapter.menuQuery = async request => {
      received.push(request);
      return { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'empty-baseline' };
    };
    const check = planServerConformance(h).find(c => c.id.includes('granted request'))!;
    expect(check.mode).toBe('granted');
    expect(await check.run()).toBeNull();
    expect(received[0].context[field]).toEqual([]);
    const results = await runServerConformance(h);
    expect(results.find(c => c.id === check.id)?.status).toBe('passed');
  });

  it.each([
    { label: 'ok outcome', outcome: 'ok' as const, assessments: [] as Assessment[], trust: null },
    { label: 'declared assessments', outcome: 'empty' as const, assessments: REF_ASSESSMENTS.filter(a => spec.kinds.includes(a.kind)), trust: null },
    { label: 'source trust', outcome: 'empty' as const, assessments: [] as Assessment[], trust: REF_TRUST },
    { label: 'missing trust', outcome: 'empty' as const, assessments: [] as Assessment[], trust: undefined },
  ])('rejects an explicit-empty baseline with $label', async ({ outcome, assessments, trust }) => {
    const h = harness(new Set(), [{ spec: required, params: { page: 0 }, context: { selection: [] } }]);
    h.adapter.menuQuery = async () => ({ outcome, data: null, assessments, trust, correlationId: 'invalid-empty' }) as ApiResponse<unknown>;
    const check = planServerConformance(h).find(c => c.id.includes('granted request'))!;
    expect(await check.run()).toBeTruthy();
    const results = await runServerConformance(h);
    expect(results.find(c => c.id === check.id)?.status).toBe('failed');
  });

  it('visibly skips baseline-dependent checks when required Context has no valid sample', async () => {
    const h = harness(new Set(), [{ spec: required, params: { page: 0 } }]);
    const plan = planServerConformance(h).filter(c => c.id.startsWith(spec.id));
    expect(plan.find(c => c.id.includes('granted request'))?.mode).toBe('skipped');
    expect(plan.find(c => c.id.includes('required selection'))?.mode).toBe('skipped');
    const results = await runServerConformance(h);
    expect(results.find(c => c.id.includes('granted request'))?.status).toBe('skipped');
  });
  it('projects a supplied valid baseline and derives independent null/omission mutations', async () => {
    const h = harness(new Set(), [{ spec: required, params: { page: 0 }, context: { selection: ['MEM-PHOTO-0103'] } }]);
    const received: MenuQuery[] = [];
    const original = h.adapter.menuQuery;
    h.adapter.menuQuery = async request => {
      received.push(request);
      if (request.endpoint === spec.id && request.context.selection == null) return err('required selection');
      return original(request);
    };
    const plan = planServerConformance(h);
    const mutations = plan.filter(c => c.id.includes('required selection'));
    expect(mutations).toHaveLength(2);
    for (const c of mutations) expect(await c.run()).toBeNull();
    expect(received[0].context).toMatchObject({ ...CONTEXT, selection: null });
    expect(Object.hasOwn(received[1].context, 'selection')).toBe(false);
    expect(await plan.find(c => c.id.includes('granted request'))!.run()).toBeNull();
    expect(received.at(-1)?.context.selection).toEqual(['MEM-PHOTO-0103']);
    const results = await runServerConformance(h);
    expect(results.filter(c => c.id.includes('required selection')).map(c => c.status)).toEqual(['passed', 'passed']);
    expect(results.find(c => c.id.includes('granted request'))?.status).toBe('passed');
  });
});

it('plans individual visible selection-port skips without option evidence', () => {
  const plan = planServerConformance(harness());
  expect(plan.find(c => c.id === 'selection ports · options paging')?.mode).toBe('skipped');
  expect(plan.find(c => c.id === 'selection ports · search upper clamp')?.mode).toBe('skipped');
});


it('passes all sampled selection-port checks and individually skips absent upper-clamp evidence', async () => {
  const h = harness(); h.ports = { ...h.ports, condition: undefined, options: optionSamples };
  const results = await runServerConformance(h);
  expect(results.filter(r => r.failure)).toEqual([]);
  const plan = planServerConformance(h);
  expect(plan.find(c => c.id === 'selection ports · options upper clamp')?.mode).toBe('skipped');
  expect(plan.find(c => c.id === 'selection ports · search upper clamp')?.mode).toBe('skipped');
});

it.each([
  ['options paging', 'listAxisOptions', async () => ({ items: [{ id: 'A', label: 'A' }], nextCursor: 'repeated' })],
  ['search paging', 'searchEquipment', async () => ({ items: [{ ...optionSamples.equipment[0], room: 'DIFF' }], nextCursor: null, total: 999 })],
  ['options query', 'listAxisOptions', async () => ({ items: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], nextCursor: null })],
  ['search query', 'searchEquipment', async () => ({ items: optionSamples.equipment, nextCursor: null })],
  ['dependent options', 'listAxisOptions', async () => ({ items: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], nextCursor: null })],
  ['denied-room options', 'listAxisOptions', async () => ({ items: [{ id: 'DENIED', label: 'secret' }], nextCursor: null })],
  ['options lower clamp', 'listAxisOptions', async () => ({ items: [], nextCursor: null })],
  ['search lower clamp', 'searchEquipment', async () => ({ items: [], nextCursor: null })],
  ['options authorization', 'listAxisOptions', async () => ({ items: [], nextCursor: null })],
  ['search authorization', 'searchEquipment', async () => ({ items: [], nextCursor: null })],
  ['resolution authorization', 'resolveSelection', async () => ({ items: [] })],
  ['explicit denied-room filter', 'searchEquipment', async () => ({ items: [], nextCursor: null })],
  ['resolve authorized', 'resolveSelection', async () => ({ items: [{ id: 'eq-1', status: 'not_found' }] })],
  ['resolve forbidden no detail', 'resolveSelection', async () => ({ items: [{ id: 'eq-denied', status: 'forbidden', summary: optionSamples.equipment[0] }] })],
  ['resolve cross-site absent', 'resolveSelection', async () => ({ items: [{ id: 'eq-foreign', status: 'forbidden' }, { id: 'eq-absent', status: 'not_found' }] })],
  ['resolve order and duplicates', 'resolveSelection', async () => ({ items: [{ id: 'eq-1', status: 'not_found' }, { id: 'eq-absent', status: 'not_found' }] })],
  ['options invalid input', 'listAxisOptions', async () => ({ items: [], nextCursor: null })],
  ['search invalid input', 'searchEquipment', async () => ({ items: [], nextCursor: null })],
  ['resolution invalid input', 'resolveSelection', async () => ({ items: [] })],
  ['options cursor identity', 'listAxisOptions', async () => ({ items: [{ id: 'A', label: 'A' }], nextCursor: 'cursor' })],
  ['search cursor identity', 'searchEquipment', async () => ({ items: [optionSamples.equipment[0]], nextCursor: 'cursor' })],
  ['global metadata needs no equipment permission', 'listAxisOptions', async () => { throw new Error('equipment permission required'); }],
] as const)('detects a reference-adapter mutant violating %s', async (name, method, replacement) => {
  const h = harness(); h.ports = { ...h.ports, condition: undefined, options: optionSamples };
  h.adapter = { ...h.adapter, [method]: replacement } as PlatformAdapter;
  const check = planServerConformance(h).find(c => c.id === `selection ports · ${name}`)!;
  let failed = false;
  try { failed = (await check.run()) !== null; } catch { failed = true; }
  expect(failed).toBe(true);
});

it.each(['options', 'search'] as const)('proves the %s upper clamp with over 200 authorized samples and detects its mutant', async port => {
  const values = Array.from({ length: 205 }, (_, n) => `v-${n.toString().padStart(3, '0')}`);
  const sample = { ...optionSamples, upperOptions: values, upperEquipment: values, equipment: values.map(id => ({ equipmentId: id, room: 'PHOTO', axes: { classification: [id] } })) };
  const h = harness(); h.ports = { ...h.ports, options: sample };
  h.adapter = { ...h.adapter, ...referenceSelectionPorts(sample) };
  const check = planServerConformance(h).find(c => c.id === `selection ports · ${port} upper clamp`)!;
  expect(check.mode).toBe('granted');
  expect(await check.run()).toBeNull();
  const options = h.adapter.listAxisOptions; const search = h.adapter.searchEquipment;
  if (port === 'options') h.adapter.listAxisOptions = async input => input.limit > 200 ? { items: values.map(id => ({ id, label: id })), nextCursor: null } : options(input);
  else h.adapter.searchEquipment = async input => input.limit > 200 ? { items: sample.equipment, nextCursor: null } : search(input);
  expect(await check.run()).toBe(port === 'options' ? 'Upper options clamp violated' : 'Upper search clamp violated');
});

it('detects an otherwise correct search whose total includes denied rows', async () => {
  const h = harness(); h.ports = { ...h.ports, options: optionSamples };
  const send = h.adapter.searchEquipment;
  h.adapter.searchEquipment = async input => ({ ...await send(input), total: 999 });
  const check = planServerConformance(h).find(c => c.id === 'selection ports · search paging')!;
  expect(await check.run()).toContain('Total');
});

it.each(['lineNames', 'prcGroups'] as const)('checks optional global %s evidence and detects missing, leaked and unnarrowed values', async axisId => {
  const h = harness();
  h.ports = { ...h.ports, options: { ...optionSamples, globalOptions: [{ axisId, values: ['global-a', 'global-b'], parents: { roomNames: ['PHOTO'] }, parentValues: ['global-a'] }] } };
  const original = h.adapter.listAxisOptions;
  h.adapter.listAxisOptions = async input => {
    if (input.axisId !== axisId) return original(input);
    const values = input.parents ? ['global-a'] : ['global-a', 'global-b'];
    const start = input.cursor ? 1 : 0;
    return { items: values.slice(start, start + 1).map(id => ({ id, label: id })), nextCursor: start + 1 < values.length ? 'global-next' : null };
  };
  const check = planServerConformance(h).find(c => c.id === `selection ports · global ${axisId} options`)!;
  expect(check?.mode).toBe('granted');
  expect(await check.run()).toBeNull();
  const send = h.adapter.listAxisOptions;
  for (const values of [[], ['secret'], ['global-a', 'global-b']]) {
    h.adapter.listAxisOptions = async input => input.parents ? { items: values.map(id => ({ id, label: id })), nextCursor: null } : send(input);
    expect(await check.run()).toBeTruthy();
  }
});

describe('declared gaps: implemented ports, site grants, siteless destinations (#674)', () => {
  // Earlier suites assign `h.ports.condition` on the shared PORTS object; these runs need no Condition sample.
  const fresh = () => ({ ...harness(), ports: { ...PORTS, condition: undefined } });
  const ALL_METHODS = Object.keys(referenceAdapter({ permissions: new Set(), console: false })) as (keyof PlatformAdapter)[];

  it('tags every planned check with the port methods it calls, all of them adapter members', () => {
    const h = { ...actionHarness(), cases: [{ spec, params: { page: 0 } }], ports: { ...PORTS, options: optionSamples } };
    for (const check of planServerConformance(h)) {
      expect(check.uses?.length, check.id).toBeGreaterThan(0);
      for (const method of check.uses!) expect(ALL_METHODS, check.id).toContain(method);
    }
  });

  // The declared tag is checked against what the check really calls: each run check, alone, through a recording
  // adapter. A check calling a port it does not declare would run (and fail or pass) on a server lacking that port.
  it('every run check calls only the port methods it declares', async () => {
    const base = { ...actionHarness(), cases: [{ spec, params: { page: 0 } }], ports: { ...PORTS, options: optionSamples, condition: { endpoint: spec.id, axisA: { id: 'alpha', values: ['a1', 'a2'] as const }, axisB: { id: 'beta', value: 'b1' }, nonHistoryAxisId: 'alpha' } } };
    const called = new Set<string>();
    const recording = new Proxy(base.adapter, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          called.add(String(key));
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    const h = { ...base, adapter: recording };
    const undeclared: string[] = [];
    for (const check of planServerConformance(h)) {
      if (check.mode === 'skipped') continue;
      called.clear();
      const run = check.mode === 'granted' ? () => h.asGranted(check.run) : check.mode === 'console' ? () => h.asConsole(check.run) : check.run;
      await run().catch(() => null);
      const extra = [...called].filter(method => !check.uses!.includes(method as keyof PlatformAdapter));
      if (extra.length > 0) undeclared.push(`${check.id}: ${extra.join(', ')}`);
    }
    expect(undeclared).toEqual([]);
  });



  it('skips, never runs, every check that calls a method outside implemented', async () => {
    const h = fresh();
    const implemented = ALL_METHODS.filter(m => !['menuQuery', 'menuAction', 'saveAnnotation', 'listAnnotations', 'deleteAnnotation', 'validateScope'].includes(m));
    const boom = async () => { throw new Error('not implemented'); };
    const adapter = { ...h.adapter, menuQuery: boom, saveAnnotation: boom, listAnnotations: boom, deleteAnnotation: boom, validateScope: boom } as PlatformAdapter;
    const results = await runServerConformance({ ...h, adapter, implemented });
    expect(results.filter(r => r.status === 'failed')).toEqual([]);
    const skipped = results.filter(r => r.status === 'skipped').map(r => r.id);
    expect(skipped).toContain('unknown endpoint → error — not implemented: menuQuery');
    expect(skipped).toContain('fixture.list · without analytics:view → forbidden — not implemented: menuQuery');
    expect(skipped).toContain('port · deleteAnnotation by the author removes the note — not implemented: listAnnotations, saveAnnotation, deleteAnnotation');
    expect(skipped).toContain('port · evaluateSelection lists only equipment in granted rooms — not implemented: validateScope');
    // A check already skipped for want of a sample still names the port gap.
    expect(skipped).toContain('actions: no sample — not implemented: menuAction');
    expect(results.find(r => r.id === 'port · getEntity(sample) → ok with the row')?.status).toBe('passed');
  });

  it('shows the new ports as visibly skipped when a server has not implemented them yet', async () => {
    const h = fresh();
    const NEW = ['readPreferences', 'patchPreferences', 'importPreferences', 'lookupPeople', 'listNotices', 'saveNotice', 'deleteNotice'];
    const implemented = ALL_METHODS.filter(m => !NEW.includes(m));
    const boom = async () => { throw new Error('not implemented'); };
    const adapter = { ...h.adapter, ...Object.fromEntries(NEW.map(m => [m, boom])) } as PlatformAdapter;
    const results = await runServerConformance({ ...h, adapter, implemented });
    expect(results.filter(r => r.status === 'failed')).toEqual([]);
    const skipped = results.filter(r => r.status === 'skipped').map(r => r.id);
    expect(skipped).toContain('port · patchPreferences stores, merges and removes keys; null is a value — not implemented: readPreferences, patchPreferences, importPreferences');
    expect(skipped).toContain('port · lookupPeople answers exact ids with GroupMember fields only; unknown ids are absent — not implemented: lookupPeople');
    expect(skipped).toContain('port · saveNotice without console:access → forbidden — not implemented: saveNotice');
    expect(results.find(r => r.id === 'port · defaultRangeTo() is a naive wall-clock')?.status).toBe('passed');
  });

  it('skips the site checks on a server with no site grants, and only those', async () => {
    const h = fresh();
    const session = { ...h.adapter.session(), scopes: [] };
    const results = await runServerConformance({ ...h, adapter: { ...h.adapter, session: () => session }, siteGrants: false });
    expect(results.filter(r => r.status === 'failed')).toEqual([]);
    const skipped = results.filter(r => r.status === 'skipped').map(r => r.id);
    expect(skipped).toContain('port · session lists the granted sites and not the foreign one — no site grants');
    expect(skipped).toContain('fixture.list · a site without a grant → forbidden — no site grants');
    expect(skipped).toContain('port · listAnnotations at a site without a grant → forbidden — no site grants');
    expect(results.find(r => r.id === 'port · recordUsage accepts a valid entry and dwell')?.status).toBe('passed');
  });

  // A Scope-requiring endpoint or action sends `context.scopeId` in every request: with no site grants that id is a
  // placeholder, so none of its checks may run — the granted read and the oversize read included.
  it('skips every check of a Scope-requiring endpoint or action on a server with no site grants', () => {
    const h = { ...actionHarness(), ports: { ...PORTS, condition: undefined }, cases: [{ spec, params: { page: 0 } }] };
    const planned = planServerConformance({ ...h, siteGrants: false });
    const scoped = planned.filter(c => c.id.startsWith(`${spec.id} · `) || c.id.startsWith(`${actionSpec.id} · `));
    expect(scoped.length).toBeGreaterThan(0);
    for (const check of scoped) expect({ id: check.id, mode: check.mode }).toEqual({ id: check.id, mode: 'skipped' });
    expect(planned.map(c => c.id)).toContain(`${spec.id} · granted request succeeds with exactly the declared assessment kinds — no site grants`);
  });

  it('skips the site and null-Scope entity checks for a siteless destination sample', () => {
    const h = fresh();
    const ports = { ...PORTS, entity: { ref: { type: 'metric', id: 'cycle_time', scopeId: null }, permission: menuPermission('metrics:view') } };
    const skipped = planServerConformance({ ...h, ports }).filter(c => c.mode === 'skipped').map(c => c.id);
    for (const method of ['getEntity', 'entityAudit']) {
      expect(skipped).toContain(`port · ${method} at a site without a grant → forbidden — siteless destination type`);
      expect(skipped).toContain(`port · ${method} with a null Scope → forbidden — siteless destination type`);
    }
  });
});

describe('entityAudit cursor page checks (ADR-0085)', () => {
  const PAGE_IDS = [
    'port · entityAudit page holds at most 50 events',
    'port · entityAudit nextCursor walks every event once, in order, to a null cursor',
    'port · entityAudit with a malformed cursor → error',
    'port · entityAudit with a cursor at a site without a grant → forbidden',
    'port · entityAudit with a cursor without equipment:view → forbidden',
    'port · entityAudit with an issued cursor on another destination → error',
    'port · entityAudit with an issued cursor at a site without a grant → forbidden',
    'port · entityAudit with an issued cursor without equipment:view → forbidden',
    'port · entityAudit with an issued cursor in an ungranted room → forbidden',
  ];
  // 120 events, newest first by (at desc, id asc); every ninth shares its `at` so the id tie-break crosses page edges.
  const ALL: AuditEvent[] = Array.from({ length: 120 }, (_, n) => ({
    ...REF_EVENT, id: `ev-${String(n).padStart(3, '0')}`, at: new Date(Date.UTC(2026, 5, 1) - Math.floor(n / 9) * 60_000).toISOString(),
  }));

  /** A paging server: the gates come from the reference adapter, the pages from `ALL`; each break drops one page rule. */
  function paged(breaks: ReadonlySet<string> = new Set()) {
    const h = harness();
    const base = h.adapter;
    const baseAudit = base.entityAudit.bind(base);
    const size = breaks.has('page-over-cap') ? 51 : 50;
    // Replace one member in place: the reference adapter is not safe to spread (its other members share state).
    base.entityAudit = async (req, signal) => {
        // A leaking server reads a valid cursor without the gate that refused the same request without one.
        const gate = await baseAudit({ type: req.type, id: req.id, scopeId: req.scopeId }, signal);
        const leaksGate = req.cursor !== undefined && gate.outcome === 'forbidden' && (
          (breaks.has('cursor-skips-gate') && gate.message?.startsWith('No grant for scope'))
          || (breaks.has('cursor-skips-permission') && gate.message?.startsWith('No permission'))
          || (breaks.has('cursor-skips-room') && gate.message === 'No grant for equipment'));
        if (gate.outcome !== 'ok' && !leaksGate) return gate;
        // The reference server binds a cursor to the destination it was issued for.
        if (req.cursor !== undefined && req.id !== PORTS.entity.ref.id && !breaks.has('cursor-ignores-ref')) return { ...REF_ENVELOPE, outcome: 'error', message: 'Invalid cursor' };
        let start = 0;
        if (req.cursor !== undefined) {
          const n = /^c(\d+)$/.exec(req.cursor);
          if (!n && !breaks.has('bad-cursor-ok')) return { ...REF_ENVELOPE, outcome: 'error', message: 'Invalid cursor' };
          start = n ? Number(n[1]) : 0;
        }
        let rows = ALL.slice(start, start + size);
        if (breaks.has('duplicate-across-pages') && start > 0) rows = [ALL[start - 1]!, ...rows.slice(1)];
        if (breaks.has('unordered')) rows = [...rows].reverse();
        const end = start + size >= ALL.length;
        const next = end && !breaks.has('cursor-never-null') ? null : `c${breaks.has('cursor-never-null') ? 0 : start + size}`;
        const nextCursor = breaks.has('empty-string-cursor') && end ? '' : next;
        return { ...REF_ENVELOPE, outcome: 'ok', data: { events: rows, nextCursor } };
    };
    return h;
  }
  const REF_ENVELOPE = { data: null, assessments: [] as Assessment[], trust: null, correlationId: 'ref' };
  const failures = async (h: ServerConformanceHarness) => (await runServerConformance(h)).filter(r => PAGE_IDS.includes(r.id) && r.failure !== null).map(r => r.id);

  it('passes a multi-page reference server on every page check', async () => {
    const results = await runServerConformance(paged());
    expect(results.filter(r => PAGE_IDS.includes(r.id)).map(r => r.status)).toEqual(Array(PAGE_IDS.length).fill('passed'));
    expect(results.filter(r => r.id.startsWith('port · entityAudit') && r.failure !== null)).toEqual([]);
  });

  it.each([
    ['page-over-cap', [PAGE_IDS[0], PAGE_IDS[1]]],
    ['duplicate-across-pages', [PAGE_IDS[1]]],
    ['unordered', [PAGE_IDS[1]]],
    ['cursor-never-null', [PAGE_IDS[1]]],
    ['empty-string-cursor', [PAGE_IDS[1]]],
    ['bad-cursor-ok', [PAGE_IDS[2]]],
    ['cursor-skips-gate', [PAGE_IDS[3], PAGE_IDS[6]]],
    ['cursor-skips-permission', [PAGE_IDS[4], PAGE_IDS[7]]],
    ['cursor-skips-room', [PAGE_IDS[8]]],
    ['cursor-ignores-ref', [PAGE_IDS[5]]],
  ])('fails exactly the page check when the server breaks %s', async (broken, expected) => {
    expect(await failures(paged(new Set([broken])))).toEqual(expected);
  });

  it('runs the cursor checks of a siteless destination sample and plans the site ones as skipped (a correct server passes)', async () => {
    const h = paged();
    const sample = { type: 'metric', id: 'cycle_time', scopeId: null } as const;
    // A correct siteless server: no site to refuse (a non-null Scope is a plain error), pages bound to the metric.
    const gates = h.adapter.entityAudit.bind(h.adapter);
    h.adapter.entityAudit = async req => {
      if (req.type !== 'metric') return err('Unknown entity type');
      const permission = await gates({ type: 'equipment', id: PORTS.entity.ref.id, scopeId: 'MEM' });
      if (permission.outcome === 'forbidden') return permission;
      if (req.scopeId !== null) return err('Metric audit has no scope');
      if (req.id !== sample.id) return req.cursor === undefined ? { ...REF_ENVELOPE, outcome: 'empty' } : err('Invalid cursor');
      const start = req.cursor === undefined ? 0 : Number(/^c(\d+)$/.exec(req.cursor)?.[1] ?? NaN);
      if (Number.isNaN(start)) return err('Invalid cursor');
      const rows = ALL.slice(start, start + 50);
      return { ...REF_ENVELOPE, outcome: 'ok', data: { events: rows, nextCursor: start + 50 >= ALL.length ? null : `c${start + 50}` } };
    };
    const results = await runServerConformance({ ...h, ports: { ...h.ports, entity: { ref: sample, permission: h.ports.entity.permission } } });
    const cursorChecks = results.filter(r => r.id.startsWith('port · entityAudit') && /cursor|page/.test(r.id));
    expect(cursorChecks.filter(r => r.failure !== null)).toEqual([]);
    const skipped = cursorChecks.filter(r => r.status === 'skipped').map(r => r.id);
    expect(skipped).toEqual([
      'port · entityAudit with a cursor at a site without a grant → forbidden — siteless destination type',
      'port · entityAudit with an issued cursor at a site without a grant → forbidden — siteless destination type',
      // No ungrantedRoomRef in this harness: planned skipped before the siteless rule applies.
      'port · entityAudit with an issued cursor in an ungranted room → forbidden',
    ]);
    expect(cursorChecks.filter(r => r.status === 'passed').length).toBe(cursorChecks.length - 3);
  });

  it('skips the issued-cursor checks with a reason when the sample fits one page', async () => {
    const h = paged();
    const baseAudit = h.adapter.entityAudit.bind(h.adapter);
    const sent: unknown[] = [];
    h.adapter.entityAudit = async (req, signal) => {
      sent.push(req.cursor);
      const res = await baseAudit(req, signal);
      return res.data && req.cursor === undefined ? { ...res, data: { events: res.data.events.slice(0, 3), nextCursor: null } } : res;
    };
    const results = await runServerConformance(h);
    const issued = results.filter(r => PAGE_IDS.slice(5).includes(r.id));
    expect(issued.map(r => r.status)).toEqual(Array(4).fill('skipped'));
    expect(issued.map(r => r.reason)).toEqual(Array(4).fill('the sample fits one page — the server issued no cursor to replay'));
    expect(sent.filter(cursor => cursor !== undefined && cursor !== '__conformance_invalid_cursor')).toEqual([]);
  });

  it('turns every page check into a run-time skip for a server whose first page has no nextCursor, and never sends it a cursor', async () => {
    const h = harness();
    const baseAudit = h.adapter.entityAudit.bind(h.adapter);
    const sent: unknown[] = [];
    h.adapter.entityAudit = async (req, signal) => {
      sent.push(req.cursor);
      const res = await baseAudit(req, signal);
      return res.data ? { ...res, data: { events: res.data.events } } : res;
    };
    const results = await runServerConformance(h);
    const page = results.filter(r => PAGE_IDS.includes(r.id));
    expect(page.map(r => r.status)).toEqual(Array(PAGE_IDS.length).fill('skipped'));
    expect(page.map((r: ConformanceResult) => r.reason)).toEqual(Array(PAGE_IDS.length).fill('server does not page entityAudit'));
    expect(sent.every(cursor => cursor === undefined)).toBe(true);
    // The six pre-existing entityAudit checks still run.
    expect(results.filter(r => r.id.startsWith('port · entityAudit') && !PAGE_IDS.includes(r.id)).every(r => r.status === 'passed')).toBe(true);
  });
});
