// Param judgments of the comparison reads (#1480 D-d): `logDataset.comparison` and `logDataset.rerunDiff`. Every refusal is a message for the
// engine's params judgment (`error` outcome). The rule list's filters are the table filter model of ADR-0105.

import type { CatalogFilterFieldSpec } from '../../../lib/list-params/catalog-filters.js';
import { parseListParams } from '../../../lib/list-params/list-params.js';
import type { ListQuery } from '../../../lib/list-params/types.js';
import { CLASSIFICATIONS, DIFF_KINDS, EXPECTED_VALUES, OBSERVED_VALUES } from './comparison.js';
import { REVIEW_LABELS } from './review-label-input.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });

/** `observed` / `expected` / `label`: `none` = the rule has no result / no expectation / no label (so `in none` selects exactly those). */
export const COMPARISON_FILTER_SPECS = {
  classification: { ops: ['in', 'notIn'], multiple: true, cell: 'scalar', values: 'enum', allowed: CLASSIFICATIONS },
  observed: { ops: ['in', 'notIn'], multiple: true, cell: 'scalar', values: 'enum', allowed: [...OBSERVED_VALUES, 'none'] },
  expected: { ops: ['in', 'notIn'], multiple: true, cell: 'scalar', values: 'enum', allowed: [...EXPECTED_VALUES, 'none'] },
  label: { ops: ['in', 'notIn'], multiple: true, cell: 'scalar', values: 'enum', allowed: [...REVIEW_LABELS, 'none'] },
  required: { ops: ['in', 'notIn'], multiple: false, cell: 'scalar', values: 'boolean' },
} as const satisfies Record<string, CatalogFilterFieldSpec>;

export const COMPARISON_SORT_IDS = ['severity', 'ruleId'] as const;
export const COMPARISON_PARAM_KEYS = ['suiteRunId', 'ordinal', 'q', 'page', 'pageSize', 'sorting', 'filters'] as const;
export const RERUN_DIFF_PARAM_KEYS = ['fromRunId', 'toRunId', 'kinds', 'page', 'pageSize'] as const;
export const ITEM_ORDINAL_MAX = 20;
export const RERUN_DIFF_PAGE_MAX = 200;

export interface ComparisonQuery {
  suiteRunId: string;
  /** Restricts the rule list to one item (1-based ordinal); the per-item summaries always cover every item. */
  ordinal: number | null;
  list: ListQuery;
}

export function parseComparisonParams(params: Record<string, unknown>): { ok: true; value: ComparisonQuery } | Fail {
  const id = params.suiteRunId;
  if (typeof id !== 'string' || !UUID.test(id)) return fail('suiteRunId must be a uuid string');
  const ordinal = params.ordinal ?? null;
  if (ordinal !== null && (typeof ordinal !== 'number' || !Number.isInteger(ordinal) || ordinal < 1 || ordinal > ITEM_ORDINAL_MAX)) {
    return fail(`ordinal must be an integer from 1 to ${ITEM_ORDINAL_MAX} or null`);
  }
  const list = parseListParams(params, COMPARISON_SORT_IDS, COMPARISON_FILTER_SPECS, { id: 'severity', desc: false });
  if (!list.ok) return list;
  return { ok: true, value: { suiteRunId: id.toLowerCase(), ordinal, list: list.value } };
}

export interface RerunDiffQuery {
  fromRunId: string;
  toRunId: string;
  /** Only these movements are listed (the counts stay complete); empty = every movement except `same`. */
  kinds: readonly string[];
  page: number;
  pageSize: number;
}

export function parseRerunDiffParams(params: Record<string, unknown>): { ok: true; value: RerunDiffQuery } | Fail {
  const ids: string[] = [];
  for (const key of ['fromRunId', 'toRunId'] as const) {
    const v = params[key];
    if (typeof v !== 'string' || !UUID.test(v)) return fail(`${key} must be a uuid string`);
    ids.push(v.toLowerCase());
  }
  const [fromRunId, toRunId] = ids as [string, string];
  const kinds = params.kinds === undefined ? [] : params.kinds;
  if (!Array.isArray(kinds) || kinds.length > DIFF_KINDS.length || new Set(kinds).size !== kinds.length || kinds.some((k) => !(DIFF_KINDS as readonly unknown[]).includes(k))) {
    return fail(`kinds must be a list of distinct values from ${DIFF_KINDS.join(', ')}`);
  }
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) return fail('page must be a non-negative integer (0-based)');
  const pageSize = params.pageSize === undefined ? 50 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > RERUN_DIFF_PAGE_MAX) {
    return fail(`pageSize must be an integer from 1 to ${RERUN_DIFF_PAGE_MAX}`);
  }
  return { ok: true, value: { fromRunId, toRunId, kinds: kinds as string[], page, pageSize } };
}
