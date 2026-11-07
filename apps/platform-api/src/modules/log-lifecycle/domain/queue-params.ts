// Param judgments of the validation request reads (#1445 d). Like the lifecycle reads: every refusal is a message for the
// engine's params judgment (`error` outcome), never an empty page. Pages are 0-based.

import { PAGE_SIZE_MAX } from '../../../lib/list-params/list-params.js';
import { REQUEST_STATES } from './request-states.js';
import { RULE_RESULTS } from './verdict.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });

export const REQUEST_PARAM_KEYS = ['page', 'pageSize', 'states', 'priority', 'immediate', 'roundId', 'modelId', 'from', 'to'] as const;
export const REQUEST_DETAIL_PARAM_KEYS = ['requestId'] as const;
export const RULE_RESULT_PARAM_KEYS = ['attemptId', 'page', 'pageSize', 'results', 'required'] as const;
export const EXCERPT_PARAM_KEYS = ['ruleResultId', 'evidenceIndex'] as const;

function pageOf(params: Record<string, unknown>, fallbackSize: number): { ok: true; page: number; pageSize: number } | Fail {
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) return fail('page must be a non-negative integer (0-based)');
  const pageSize = params.pageSize === undefined ? fallbackSize : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return fail(`pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}`);
  }
  return { ok: true, page, pageSize };
}
const uuidOf = (params: Record<string, unknown>, key: string): { ok: true; value: string } | Fail =>
  typeof params[key] === 'string' && UUID.test(params[key] as string) ? { ok: true, value: (params[key] as string).toLowerCase() } : fail(`${key} must be a uuid string`);
function enumList<T extends string>(raw: unknown, key: string, allowed: readonly T[]): { ok: true; value: T[] | undefined } | Fail {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > allowed.length || !raw.every((v) => allowed.includes(v as T))) {
    return fail(`${key} must be a non-empty list of ${allowed.join(', ')}`);
  }
  return { ok: true, value: [...new Set(raw as T[])] };
}
function instant(raw: unknown, key: string): { ok: true; value: Date | undefined } | Fail {
  if (raw === undefined) return { ok: true, value: undefined };
  const d = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(raw) ? new Date(raw) : null;
  return d && Number.isFinite(d.getTime()) ? { ok: true, value: d } : fail(`${key} must be an ISO instant with an offset`);
}

export interface RequestListQuery {
  page: number;
  pageSize: number;
  states: string[] | undefined;
  priority: number | undefined;
  immediate: boolean | undefined;
  roundId: string | undefined;
  modelId: string | undefined;
  from: Date | undefined;
  to: Date | undefined;
}
export function parseRequestListParams(params: Record<string, unknown>): { ok: true; value: RequestListQuery } | Fail {
  const pg = pageOf(params, 50);
  if (!pg.ok) return pg;
  const states = enumList(params.states, 'states', REQUEST_STATES);
  if (!states.ok) return states;
  const priority = params.priority;
  if (priority !== undefined && (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 0 || priority > 2)) return fail('priority must be 0, 1 or 2');
  if (params.immediate !== undefined && typeof params.immediate !== 'boolean') return fail('immediate must be a boolean');
  let roundId: string | undefined;
  if (params.roundId !== undefined) {
    const r = uuidOf(params, 'roundId');
    if (!r.ok) return r;
    roundId = r.value;
  }
  let modelId: string | undefined;
  if (params.modelId !== undefined) {
    const m = uuidOf(params, 'modelId');
    if (!m.ok) return m;
    modelId = m.value;
  }
  const from = instant(params.from, 'from');
  if (!from.ok) return from;
  const to = instant(params.to, 'to');
  if (!to.ok) return to;
  return {
    ok: true,
    value: { page: pg.page, pageSize: pg.pageSize, states: states.value, priority: priority as number | undefined, immediate: params.immediate as boolean | undefined, roundId, modelId, from: from.value, to: to.value },
  };
}

export const parseRequestDetailParams = (p: Record<string, unknown>) => uuidOf(p, 'requestId');

export interface RuleResultListQuery {
  attemptId: string;
  page: number;
  pageSize: number;
  results: string[] | undefined;
  required: boolean | undefined;
}
export function parseRuleResultParams(params: Record<string, unknown>): { ok: true; value: RuleResultListQuery } | Fail {
  const id = uuidOf(params, 'attemptId');
  if (!id.ok) return id;
  const pg = pageOf(params, 100);
  if (!pg.ok) return pg;
  const results = enumList(params.results, 'results', RULE_RESULTS);
  if (!results.ok) return results;
  if (params.required !== undefined && typeof params.required !== 'boolean') return fail('required must be a boolean');
  return { ok: true, value: { attemptId: id.value, page: pg.page, pageSize: pg.pageSize, results: results.value, required: params.required as boolean | undefined } };
}

export function parseExcerptParams(params: Record<string, unknown>): { ok: true; value: { ruleResultId: string; evidenceIndex: number } } | Fail {
  const id = uuidOf(params, 'ruleResultId');
  if (!id.ok) return id;
  const i = params.evidenceIndex;
  if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i > 19) return fail('evidenceIndex must be an integer from 0 to 19');
  return { ok: true, value: { ruleResultId: id.value, evidenceIndex: i } };
}
