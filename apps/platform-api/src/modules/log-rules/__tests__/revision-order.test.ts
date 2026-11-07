import { describe, expect, it } from 'vitest';

import { CHANGE_LIST_MAX, currentRevision, diffRules, orderRevisions, predecessorOf } from '../domain/revision-order.js';

const rev = (revision: string, supersedes: string | null = null, status: 'active' | 'retired' = 'active') => ({ revision, supersedes, status });
const map = (o: Record<string, string>) => new Map(Object.entries(o));

describe('orderRevisions', () => {
  it('puts a Revision after the one it supersedes, whatever the input order', () => {
    const out = orderRevisions([rev('3', '2'), rev('1'), rev('2', '1')]);
    expect(out.map((r) => r.revision)).toEqual(['1', '2', '3']);
  });

  it('starts a chain at a Revision whose predecessor is not in the snapshot or is itself, ordering chains by revision string', () => {
    const out = orderRevisions([rev('b', 'gone'), rev('a', 'a'), rev('c', 'b')]);
    expect(out.map((r) => r.revision)).toEqual(['a', 'b', 'c']);
  });

  it('terminates on a cycle and keeps every Revision once', () => {
    const out = orderRevisions([rev('x', 'y'), rev('y', 'x')]);
    expect(out.map((r) => r.revision).sort()).toEqual(['x', 'y']);
  });

  it('compares revision strings exactly: no case folding', () => {
    expect(orderRevisions([rev('b'), rev('B')]).map((r) => r.revision)).toEqual(['B', 'b']);
  });
});

describe('predecessorOf', () => {
  it('is null at the first Revision, for an unknown target and for a self reference', () => {
    const all = [rev('1'), rev('2', 'zzz'), rev('3', '3')];
    expect(all.map((r) => predecessorOf(all, r))).toEqual([null, null, null]);
    expect(predecessorOf([rev('1'), rev('2', '1')], rev('2', '1'))?.revision).toBe('1');
  });
});

describe('currentRevision', () => {
  it('is the active Revision no other active one supersedes; a retired head is not current', () => {
    const ordered = orderRevisions([rev('1', null, 'retired'), rev('2', '1'), rev('3', '2', 'retired')]);
    expect(currentRevision(ordered)).toMatchObject({ current: { revision: '2' }, headCount: 1 });
  });

  it('is null when every Revision is retired', () => {
    expect(currentRevision(orderRevisions([rev('1', null, 'retired')]))).toEqual({ current: null, headCount: 0 });
  });

  it('ignores a self reference: the Revision naming itself is still a head', () => {
    expect(currentRevision(orderRevisions([rev('a'), rev('z', 'z')]))).toMatchObject({ current: { revision: 'z' }, headCount: 2 });
  });

  it('has no current Revision when active Revisions only supersede each other', () => {
    expect(currentRevision(orderRevisions([rev('x', 'y'), rev('y', 'x')]))).toEqual({ current: null, headCount: 0 });
  });

  it('reports parallel active heads and takes the last in order', () => {
    expect(currentRevision(orderRevisions([rev('1'), rev('2')]))).toMatchObject({ current: { revision: '2' }, headCount: 2 });
  });
});

describe('diffRules', () => {
  it('lists added, removed and support-changed Rule keys with exact counts', () => {
    const d = diffRules(map({ a: 'supported', b: 'partial', c: 'unknown' }), map({ a: 'partial', b: 'partial', d: 'supported' }));
    expect(d).toMatchObject({
      added: ['d'],
      removed: ['c'],
      supportChanged: [{ ruleKey: 'a', from: 'supported', to: 'partial' }],
      addedCount: 1,
      removedCount: 1,
      supportChangedCount: 1,
      truncated: false,
    });
  });

  it('cuts the lists at the cap and keeps the counts complete', () => {
    const after = new Map(Array.from({ length: CHANGE_LIST_MAX + 3 }, (_v, i) => [`k${String(i).padStart(5, '0')}`, 'supported'] as const));
    const d = diffRules(new Map(), after);
    expect(d.added).toHaveLength(CHANGE_LIST_MAX);
    expect(d).toMatchObject({ addedCount: CHANGE_LIST_MAX + 3, truncated: true });
  });
});
