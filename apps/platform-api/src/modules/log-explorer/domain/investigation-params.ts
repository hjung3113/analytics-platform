// Param judgments of the log explorer investigation reads (#1468 b). A refusal is a message for the engine's params
// judgment (`error` outcome), never an empty page.

import { PAGE_SIZE_MAX } from '../../../lib/list-params/list-params.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });

export const LIST_PARAM_KEYS = ['status', 'page', 'pageSize'] as const;
export const DETAIL_PARAM_KEYS = ['investigationId'] as const;
export const INVESTIGATION_STATUSES = ['open', 'archived'] as const;

export interface ListQuery {
  status: (typeof INVESTIGATION_STATUSES)[number] | null;
  page: number;
  pageSize: number;
}

export function parseListParams(params: Record<string, unknown>): { ok: true; value: ListQuery } | Fail {
  const status = params.status === undefined ? null : params.status;
  if (status !== null && status !== 'open' && status !== 'archived') return fail("status must be 'open' or 'archived'");
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) {
    return fail('page must be a non-negative integer (0-based)');
  }
  const pageSize = params.pageSize === undefined ? 50 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return fail(`pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}`);
  }
  return { ok: true, value: { status, page, pageSize } };
}

export function parseDetailParams(params: Record<string, unknown>): { ok: true; value: string } | Fail {
  const v = params.investigationId;
  return typeof v === 'string' && UUID.test(v) ? { ok: true, value: v.toLowerCase() } : fail('investigationId must be a uuid string');
}
