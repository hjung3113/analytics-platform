/**
 * Mock request validation + response envelope (docs/06 §19): exclusive `outcome` plus declared `assessments[]`.
 * Every page query goes through `serve()` so Scope/room grants are re-validated per request (§6.2).
 */
import type { Condition, GlobalContext } from '../kernel/url';
import { parseDateTime } from '../kernel/url';
import { EQUIPMENT, SITES, USERS, type Equipment, type RoleId } from './world';

export type Outcome = 'ok' | 'empty' | 'error' | 'forbidden' | 'too_large' | 'timeout';
export type AssessmentKind = 'collection' | 'processing_delay' | 'coverage' | 'time_domain';
export type Assessment = {
  kind: AssessmentKind;
  state: 'confirmed' | 'clear' | 'unknown';
  statusSource?: string;
  observedAt?: string;
  reason?: 'source_unavailable' | 'check_failed';
  explainsEmpty?: boolean;
  detail?: string;
};
export type Trust = {
  updatedAt: string;
  dataThrough: string | null;
  coverage: number | null;
  metricVersion?: string;
  provisional: boolean;
  source: string;
};
export type ApiResponse<T> = {
  outcome: Outcome;
  data: T | null;
  assessments: Assessment[];
  trust: Trust | null;
  correlationId: string;
  message?: string;
};

export type Scenario = 'normal' | 'slow' | 'empty' | 'error' | 'forbidden' | 'too_large' | 'timeout' | 'partial' | 'unknown_status';
let scenario: Scenario = 'normal';
const listeners = new Set<() => void>();
export const getScenario = () => scenario;
export function setScenario(next: Scenario) { scenario = next; listeners.forEach(l => l()); }
export function subscribeScenario(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

let correlation = 4100;
let partialCounter = 0;
const nextCorrelation = () => `corr-${(correlation++).toString(16)}-${Math.random().toString(16).slice(2, 6)}`;
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const id = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('aborted', 'AbortError')); });
});

export type ScopeCheck = { status: 'valid' | 'forbidden' | 'unknown_scope'; grantedRooms: string[] };
export function checkScope(role: RoleId, scopeId: string | null): ScopeCheck {
  if (!scopeId) return { status: 'unknown_scope', grantedRooms: [] };
  if (!SITES.some(s => s.id === scopeId)) return { status: 'unknown_scope', grantedRooms: [] };
  const grants = USERS[role].grants[scopeId];
  return grants?.length ? { status: 'valid', grantedRooms: grants } : { status: 'forbidden', grantedRooms: [] };
}

export async function validateScope(role: RoleId, scopeId: string, signal?: AbortSignal): Promise<ScopeCheck> {
  await sleep(350, signal);
  return checkScope(role, scopeId);
}

export function matchesCondition(e: Equipment, c: Condition | null): boolean {
  if (!c) return true;
  if (c.axis === 'stgroup') return e.stgroup === c.id;
  if (c.axis === 'team') return e.team === c.id;
  return e.maker === c.maker && e.model === c.model;
}

/** Equipment the request may analyse: Scope → granted rooms → room filter → Condition → Selection. */
export function resolveEquipment(role: RoleId, g: GlobalContext): { rows: Equipment[]; forbidden: string | null } {
  const scope = checkScope(role, g.scopeId);
  if (scope.status !== 'valid') return { rows: [], forbidden: scope.status === 'forbidden' ? `No grant for scope ${g.scopeId}` : `Unknown scope ${g.scopeId}` };
  if (g.roomNames?.length) {
    const denied = g.roomNames.filter(r => !scope.grantedRooms.includes(r));
    if (denied.length) return { rows: [], forbidden: `No grant for room_name ${denied.join(', ')}` };
  }
  let rows = EQUIPMENT.filter(e => e.site === g.scopeId && scope.grantedRooms.includes(e.room));
  if (g.roomNames !== null) rows = rows.filter(e => g.roomNames!.includes(e.room));
  rows = rows.filter(e => matchesCondition(e, g.condition));
  if (g.selection !== null) {
    const outside = g.selection.filter(id => !EQUIPMENT.some(e => e.equipmentId === id && e.site === g.scopeId && scope.grantedRooms.includes(e.room)));
    if (outside.length) return { rows: [], forbidden: `Selection outside scope/grants: ${outside.join(', ')}` };
    rows = rows.filter(e => g.selection!.includes(e.equipmentId));
  }
  return { rows, forbidden: null };
}

export function periodHours(g: GlobalContext): number | null {
  if (!g.from || !g.to) return null;
  return (parseDateTime(g.to, 'to').getTime() - parseDateTime(g.from, 'from').getTime()) / 3_600_000;
}

export type ServeOptions<T> = {
  role: RoleId;
  global: GlobalContext;
  /** Kinds this query contract declares (§19); every one is answered exactly once. */
  kinds?: AssessmentKind[];
  requiresScope?: boolean;
  /** Reject unbounded analytics: prototype max period in hours when no fixed Selection narrows it. */
  maxHours?: number;
  latency?: number;
  signal?: AbortSignal;
  metricVersion?: string;
  /** Logical source shown in Data Trust (e.g. 'master.equipment'); defaults to the productivity mart. */
  source?: string;
  compute: (ctx: { equipment: Equipment[] }) => T;
  isEmpty?: (data: T) => boolean;
};

const OBSERVED = '2026-09-26T08:58:00';

export async function serve<T>(o: ServeOptions<T>): Promise<ApiResponse<T>> {
  const s = scenario;
  const correlationId = nextCorrelation();
  await sleep((o.latency ?? 450) + (s === 'slow' ? 2200 : 0) + Math.random() * 200, o.signal);
  const base = { correlationId, data: null, trust: null, assessments: [] as Assessment[] };
  if (s === 'timeout') return { ...base, outcome: 'timeout', message: 'Query exceeded 30s budget' };
  if (s === 'error') return { ...base, outcome: 'error', message: 'Upstream mart query failed' };
  // Every other widget query fails so pages can show a local failure next to healthy widgets (§19 Partial widget failure).
  if (s === 'partial' && partialCounter++ % 2 === 1) return { ...base, outcome: 'error', message: 'Widget query failed (partial scenario)' };
  const requiresScope = o.requiresScope ?? true;
  const resolved = requiresScope ? resolveEquipment(o.role, o.global) : { rows: EQUIPMENT, forbidden: null };
  if (s === 'forbidden' || resolved.forbidden) return { ...base, outcome: 'forbidden', message: resolved.forbidden ?? 'Permission revoked (scenario)' };
  const hours = periodHours(o.global);
  if (s === 'too_large' || (o.maxHours && hours !== null && hours > o.maxHours && (o.global.selection === null || o.global.selection.length > 40))) {
    return { ...base, outcome: 'too_large', message: `Period ${hours ?? '?'}h exceeds ${o.maxHours ?? '—'}h without a narrow fixed Selection` };
  }
  const equipment = s === 'empty' ? [] : resolved.rows;
  const data = o.compute({ equipment });
  const empty = s === 'empty' || (o.isEmpty ? o.isEmpty(data) : false);
  const kinds = o.kinds ?? ['collection', 'processing_delay', 'coverage'];
  const assessments: Assessment[] = kinds.map(kind => {
    if (s === 'unknown_status' || kind === 'collection') return { kind, state: 'unknown', reason: 'source_unavailable' };
    if (kind === 'processing_delay') return { kind, state: 'clear', statusSource: 'mart-watermark', observedAt: OBSERVED };
    if (kind === 'coverage') return { kind, state: 'clear', statusSource: 'coverage-service', observedAt: OBSERVED, detail: '98.7%' };
    return { kind, state: 'unknown', reason: 'source_unavailable' };
  });
  return {
    correlationId,
    outcome: empty ? 'empty' : 'ok',
    data,
    assessments,
    trust: {
      updatedAt: '2026-09-26T09:02:00', dataThrough: '2026-09-26T08:00:00', coverage: s === 'unknown_status' ? null : 0.987,
      metricVersion: o.metricVersion, provisional: hours !== null && hours <= 24, source: o.source ?? 'mart.productivity_hourly',
    },
  };
}
