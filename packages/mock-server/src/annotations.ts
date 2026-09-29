/**
 * Persistent chart annotations (06 §16 layer 4, issue #103). Module-level store like usage: it survives `setRole`,
 * so what one user wrote is what another user of the same site reads. Every row carries the site it was written
 * under and every read filters on it — the chart id alone never selects a row (ADR-0004 site boundary). Not mart
 * data: trust is null and assessments are empty on every branch, so this does not go through finish().
 * The server stamps the author and `at`; the wire input has no field for either and an unknown key rejects the call.
 */
import type { AnnotationInput, AnnotationRef, ApiResponse, Assessment, ChartAnnotation } from '@ap/contracts';
import { checkScope, getRole, getScenario, nextCorrelation, sleep } from './server';
import { USERS, type RoleId } from './world';

export type AnnotationOptions = { role?: RoleId; latency?: number };
type StoredAnnotation = ChartAnnotation & { authorId: string };

/** The chart menus' permission. A server-side constant like getEntity's type map, never a client argument. */
const ANNOTATION_PERMISSION = 'analytics:view' as const;
const REF_KEYS = ['chartId', 'scopeId'] as const;
const INPUT_KEYS = [...REF_KEYS, 'from', 'to', 'text'] as const;

const rows: StoredAnnotation[] = [];
let nextId = 1;
export function resetAnnotations() { rows.length = 0; nextId = 1; }
export function storedAnnotations(): readonly StoredAnnotation[] { return rows; }

const hasOnly = (value: object, keys: readonly string[]) => {
  const own = Object.keys(value);
  return own.every(k => keys.includes(k));
};
const validToken = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[?#&\s]/.test(v);
// from/to: an ISO-like naive time or a category label (may hold spaces), never control characters.
const validLabel = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64 && !/[\u0000-\u001f]/.test(v);

function invalidRef(ref: AnnotationRef, keys: readonly string[] = REF_KEYS): boolean {
  return typeof ref !== 'object' || ref === null || !hasOnly(ref, keys) || !validToken(ref.chartId, 80) || (ref.scopeId !== null && !validToken(ref.scopeId, 40));
}
function invalidInput(input: AnnotationInput): boolean {
  if (invalidRef(input, INPUT_KEYS)) return true;
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  return !validLabel(input.from) || !validLabel(input.to) || text.length === 0 || text.length > 200;
}

type Base = { correlationId: string; data: null; trust: null; assessments: Assessment[] };
type Gated = { fail: ApiResponse<never> } | { fail?: undefined; requestRole: RoleId; scenario: ReturnType<typeof getScenario>; base: Base };
async function gate(ref: AnnotationRef, signal: AbortSignal | undefined, opts: AnnotationOptions | undefined, invalid: boolean): Promise<Gated> {
  // Pin identity at send time, like serve(): a role switch while in flight must not re-evaluate this request.
  const scenario = getScenario();
  const requestRole = opts?.role ?? getRole();
  await sleep((opts?.latency ?? 80) + (scenario === 'slow' ? 2200 : 0), signal);
  const base: Base = { correlationId: nextCorrelation(), data: null, trust: null, assessments: [] };
  const fail = (outcome: ApiResponse<never>['outcome'], message: string): Gated => ({ fail: { ...base, outcome, message } });
  if (!USERS[requestRole].permissions.includes(ANNOTATION_PERMISSION)) return fail('forbidden', `No permission ${ANNOTATION_PERMISSION}`);
  if (scenario === 'timeout') return fail('timeout', 'Query exceeded 30s budget');
  if (scenario === 'error') return fail('error', 'Upstream mart query failed');
  if (scenario === 'forbidden') return fail('forbidden', 'Permission revoked (scenario)');
  if (invalid) return fail('error', 'Invalid annotation request');
  // Site gate: an unknown or ungranted site never reads or writes a row, and null is never "all sites".
  const scope = checkScope(requestRole, ref.scopeId);
  if (scope.status !== 'valid') return fail('forbidden', scope.status === 'forbidden' ? `No grant for scope ${ref.scopeId}` : `Unknown scope ${ref.scopeId}`);
  return { requestRole, scenario, base };
}

export async function listAnnotations(ref: AnnotationRef, signal?: AbortSignal, opts?: AnnotationOptions): Promise<ApiResponse<{ items: readonly ChartAnnotation[] }>> {
  const g = await gate(ref, signal, opts, invalidRef(ref));
  if (g.fail) return g.fail;
  const items = g.scenario === 'empty' ? [] : rows.filter(r => r.scopeId === ref.scopeId && r.chartId === ref.chartId).map(({ authorId: _author, ...row }) => row);
  if (items.length === 0) return { ...g.base, outcome: 'empty' };
  return { ...g.base, outcome: 'ok', data: { items } };
}

export async function saveAnnotation(input: AnnotationInput, signal?: AbortSignal, opts?: AnnotationOptions): Promise<ApiResponse<ChartAnnotation>> {
  const g = await gate(input, signal, opts, invalidInput(input));
  if (g.fail) return g.fail;
  const stored: StoredAnnotation = {
    id: `ann-${nextId++}`, chartId: input.chartId, scopeId: input.scopeId as string, from: input.from, to: input.to, text: input.text.trim(),
    at: new Date().toISOString().slice(0, 16), authorId: USERS[g.requestRole].role,
  };
  rows.push(stored);
  const { authorId: _author, ...row } = stored;
  return { ...g.base, outcome: 'ok', data: row };
}
