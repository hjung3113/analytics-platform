import { describe, expect, it } from 'vitest';
import {
  defineEndpoint, emptyGlobal, projectContext,
  type ApiResponse, type Assessment, type AuditEvent, type ChartAnnotation, type ClientErrorReport, type GlobalContext,
  type MenuQuery, type Permission, type PlatformAdapter, type Session, type Trust, type UsageEvent, type UsageRange, type UsageSummary,
} from '@ap/contracts';
import { planServerConformance, runServerConformance, type ConformanceCase, type PortSamples, type ServerConformanceHarness } from './index';

const spec = defineEndpoint<{ page: number }, { rows: number }>({
  id: 'fixture.list',
  menuId: 'fixture',
  paramKeys: { page: true },
  permission: 'analytics:view',
  requiresScope: true,
  context: { time: 'apply', roomNames: 'apply', selection: 'apply', metric: 'apply' },
  kinds: ['collection', 'coverage'],
  mergeTimeDomain: false,
});

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
  id: 'equipment:ICH-PHOTO-0103:create', at: '2026-01-01T00:00:00.000Z', actor: 'master-sync', action: 'create', source: 'system',
  target: { type: 'equipment', id: 'ICH-PHOTO-0103', scopeId: 'ICH' }, changes: {},
};

/** Granted actor: every case/entity permission, grants at ICH + CJU, no console:access; `console` flips under asConsole. */
type RefState = { permissions: Set<Permission>; console: boolean };

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
  const annotationRows: (ChartAnnotation & { authorId: string })[] = [];
  let annotationSeq = 0;
  const usageRows: (UsageEvent & { userId: string; receivedAt: number })[] = [];
  return {
    session: () => {
      if (session === null || breaks.has('session-identity')) {
        session = {
          user: { id: 'engineer', name: 'Engineer', title: { ko: '엔지니어', en: 'Engineer' }, permissions: [...state.permissions] },
          scopes: (breaks.has('session-scopes') ? ['ICH'] : [...(breaks.has('session-foreign') ? ['XIA'] : []), 'ICH', 'CJU']).map(id => ({ id, label: id, grantedRooms: 1, totalRooms: 4 })),
        };
      }
      return session;
    },
    subscribe: onChange => {
      if (breaks.has('subscribe-unsubscribe')) return undefined as unknown as () => void;
      listeners.add(onChange);
      // 'unsubscribe-twice' throws on the second call — the double-unsubscribe branch must catch it.
      let unsubscribed = false;
      return () => {
        if (breaks.has('unsubscribe-twice') && unsubscribed) throw new Error('already unsubscribed');
        unsubscribed = true;
        listeners.delete(onChange);
      };
    },
    validateScope: async scopeId => {
      if (scopeId === 'ICH' || scopeId === 'CJU') {
        return { status: 'valid', grantedRooms: breaks.has('validate-granted') ? [] : ['PH-101'] };
      }
      if (scopeId === 'XIA') {
        return { status: 'forbidden', grantedRooms: breaks.has('validate-foreign') ? ['ET-502'] : [] };
      }
      return { status: breaks.has('validate-unknown') ? 'forbidden' : 'unknown_scope', grantedRooms: breaks.has('validate-unknown-rooms') ? ['PH-101'] : [] };
    },
    getEntity: async ref => {
      if (ref.type !== 'equipment') {
        return breaks.has('entity-unknown-type') ? { ...envelope, outcome: 'forbidden', message: 'Unknown entity type' } : err('Unknown entity type');
      }
      if (!state.permissions.has('equipment:view')) {
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
      if (ref.scopeId !== 'ICH') {
        return breaks.has('entity-foreign')
          ? { ...envelope, outcome: 'ok', data: { equipmentId: ref.id }, assessments: REF_ASSESSMENTS, trust: REF_TRUST }
          : { ...envelope, outcome: 'forbidden', message: `No grant for scope ${ref.scopeId}` };
      }
      return {
        ...envelope,
        outcome: 'ok',
        data: breaks.has('entity-ok') ? null : { equipmentId: ref.id, room: 'PH-101' },
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
      if (context.scopeId !== 'ICH' && !breaks.has('scope')) return forbidden;
      const emptySets = (['roomNames', 'selection'] as const).filter(k => Array.isArray(context[k]) && (context[k] as unknown[]).length === 0);
      const honoured = breaks.has('explicit-empty-roomNames-only') ? emptySets.filter(k => k === 'roomNames') : emptySets;
      if (honoured.length > 0 && !breaks.has('explicit-empty')) {
        return { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'ref' };
      }
      const assessments: Assessment[] = breaks.has('kinds')
        ? [{ kind: 'collection', state: 'unknown', reason: 'source_unavailable' }]
        : breaks.has('assessments-wellformed')
          ? spec.kinds.map(kind => kind === 'coverage' ? { kind, state: 'clear' as const } : { kind, state: 'unknown' as const, reason: 'source_unavailable' as const })
          : spec.kinds.map(kind => ({ kind, state: 'unknown' as const, reason: 'source_unavailable' as const }));
      return {
        outcome: 'ok',
        data: { rows: 1 },
        assessments,
        trust: breaks.has('trust-incomplete') ? { ...REF_TRUST, coverage: '98%' as unknown as number | null } : null,
        correlationId: 'ref',
      };
    },
    entityAudit: async (ref): Promise<ApiResponse<{ events: readonly AuditEvent[] }>> => {
      if (ref.type !== 'equipment' && ref.type !== 'metric') {
        return breaks.has('entity-audit-unknown-type')
          ? { ...envelope, outcome: 'forbidden', message: 'Unknown entity type' }
          : err('Unknown entity type');
      }
      if (!state.permissions.has('equipment:view')) {
        return breaks.has('entity-audit-permission')
          ? { ...envelope, outcome: 'ok', data: { events: [REF_EVENT] } }
          : { ...envelope, outcome: 'forbidden', message: 'No permission equipment:view' };
      }
      if (ref.scopeId !== 'ICH') {
        // 'entity-audit-null' answers ok for a null Scope — the getEntity gate must catch it (adapter.ts).
        if (ref.scopeId === null && breaks.has('entity-audit-null')) {
          return { ...envelope, outcome: 'ok', data: { events: [REF_EVENT] } };
        }
        return ref.scopeId !== null && breaks.has('entity-audit-foreign')
          ? { ...envelope, outcome: 'ok', data: { events: [REF_EVENT] } }
          : { ...envelope, outcome: 'forbidden', message: `No grant for scope ${ref.scopeId}` };
      }
      if (breaks.has('entity-audit-ok')) return { ...envelope, outcome: 'ok', data: {} as unknown as { events: readonly AuditEvent[] } }; // data.events is not an array
      return { ...envelope, outcome: 'ok', data: { events: [REF_EVENT] } };
    },
    auditTrail: async () => {
      // adapter.ts zero rule: a zero is outcome `empty`. 'console-auditTrail-empty' empties the audit store
      // (still conforming); 'console-auditTrail-ok-zero' answers ok with an empty page — the kit must refuse it.
      if (breaks.has('console-auditTrail-ok-zero')) return consoleGate('auditTrail', { items: [], total: 0 });
      const r = consoleGate('auditTrail', { items: [REF_EVENT], total: 1 });
      return breaks.has('console-auditTrail-empty') && r.outcome === 'ok'
        ? { ...r, outcome: 'empty' as const, data: null }
        : r;
    },
    accessDirectory: async () => {
      // The reference directory holds no principals: a zero is outcome `empty` (adapter.ts) — the kit must
      // accept it. 'console-accessDirectory-mart' dresses a non-mart read up as mart data — the kit must refuse that.
      const r = consoleGate('accessDirectory', { items: [], total: 0 });
      const zero = r.outcome === 'ok' ? { ...r, outcome: 'empty' as const, data: null } : r;
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
      return breaks.has('console-usageSummary-empty') && r.outcome === 'ok'
        ? { ...r, outcome: 'empty' as const, data: null }
        : r;
    },
    recordUsage: async (events) => {
      const USAGE_KEYS = ['name', 'menuId', 'spaceId', 'path', 'at', 'sessionId'];
      const token = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max
        && (breaks.has('usage-allows-query') ? !/[#&\s]/.test(v) : !/[?#&\s]/.test(v));
      const invalid = (e: UsageEvent) => {
        const allowed = e.name === 'dwell' ? [...USAGE_KEYS, 'dwellMs', 'enteredAt'] : USAGE_KEYS;
        return Object.keys(e).some(k => !allowed.includes(k) && !(breaks.has('usage-client-user') && k === 'userId'))
          || !token(e.menuId, 80) || !token(e.path, 200)
          || typeof e.sessionId !== 'string'
          || typeof e.spaceId !== 'string' || !['analytics', 'operations', 'feedback'].includes(e.spaceId)
          || (e.name !== 'entry' && e.name !== 'dwell')
          || (!breaks.has('usage-allows-any-at') && (typeof e.at !== 'number' || !Number.isFinite(e.at)))
          || (e.name === 'dwell' && (typeof e.enteredAt !== 'number' || !Number.isFinite(e.enteredAt)
            || typeof e.dwellMs !== 'number' || !Number.isInteger(e.dwellMs) || (!breaks.has('usage-allows-negative-dwell') && e.dwellMs < 0)))
          || (breaks.has('usage-drops-dwell') && e.name === 'dwell');
      };
      const store = (rows: readonly UsageEvent[]) => {
        const userId = state.console ? 'admin' : 'engineer';
        const receivedAt = Date.now();
        for (const e of rows) {
          if (e.name === 'dwell') {
            // §5: the same (userId, sessionId, menuId, enteredAt) dwell replaces the previous one — the final dwell wins.
            const previous = usageRows.findIndex(x => x.name === 'dwell' && x.userId === userId && x.sessionId === e.sessionId && x.menuId === e.menuId && x.enteredAt === e.enteredAt);
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
        || typeof report.spaceId !== 'string' || !['analytics', 'operations', 'feedback'].includes(report.spaceId)
        || typeof name !== 'string' || (!breaks.has('client-error-allows-any-name') && !/^[A-Za-z_$][\w$]{0,79}$/.test(name));
      return invalidReport ? { accepted: false } : { accepted: true };
    },
    listAnnotations: async (ref) => {
      if (!state.permissions.has('analytics:view')) {
        return breaks.has('annotation-list-permission')
          ? { ...envelope, outcome: 'ok', data: { items: [] } }
          : { ...envelope, outcome: 'forbidden', message: 'No permission analytics:view' };
      }
      if (ref.scopeId === null) {
        return breaks.has('annotation-list-null')
          ? { ...envelope, outcome: 'empty' }
          : { ...envelope, outcome: 'forbidden', message: 'No grant for scope null' };
      }
      if (ref.scopeId !== 'ICH' && ref.scopeId !== 'CJU') {
        return breaks.has('annotation-list-foreign')
          ? { ...envelope, outcome: 'empty' }
          : { ...envelope, outcome: 'forbidden', message: `No grant for scope ${ref.scopeId}` };
      }
      // 'annotation-keyed-by-chart' selects by chartId alone — a note crosses the site boundary.
      const items = annotationRows
        .filter(r => r.chartId === ref.chartId && (breaks.has('annotation-keyed-by-chart') || r.scopeId === ref.scopeId))
        .map(({ authorId: _author, ...row }) => row);
      if (items.length === 0) return { ...envelope, outcome: 'empty' };
      // 'annotation-list-mart' taints only the list — 'annotation-mart' taints save and list together.
      return breaks.has('annotation-mart') || breaks.has('annotation-list-mart')
        ? { ...envelope, outcome: 'ok', data: { items }, assessments: REF_ASSESSMENTS, trust: REF_TRUST }
        : { ...envelope, outcome: 'ok', data: { items } };
    },
    saveAnnotation: async (input) => {
      if (!state.permissions.has('analytics:view')) {
        return breaks.has('annotation-save-permission')
          ? { ...envelope, outcome: 'ok', data: { id: 'ann-0', chartId: input.chartId, scopeId: input.scopeId ?? 'ICH', from: input.from, to: input.to, text: input.text, at: '2026-09-26T09:00:00' } }
          : { ...envelope, outcome: 'forbidden', message: 'No permission analytics:view' };
      }
      // A user/at/id in the input is an unknown key and rejects the call (adapter.ts) — 'annotation-accepts-at' takes it anyway.
      // 'annotation-error-stores' answers error but persists the row — the "nothing stored" half must catch it.
      if (!breaks.has('annotation-accepts-at') && Object.keys(input).some(k => !['chartId', 'scopeId', 'from', 'to', 'text'].includes(k))) {
        if (breaks.has('annotation-error-stores')) {
          annotationRows.push({ id: `ann-${++annotationSeq}`, chartId: input.chartId, scopeId: input.scopeId ?? 'ICH', from: input.from, to: input.to, text: input.text, at: '2026-09-26T09:00:00', authorId: 'engineer' });
        }
        return err('Invalid annotation input');
      }
      if (input.scopeId === null) {
        return breaks.has('annotation-save-null')
          ? { ...envelope, outcome: 'ok', data: { id: 'ann-0', chartId: input.chartId, scopeId: 'ICH', from: input.from, to: input.to, text: input.text, at: '2026-09-26T09:00:00' } }
          : { ...envelope, outcome: 'forbidden', message: 'No grant for scope null' };
      }
      if (input.scopeId !== 'ICH' && input.scopeId !== 'CJU') {
        return breaks.has('annotation-save-foreign')
          ? { ...envelope, outcome: 'ok', data: { id: 'ann-0', chartId: input.chartId, scopeId: input.scopeId, from: input.from, to: input.to, text: input.text, at: '2026-09-26T09:00:00' } }
          : { ...envelope, outcome: 'forbidden', message: `No grant for scope ${input.scopeId}` };
      }
      // 'annotation-echo' saves a different text than the input — the saved row must echo it. 'annotation-
      // row-author' leaks the stamped author into the returned row (adapter.ts: never sent, never returned).
      const stored = { id: `ann-${++annotationSeq}`, chartId: input.chartId, scopeId: input.scopeId, from: input.from, to: input.to, text: breaks.has('annotation-echo') ? `${input.text} (edited)` : input.text, at: '2026-09-26T09:00:00', authorId: 'engineer' };
      // 'annotation-not-stored' answers ok without persisting — the same-site list must notice.
      if (!breaks.has('annotation-not-stored')) annotationRows.push(stored);
      const { authorId: _author, ...row } = stored;
      if (breaks.has('annotation-row-author')) return { ...envelope, outcome: 'ok', data: { ...row, authorId: 'engineer' } };
      return breaks.has('annotation-mart')
        ? { ...envelope, outcome: 'ok', data: row, assessments: REF_ASSESSMENTS, trust: REF_TRUST }
        : { ...envelope, outcome: 'ok', data: row };
    },
    // Ports the kit does not exercise: present, minimal, contract-shaped.
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
  };
}

const CONTEXT = { scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };
const PORTS: PortSamples = {
  entity: { ref: { type: 'equipment', id: 'ICH-PHOTO-0103', scopeId: 'ICH' }, permission: 'equipment:view' },
  annotation: { chartId: 'fixture-chart', permission: 'analytics:view' },
  usage: { name: 'entry', menuId: 'fixture', spaceId: 'analytics', path: '/fixture', at: 0, sessionId: 'tab' },
  clientError: { correlationId: 'client-ref', menuId: 'fixture', spaceId: 'analytics', path: '/fixture', name: 'Error' },
  otherGrantedScopeId: 'CJU',
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
  };
}

function harness(breaks: ReadonlySet<string> = new Set(), cases: readonly ConformanceCase[] = [{ spec, params: { page: 0 } }]): ServerConformanceHarness {
  const state: RefState = { permissions: new Set<Permission>(['analytics:view', 'equipment:view']), console: false };
  return { adapter: referenceAdapter(state, breaks), cases, context: CONTEXT, foreignScopeId: 'XIA', ports: PORTS, ...actors(state) };
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
      'port · validateScope(foreign site) → forbidden with no rooms',
      'port · validateScope(unknown site) → unknown_scope',
      'port · getEntity(sample) → ok with the row',
      'port · getEntity of an unregistered type → error',
      'port · getEntity at a site without a grant → forbidden',
      'port · getEntity with a null Scope → forbidden',
      'port · getEntity without equipment:view → forbidden',
      'port · entityAudit(sample) → events',
      'port · entityAudit of an unregistered type → error',
      'port · entityAudit at a site without a grant → forbidden',
      'port · entityAudit with a null Scope → forbidden',
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
      'port · annotations are not mart data: no assessments, null trust',
      'port · listAnnotations without analytics:view → forbidden',
      'port · saveAnnotation without analytics:view → forbidden',
      'port · recordUsage accepts a valid entry and dwell',
      'port · recordUsage: one bad event rejects the whole call',
      'port · recordUsage: a client userId is rejected',
      'port · recordUsage: a concrete path with a query is rejected',
      'port · recordUsage: a non-numeric at is rejected',
      'port · recordUsage: a negative dwellMs is rejected',
      'port · usageSummary counts by receive time, not the client at',
      'port · reportClientError accepts the sample',
      'port · reportClientError: an unknown key (free-text message) is rejected',
      'port · reportClientError: an absolute URL path is rejected',
      'port · reportClientError: a path with a query is rejected',
      'port · reportClientError: a free-text name is rejected',
      'port · reportClientError: a missing field is rejected',
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
    ['non-applied', ['condition', 'lotIds', 'ppid', 'recipeIds'].map(k => `fixture.list · non-applied Context key ${k} → error`)],
    ['non-applied-first-only', ['lotIds', 'ppid', 'recipeIds'].map(k => `fixture.list · non-applied Context key ${k} → error`)],
    // from/to stay caught by the reference server's separate absolute-period rule.
    ['missing-last-only', ['scopeId', 'roomNames', 'selection', 'metricId'].map(k => `fixture.list · missing applied Context key ${k} → error`)],
    ['explicit-empty', ['roomNames', 'selection'].map(k => `fixture.list · explicit empty ${k}: [] → empty with no assessments and no trust`)],
    ['explicit-empty-roomNames-only', ['fixture.list · explicit empty selection: [] → empty with no assessments and no trust']],
  ])('catches a server that drops the %s rule on any declared key', async (broken, checks) => {
    expect(await failing([broken])).toEqual(checks);
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
    ['unsubscribe-twice', 'port · subscribe returns an unsubscribe function'],
    ['validate-granted', 'port · validateScope(granted site) → valid with its rooms'],
    ['validate-foreign', 'port · validateScope(foreign site) → forbidden with no rooms'],
    ['validate-unknown', 'port · validateScope(unknown site) → unknown_scope'],
    ['validate-unknown-rooms', 'port · validateScope(unknown site) → unknown_scope'],
    ['entity-ok', 'port · getEntity(sample) → ok with the row'],
    ['entity-unknown-type', 'port · getEntity of an unregistered type → error'],
    ['entity-foreign', 'port · getEntity at a site without a grant → forbidden'],
    ['entity-null-scope', 'port · getEntity with a null Scope → forbidden'],
    ['entity-permission', 'port · getEntity without equipment:view → forbidden'],
    // Three ways the getEntity success check can fail: no row, malformed assessments, incomplete trust.
    ['entity-assessments', 'port · getEntity(sample) → ok with the row'],
    ['entity-trust', 'port · getEntity(sample) → ok with the row'],
    ['entity-audit-ok', 'port · entityAudit(sample) → events'],
    ['entity-audit-unknown-type', 'port · entityAudit of an unregistered type → error'],
    ['entity-audit-foreign', 'port · entityAudit at a site without a grant → forbidden'],
    ['entity-audit-null', 'port · entityAudit with a null Scope → forbidden'],
    ['entity-audit-permission', 'port · entityAudit without equipment:view → forbidden'],
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
    // The other half of the same check: answering error but persisting the row anyway.
    ['annotation-error-stores', 'port · saveAnnotation carrying an at → error, nothing stored'],
    // 'annotation-mart' taints save and list; 'annotation-list-mart' taints the list only.
    ['annotation-mart', 'port · annotations are not mart data: no assessments, null trust'],
    ['annotation-list-mart', 'port · annotations are not mart data: no assessments, null trust'],
    ['annotation-list-permission', 'port · listAnnotations without analytics:view → forbidden'],
    ['annotation-save-permission', 'port · saveAnnotation without analytics:view → forbidden'],
    ['usage-drops-dwell', 'port · recordUsage accepts a valid entry and dwell'],
    ['usage-partial-accept', 'port · recordUsage: one bad event rejects the whole call'],
    ['usage-client-user', 'port · recordUsage: a client userId is rejected'],
    ['usage-allows-query', 'port · recordUsage: a concrete path with a query is rejected'],
    ['usage-allows-any-at', 'port · recordUsage: a non-numeric at is rejected'],
    ['usage-allows-negative-dwell', 'port · recordUsage: a negative dwellMs is rejected'],
    ['usage-aggregates-by-client-at', 'port · usageSummary counts by receive time, not the client at'],
    ['client-error-rejects-all', 'port · reportClientError accepts the sample'],
    ['client-error-ignores-unknown', 'port · reportClientError: an unknown key (free-text message) is rejected'],
    ['client-error-allows-absolute-path', 'port · reportClientError: an absolute URL path is rejected'],
    ['client-error-allows-query', 'port · reportClientError: a path with a query is rejected'],
    ['client-error-allows-any-name', 'port · reportClientError: a free-text name is rejected'],
    ['client-error-allows-missing', 'port · reportClientError: a missing field is rejected'],
    ['assessments-wellformed', 'fixture.list · granted response assessments are well-formed (06 §19)'],
    ['trust-incomplete', 'fixture.list · granted response trust is null or complete (06 §18)'],
    // Rejections carry no data (checklist §2): demonstrated on one error path and one forbidden path.
    ['unknown-endpoint-data', 'unknown endpoint → error'],
    ['permission-reject-data', 'fixture.list · without analytics:view → forbidden'],
  ])('fails exactly the matching check when the server drops the %s rule', async (broken, check) => {
    expect(await failing([broken])).toEqual([check]);
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

  it('reports an adapter that throws instead of answering an envelope', async () => {
    const h = harness();
    const results = await runServerConformance({ ...h, adapter: { ...h.adapter, menuQuery: async () => { throw new Error('boom'); } } });
    const menuQueryChecks = results.filter(r => !r.id.startsWith('port · '));
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
    permission: 'analytics:view',
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
    const state: RefState = { permissions: new Set<Permission>(['analytics:view', 'equipment:view']), console: false };
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
      .toEqual([`${exportSpec.id} · declares maxRows but has no oversizeParams sample — oversize check not run`]);
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
    expect(planServerConformance(oversizeHarness('too_large')).some(c => c.mode === 'skipped')).toBe(false);
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
