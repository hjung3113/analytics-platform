import { describe, expect, it } from 'vitest';

import {
  type CoverageCatalogInput,
  type CoverageRule,
  type CoverageSpecInput,
  type RuleSupport,
  computeCoverage,
  sortRequirements,
  stateOf,
} from '../domain/coverage.js';

const PIN = { revisionId: 'rev-1', changeSetDigest: 'a'.repeat(64) };
const spec = (...keys: string[]): CoverageSpecInput => ({ state: 'ok', specPin: PIN, keys });
const rev = (ruleSetKey: string, revision = '1') => ({ ruleSetKey, revision, resultRef: revision, revisionDigest: 'd'.repeat(64) });
const rule = (ruleKey: string, support: RuleSupport, requirementIds: string[], ruleSetKey = 'RS', revision = '1'): CoverageRule => ({
  ruleSetKey,
  revision,
  ruleKey,
  support,
  requirementIds,
});
const catalog = (rules: CoverageRule[], revisions = [rev('RS')]): CoverageCatalogInput => ({ received: true, revisions, rules });
const stateMap = (r: ReturnType<typeof computeCoverage>) => {
  if (!r.computable) throw new Error(`not computable: ${r.reason}`);
  return Object.fromEntries(r.requirements.map((x) => [x.key, x.state]));
};

describe('stateOf precedence', () => {
  it.each<[RuleSupport[], string]>([
    [[], 'no_rule'],
    [['supported'], 'covered'],
    [['unsupported', 'supported', 'unknown'], 'covered'],
    [['partial'], 'partial'],
    [['partial', 'partial'], 'partial'],
    [['unsupported', 'partial'], 'partial'],
    [['unknown', 'partial'], 'partial'],
    [['unsupported'], 'unsupported'],
    [['unsupported', 'unsupported'], 'unsupported'],
    [['unknown'], 'unknown'],
    [['unsupported', 'unknown'], 'unknown'],
  ])('%j -> %s', (supports, expected) => {
    expect(stateOf(supports)).toBe(expected);
  });
});

describe('computeCoverage', () => {
  it('matches exact strings only: case, trailing space, prefix and module-vs-event never match', () => {
    const result = computeCoverage(
      spec('m', 'm/e', 'M/E', 'x'),
      catalog([rule('r1', 'supported', ['m/e', 'M', 'm ', 'm/', '/e', 'x/y', 'unknown-id'])]),
    );
    expect(stateMap(result)).toEqual({ m: 'no_rule', 'm/e': 'covered', 'M/E': 'no_rule', x: 'no_rule' });
  });

  it('a module key is covered only by an id equal to that key, not by an event of it', () => {
    const result = computeCoverage(spec('m', 'm/e'), catalog([rule('r1', 'supported', ['m/e'])]));
    expect(stateMap(result)).toEqual({ m: 'no_rule', 'm/e': 'covered' });
  });

  it('lists declaring Rules sorted, counting a rule once even when two targets name the same id', () => {
    const result = computeCoverage(
      spec('k'),
      catalog([rule('b', 'partial', ['k', 'k']), rule('a', 'unknown', ['k']), rule('a', 'partial', ['k'], 'AA')]),
    );
    if (!result.computable) throw new Error('x');
    expect(result.requirements[0]?.declaredBy.map((d) => `${d.ruleSetKey}/${d.ruleKey}`)).toEqual(['AA/a', 'RS/a', 'RS/b']);
    expect(result.counts).toEqual({ no_rule: 0, unsupported: 0, unknown: 0, partial: 1, covered: 0, total: 1 });
  });

  it.each([
    [{ state: 'model_unknown', specPin: null }, 'model_unknown'],
    [{ state: 'no_spec', specPin: null }, 'no_spec'],
  ] as const)('spec %j is not computable (%s)', (input, reason) => {
    const result = computeCoverage(input, catalog([rule('r', 'supported', ['k'])]));
    expect(result).toEqual({ computable: false, reason, specPin: null });
  });

  it('ambiguous_key is surfaced with the keys', () => {
    const result = computeCoverage({ state: 'ambiguous_key', specPin: PIN, ambiguousKeys: ['a/b/c'] }, catalog([rule('r', 'supported', ['k'])]));
    expect(result).toEqual({ computable: false, reason: 'ambiguous_key', specPin: PIN, ambiguousKeys: ['a/b/c'] });
  });

  it('no_catalog: never received, never 0%', () => {
    const result = computeCoverage(spec('k'), { received: false, revisions: [], rules: [] });
    expect(result).toEqual({ computable: false, reason: 'no_catalog', specPin: PIN });
  });

  it('no_requirement_ids: rules exist but none declares an id, never all no_rule', () => {
    const result = computeCoverage(spec('k'), catalog([rule('r', 'supported', [])]));
    expect(result).toEqual({ computable: false, reason: 'no_requirement_ids', specPin: PIN });
  });

  it('an id that matches no key still makes the catalog computable (all no_rule is then a real answer)', () => {
    const result = computeCoverage(spec('k'), catalog([rule('r', 'supported', ['other'])]));
    expect(stateMap(result)).toEqual({ k: 'no_rule' });
  });

  it('an empty effective spec is computable with zero requirements', () => {
    const result = computeCoverage(spec(), catalog([rule('r', 'supported', ['other'])]));
    expect(result.computable && result.counts.total).toBe(0);
  });
});

describe('coverageDigest', () => {
  const base = () => computeCoverage(spec('a', 'b'), catalog([rule('r1', 'supported', ['a']), rule('r2', 'partial', ['b'])]));
  const digestOf = (r: ReturnType<typeof computeCoverage>) => (r.computable ? r.coverageDigest : '');

  it('is a 64-hex SHA-256 and stable', () => {
    expect(digestOf(base())).toMatch(/^[0-9a-f]{64}$/);
    expect(digestOf(base())).toBe(digestOf(base()));
  });

  it('does not depend on input order', () => {
    const shuffled = computeCoverage(
      spec('b', 'a'),
      catalog([rule('r2', 'partial', ['b']), rule('r1', 'supported', ['a'])], [rev('RS')]),
    );
    expect(digestOf(shuffled)).toBe(digestOf(base()));
  });

  it.each<[string, () => ReturnType<typeof computeCoverage>]>([
    ['a state change', () => computeCoverage(spec('a', 'b'), catalog([rule('r1', 'unsupported', ['a']), rule('r2', 'partial', ['b'])]))],
    ['a different declaring rule', () => computeCoverage(spec('a', 'b'), catalog([rule('r9', 'supported', ['a']), rule('r2', 'partial', ['b'])]))],
    ['a spec pin change', () => computeCoverage({ state: 'ok', specPin: { ...PIN, revisionId: 'rev-2' }, keys: ['a', 'b'] }, catalog([rule('r1', 'supported', ['a']), rule('r2', 'partial', ['b'])]))],
    ['a spec pin change digest', () => computeCoverage({ state: 'ok', specPin: { ...PIN, changeSetDigest: 'b'.repeat(64) }, keys: ['a', 'b'] }, catalog([rule('r1', 'supported', ['a']), rule('r2', 'partial', ['b'])]))],
    ['a revision digest change', () => computeCoverage(spec('a', 'b'), catalog([rule('r1', 'supported', ['a']), rule('r2', 'partial', ['b'])], [{ ...rev('RS'), revisionDigest: 'e'.repeat(64) }]))],
    ['an extra current revision', () => computeCoverage(spec('a', 'b'), catalog([rule('r1', 'supported', ['a']), rule('r2', 'partial', ['b'])], [rev('RS'), rev('OTHER')]))],
    ['an extra requirement key', () => computeCoverage(spec('a', 'b', 'c'), catalog([rule('r1', 'supported', ['a']), rule('r2', 'partial', ['b'])]))],
  ])('changes with %s', (_label, make) => {
    expect(digestOf(make())).not.toBe(digestOf(base()));
  });

  it('a "/" inside a rule or set key cannot blur two different rules into one digest', () => {
    // Both flatten to "x/y/1/c"; the Revision list is identical, so only the declaring-rule encoding can differ.
    const revs = [rev('x'), rev('x/y')];
    const one = computeCoverage(spec('a'), catalog([rule('c', 'supported', ['a'], 'x/y')], revs));
    const two = computeCoverage(spec('a'), catalog([{ ...rule('1/c', 'supported', ['a'], 'x'), revision: 'y' }], revs));
    expect(digestOf(one)).not.toBe(digestOf(two));
  });

  it('does not depend on the order of several declaring rules or several revisions', () => {
    const rules = [rule('r1', 'supported', ['a'], 'RS'), rule('r2', 'partial', ['a'], 'RS'), rule('r3', 'unknown', ['a'], 'OTHER', '2')];
    const revs = [rev('RS'), rev('OTHER', '2'), rev('THIRD')];
    const fwd = computeCoverage(spec('a'), catalog(rules, revs));
    const rev_ = computeCoverage(spec('a'), catalog([...rules].reverse(), [...revs].reverse()));
    expect(digestOf(fwd)).toBe(digestOf(rev_));
  });
});

describe('sortRequirements', () => {
  it('puts no_rule first, covered last, ties by key', () => {
    const rows = sortRequirements([
      { key: 'b', state: 'covered' as const },
      { key: 'z', state: 'no_rule' as const },
      { key: 'a', state: 'no_rule' as const },
      { key: 'c', state: 'partial' as const },
      { key: 'd', state: 'unsupported' as const },
    ]);
    expect(rows.map((r) => r.key)).toEqual(['a', 'z', 'd', 'c', 'b']);
  });
});
