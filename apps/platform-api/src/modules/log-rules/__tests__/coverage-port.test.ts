// RuleCoveragePort key-less lookup and rule-id check (#1496 R-f), over a mocked catalog read and a scripted tx: the
// matching itself is `domain/revision-match.ts`; here the port's states are pinned.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadGroups = vi.fn();
vi.mock('../repositories/catalog-read.js', () => ({ loadGroups: (...a: unknown[]) => loadGroups(...a) }));

import { createRuleCoveragePort } from '../coverage-port.js';

const rev = (id: string, revision: string, extra: Record<string, unknown> = {}) => ({ id, revision, resultRef: revision, status: 'active', supersedes: null, ...extra });
const group = (ruleSetKey: string, revisions: ReturnType<typeof rev>[], currentId: string) => ({
  ruleSetKey,
  revisions,
  current: revisions.find((r) => r.id === currentId) ?? null,
});

/** A tx whose select().from().where() answers the scripted rows in call order. */
function scriptedTx(...answers: unknown[][]) {
  const queue = [...answers];
  const chain = { from: () => chain, where: () => Promise.resolve(queue.shift() ?? []) };
  return { select: () => chain } as never;
}
const port = createRuleCoveragePort({ knowledgeLookup: {} as never });
const WS = 'ws';

beforeEach(() => loadGroups.mockReset());

describe('RuleCoveragePort.findRuleSetRevision', () => {
  it('matched: the RuleSet, revision, status, isCurrent and the digest', async () => {
    loadGroups.mockResolvedValue([group('RS-A', [rev('1', 'v1', { status: 'retired' }), rev('2', 'v2')], '2')]);
    expect(await port.findRuleSetRevision(scriptedTx([{ revisionDigest: 'd1' }]), WS, 'v1')).toEqual({
      state: 'matched',
      ruleSetKey: 'RS-A',
      revision: 'v1',
      resultRef: 'v1',
      status: 'retired',
      isCurrent: false,
      revisionDigest: 'd1',
    });
  });

  it('ambiguous: the same string on two RuleSets is counted, not guessed', async () => {
    loadGroups.mockResolvedValue([group('RS-A', [rev('1', 'v1')], '1'), group('RS-B', [rev('2', 'v1')], '2')]);
    expect(await port.findRuleSetRevision(scriptedTx(), WS, 'v1')).toEqual({ state: 'ambiguous', count: 2 });
  });

  it('unknown: reports exist but no Revision carries the string', async () => {
    loadGroups.mockResolvedValue([group('RS-A', [rev('1', 'v1')], '1')]);
    expect(await port.findRuleSetRevision(scriptedTx(), WS, 'nope')).toEqual({ state: 'unknown' });
  });

  it('no_catalog: nothing received', async () => {
    loadGroups.mockResolvedValue([]);
    expect(await port.findRuleSetRevision(scriptedTx(), WS, 'v1')).toEqual({ state: 'no_catalog' });
  });
});

describe('RuleCoveragePort.checkRuleKeys', () => {
  it('checked: lists the asked ids the Revision has no rule_key for, in asked order', async () => {
    loadGroups.mockResolvedValue([group('RS-A', [rev('1', 'v1')], '1')]);
    const tx = scriptedTx([{ revisionDigest: 'd' }], [{ ruleKey: 'R-1' }, { ruleKey: 'R-3' }]);
    expect(await port.checkRuleKeys(tx, WS, 'v1', ['R-3', 'R-2', 'R-1', 'r-4'])).toEqual({ state: 'checked', missing: ['R-2', 'r-4'] });
  });

  it('checked with nothing missing, and an empty id list needs no rule read', async () => {
    loadGroups.mockResolvedValue([group('RS-A', [rev('1', 'v1')], '1')]);
    expect(await port.checkRuleKeys(scriptedTx([{ revisionDigest: 'd' }], [{ ruleKey: 'R-1' }]), WS, 'v1', ['R-1'])).toEqual({ state: 'checked', missing: [] });
    expect(await port.checkRuleKeys(scriptedTx([{ revisionDigest: 'd' }]), WS, 'v1', [])).toEqual({ state: 'checked', missing: [] });
  });

  it.each([
    ['ambiguous', [group('RS-A', [rev('1', 'v1')], '1'), group('RS-B', [rev('2', 'v1')], '2')]],
    ['unknown', [group('RS-A', [rev('1', 'other')], '1')]],
    ['no_catalog', []],
  ] as const)('unresolved %s: never reports missing ids', async (reason, groups) => {
    loadGroups.mockResolvedValue(groups);
    expect(await port.checkRuleKeys(scriptedTx(), WS, 'v1', ['R-1'])).toEqual({ state: 'unresolved', reason });
  });
});

describe('RuleCoveragePort.resolveRuleSetRevision (key-bearing form)', () => {
  it('still answers null for unknown and for ambiguous inside one RuleSet', async () => {
    loadGroups.mockResolvedValue([group('RS-A', [rev('1', 'v1'), rev('2', 'other', { resultRef: 'v1' })], '2')]);
    expect(await port.resolveRuleSetRevision(scriptedTx(), WS, 'RS-A', 'v1')).toBeNull();
    expect(await port.resolveRuleSetRevision(scriptedTx(), WS, 'RS-A', 'zzz')).toBeNull();
  });
});
