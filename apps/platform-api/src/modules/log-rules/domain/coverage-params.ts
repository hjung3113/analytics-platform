// Param judgments of the coverage reads (#1494 R-d). A refusal is a message for the engine's params judgment (`error`).

import { PAGE_SIZE_MAX } from '../../../lib/list-params/list-params.js';
import { isUuid } from '../../../lib/input/fields.js';

type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });

export const COVERAGE_PARAM_KEYS = ['modelId', 'softwareId', 'page', 'pageSize'] as const;
export const COVERAGE_SUMMARY_PARAM_KEYS = ['modelIds'] as const;
/** Models one summary call computes (each costs one effective-spec read under the model lock). */
export const COVERAGE_SUMMARY_MAX_MODELS = 50;
/** Declaring Rules listed per requirement row; `declaredCount` is complete. */
export const DECLARED_REF_CAP = 50;
export const COVERAGE_PAGE_SIZE_DEFAULT = 50;

export interface CoverageQuery {
  modelId: string;
  softwareId: string | null;
  page: number;
  pageSize: number;
}

function parseId(params: Record<string, unknown>, key: string, nullable: boolean): { ok: true; value: string | null } | Fail {
  const v = params[key];
  if (v === undefined || v === null) return nullable ? { ok: true, value: null } : fail(`${key} is required`);
  if (typeof v !== 'string' || !isUuid(v)) return fail(`${key} must be a UUID`);
  return { ok: true, value: v.toLowerCase() };
}

export function parseCoverageParams(params: Record<string, unknown>): { ok: true; value: CoverageQuery } | Fail {
  const modelId = parseId(params, 'modelId', false);
  if (!modelId.ok) return modelId;
  const softwareId = parseId(params, 'softwareId', true);
  if (!softwareId.ok) return softwareId;
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) return fail('page must be a non-negative integer (0-based)');
  const pageSize = params.pageSize === undefined ? COVERAGE_PAGE_SIZE_DEFAULT : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return fail(`pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}`);
  }
  return { ok: true, value: { modelId: modelId.value as string, softwareId: softwareId.value, page, pageSize } };
}

export function parseCoverageSummaryParams(params: Record<string, unknown>): { ok: true; value: string[] } | Fail {
  const ids = params.modelIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > COVERAGE_SUMMARY_MAX_MODELS) {
    return fail(`modelIds must be a list of 1 to ${COVERAGE_SUMMARY_MAX_MODELS} model ids`);
  }
  if (!ids.every((id) => typeof id === 'string' && isUuid(id))) return fail('modelIds must hold UUIDs');
  return { ok: true, value: [...new Set((ids as string[]).map((id) => id.toLowerCase()))] };
}
