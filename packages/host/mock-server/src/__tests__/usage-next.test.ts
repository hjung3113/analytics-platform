import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  aggregateUsage, aggregateUsageNext, getRole, resetUsage, seedUsageNext, setRole, setScenario, storedUsage, usageNextScreens,
  type StoredUsageEvent,
} from '../server';
import type { RoleId } from '../world';
import type { UsageVia } from '@ap/contracts';

let seq = 0;
const row = (userId: string, menuId: string, via: UsageVia | undefined, fromMenuId: string | null | undefined, over: Partial<StoredUsageEvent> = {}): StoredUsageEvent => {
  seq += 1;
  return {
    name: 'entry', menuId, spaceId: null, path: `/${menuId}`, at: seq, sessionId: `${userId}-t`, userId, receivedAt: seq,
    ...(via !== undefined && { via }), ...(fromMenuId !== undefined && { fromMenuId }), ...over,
  };
};
const U = ['u1', 'u2', 'u3', 'u4'];
/** `n` people enter `menu` (the base N). */
const enter = (menu: string, who = U) => who.map(u => row(u, menu, 'sidebar', null));
const go = (from: string, to: string, who: readonly string[], via: UsageVia = 'link') => who.map(u => row(u, to, via, from));

let previousRole: RoleId;
beforeEach(() => { previousRole = getRole(); seq = 0; });
afterEach(() => { resetUsage(); setScenario('normal'); setRole(previousRole); });

describe('aggregateUsageNext (#605)', () => {
  it('splits next entries four ways and the parts sum to entries', () => {
    const events = [
      ...enter('M', [...U, 'u5', 'u6', 'u7', 'u8', 'u9', 'u10']),
      ...go('M', 'A', U), // moved 4
      ...go('M', 'M', ['u1', 'u2', 'u3']), // sameMenu 3
      ...go('M', 'B', ['u1', 'u2', 'u3'], 'history'), ...go('M', 'M', ['u1', 'u2', 'u3'], 'return'), // back 6 (a back self-loop is back, not same-menu)
    ];
    const r = aggregateUsageNext(events, 'M');
    // N counts every main entry of M, the self-loop entries (three link, three return) included: 10 + 3 + 3.
    expect(r.entries).toBe(16);
    expect(r.masked).toBe(false);
    expect(r.summary).toEqual({ moved: 4, sameMenu: 3, backOrReturn: 6, noMove: 3 });
    expect(Object.values(r.summary).reduce((a, b) => a + b, 0)).toBe(r.entries);
  });

  it('noMove never goes below 0 when next entries outnumber entries', () => {
    const r = aggregateUsageNext([...enter('M', U.slice(0, 3)), ...go('M', 'A', U), ...go('M', 'A', U)], 'M');
    // The floor is the approved definition: one entry can be followed by several, so the sum of the four may exceed N (never below it).
    expect(r.summary).toEqual({ moved: 8, sameMenu: 0, backOrReturn: 0, noMove: 0 });
    expect(Object.values(r.summary).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(r.entries);
  });

  it('ranks moved entries only by default; includeBack also ranks history/return and same-menu with one consistent set per row', () => {
    const events = [
      ...enter('M'),
      ...go('M', 'A', U, 'sidebar'), // A: 4 moved
      ...go('M', 'A', ['u1', 'u2', 'u3'], 'history'), // A: 3 back
      ...go('M', 'M', U, 'link'), // self-loop 4
    ];
    const plain = aggregateUsageNext(events, 'M');
    expect(plain.next).toEqual([{ menuId: 'A', count: 4, distinctUsers: 4, vias: { sidebar: 4 } }]);
    const withBack = aggregateUsageNext(events, 'M', true);
    expect(withBack.next).toEqual([
      { menuId: 'A', count: 4, distinctUsers: 4, vias: { sidebar: 4 } }, // the back cell adds no new person: not merged, its entries stay in the summary
      { menuId: 'M', count: 4, distinctUsers: 4, vias: { link: 4 } },
    ]);
    for (const n of withBack.next) expect(Object.values(n.vias).reduce((a, b) => a + (b ?? 0), 0)).toBe(n.count);
    // The summary does not depend on includeBack.
    expect(withBack.summary).toEqual(plain.summary);
  });

  it('counts distinct actors, not sessions or events, and orders by count desc then menu id', () => {
    const events = [
      ...enter('M'),
      ...go('M', 'B', U), ...go('M', 'B', U), // 8 events, 4 users
      ...go('M', 'A', U), // 4 events
      ...go('M', 'C', U), // 4 events
    ];
    const r = aggregateUsageNext(events, 'M');
    expect(r.next.map(n => [n.menuId, n.count, n.distinctUsers])).toEqual([['B', 8, 4], ['A', 4, 4], ['C', 4, 4]]);
  });

  it('keeps main only: board entries and their fromMenuId never count', () => {
    const board = { source: 'board' as const, stayId: 's' };
    const events = [
      ...enter('M'),
      ...U.map(u => row(u, 'P', 'paneReplace', 'M', board)),
      ...U.map(u => row(u, 'M', 'paneOpen', null, board)), // board entries of M are not M's N
      ...go('M', 'A', U),
    ];
    const r = aggregateUsageNext(events, 'M');
    expect(r.entries).toBe(4);
    expect(r.next.map(n => n.menuId)).toEqual(['A']);
    expect(r.hiddenDestinations).toBe(0);
  });

  it('folds destinations under 3 distinct users into hiddenDestinations and never names them', () => {
    const events = [...enter('M'), ...go('M', 'A', U), ...go('M', 'SECRET1', ['u1', 'u2']), ...go('M', 'SECRET2', ['u1']), ...go('M', 'SECRET2', ['u1'])];
    const r = aggregateUsageNext(events, 'M');
    expect(r.next.map(n => n.menuId)).toEqual(['A']);
    expect(r.hiddenDestinations).toBe(2);
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });

  it('masks a menu with fewer than 3 distinct users: masked, nothing else', () => {
    const events = [...enter('M', ['u1', 'u2']), ...go('M', 'A', U)];
    expect(aggregateUsageNext(events, 'M')).toEqual({ menuId: 'M', entries: 0, masked: true, summary: { moved: 0, sameMenu: 0, backOrReturn: 0, noMove: 0 }, next: [], hiddenDestinations: 0 });
  });

  it('a menu with no main entry at all is honestly empty, not masked (masked means exactly 1–2 main-entry users)', () => {
    const r = aggregateUsageNext([...enter('M'), ...go('M', 'A', U)], 'nobody');
    expect(r).toEqual({ menuId: 'nobody', entries: 0, masked: false, summary: { moved: 0, sameMenu: 0, backOrReturn: 0, noMove: 0 }, next: [], hiddenDestinations: 0 });
    // Board entries alone are not a main entry either.
    const board = { source: 'board' as const, stayId: 's' };
    expect(aggregateUsageNext(U.map(u => row(u, 'P', 'paneOpen', null, board)), 'P').masked).toBe(false);
    expect(aggregateUsageNext(enter('M', ['u1']), 'M').masked).toBe(true);
    expect(aggregateUsageNext(enter('M', ['u1', 'u2']), 'M').masked).toBe(true);
    expect(aggregateUsageNext(enter('M', ['u1', 'u2', 'u3']), 'M').masked).toBe(false);
  });

  it('limits the list to 20 destinations', () => {
    const events = [...enter('M'), ...Array.from({ length: 25 }, (_, i) => go('M', `D${String(i).padStart(2, '0')}`, U.slice(0, 3))).flat()];
    const r = aggregateUsageNext(events, 'M');
    expect(r.next).toHaveLength(20);
    expect(r.hiddenDestinations).toBe(0);
  });

  it('a via-less next entry (older client) is counted as link, so the vias still sum to the count', () => {
    const r = aggregateUsageNext([...enter('M'), ...U.map(u => row(u, 'A', undefined, 'M'))], 'M');
    expect(r.next[0]).toMatchObject({ menuId: 'A', count: 4, vias: { link: 4 } });
  });
});

describe('small cells never leave through a difference (#605, F1)', () => {
  const total = (r: ReturnType<typeof aggregateUsageNext>) => r.next.reduce((a, n) => a + n.count, 0);

  it('the summary does not let moved minus the visible rows reveal a hidden destination', () => {
    // M has 6 entries; A is used by 3 people, S by one person once.
    const events = [...enter('M', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']), ...go('M', 'A', ['u1', 'u2', 'u3']), ...go('M', 'S', ['u4'])];
    const r = aggregateUsageNext(events, 'M');
    expect(r.summary.moved).toBe(3);
    expect(r.summary.moved - total(r)).toBe(0);
    expect(r.hiddenDestinations).toBe(1);
    expect(r.summary.noMove).toBe(3); // S falls into noMove with the entries nobody followed
  });

  it('includeBack does not reveal a destination hidden by default: link:1 + history:2 stays hidden both ways', () => {
    const events = [...enter('M'), ...go('M', 'A', U), ...go('M', 'S', ['u1'], 'link'), ...go('M', 'S', ['u2', 'u3'], 'history')];
    for (const includeBack of [false, true]) {
      const r = aggregateUsageNext(events, 'M', includeBack);
      expect(r.next.map(n => n.menuId)).toEqual(['A']);
      expect(r.hiddenDestinations).toBe(1);
      expect(JSON.stringify(r)).not.toContain('"S"');
    }
  });

  it('a back cell of the same 3 people adds no new person: the row is identical with and without includeBack', () => {
    const events = [...enter('M'), ...go('M', 'A', ['u1', 'u2', 'u3']), ...go('M', 'A', ['u1', 'u2'], 'history'), ...go('M', 'A', ['u3'], 'history')];
    const plain = aggregateUsageNext(events, 'M');
    const withBack = aggregateUsageNext(events, 'M', true);
    expect(plain.next).toEqual([{ menuId: 'A', count: 3, distinctUsers: 3, vias: { link: 3 } }]);
    expect(withBack.next).toEqual(plain.next);
    expect(withBack.summary.backOrReturn).toBe(3);
  });

  const users = (r: ReturnType<typeof aggregateUsageNext>, id: string) => r.next.find(n => n.menuId === id)?.distinctUsers ?? 0;

  it('G2 counter-example: moved u1–u3 + back u2–u4 → the back cell adds only u4, so it is not merged (toggle difference never 1)', () => {
    const events = [...enter('M', [...U, 'u5']), ...go('M', 'A', ['u1', 'u2', 'u3']), ...go('M', 'A', ['u2', 'u3', 'u4'], 'history')];
    const plain = aggregateUsageNext(events, 'M');
    const withBack = aggregateUsageNext(events, 'M', true);
    expect(withBack.next).toEqual([{ menuId: 'A', count: 3, distinctUsers: 3, vias: { link: 3 } }]);
    expect(users(withBack, 'A') - users(plain, 'A')).toBe(0);
    expect(withBack.summary.backOrReturn).toBe(3); // the summary still reports the open back cell
  });

  it('G2: moved u1–u3 + back u3–u5 → adds u4,u5 only (2), not merged; the difference is never 2', () => {
    const five = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const events = [...enter('M', five), ...go('M', 'A', ['u1', 'u2', 'u3']), ...go('M', 'A', ['u3', 'u4', 'u5'], 'history')];
    expect(users(aggregateUsageNext(events, 'M', true), 'A')).toBe(3);
  });

  it('G2: a back cell adding exactly 3 new people is merged; count, users and vias come from both cells', () => {
    const six = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];
    const events = [...enter('M', six), ...go('M', 'A', ['u1', 'u2', 'u3']), ...go('M', 'A', ['u3', 'u4', 'u5', 'u6'], 'history')];
    const withBack = aggregateUsageNext(events, 'M', true);
    expect(withBack.next).toEqual([{ menuId: 'A', count: 7, distinctUsers: 6, vias: { link: 3, history: 4 } }]);
    expect(users(withBack, 'A') - users(aggregateUsageNext(events, 'M'), 'A')).toBe(3);
  });

  it('G2: a destination hidden by default (moved cell of 2) appears with includeBack from its open back cell only', () => {
    const events = [...enter('M'), ...go('M', 'A', ['u1', 'u2']), ...go('M', 'A', ['u2', 'u3', 'u4'], 'history')];
    expect(aggregateUsageNext(events, 'M').next).toEqual([]);
    expect(aggregateUsageNext(events, 'M', true).next).toEqual([{ menuId: 'A', count: 3, distinctUsers: 3, vias: { history: 3 } }]);
  });

  it('G2: the same-menu cell obeys the new-people rule against a back self-loop (same first, back only if it adds >= 3)', () => {
    const six = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];
    const loop = (backWho: string[]) => aggregateUsageNext([...enter('M', six), ...go('M', 'M', ['u1', 'u2', 'u3']), ...go('M', 'M', backWho, 'history')], 'M', true);
    expect(loop(['u2', 'u3', 'u4']).next).toEqual([{ menuId: 'M', count: 3, distinctUsers: 3, vias: { link: 3 } }]);
    expect(loop(['u3', 'u4', 'u5', 'u6']).next[0]).toMatchObject({ count: 7, distinctUsers: 6 });
  });

  it('vias are all-or-nothing: one via kind under 3 people empties the split, count and users stay', () => {
    const events = [...enter('M'), ...go('M', 'A', ['u1', 'u2', 'u3'], 'sidebar'), ...go('M', 'A', ['u4'], 'palette')];
    const r = aggregateUsageNext(events, 'M');
    expect(r.next).toEqual([{ menuId: 'A', count: 4, distinctUsers: 4, vias: {} }]);
  });

  it('a destination with a small cell next to an open cell counts only the open cell', () => {
    // includeBack: A has moved by 3 people and history by 1 person → the history entry is not in A's count.
    const events = [...enter('M'), ...go('M', 'A', ['u1', 'u2', 'u3']), ...go('M', 'A', ['u4'], 'history')];
    const withBack = aggregateUsageNext(events, 'M', true);
    expect(withBack.next).toEqual([{ menuId: 'A', count: 3, distinctUsers: 3, vias: { link: 3 } }]);
    expect(withBack.summary.backOrReturn).toBe(0);
  });

  it('a mask-free sum: every summary part equals the sum of the rows it could be drawn from when all cells are open', () => {
    const events = [...enter('M'), ...go('M', 'A', U), ...go('M', 'B', U.slice(0, 3))];
    const r = aggregateUsageNext(events, 'M');
    expect(r.summary.moved).toBe(total(r));
  });
});

describe('usageSummary rates (#605)', () => {
  it('gives entries, backRate and searchEntryRate from main entries; both null under 3 users', () => {
    const many = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];
    const events = [
      ...many.map((u, i) => row(u, 'M', i < 3 ? 'palette' : 'sidebar', null)), // N=6, 3 palette (3 people), 3 other (3 people)
      ...go('M', 'A', ['u1', 'u2', 'u3'], 'history'), // back 3 of 6 (one cell of 3 people)
      ...enter('SMALL', ['u1', 'u2']), // 2 users
    ];
    const menus = aggregateUsage(events, { preset: 'all' }).menus;
    expect(menus.find(m => m.menuId === 'M')).toMatchObject({ entries: 6, backRate: 0.5, searchEntryRate: 0.5 });
    // F2: the entry count is masked like the rates.
    expect(menus.find(m => m.menuId === 'SMALL')).toMatchObject({ entries: null, backRate: null, searchEntryRate: null });
  });

  it('a numerator built from fewer than 3 people counts as 0, so entries × rate never isolates them', () => {
    const events = [
      ...U.map(u => row(u, 'M', u === 'u1' ? 'palette' : 'sidebar', null)), // 1 palette entry
      ...go('M', 'A', ['u1'], 'history'), // 1 back entry
      ...go('M', 'B', ['u1', 'u2'], 'history'), ...go('M', 'C', ['u3'], 'return'), // 2 + 1: two cells under 3
    ];
    const m = aggregateUsage(events, { preset: 'all' }).menus.find(x => x.menuId === 'M');
    // 1 palette person: the palette side is 1–2 people, so the rate is withheld (a 0 would still pair with entries to leave the group exposed).
    expect(m).toMatchObject({ entries: 4, backRate: 0, searchEntryRate: null });
  });

  // G1: `entries × (1 − rate)` must never be the size of a group of 1–2 people, from either side of the split.
  const search = (palette: number, other: number) => {
    const ids = Array.from({ length: palette + other }, (_, i) => `p${i}`);
    const events = ids.map((u, i) => row(u, 'M', i < palette ? 'palette' : 'sidebar', null));
    return aggregateUsage(events, { preset: 'all' }).menus[0]!.searchEntryRate;
  };
  it.each([
    [3, 1, null], [3, 2, null], [3, 3, 0.5], [1, 3, null], [2, 3, null], [3, 4, 3 / 7], [0, 3, 0], [3, 0, 1],
  ])('searchEntryRate with %i palette and %i other people → %s (null when either non-empty side has 1–2 people)', (palette, other, expected) => {
    expect(search(palette, other)).toBe(expected);
  });

  it('one person entering twice by two vias counts on both sides of the split', () => {
    const events = [...['a', 'b', 'c'].map(u => row(u, 'M', 'palette', null)), ...['a', 'b', 'c'].map(u => row(u, 'M', 'sidebar', null)), row('a', 'M', 'sidebar', null)];
    expect(aggregateUsage(events, { preset: 'all' }).menus[0]!.searchEntryRate).toBe(3 / 7);
  });

  it('a menu with only board entries has null entries and rates (no main-entry people); visits still count them', () => {
    const board = { source: 'board' as const, stayId: 's' };
    const events = U.map(u => row(u, 'P', 'paneOpen', null, board));
    expect(aggregateUsage(events, { preset: 'all' }).menus[0]).toMatchObject({ menuId: 'P', visits: 4, entries: null, backRate: null, searchEntryRate: null });
  });
});

describe('usageNextScreens port (#605)', () => {
  const read = (query: Parameters<typeof usageNextScreens>[0], role: RoleId = 'admin') => usageNextScreens(query, undefined, { role, latency: 0 });

  it('forbids a reader without console:access before anything else, even on a malformed menu id', async () => {
    const res = await read({ menuId: '/bad' }, 'engineer');
    expect(res.outcome).toBe('forbidden');
    expect(res.data).toBeNull();
  });

  it('honors the dev scenarios like usageSummary', async () => {
    setScenario('timeout');
    expect((await read({ menuId: 'a' })).outcome).toBe('timeout');
    setScenario('error');
    expect((await read({ menuId: 'a' })).outcome).toBe('error');
    setScenario('forbidden');
    expect((await read({ menuId: 'a' })).outcome).toBe('forbidden');
  });

  it.each([
    ['a path', { menuId: '/mars/x' }],
    ['key=value', { menuId: 'a=b' }],
    ['empty', { menuId: '' }],
    ['81 characters', { menuId: 'a'.repeat(81) }],
    ['a non-string', { menuId: 7 as never }],
    ['a non-boolean includeBack', { menuId: 'a', includeBack: 'yes' as never }],
  ])('answers error for a malformed query: %s', async (_why, q) => {
    const res = await read(q);
    expect(res.outcome).toBe('error');
    expect(res.data).toBeNull();
  });

  it('answers ok with masked:false and zero entries for a well-formed menu without data, never an error', async () => {
    const res = await read({ menuId: 'mars:nothing' });
    expect(res.outcome).toBe('ok');
    expect(res.data).toMatchObject({ menuId: 'mars:nothing', masked: false, entries: 0, next: [] });
  });

  it('writes no audit row and no usage row', async () => {
    seedUsageNext();
    const before = storedUsage().length;
    await read({ menuId: 'seed-tail' });
    expect(storedUsage()).toHaveLength(before);
  });
});

describe('seedUsageNext (#605)', () => {
  it('shows the hard cases: masked, no data, long tail, back-heavy, self-loop, dominant', async () => {
    seedUsageNext();
    const all = storedUsage();
    expect(aggregateUsageNext(all, 'seed-solo').masked).toBe(true);
    expect(aggregateUsageNext(all, 'seed-empty')).toMatchObject({ masked: false, entries: 0, next: [] });
    const tail = aggregateUsageNext(all, 'seed-tail');
    expect(tail.next.map(n => n.menuId)).toEqual(['seed-d1', 'seed-d2', 'seed-d3', 'seed-d4']);
    expect(tail.hiddenDestinations).toBe(2);
    const back = aggregateUsageNext(all, 'seed-back');
    expect(back.summary.backOrReturn).toBeGreaterThan(back.summary.moved);
    expect(back.next.length).toBeGreaterThan(0);
    const loop = aggregateUsageNext(all, 'seed-loop', true);
    expect(loop.summary.sameMenu).toBe(4);
    expect(loop.next.some(n => n.menuId === 'seed-loop')).toBe(true);
    const dominant = aggregateUsageNext(all, 'seed-dominant');
    expect(dominant.next[0]).toMatchObject({ menuId: 'seed-d1', count: 12 });
    expect(dominant.next[0]!.count).toBeGreaterThan(dominant.next[1]!.count * 3);
  });

  it('is opt-in: the store is empty until it is called', () => {
    expect(storedUsage()).toHaveLength(0);
  });
});

describe('cross-menu subtraction: uncovered entries (#605 R1)', () => {
  // uncovered(M) = entries(M) − events of open inflow cells into M (a cell = from menu X, kind; open = >= 3 distinct people).
  // 1 or 2 → M is masked in both reads; 0 or >= 3 → unchanged.
  const both = (events: StoredUsageEvent[], menu: string, includeBack = false) => ({
    summary: aggregateUsage(events, { preset: 'all' }).menus.find(m => m.menuId === menu)!,
    next: aggregateUsageNext(events, menu, includeBack),
  });
  const maskedNext = { entries: 0, masked: true, summary: { moved: 0, sameMenu: 0, backOrReturn: 0, noMove: 0 }, next: [], hiddenDestinations: 0 };
  const direct = (menu: string, who: readonly string[]) => who.map(u => row(u, menu, 'sidebar', null));

  it("the reviewer's example: u1–u3 M→A and u4 direct to A leaves 1 uncovered, so A is masked in both reads", () => {
    const events = [...enter('M'), ...go('M', 'A', ['u1', 'u2', 'u3']), ...direct('A', ['u4'])];
    const { summary, next } = both(events, 'A');
    expect(summary).toMatchObject({ entries: null, backRate: null, searchEntryRate: null });
    expect(next).toMatchObject(maskedNext);
  });

  it('with 3 direct entries (uncovered 3) A is not masked', () => {
    const events = [...enter('M'), ...go('M', 'A', ['u1', 'u2', 'u3']), ...direct('A', ['u4', 'u5', 'u6'])];
    const { summary, next } = both(events, 'A');
    expect(summary.entries).toBe(6);
    expect(next).toMatchObject({ masked: false, entries: 6 });
  });

  it('the variant: u4 reaching A from B (a closed cell) leaves 1 uncovered, so A is masked', () => {
    const events = [...enter('M'), ...enter('B'), ...go('M', 'A', ['u1', 'u2', 'u3']), ...go('B', 'A', ['u4'])];
    const { summary, next } = both(events, 'A');
    expect(summary.entries).toBeNull();
    expect(next).toMatchObject(maskedNext);
    // Nothing of the closed B→A cell leaks through B either: B's outflow names no destination.
    expect(aggregateUsageNext(events, 'B').hiddenDestinations).toBe(1);
  });

  it.each([[0, false], [1, true], [2, true], [3, false], [4, false]])('%i uncovered entries (direct): masked = %s', (uncovered, masked) => {
    const direct3 = direct('A', Array.from({ length: uncovered }, (_, i) => `d${i}`));
    const events = [...enter('M'), ...go('M', 'A', ['u1', 'u2', 'u3']), ...direct3];
    const { summary, next } = both(events, 'A');
    expect(summary.entries === null).toBe(masked);
    expect(next.masked).toBe(masked);
    if (!masked) expect(next.entries).toBe(3 + uncovered);
  });

  it('an uncovered count of 1–2 from a closed cell of 2 people also masks (2 events, 2 people)', () => {
    const events = [...enter('M'), ...go('M', 'A', ['u1', 'u2', 'u3']), ...go('B', 'A', ['u1', 'u2'])];
    expect(both(events, 'A').next.masked).toBe(true);
  });

  it('includeBack on and off give the same masking (inflow cells are the same three kinds)', () => {
    const events = [...enter('M'), ...go('M', 'A', ['u1', 'u2', 'u3']), ...go('M', 'A', ['u1', 'u2', 'u3'], 'history'), ...direct('A', ['u4'])];
    expect(both(events, 'A', false).next.masked).toBe(true);
    expect(both(events, 'A', true).next.masked).toBe(true);
    const ok = [...enter('M'), ...go('M', 'A', ['u1', 'u2', 'u3']), ...go('M', 'A', ['u1', 'u2', 'u3'], 'history'), ...direct('A', ['u4', 'u5', 'u6'])];
    expect(both(ok, 'A', false).next).toMatchObject({ masked: false, entries: 9 });
    expect(both(ok, 'A', true).next).toMatchObject({ masked: false, entries: 9 });
  });

  it('a same-menu inflow cell of >= 3 people covers (the self loop counts as an open inflow cell)', () => {
    const events = [...direct('A', ['u1', 'u2', 'u3']), ...go('A', 'A', ['u1', 'u2', 'u3'])];
    expect(both(events, 'A').next).toMatchObject({ masked: false, entries: 6 });
  });

  it('a menu with only direct entries (>= 3 people) stays unmasked', () => {
    const events = direct('A', ['u1', 'u2', 'u3', 'u4']);
    const { summary, next } = both(events, 'A');
    expect(summary.entries).toBe(4);
    expect(next).toMatchObject({ masked: false, entries: 4 });
  });

  it('what a client can compute is 0 or >= 3: entries minus the visible inflow, over a grid of direct and closed-cell sizes', () => {
    for (let direct_ = 0; direct_ <= 5; direct_ += 1) {
      for (let closed = 0; closed <= 4; closed += 1) {
        const events = [...enter('M'), ...go('M', 'A', ['u1', 'u2', 'u3']), ...direct('A', Array.from({ length: direct_ }, (_, i) => `d${i}`)), ...go('B', 'A', Array.from({ length: closed }, (_, i) => `c${i}`).slice(0, Math.min(closed, 2)))];
        const entries = aggregateUsage(events, { preset: 'all' }).menus.find(m => m.menuId === 'A')!.entries;
        if (entries === null || entries === undefined) continue;
        // Visible inflow = the open cell M→A only (3 events); the rest is uncovered.
        expect(entries - 3 === 0 || entries - 3 >= 3).toBe(true);
      }
    }
  });
});
