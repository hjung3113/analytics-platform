// Param judgments of the regression suite reads (#1479 D-c). A refusal is a message for the engine's params judgment (`error` outcome).

import { parseListParams } from '../../../lib/list-params/list-params.js';
import type { ListQuery } from '../../../lib/list-params/types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Fail = { ok: false; message: string };

export const SUITE_SORT_IDS = ['updatedAt', 'name', 'createdAt'] as const;
export const SUITES_PARAM_KEYS = ['q', 'page', 'pageSize', 'sorting', 'filters', 'datasetId'] as const;
export const SUITE_DETAIL_PARAM_KEYS = ['suiteId'] as const;
export const SUITE_RUNS_PARAM_KEYS = ['suiteId', 'page', 'pageSize'] as const;
/** A run page carries every item of every run on it, so the page is small. */
export const SUITE_RUNS_PAGE_MAX = 50;

export function parseSuitesParams(params: Record<string, unknown>): { ok: true; value: ListQuery & { datasetId?: string } } | Fail {
  const parsed = parseListParams(params, SUITE_SORT_IDS, {}, { id: 'updatedAt', desc: true });
  if (!parsed.ok) return parsed;
  if (params.datasetId === undefined) return parsed;
  if (typeof params.datasetId !== 'string' || !UUID.test(params.datasetId)) return { ok: false, message: 'datasetId must be a uuid string' };
  return { ok: true, value: { ...parsed.value, datasetId: params.datasetId.toLowerCase() } };
}

export function parseSuiteDetailParams(params: Record<string, unknown>): { ok: true; value: string } | Fail {
  const v = params.suiteId;
  return typeof v === 'string' && UUID.test(v) ? { ok: true, value: v.toLowerCase() } : { ok: false, message: 'suiteId must be a uuid string' };
}

export function parseSuiteRunsParams(params: Record<string, unknown>): { ok: true; value: { suiteId: string; page: number; pageSize: number } } | Fail {
  const id = parseSuiteDetailParams(params);
  if (!id.ok) return id;
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) return { ok: false, message: 'page must be a non-negative integer (0-based)' };
  const pageSize = params.pageSize === undefined ? 20 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > SUITE_RUNS_PAGE_MAX) {
    return { ok: false, message: `pageSize must be an integer from 1 to ${SUITE_RUNS_PAGE_MAX}` };
  }
  return { ok: true, value: { suiteId: id.value, page, pageSize } };
}
