// Param judgments of the catalog reads (#1492 R-b). Every refusal is a message for the engine's params judgment
// (`error` outcome), never an empty page. Filter and sort keys are allow-lists; nothing from a param reaches SQL as an identifier.

import type { CatalogFilterFieldSpec } from '../../../lib/list-params/catalog-filters.js';
import { Q_MAX, parseListParams } from '../../../lib/list-params/list-params.js';
import type { ListQuery } from '../../../lib/list-params/types.js';
import { unsafeText } from '../../../lib/text-safety.js';

type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });

export const SUPPORTS = ['supported', 'partial', 'unsupported', 'unknown'] as const;
const SCALAR_OPS = ['in', 'notIn'] as const;
const PRESENCE_OPS = ['isEmpty', 'isNotEmpty'] as const;

/** Filter fields of `logRules.ruleSets` (ADR-0105): exact values of the RuleSet key and of the reporting source. */
export const RULE_SET_FILTER_SPECS = {
  ruleSetKey: { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'text', maxLength: 200 },
  sourceSystem: { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'text', maxLength: 200 },
} as const satisfies Record<string, CatalogFilterFieldSpec>;
export const RULE_SET_SORT_IDS = ['ruleSetKey', 'sourceSystem', 'revisionCount', 'ruleCount', 'reportedAt'] as const;
export const RULE_SET_PARAM_KEYS = ['q', 'page', 'pageSize', 'sorting', 'filters'] as const;

/**
 * Filter fields of `logRules.rules`. `scope` and `requirementIds` are presence filters (the Rule declares a scope /
 * declares at least one requirement id on a target); `isNotEmpty` = yes, `isEmpty` = no.
 */
export const RULE_FILTER_SPECS = {
  support: { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'enum', allowed: SUPPORTS },
  ruleSetKey: { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'text', maxLength: 200 },
  scope: { ops: PRESENCE_OPS, multiple: false, cell: 'scalar', values: 'text' },
  requirementIds: { ops: PRESENCE_OPS, multiple: false, cell: 'scalar', values: 'text' },
} as const satisfies Record<string, CatalogFilterFieldSpec>;
export const RULE_SORT_IDS = ['ruleSetKey', 'ruleKey', 'title', 'support', 'revision', 'targetCount', 'requirementIdCount'] as const;
export const RULE_PARAM_KEYS = ['q', 'targetQ', 'page', 'pageSize', 'sorting', 'filters'] as const;

export const RULE_SET_DETAIL_PARAM_KEYS = ['ruleSetKey'] as const;
export const RULE_DETAIL_PARAM_KEYS = ['ruleSetKey', 'ruleKey'] as const;
export const CATALOG_STATUS_PARAM_KEYS = [] as const;

export type RuleSetParse = { ok: true; value: ListQuery } | Fail;
export const parseRuleSetParams = (params: Record<string, unknown>): RuleSetParse =>
  parseListParams(params, RULE_SET_SORT_IDS, RULE_SET_FILTER_SPECS);

export interface RuleQuery extends ListQuery {
  /** Substring of any declared target text (case-insensitive, matched verbatim: the text is never parsed); null = no constraint. */
  targetQ: string | null;
}
export type RuleParse = { ok: true; value: RuleQuery } | Fail;
export function parseRuleParams(params: Record<string, unknown>): RuleParse {
  const targetQ = params.targetQ ?? null;
  if (targetQ !== null && (typeof targetQ !== 'string' || targetQ.length > Q_MAX || unsafeText(targetQ))) {
    return fail(`targetQ must be a string of at most ${Q_MAX} characters or null`);
  }
  const base = parseListParams(params, RULE_SORT_IDS, RULE_FILTER_SPECS);
  if (!base.ok) return base;
  return { ok: true, value: { ...base.value, targetQ: targetQ === null || targetQ.trim() === '' ? null : targetQ } };
}

const hasControl = (text: string): boolean => [...text].some((c) => {
  const code = c.codePointAt(0) as number;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
});

function parseKey(key: string, params: Record<string, unknown>): { ok: true; value: string } | Fail {
  const v = params[key];
  // Identifiers are compared exactly (design §2): no trimming. A value the report could never carry is refused, not "not found".
  if (typeof v !== 'string' || v === '' || v.length > 200 || v !== v.trim() || unsafeText(v) || hasControl(v)) {
    return fail(`${key} must be an identifier string of 1 to 200 characters`);
  }
  return { ok: true, value: v };
}
export const parseRuleSetDetailParams = (p: Record<string, unknown>) => parseKey('ruleSetKey', p);
export function parseRuleDetailParams(
  p: Record<string, unknown>,
): { ok: true; value: { ruleSetKey: string; ruleKey: string } } | Fail {
  const ruleSetKey = parseKey('ruleSetKey', p);
  if (!ruleSetKey.ok) return ruleSetKey;
  const ruleKey = parseKey('ruleKey', p);
  if (!ruleKey.ok) return ruleKey;
  return { ok: true, value: { ruleSetKey: ruleSetKey.value, ruleKey: ruleKey.value } };
}
export function parseCatalogStatusParams(_params: Record<string, unknown>): { ok: true } {
  return { ok: true };
}
