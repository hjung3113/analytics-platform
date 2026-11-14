import { describe, expect, it } from 'vitest';

import {
  type Classification,
  type Expected,
  type Observed,
  classifyRule,
  compareRules,
  computeCoverage,
  countClassifications,
  countDiffs,
  diffRuns,
} from '../domain/comparison.js';
import { filterRules, pageOf, sortRules, type RuleRow } from '../domain/comparison-page.js';
import { parseComparisonParams, parseRerunDiffParams } from '../domain/comparison-params.js';
import { parseReviewLabelInput } from '../domain/review-label-input.js';

const U = 'unchanged', R = 'regressed', F = 'fixed', N = 'new', C = 'not_comparable', M = 'missing';
type Row = Classification | null;

// Every cell of the classification table (design §3.6): rows = expected (null = no expectation), columns = observed.
const OBSERVED: (Observed | null)[] = ['PASS', 'FAIL', 'WARN', 'NOT_CHECKED', 'SKIPPED', 'NOT_APPLICABLE', 'ERROR', null];
const TABLE: [Expected | null, Row[]][] = [
  //                 PASS FAIL WARN NOT_CHECKED SKIPPED NOT_APPLICABLE ERROR (no result)
  ['PASS',           [U,   R,   R,   C,          C,      C,             R,    M]],
  ['FAIL',           [F,   U,   F,   C,          C,      C,             C,    M]],
  ['WARN',           [F,   R,   U,   C,          C,      C,             C,    M]],
  ['NOT_APPLICABLE', [N,   N,   N,   U,          U,      U,             N,    M]],
  ['EXPECTED_UNSUPPORTED', [N, N,  N,   U,          U,      N,             C,    M]],
  [null,             [N,   N,   N,   N,          N,      N,             N,    null]],
];

describe('classifyRule — every cell of the classification table', () => {
  const cells = TABLE.flatMap(([expected, row]) => OBSERVED.map((observed, i) => [expected, observed, row[i]] as const));
  it('covers 6 expectation rows x 8 observed columns', () => expect(cells).toHaveLength(48));
  it.each(cells)('expected %s, observed %s -> %s', (expected, observed, want) => {
    expect(classifyRule(expected, observed)).toBe(want);
  });

  it('never classifies a not-checked / skipped / error result against an expected check as PASS-like (unchanged or fixed)', () => {
    for (const expected of ['PASS', 'FAIL', 'WARN'] as const) {
      for (const observed of ['NOT_CHECKED', 'SKIPPED', 'NOT_APPLICABLE', 'ERROR'] as const) {
        expect(['unchanged', 'fixed']).not.toContain(classifyRule(expected, observed));
      }
    }
  });

  it('treats EXPECTED_UNSUPPORTED against NOT_CHECKED / SKIPPED as unchanged (the design cell)', () => {
    expect(classifyRule('EXPECTED_UNSUPPORTED', 'NOT_CHECKED')).toBe('unchanged');
    expect(classifyRule('EXPECTED_UNSUPPORTED', 'SKIPPED')).toBe('unchanged');
  });
});

describe('compareRules', () => {
  it('classifies the union of expected and observed rules, ordered by rule id, and skips a rule with neither', () => {
    const out = compareRules(
      [{ ruleId: 'B', expected: 'PASS' }, { ruleId: 'A', expected: 'FAIL' }, { ruleId: 'D', expected: 'PASS' }],
      [{ ruleId: 'A', result: 'PASS', required: true }, { ruleId: 'B', result: 'NOT_CHECKED', required: true }, { ruleId: 'C', result: 'FAIL', required: false }],
    );
    expect(out.map((r) => [r.ruleId, r.classification])).toEqual([['A', F], ['B', C], ['C', N], ['D', M]]);
    expect(out.find((r) => r.ruleId === 'D')).toMatchObject({ observed: null, required: null });
    expect(countClassifications(out)).toEqual({ unchanged: 0, regressed: 0, fixed: 1, new: 1, not_comparable: 1, missing: 1 });
  });

  it('collapses duplicate results to the least favourable one, so a duplicate PASS cannot hide a FAIL', () => {
    const out = compareRules([{ ruleId: 'A', expected: 'PASS' }], [{ ruleId: 'A', result: 'PASS', required: false }, { ruleId: 'A', result: 'FAIL', required: true }, { ruleId: 'A', result: 'PASS', required: false }]);
    expect(out).toEqual([{ ruleId: 'A', classification: 'regressed', expected: 'PASS', observed: 'FAIL', required: true }]);
  });

  it('keeps the first of duplicate expectations', () => {
    const out = compareRules([{ ruleId: 'A', expected: 'PASS' }, { ruleId: 'A', expected: 'FAIL' }], [{ ruleId: 'A', result: 'PASS', required: true }]);
    expect(out[0]).toMatchObject({ classification: 'unchanged', expected: 'PASS' });
  });

  it('is empty for no expectations and no results', () => expect(compareRules([], [])).toEqual([]));
});

describe('computeCoverage', () => {
  const res = (ruleId: string, result: Observed, required = true) => ({ ruleId, result, required });

  it('counts executed (PASS/FAIL/WARN/NOT_APPLICABLE) against the scope and lists the rest with the reason', () => {
    const c = computeCoverage(['A', 'B', 'C', 'D', 'E'], [res('A', 'PASS'), res('B', 'NOT_APPLICABLE'), res('C', 'NOT_CHECKED'), res('D', 'ERROR'), res('X', 'FAIL')]);
    expect(c).toMatchObject({ scopeCount: 5, executedCount: 2, notExecutedCount: 3, ratio: 0.4, executed: ['A', 'B'], outsideScope: ['X'] });
    expect(c.notExecuted.map((r) => [r.ruleId, r.reason])).toEqual([['C', 'not_checked'], ['D', 'error'], ['E', 'missing']].map(([a, b]) => [a, b]).sort());
  });

  it('puts required gaps first, then unknown (missing) ones, then non-required, each by rule id', () => {
    const c = computeCoverage(['A', 'B', 'C', 'D', 'E'], [res('A', 'SKIPPED', false), res('B', 'NOT_CHECKED', true), res('C', 'ERROR', false), res('E', 'SKIPPED', true)]);
    expect(c.notExecuted.map((r) => [r.ruleId, r.required])).toEqual([['B', true], ['E', true], ['D', null], ['A', false], ['C', false]]);
    expect(c.requiredGapCount).toBe(2);
  });

  it('has no ratio for an empty scope, and lists everything that ran as outside the scope', () => {
    const c = computeCoverage([], [res('A', 'PASS'), res('B', 'NOT_CHECKED')]);
    expect(c).toMatchObject({ scopeCount: 0, executedCount: 0, notExecutedCount: 0, ratio: null, outsideScope: ['A'] });
  });

  it('counts a scope rule once however often it is named, and a not-checked result outside the scope is not "outside"', () => {
    const c = computeCoverage(['A', 'A'], [res('A', 'PASS'), res('A', 'PASS')]);
    expect(c).toMatchObject({ scopeCount: 1, executedCount: 1, ratio: 1 });
  });

  it('a duplicate that includes a failure to run keeps the rule not executed, with the required flag of either copy', () => {
    const c = computeCoverage(['A'], [res('A', 'PASS', false), res('A', 'NOT_CHECKED', true)]);
    expect(c.executedCount).toBe(0);
    expect(c.notExecuted).toEqual([{ ruleId: 'A', reason: 'not_checked', required: true }]);
  });

  it('a scope with no results at all is entirely missing', () => {
    const c = computeCoverage(['B', 'A'], []);
    expect(c).toMatchObject({ executedCount: 0, notExecutedCount: 2, ratio: 0, requiredGapCount: 0 });
    expect(c.notExecuted.map((r) => [r.ruleId, r.reason, r.required])).toEqual([['A', 'missing', null], ['B', 'missing', null]]);
  });
});

describe('diffRuns', () => {
  const rc = (ruleId: string, classification: Classification, observed: Observed | null = 'PASS') => ({ ruleId, classification, expected: 'PASS' as const, observed, required: true });

  it('names how each rule moved between two runs of the same revision', () => {
    const diffs = diffRuns(
      [rc('A', 'unchanged'), rc('B', 'unchanged'), rc('C', 'regressed', 'FAIL'), rc('D', 'unchanged'), rc('E', 'not_comparable', 'SKIPPED'), rc('G', 'new', 'WARN')],
      [rc('A', 'unchanged'), rc('B', 'regressed', 'FAIL'), rc('C', 'unchanged'), rc('F', 'new', 'FAIL'), rc('E', 'missing', null), rc('G', 'regressed', 'FAIL')],
    );
    expect(diffs.map((d) => [d.ruleId, d.kind])).toEqual([['A', 'same'], ['B', 'worsened'], ['C', 'improved'], ['D', 'disappeared'], ['E', 'changed'], ['F', 'appeared'], ['G', 'worsened']]);
    expect(countDiffs(diffs)).toEqual({ same: 1, improved: 1, worsened: 2, changed: 1, appeared: 1, disappeared: 1 });
  });

  it('a rule that stopped being checked is never an improvement', () => {
    expect(diffRuns([rc('A', 'regressed', 'FAIL')], [rc('A', 'not_comparable', 'NOT_CHECKED')])[0]?.kind).toBe('worsened');
  });

  it('the same classification with another observed result is a change', () => {
    expect(diffRuns([rc('A', 'unchanged', 'PASS')], [rc('A', 'unchanged', 'WARN')])[0]?.kind).toBe('changed');
  });
});

describe('rule list paging', () => {
  const row = (ruleId: string, classification: Classification, over: Partial<RuleRow> = {}): RuleRow => ({ ordinal: 1, ruleId, classification, expected: 'PASS', observed: 'PASS', required: true, label: null, ...over });
  const rows = [row('a', 'unchanged'), row('b', 'regressed', { observed: 'FAIL', label: 'false_positive' }), row('c', 'missing', { observed: null, required: null }), row('d', 'not_comparable', { observed: 'SKIPPED', required: false }), row('e', 'new', { expected: null })];

  it('sorts by severity by default order: regressed, not_comparable, missing, new, fixed, unchanged; ties by rule id', () => {
    expect(sortRules(rows, [{ id: 'severity', desc: false }]).map((r) => r.ruleId)).toEqual(['b', 'd', 'c', 'e', 'a']);
    expect(sortRules(rows, [{ id: 'severity', desc: true }]).map((r) => r.ruleId)).toEqual(['a', 'e', 'c', 'd', 'b']);
    expect(sortRules(rows, [{ id: 'ruleId', desc: true }]).map((r) => r.ruleId)).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('filters by classification, observed, expected, label (none = unlabelled), required and a rule-id search', () => {
    const f = (conditions: Record<string, { op: 'in' | 'notIn'; values: string[] }>, q: string | null = null) => filterRules(rows, conditions as never, q).map((r) => r.ruleId);
    expect(f({ classification: { op: 'in', values: ['regressed', 'new'] } })).toEqual(['b', 'e']);
    expect(f({ classification: { op: 'notIn', values: ['unchanged'] } })).toEqual(['b', 'c', 'd', 'e']);
    expect(f({ observed: { op: 'in', values: ['none'] } })).toEqual(['c']);
    expect(f({ expected: { op: 'in', values: ['none'] } })).toEqual(['e']);
    expect(f({ label: { op: 'in', values: ['false_positive'] } })).toEqual(['b']);
    expect(f({ label: { op: 'in', values: ['none'] } })).toEqual(['a', 'c', 'd', 'e']);
    expect(f({ required: { op: 'in', values: ['false'] } })).toEqual(['d']);
    expect(f({ required: { op: 'notIn', values: ['true'] } })).toEqual(['c', 'd']);
    expect(f({}, 'B')).toEqual(['b']);
  });

  it('pages with a true total', () => {
    expect(pageOf(rows, 1, 2)).toMatchObject({ total: 5, rows: [rows[2], rows[3]] });
    expect(pageOf(rows, 9, 2)).toEqual({ total: 5, rows: [] });
  });
});

describe('param judgments', () => {
  const ID = '0b2d6d2e-6d3a-4a43-9d52-7a1d4c9f0c11';
  it('comparison: a uuid run id, an optional item ordinal, the common list params and the rule filters', () => {
    expect(parseComparisonParams({ suiteRunId: ID })).toMatchObject({ ok: true, value: { suiteRunId: ID, ordinal: null } });
    expect(parseComparisonParams({ suiteRunId: ID, ordinal: 3, pageSize: 20, filters: [{ id: 'classification', op: 'in', value: ['regressed'] }] })).toMatchObject({ ok: true, value: { ordinal: 3 } });
    for (const bad of [{}, { suiteRunId: 'x' }, { suiteRunId: ID, ordinal: 0 }, { suiteRunId: ID, ordinal: 21 }, { suiteRunId: ID, ordinal: 1.5 }, { suiteRunId: ID, filters: [{ id: 'classification', op: 'in', value: ['good'] }] }, { suiteRunId: ID, sorting: [{ id: 'nope', desc: false }] }]) {
      expect(parseComparisonParams(bad as never).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it('rerunDiff: two uuid run ids, optional distinct kinds, bounded page', () => {
    const OTHER = '1b2d6d2e-6d3a-4a43-9d52-7a1d4c9f0c11';
    expect(parseRerunDiffParams({ fromRunId: ID, toRunId: OTHER })).toMatchObject({ ok: true, value: { kinds: [], page: 0, pageSize: 50 } });
    expect(parseRerunDiffParams({ fromRunId: ID, toRunId: OTHER, kinds: ['worsened'], pageSize: 200 }).ok).toBe(true);
    for (const bad of [{ fromRunId: ID }, { fromRunId: ID, toRunId: 'x' }, { fromRunId: ID, toRunId: OTHER, kinds: ['bad'] }, { fromRunId: ID, toRunId: OTHER, kinds: ['same', 'same'] }, { fromRunId: ID, toRunId: OTHER, pageSize: 201 }, { fromRunId: ID, toRunId: OTHER, page: -1 }]) {
      expect(parseRerunDiffParams(bad as never).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('reviewLabelAdd input', () => {
  const ok = { ordinal: 1, suiteRunId: '0B2D6D2E-6D3A-4A43-9D52-7A1D4C9F0C11', ruleId: ' R-1 ', datasetRevisionId: '1b2d6d2e-6d3a-4a43-9d52-7a1d4c9f0c11', label: 'false_positive', reason: ' not a defect ' };
  it('normalises ids to lower case and trims text', () => {
    expect(parseReviewLabelInput(ok)).toMatchObject({ ok: true, value: { suiteRunId: '0b2d6d2e-6d3a-4a43-9d52-7a1d4c9f0c11', ruleId: 'R-1', reason: 'not a defect' } });
  });
  it.each([
    ['no ordinal', { ordinal: undefined }, 'ordinal:required'],
    ['a zero ordinal', { ordinal: 0 }, 'ordinal:malformed'],
    ['a negative ordinal', { ordinal: -1 }, 'ordinal:malformed'],
    ['a fractional ordinal', { ordinal: 1.5 }, 'ordinal:malformed'],
    ['a string ordinal', { ordinal: '2' }, 'ordinal:malformed'],
    ['a null ordinal', { ordinal: null }, 'ordinal:malformed'],
    ['no run', { suiteRunId: undefined }, 'suiteRunId:required'],
    ['a malformed revision', { datasetRevisionId: 'x' }, 'datasetRevisionId:malformed'],
    ['no rule', { ruleId: '  ' }, 'ruleId:required'],
    ['an overlong rule', { ruleId: 'r'.repeat(201) }, 'ruleId:too_long'],
    ['an unknown label', { label: 'accepted' }, 'label:malformed'],
    ['no label', { label: undefined }, 'label:required'],
    ['no reason', { reason: '' }, 'reason:required'],
    ['an overlong reason', { reason: 'x'.repeat(2001) }, 'reason:too_long'],
  ])('refuses %s', (_l, over, code) => {
    const out = parseReviewLabelInput({ ...ok, ...over });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.map((e) => `${e.path.join('.')}:${e.code}`)).toEqual([code]);
  });
});
