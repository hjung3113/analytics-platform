// Verdict of one attempt (design §3 `execution_attempt`, ADR-0117 decision 6). Pure. The server computes it from the
// rule results; the worker's own summary is stored for reference and never read here. There is no input for an AI
// opinion: nothing but rule results and the manifest comparison reaches the verdict.
//   fail        any result is FAIL
//   incomplete  a required rule is ERROR / NOT_CHECKED / SKIPPED, or the worker's manifest digest differs from the request's
//   pass        otherwise (WARN, NOT_APPLICABLE and a non-required ERROR/NOT_CHECKED/SKIPPED do not block)

import type { Verdict } from './request-states.js';

export const RULE_RESULTS = ['PASS', 'FAIL', 'WARN', 'NOT_CHECKED', 'SKIPPED', 'NOT_APPLICABLE', 'ERROR'] as const;
export type RuleResultValue = (typeof RULE_RESULTS)[number];

const INCOMPLETE_WHEN_REQUIRED: readonly RuleResultValue[] = ['ERROR', 'NOT_CHECKED', 'SKIPPED'];

export function computeVerdict(
  results: readonly { result: RuleResultValue; required: boolean }[],
  manifestMatches: boolean,
): Verdict {
  if (results.some((r) => r.result === 'FAIL')) return 'fail';
  if (!manifestMatches) return 'incomplete';
  if (results.some((r) => r.required && INCOMPLETE_WHEN_REQUIRED.includes(r.result))) return 'incomplete';
  return 'pass';
}
