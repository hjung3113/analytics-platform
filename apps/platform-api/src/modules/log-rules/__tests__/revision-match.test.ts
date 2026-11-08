import { describe, expect, it } from 'vitest';

import { matchRevisionRef } from '../domain/revision-match.js';

const rev = (id: string, revision: string, resultRef = revision) => ({ id, revision, resultRef });
const group = (ruleSetKey: string, revisions: ReturnType<typeof rev>[], currentId: string | null = null) => ({
  ruleSetKey,
  revisions,
  current: currentId ? { id: currentId } : null,
});

describe('matchRevisionRef (design log-rules §2 ②③)', () => {
  it('matches the revision string, or the resultRef, of exactly one Revision', () => {
    const groups = [group('RS-A', [rev('1', 'v1'), rev('2', 'v2', 'ref-2')], '2'), group('RS-B', [rev('3', 'x')])];
    expect(matchRevisionRef(groups, 'v1')).toMatchObject({ state: 'matched', group: { ruleSetKey: 'RS-A' }, revision: { id: '1' } });
    expect(matchRevisionRef(groups, 'ref-2')).toMatchObject({ state: 'matched', revision: { id: '2' } });
  });

  it('counts a Revision whose revision and resultRef both equal the string once', () => {
    expect(matchRevisionRef([group('RS-A', [rev('1', 'same', 'same')])], 'same').state).toBe('matched');
  });

  it('is ambiguous when two RuleSets, or two Revisions of one RuleSet, carry the string', () => {
    expect(matchRevisionRef([group('RS-A', [rev('1', 'v1')]), group('RS-B', [rev('2', 'v1')])], 'v1')).toEqual({ state: 'ambiguous', count: 2 });
    expect(matchRevisionRef([group('RS-A', [rev('1', 'v1'), rev('2', 'other', 'v1')])], 'v1')).toEqual({ state: 'ambiguous', count: 2 });
  });

  it('a ruleSetKey narrows the search, so a string shared across RuleSets resolves inside one', () => {
    const groups = [group('RS-A', [rev('1', 'v1')]), group('RS-B', [rev('2', 'v1')])];
    expect(matchRevisionRef(groups, 'v1', 'RS-B')).toMatchObject({ state: 'matched', revision: { id: '2' } });
  });

  it.each(['V1', ' v1', 'v1 ', 'v', ''])('compares exactly: %j is unknown', (ref) => {
    expect(matchRevisionRef([group('RS-A', [rev('1', 'v1')])], ref)).toEqual({ state: 'unknown' });
  });
});
