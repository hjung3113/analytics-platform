// Param judgments of the log lifecycle reads (#1444 c). Every refusal is a message for the engine's params judgment
// (`error` outcome), never an empty page.

import type { CatalogFilterFieldSpec } from '../../../lib/list-params/catalog-filters.js';
import { PAGE_SIZE_MAX, parseListParams } from '../../../lib/list-params/list-params.js';
import type { ListQuery } from '../../../lib/list-params/types.js';
import { OPEN_STAGES } from './stage-transitions.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });

const SCALAR_OPS = ['in', 'notIn'] as const;
/**
 * Filter fields of `logLifecycle.models` (ADR-0105): the model fields of `logKnowledge.models` (`active`, `id`,
 * `vendorId`, `processes`) plus `stage` of the model's OPEN project. `isEmpty` = the model has no open project
 * (`isNotEmpty` = it has one); `in` / `notIn` take the open stages (a completed or cancelled project is not the
 * model's current project, so those stages are not filter values).
 */
export const MODEL_FILTER_SPECS = {
  active: { ops: SCALAR_OPS, multiple: false, cell: 'scalar', values: 'boolean' },
  id: { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'uuid' },
  vendorId: { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'uuid' },
  processes: { ops: ['in', 'notIn', 'isEmpty', 'isNotEmpty'], multiple: true, cell: 'many', values: 'uuid' },
  stage: {
    ops: ['in', 'notIn', 'isEmpty', 'isNotEmpty'],
    multiple: true,
    cell: 'scalar',
    values: 'enum',
    allowed: OPEN_STAGES,
  },
} as const satisfies Record<string, CatalogFilterFieldSpec>;

export const MODEL_SORT_IDS = ['code', 'name', 'vendorName', 'active', 'softwareCount', 'stage', 'createdAt', 'updatedAt'] as const;
export const MODEL_PARAM_KEYS = ['q', 'page', 'pageSize', 'sorting', 'filters'] as const;
export const PROJECT_PARAM_KEYS = ['projectId'] as const;
export const EVENT_PARAM_KEYS = ['projectId', 'page', 'pageSize'] as const;
export const ROUNDS_PARAM_KEYS = ['projectId'] as const;
export const ROUND_PARAM_KEYS = ['roundId'] as const;

export type ModelParse = { ok: true; value: ListQuery } | Fail;
export function parseModelParams(params: Record<string, unknown>): ModelParse {
  return parseListParams(params, MODEL_SORT_IDS, MODEL_FILTER_SPECS);
}

function parseId(key: string, params: Record<string, unknown>): { ok: true; value: string } | Fail {
  const v = params[key];
  return typeof v === 'string' && UUID.test(v) ? { ok: true, value: v.toLowerCase() } : fail(`${key} must be a uuid string`);
}
export const parseProjectParams = (p: Record<string, unknown>) => parseId('projectId', p);
export const parseRoundsParams = (p: Record<string, unknown>) => parseId('projectId', p);
export const parseRoundParams = (p: Record<string, unknown>) => parseId('roundId', p);

export interface EventQuery {
  projectId: string;
  page: number;
  pageSize: number;
}
export type EventParse = { ok: true; value: EventQuery } | Fail;
export function parseEventParams(params: Record<string, unknown>): EventParse {
  const id = parseId('projectId', params);
  if (!id.ok) return id;
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) {
    return fail('page must be a non-negative integer (0-based)');
  }
  const pageSize = params.pageSize === undefined ? 50 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return fail(`pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}`);
  }
  return { ok: true, value: { projectId: id.value, page, pageSize } };
}
