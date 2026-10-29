/**
 * Persistent chart annotations (06 §16 layer 4, issue #103). Module-level store like usage: it survives `setRole`,
 * so what one user wrote is what another user of the same site reads. Every row carries the site it was written
 * under and every read filters on it — the chart id alone never selects a row (ADR-0004 site boundary). Not mart
 * data: trust is null and assessments are empty on every branch, so this does not go through finish().
 * The server stamps the author and `at`; the wire input has no field for either and an unknown key rejects the call.
 */
import { checkScope, getRole, getScenario, nextCorrelation, sleep } from '../server';
import { activeWorld, type RoleId } from '../world';
import { menuPermission, type AnnotationInput, type AnnotationRef, type ApiResponse, type Assessment, type AuditEvent, type ChartAnnotation } from '@ap/contracts';

export type AnnotationOptions = { role?: RoleId; latency?: number };
/** `mine` is computed per response from the requesting role and never stored. */
type StoredAnnotation = Omit<ChartAnnotation, 'mine'> & { authorId: string };

/** The chart menus' permission. A server-side constant like getEntity's type map, never a client argument. */
const ANNOTATION_PERMISSION = menuPermission('analytics:view');
const REF_KEYS = ['chartId', 'scopeId'] as const;
const INPUT_KEYS = [...REF_KEYS, 'from', 'to', 'text'] as const;
const DELETE_KEYS = [...REF_KEYS, 'id'] as const;

const rows: StoredAnnotation[] = [];
let nextId = 1;
/** Deletions recorded for the console: `auditTrail` concatenates these with the fixture events. */
const deletions: AuditEvent[] = [];
export function resetAnnotations() { rows.length = 0; nextId = 1; deletions.length = 0; }
export function runtimeAuditEvents(): readonly AuditEvent[] { return deletions; }
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

function invalidDelete(ref: AnnotationRef & { id: string }): boolean {
  return invalidRef(ref, DELETE_KEYS) || !validToken(ref.id, 40);
}
const toWire = ({ authorId, ...row }: StoredAnnotation, requestRole: RoleId): ChartAnnotation => ({ ...row, mine: authorId === activeWorld().users[requestRole].role });

type Base = { correlationId: string; data: null; trust: null; assessments: Assessment[] };
type Gated = { fail: ApiResponse<never> } | { fail?: undefined; requestRole: RoleId; scenario: ReturnType<typeof getScenario>; base: Base };
async function gate(ref: AnnotationRef, signal: AbortSignal | undefined, opts: AnnotationOptions | undefined, invalid: boolean): Promise<Gated> {
  // Pin identity at send time, like serve(): a role switch while in flight must not re-evaluate this request.
  const scenario = getScenario();
  const requestRole = opts?.role ?? getRole();
  await sleep((opts?.latency ?? 80) + (scenario === 'slow' ? 2200 : 0), signal);
  const base: Base = { correlationId: nextCorrelation(), data: null, trust: null, assessments: [] };
  const fail = (outcome: ApiResponse<never>['outcome'], message: string): Gated => ({ fail: { ...base, outcome, message } });
  if (!activeWorld().users[requestRole].permissions.includes(ANNOTATION_PERMISSION)) return fail('forbidden', `No permission ${ANNOTATION_PERMISSION}`);
  if (scenario === 'timeout') return fail('timeout', '조회가 30초 제한을 넘었습니다');
  if (scenario === 'error') return fail('error', '상류 mart 쿼리가 실패했습니다');
  if (scenario === 'forbidden') return fail('forbidden', '권한이 회수되었습니다(시나리오)');
  if (invalid) return fail('error', 'Invalid annotation request');
  // Site gate: an unknown or ungranted site never reads or writes a row, and null is never "all sites".
  const scope = checkScope(requestRole, ref.scopeId);
  if (scope.status !== 'valid') return fail('forbidden', scope.status === 'forbidden' ? `No grant for scope ${ref.scopeId}` : `Unknown scope ${ref.scopeId}`);
  return { requestRole, scenario, base };
}

export async function listAnnotations(ref: AnnotationRef, signal?: AbortSignal, opts?: AnnotationOptions): Promise<ApiResponse<{ items: readonly ChartAnnotation[] }>> {
  const g = await gate(ref, signal, opts, invalidRef(ref));
  if (g.fail) return g.fail;
  const items = g.scenario === 'empty' ? [] : rows.filter(r => r.scopeId === ref.scopeId && r.chartId === ref.chartId).map(r => toWire(r, g.requestRole));
  if (items.length === 0) return { ...g.base, outcome: 'empty' };
  return { ...g.base, outcome: 'ok', data: { items } };
}

export async function saveAnnotation(input: AnnotationInput, signal?: AbortSignal, opts?: AnnotationOptions): Promise<ApiResponse<ChartAnnotation>> {
  const g = await gate(input, signal, opts, invalidInput(input));
  if (g.fail) return g.fail;
  const stored: StoredAnnotation = {
    id: `ann-${nextId++}`, chartId: input.chartId, scopeId: input.scopeId as string, from: input.from, to: input.to, text: input.text.trim(),
    at: new Date().toISOString().slice(0, 16), authorId: activeWorld().users[g.requestRole].role,
  };
  rows.push(stored);
  return { ...g.base, outcome: 'ok', data: toWire(stored, g.requestRole) };
}

/**
 * Author-only delete (#399, ADR-0041). Same gates as list/save, so a null, unknown or ungranted site is
 * `forbidden` before any lookup. Then the lookup is inside `(chartId, scopeId)` only: an id of another site or
 * chart is `empty`, a note of another author is `forbidden`. A successful delete leaves an audit row.
 */
export async function deleteAnnotation(ref: AnnotationRef & { id: string }, signal?: AbortSignal, opts?: AnnotationOptions): Promise<ApiResponse<{ id: string }>> {
  const g = await gate(ref, signal, opts, invalidDelete(ref));
  if (g.fail) return g.fail;
  const index = rows.findIndex(r => r.id === ref.id && r.scopeId === ref.scopeId && r.chartId === ref.chartId);
  if (index < 0) return { ...g.base, outcome: 'empty' };
  const row = rows[index];
  const actor = activeWorld().users[g.requestRole].role;
  if (row.authorId !== actor) return { ...g.base, outcome: 'forbidden', message: 'Only the author can delete a note' };
  rows.splice(index, 1);
  deletions.push({
    id: `annotation:${row.id}:delete`, at: new Date().toISOString(), actor, action: 'delete', source: 'user',
    target: { type: 'annotation', id: row.id, scopeId: row.scopeId }, changes: { chartId: [row.chartId, null] }, reason: row.text,
  });
  return { ...g.base, outcome: 'ok', data: { id: row.id } };
}
