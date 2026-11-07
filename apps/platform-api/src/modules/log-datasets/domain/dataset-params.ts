// Param judgments of the log dataset reads (#1477 D-a). Every refusal is a message for the engine's params judgment (`error`
// outcome), never an empty page. The list filters are the table filter model of ADR-0105.

import type { CatalogFilterFieldSpec } from '../../../lib/list-params/catalog-filters.js';
import { parseListParams } from '../../../lib/list-params/list-params.js';
import type { ListQuery } from '../../../lib/list-params/types.js';
import { DATASET_STATUSES, SCENARIO_TAGS } from './scenario-tags.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });

/**
 * Filter fields of `logDataset.datasets`: `status` (a dataset has exactly one), `tag` (its scenario tags, a set; `isEmpty` = untagged)
 * and `model` (its model range, a set; `isEmpty` = independent of any model). `in` on a set = any of the values is held.
 */
export const DATASET_FILTER_SPECS = {
  status: { ops: ['in', 'notIn'], multiple: true, cell: 'scalar', values: 'enum', allowed: DATASET_STATUSES },
  tag: { ops: ['in', 'notIn', 'isEmpty', 'isNotEmpty'], multiple: true, cell: 'many', values: 'enum', allowed: SCENARIO_TAGS },
  model: { ops: ['in', 'notIn', 'isEmpty', 'isNotEmpty'], multiple: true, cell: 'many', values: 'uuid' },
} as const satisfies Record<string, CatalogFilterFieldSpec>;

export const DATASET_SORT_IDS = ['updatedAt', 'name', 'status', 'createdAt', 'revisionCount'] as const;
export const DATASETS_PARAM_KEYS = ['q', 'page', 'pageSize', 'sorting', 'filters'] as const;
export const DATASET_DETAIL_PARAM_KEYS = ['datasetId'] as const;

export type DatasetsParse = { ok: true; value: ListQuery } | Fail;
export function parseDatasetsParams(params: Record<string, unknown>): DatasetsParse {
  return parseListParams(params, DATASET_SORT_IDS, DATASET_FILTER_SPECS, { id: 'updatedAt', desc: true });
}

export function parseDatasetDetailParams(params: Record<string, unknown>): { ok: true; value: string } | Fail {
  const v = params.datasetId;
  return typeof v === 'string' && UUID.test(v) ? { ok: true, value: v.toLowerCase() } : fail('datasetId must be a uuid string');
}
