// The comparison of one suite run item with its approved baseline (design log-test-datasets §3.6) — pure, computed at read time, never stored.
// Inputs: the baseline's `expected_scope` and `expectations` (as pinned by the run item) and the rule results of the latest `succeeded`
// attempt of the item's request. Output: a classification per rule, per-classification counts and the coverage of the expected scope.
// Hard rules: `not_comparable` NEVER counts as PASS; nothing here reads or returns log text (rule ids, names and counts only); nothing
// changes a baseline, a result or a classification (review labels are shown beside, never folded in).

export const CLASSIFICATIONS = ['unchanged', 'regressed', 'fixed', 'new', 'not_comparable', 'missing'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const EXPECTED_VALUES = ['PASS', 'FAIL', 'WARN', 'NOT_APPLICABLE', 'EXPECTED_UNSUPPORTED'] as const;
export type Expected = (typeof EXPECTED_VALUES)[number];

export const OBSERVED_VALUES = ['PASS', 'FAIL', 'WARN', 'NOT_CHECKED', 'SKIPPED', 'NOT_APPLICABLE', 'ERROR'] as const;
export type Observed = (typeof OBSERVED_VALUES)[number];

/**
 * The classification table, cell by cell. `expected` null = the baseline has no expectation for the rule; `observed` null = the attempt has no
 * result for it. A rule with neither is never classified.
 *
 * - expected PASS: PASS unchanged; WARN/FAIL/ERROR regressed (design table); NOT_CHECKED/SKIPPED/NOT_APPLICABLE not_comparable.
 * - expected FAIL / WARN (a known defect or warning): equal unchanged; a better evaluated result fixed (PASS for both; WARN for a FAIL); a worse
 *   evaluated result regressed (FAIL for a WARN); NOT_CHECKED/SKIPPED/ERROR/NOT_APPLICABLE not_comparable (the expected check did not happen).
 * - expected NOT_APPLICABLE: NOT_APPLICABLE/NOT_CHECKED/SKIPPED unchanged (no check expected, none made); any evaluated or ERROR result new.
 * - expected EXPECTED_UNSUPPORTED: NOT_CHECKED/SKIPPED unchanged (the design's explicit cell); PASS/FAIL/WARN/NOT_APPLICABLE new (the engine now
 *   reports what the baseline said it could not); ERROR not_comparable.
 * - no expectation: any result is new (an unexpected rule, including an unexpected FAIL).
 * - expectation but no result at all: missing, whatever was expected (an unsupported rule is also reported, never silently equal).
 */
const SEVERITY: Partial<Record<Observed, number>> = { PASS: 0, WARN: 1, FAIL: 2 };

export function classifyRule(expected: Expected | null, observed: Observed | null): Classification | null {
  if (expected === null) return observed === null ? null : 'new';
  if (observed === null) return 'missing';
  switch (expected) {
    case 'NOT_APPLICABLE':
      return observed === 'NOT_APPLICABLE' || observed === 'NOT_CHECKED' || observed === 'SKIPPED' ? 'unchanged' : 'new';
    case 'EXPECTED_UNSUPPORTED':
      if (observed === 'NOT_CHECKED' || observed === 'SKIPPED') return 'unchanged';
      return observed === 'ERROR' ? 'not_comparable' : 'new';
    case 'PASS':
      if (observed === 'PASS') return 'unchanged';
      if (observed === 'WARN' || observed === 'FAIL' || observed === 'ERROR') return 'regressed';
      return 'not_comparable';
    default: {
      // expected FAIL or WARN
      const want = SEVERITY[expected] as number;
      const got = SEVERITY[observed];
      if (got === undefined) return 'not_comparable';
      if (got === want) return 'unchanged';
      return got < want ? 'fixed' : 'regressed';
    }
  }
}

export interface ExpectationIn {
  ruleId: string;
  expected: Expected;
}
export interface ObservedIn {
  ruleId: string;
  result: Observed;
  required: boolean;
}

export interface RuleComparison {
  ruleId: string;
  classification: Classification;
  expected: Expected | null;
  observed: Observed | null;
  /** The observed result's `required` flag; `null` when the rule has no result (unknown). */
  required: boolean | null;
}

/** A rule that appears more than once keeps its LEAST favourable result, so a duplicate can never hide a problem behind a PASS. */
const BADNESS: Record<Observed, number> = { FAIL: 6, ERROR: 5, WARN: 4, NOT_CHECKED: 3, SKIPPED: 2, NOT_APPLICABLE: 1, PASS: 0 };

export function collapseObserved(results: readonly ObservedIn[]): { rules: Map<string, ObservedIn>; duplicates: number } {
  const rules = new Map<string, ObservedIn>();
  let duplicates = 0;
  for (const r of results) {
    const seen = rules.get(r.ruleId);
    if (!seen) rules.set(r.ruleId, r);
    else {
      duplicates += 1;
      // `required` is kept if either copy was required.
      const worse = BADNESS[r.result] > BADNESS[seen.result] ? r : seen;
      rules.set(r.ruleId, { ...worse, required: seen.required || r.required });
    }
  }
  return { rules, duplicates };
}

function dedupeFirst<T extends { ruleId: string }>(list: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const x of list) if (!out.has(x.ruleId)) out.set(x.ruleId, x);
  return out;
}

/** Classifies every rule that has an expectation or a result, ordered by rule id. */
export function compareRules(expectations: readonly ExpectationIn[], results: readonly ObservedIn[]): RuleComparison[] {
  const expectedByRule = dedupeFirst(expectations);
  const { rules: observedByRule } = collapseObserved(results);
  const ids = [...new Set([...expectedByRule.keys(), ...observedByRule.keys()])].sort();
  const out: RuleComparison[] = [];
  for (const ruleId of ids) {
    const expected = expectedByRule.get(ruleId)?.expected ?? null;
    const observed = observedByRule.get(ruleId) ?? null;
    const classification = classifyRule(expected, observed?.result ?? null);
    if (classification) out.push({ ruleId, classification, expected, observed: observed?.result ?? null, required: observed?.required ?? null });
  }
  return out;
}

export type ClassificationCounts = Record<Classification, number>;

export function countClassifications(rules: readonly { classification: Classification }[]): ClassificationCounts {
  const counts = Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as ClassificationCounts;
  for (const r of rules) counts[r.classification] += 1;
  return counts;
}

// ---- coverage ------------------------------------------------------------------------------------------------------------------

/** A scope rule counts as EXECUTED when the engine produced a verdict-like result for it; NOT_CHECKED, SKIPPED, ERROR and no result do not. */
const EXECUTED: readonly Observed[] = ['PASS', 'FAIL', 'WARN', 'NOT_APPLICABLE'];
export const NOT_EXECUTED_REASONS = ['missing', 'not_checked', 'skipped', 'error'] as const;
export type NotExecutedReason = (typeof NOT_EXECUTED_REASONS)[number];

export interface NotExecutedRule {
  ruleId: string;
  reason: NotExecutedReason;
  /** The observed result's flag; `null` for a rule with no result (a missing rule's flag is unknown). */
  required: boolean | null;
}

export interface Coverage {
  scopeCount: number;
  executedCount: number;
  notExecutedCount: number;
  /** executed / scope, or `null` for an empty scope (no ratio is invented). */
  ratio: number | null;
  executed: string[];
  /** Required gaps first, then gaps of unknown requiredness, then non-required ones; each group by rule id. */
  notExecuted: NotExecutedRule[];
  requiredGapCount: number;
  /** Rules that ran although the baseline's scope did not name them. */
  outsideScope: string[];
}

const REASON_OF: Partial<Record<Observed, NotExecutedReason>> = { NOT_CHECKED: 'not_checked', SKIPPED: 'skipped', ERROR: 'error' };

export function computeCoverage(expectedScope: readonly string[], results: readonly ObservedIn[]): Coverage {
  const scope = [...new Set(expectedScope)].sort();
  const { rules: observed } = collapseObserved(results);
  const executed: string[] = [];
  const notExecuted: NotExecutedRule[] = [];
  for (const ruleId of scope) {
    const got = observed.get(ruleId);
    if (got && EXECUTED.includes(got.result)) executed.push(ruleId);
    else notExecuted.push({ ruleId, reason: (got && REASON_OF[got.result]) || 'missing', required: got ? got.required : null });
  }
  const rank = (r: NotExecutedRule) => (r.required === true ? 0 : r.required === null ? 1 : 2);
  notExecuted.sort((a, b) => rank(a) - rank(b) || (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
  const inScope = new Set(scope);
  return {
    scopeCount: scope.length,
    executedCount: executed.length,
    notExecutedCount: notExecuted.length,
    ratio: scope.length === 0 ? null : executed.length / scope.length,
    executed,
    notExecuted,
    requiredGapCount: notExecuted.filter((r) => r.required === true).length,
    outsideScope: [...observed.values()].filter((r) => !inScope.has(r.ruleId) && EXECUTED.includes(r.result)).map((r) => r.ruleId).sort(),
  };
}

// ---- rerun diff ------------------------------------------------------------------------------------------------------------------

/** How one rule moved between two runs of the same revision (the classification is each run's own against the same baseline). */
export const DIFF_KINDS = ['same', 'improved', 'worsened', 'changed', 'appeared', 'disappeared'] as const;
export type DiffKind = (typeof DIFF_KINDS)[number];

/** Lower = better; `not_comparable` and `missing` rank worst so a rule that stopped being checked is never an improvement. */
const CLASS_RANK: Record<Classification, number> = { fixed: 0, unchanged: 0, new: 1, regressed: 2, not_comparable: 3, missing: 3 };

export interface RuleDiff {
  ruleId: string;
  kind: DiffKind;
  from: { classification: Classification; observed: Observed | null } | null;
  to: { classification: Classification; observed: Observed | null } | null;
}

export function diffRuns(from: readonly RuleComparison[], to: readonly RuleComparison[]): RuleDiff[] {
  const a = new Map(from.map((r) => [r.ruleId, r]));
  const b = new Map(to.map((r) => [r.ruleId, r]));
  const out: RuleDiff[] = [];
  for (const ruleId of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const x = a.get(ruleId);
    const y = b.get(ruleId);
    const side = (r: RuleComparison | undefined) => (r ? { classification: r.classification, observed: r.observed } : null);
    let kind: DiffKind;
    if (!x) kind = 'appeared';
    else if (!y) kind = 'disappeared';
    else if (x.classification === y.classification && x.observed === y.observed) kind = 'same';
    else if (CLASS_RANK[y.classification] > CLASS_RANK[x.classification]) kind = 'worsened';
    else if (CLASS_RANK[y.classification] < CLASS_RANK[x.classification]) kind = 'improved';
    else kind = 'changed';
    out.push({ ruleId, kind, from: side(x), to: side(y) });
  }
  return out;
}

export type DiffCounts = Record<DiffKind, number>;
export function countDiffs(diffs: readonly { kind: DiffKind }[]): DiffCounts {
  const counts = Object.fromEntries(DIFF_KINDS.map((k) => [k, 0])) as DiffCounts;
  for (const d of diffs) counts[d.kind] += 1;
  return counts;
}
