// The rule-id check of a baseline's `expectedScope` against the rule catalog (#1496 R-f, design log-test-datasets §3.3, log-rules §2).
// Only when the pinned `profilePin.ruleSetRevision` names exactly one RuleSet Revision of the current catalog is a rule id that
// Revision lacks refused. Whenever the Revision cannot be named (no pin, no catalog, unknown, ambiguous, no port wired) the ids are
// accepted unchecked: the absence of the catalog must never block dataset work. Approve does not re-check.

import type { Tx } from '../../db/tx.js';
import type { FieldError } from '../menu-dispatch/types.js';

/** What the check needs of `RuleCoveragePort.checkRuleKeys` (structural: this module never imports log-rules). */
export interface RuleKeyChecker {
  checkRuleKeys(
    tx: Tx,
    workspaceId: string,
    ref: string,
    ruleIds: readonly string[],
  ): Promise<{ state: 'checked'; missing: string[] } | { state: 'unresolved'; reason: 'ambiguous' | 'unknown' | 'no_catalog' }>;
}

/** Missing ids listed per request; beyond it one `unknown_rule_truncated` entry tells the list is cut. */
export const UNKNOWN_RULE_LIST_MAX = 10;

/**
 * Field errors for the scope ids the pinned Revision does not have: one `unknown_rule` per id at `['expectedScope', '<index>']`
 * (the index into the submitted list; at most 10), then `['expectedScope'] unknown_rule_truncated` when more are missing.
 */
export async function unknownScopeRules(
  checker: RuleKeyChecker | undefined,
  tx: Tx,
  workspaceId: string,
  ruleSetRevision: string | undefined,
  scope: readonly string[],
): Promise<FieldError[]> {
  if (!checker || ruleSetRevision === undefined || scope.length === 0) return [];
  const result = await checker.checkRuleKeys(tx, workspaceId, ruleSetRevision, scope);
  if (result.state !== 'checked' || result.missing.length === 0) return [];
  const missing = new Set(result.missing);
  const errors: FieldError[] = [];
  scope.forEach((id, index) => {
    if (missing.has(id) && errors.length < UNKNOWN_RULE_LIST_MAX) errors.push({ path: ['expectedScope', String(index)], code: 'unknown_rule' });
  });
  if (result.missing.length > UNKNOWN_RULE_LIST_MAX) errors.push({ path: ['expectedScope'], code: 'unknown_rule_truncated' });
  return errors;
}
