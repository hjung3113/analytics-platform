// The contract every SearchPort adapter must pass (#1507 S-d, design log-knowledge-search §5.3). Not a test file itself: an adapter's own
// test calls `describeSearchPortContract` with a harness that seeds the STANDARD FIXTURE below into the adapter's store and indexes it.
//
// Standard fixture (workspace of its own; Events `a_evt` and `b_evt`; ranks are by `(stage, score, published desc, item id)`):
//   fwdObserved  observed `a_evt before b_evt`, title «alpha forward»   fwdExpected  expected `a_evt before b_evt`, title «alpha expected»
//   reverse      observed `b_evt before a_evt`, title «alpha reverse»   textOnly     no record, title «alpha lookup»
//   blocked      observed `a_evt before b_evt`, title «alpha blocked» — the harness's guard denies it.
// A port may know nothing about access: it must only apply the guard it is handed, inside the statement that produces candidates.

import { describe, expect, it } from 'vitest';

import type { Tx } from '../../../db/tx.js';
import type { CandidateGuard, SearchAfter, SearchPlan, SearchPort } from '../repositories/search-port.js';

export interface SearchPortFixture {
  port: SearchPort;
  withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  workspaceId: string;
  ids: { fwdObserved: string; fwdExpected: string; reverse: string; textOnly: string; blocked: string };
  /** Allows every Item except `blocked`. */
  guard: CandidateGuard;
}

export function describeSearchPortContract(label: string, getFixture: () => SearchPortFixture): void {
  const matcher = (token: string) => ({ tokens: [token], conceptKeys: [] });
  const directionPlan = (f: SearchPortFixture, kinds: ('observed' | 'expected')[] = ['observed', 'expected']): SearchPlan => ({
    workspaceId: f.workspaceId,
    owner: null,
    text: null,
    direction: { source: matcher('a_evt'), target: matcher('b_evt'), kinds },
  });
  const textPlan = (f: SearchPortFixture, words: string[]): SearchPlan => ({
    workspaceId: f.workspaceId,
    owner: null,
    text: { normalized: words.join(' '), words, conceptKeys: [] },
    direction: null,
  });
  const emptyPlan = (f: SearchPortFixture): SearchPlan => ({ workspaceId: f.workspaceId, owner: null, text: null, direction: null });

  describe(`SearchPort contract: ${label}`, () => {
    it('direction: observed (stage 1) before expected (stage 2, expectedOnly), no opposite direction, no record-less Item', async () => {
      const f = getFixture();
      const found = await f.withTx((tx) => f.port.search(tx, directionPlan(f), f.guard, { after: null, limit: 20 }));
      expect(found.map((c) => c.itemId)).toEqual([f.ids.fwdObserved, f.ids.fwdExpected]);
      expect(found.map((c) => [c.stage, c.expectedOnly, c.reasons])).toEqual([
        [1, false, ['observed_same_direction']],
        [2, true, ['expected_same_direction']],
      ]);
    });

    it('the opposite direction is a separate query and never in the main stages', async () => {
      const f = getFixture();
      const opposite = await f.withTx((tx) => f.port.searchOpposite(tx, directionPlan(f), f.guard, 20));
      expect(opposite.map((c) => c.itemId)).toEqual([f.ids.reverse]);
      const none = await f.withTx((tx) => f.port.searchOpposite(tx, textPlan(f, ['alpha']), f.guard, 20));
      expect(none).toEqual([]);
    });

    it('the relation kind restricts the records that count', async () => {
      const f = getFixture();
      const observed = await f.withTx((tx) => f.port.search(tx, directionPlan(f, ['observed']), f.guard, { after: null, limit: 20 }));
      expect(observed.map((c) => c.itemId)).toEqual([f.ids.fwdObserved]);
      const expected = await f.withTx((tx) => f.port.search(tx, directionPlan(f, ['expected']), f.guard, { after: null, limit: 20 }));
      expect(expected.map((c) => c.itemId)).toEqual([f.ids.fwdExpected]);
    });

    it('applies the guard to candidates, to the count, to the opposite section and to suggestions', async () => {
      const f = getFixture();
      const all = [
        ...(await f.withTx((tx) => f.port.search(tx, textPlan(f, ['alpha']), f.guard, { after: null, limit: 50 }))),
        ...(await f.withTx((tx) => f.port.search(tx, directionPlan(f), f.guard, { after: null, limit: 50 }))),
        ...(await f.withTx((tx) => f.port.searchOpposite(tx, directionPlan(f), f.guard, 50))),
      ];
      expect(all.length).toBeGreaterThan(0);
      expect(all.map((c) => c.itemId)).not.toContain(f.ids.blocked);
      expect(await f.withTx((tx) => f.port.countUpTo(tx, directionPlan(f), f.guard, 101))).toBe(2);
      const suggestions = await f.withTx((tx) => f.port.suggest(tx, { workspaceId: f.workspaceId, owner: null }, f.guard, 'alpha', 12));
      expect(suggestions.map((s) => s.text)).toEqual(expect.arrayContaining(['alpha forward', 'alpha lookup']));
      expect(suggestions.map((s) => s.text)).not.toContain('alpha blocked');
    });

    it('text: an Item without records is found by text only, never with a direction reason', async () => {
      const f = getFixture();
      const found = await f.withTx((tx) => f.port.search(tx, textPlan(f, ['lookup']), f.guard, { after: null, limit: 20 }));
      expect(found.map((c) => c.itemId)).toEqual([f.ids.textOnly]);
      expect(found[0]?.reasons).toContain('exact_token');
      expect(found[0]?.reasons).not.toContain('observed_same_direction');
      expect(found[0]?.reasons).not.toContain('expected_same_direction');
    });

    it('keyset paging: pages of one equal the single page, no duplicate, no gap, repeatable', async () => {
      const f = getFixture();
      const plan = textPlan(f, ['alpha']);
      const whole = await f.withTx((tx) => f.port.search(tx, plan, f.guard, { after: null, limit: 50 }));
      expect(whole.length).toBeGreaterThanOrEqual(3);
      const walked: string[] = [];
      let after: SearchAfter | null = null;
      for (let i = 0; i < 20; i += 1) {
        const page: Awaited<ReturnType<SearchPort['search']>> = await f.withTx((tx) => f.port.search(tx, plan, f.guard, { after, limit: 1 }));
        const last = page[0];
        if (!last) break;
        walked.push(last.itemId);
        after = { stage: last.stage, scoreMicro: last.scoreMicro, publishedAtMicro: last.publishedAtMicro, itemId: last.itemId };
      }
      expect(walked).toEqual(whole.map((c) => c.itemId));
      expect(new Set(walked).size).toBe(walked.length);
      expect(await f.withTx((tx) => f.port.search(tx, plan, f.guard, { after: null, limit: 50 }))).toEqual(whole);
    });

    it('the count never exceeds its cap, an empty plan finds nothing', async () => {
      const f = getFixture();
      expect(await f.withTx((tx) => f.port.countUpTo(tx, textPlan(f, ['alpha']), f.guard, 1))).toBe(1);
      expect(await f.withTx((tx) => f.port.search(tx, emptyPlan(f), f.guard, { after: null, limit: 20 }))).toEqual([]);
      expect(await f.withTx((tx) => f.port.countUpTo(tx, emptyPlan(f), f.guard, 101))).toBe(0);
    });
  });
}
