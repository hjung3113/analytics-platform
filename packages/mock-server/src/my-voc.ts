/**
 * "My VOC" reads (issue #60): the session actor's filed VOCs and survey submissions. Not an analysis path —
 * no GlobalContext, no Scope, no serve() equipment/time-domain resolution — and not finished by finish():
 * its mart trust (`mart.productivity_hourly`) and `collection` assessment would both be fake here.
 * Scenario order mirrors usageSummary(): the pinned role's permission outranks every dev scenario.
 */
import type { ApiResponse, Assessment, MySurveyPage, MyVocPage, MyVocQuery } from '@ap/contracts';
import { getRole, getScenario, nextCorrelation, sleep } from './server';
import { MY_VOC_PAGE_SIZE, MY_VOC_ROWS } from './my-voc-fixtures';
import { USERS, type RoleId } from './world';

export type MyVocOptions = { role?: RoleId; latency?: number };

/** Offset this token continues from, or null when it is not exactly a token the pinned role can continue. */
function cursorOffset(token: string, role: RoleId): number | null {
  const m = /^mock:([a-z]+):(\d+)$/.exec(token);
  // A token naming another actor is invalid, never rewound to page 1: it must not hand over their slice.
  if (!m || m[1] !== role) return null;
  // Accept only tokens the mock actually issues: nextCursor is always a full page past the served window,
  // so a valid continue point is a positive multiple of MY_VOC_PAGE_SIZE below the row count, written
  // canonically — `:0` would rewind to page 1, `:1` is off the page grid, and `:0002` was never issued.
  const digits = m[2];
  if (digits.length > 1 && digits.startsWith('0')) return null;
  const offset = Number(digits);
  return offset > 0 && offset % MY_VOC_PAGE_SIZE === 0 && offset < MY_VOC_ROWS[role].length ? offset : null;
}

/**
 * The session actor's filed VOCs, newest openedAt first (issue #60). Cursor, not offset: the client never
 * sends limit/sort/filter. An unknown, empty or other-actor cursor is outcome 'error', never page 1.
 */
export async function myVocHistory(query: MyVocQuery, signal?: AbortSignal, opts?: MyVocOptions): Promise<ApiResponse<MyVocPage>> {
  // Pin identity at send time, like serve(): a role switch while in flight must not re-evaluate this request.
  const s = getScenario();
  const requestRole = opts?.role ?? getRole();
  const correlationId = nextCorrelation();
  await sleep(opts?.latency ?? 80, signal);
  const base = { correlationId, data: null, trust: null, assessments: [] as Assessment[] };
  if (!USERS[requestRole].permissions.includes('voc:view')) return { ...base, outcome: 'forbidden', message: 'No permission voc:view' };
  if (s === 'timeout') return { ...base, outcome: 'timeout', message: 'Query exceeded 30s budget' };
  if (s === 'error') return { ...base, outcome: 'error', message: 'Upstream mart query failed' };
  if (s === 'forbidden') return { ...base, outcome: 'forbidden', message: 'Permission revoked (scenario)' };
  const rows = MY_VOC_ROWS[requestRole];
  const offset = query.cursor === undefined ? 0 : cursorOffset(query.cursor, requestRole);
  if (offset === null) return { ...base, outcome: 'error', message: 'Invalid cursor' };
  if (s === 'empty' || rows.length === 0) return { ...base, outcome: 'empty' };
  const items = rows.slice(offset, offset + MY_VOC_PAGE_SIZE);
  return {
    ...base,
    outcome: 'ok',
    data: { items, nextCursor: offset + MY_VOC_PAGE_SIZE < rows.length ? `mock:${requestRole}:${offset + MY_VOC_PAGE_SIZE}` : null },
  };
}

/**
 * The session actor's survey submissions. FeedbackOps has no read of them yet (issue #60), so the success body
 * is always the declared `respondent_history`/`unknown` envelope — never outcome 'empty', which would assert a
 * confirmed zero, and never a row. The screen branches on the assessment, not on items.length.
 */
export async function mySurveyHistory(signal?: AbortSignal, opts?: MyVocOptions): Promise<ApiResponse<MySurveyPage>> {
  const s = getScenario();
  const requestRole = opts?.role ?? getRole();
  const correlationId = nextCorrelation();
  await sleep(opts?.latency ?? 80, signal);
  const base = { correlationId, data: null, trust: null, assessments: [] as Assessment[] };
  if (!USERS[requestRole].permissions.includes('voc:view')) return { ...base, outcome: 'forbidden', message: 'No permission voc:view' };
  if (s === 'timeout') return { ...base, outcome: 'timeout', message: 'Query exceeded 30s budget' };
  if (s === 'error') return { ...base, outcome: 'error', message: 'Upstream mart query failed' };
  if (s === 'forbidden') return { ...base, outcome: 'forbidden', message: 'Permission revoked (scenario)' };
  // empty/partial/too_large do not apply here: 'empty' would assert a confirmed zero. `unknown` carries no
  // statusSource/observedAt — those are required only for confirmed/clear.
  return {
    ...base,
    outcome: 'ok',
    data: { items: [] },
    assessments: [{ kind: 'respondent_history', state: 'unknown', reason: 'source_unavailable' }],
  };
}
