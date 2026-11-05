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
      { menuId: 'A', count: 7, distinctUsers: 4, vias: { sidebar: 4, history: 3 } },
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

  it('a back group of 3 people shows up with includeBack as exactly that group, and the toggle difference is a cell of >= 3 people', () => {
    const events = [...enter('M'), ...go('M', 'A', ['u1', 'u2', 'u3']), ...go('M', 'A', ['u1', 'u2'], 'history'), ...go('M', 'A', ['u3'], 'history')];
    const plain = aggregateUsageNext(events, 'M');
    const withBack = aggregateUsageNext(events, 'M', true);
    expect(plain.next).toEqual([{ menuId: 'A', count: 3, distinctUsers: 3, vias: { link: 3 } }]);
    expect(withBack.next).toEqual([{ menuId: 'A', count: 6, distinctUsers: 3, vias: { link: 3, history: 3 } }]);
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
    const many = ['u1', 'u2', 'u3', 'u4'];
    const events = [
      ...many.map((u, i) => row(u, 'M', i < 3 ? 'palette' : 'sidebar', null)), // N=4, 3 palette (3 people)
      ...go('M', 'A', ['u1', 'u2', 'u3'], 'history'), // back 3 of 4 (one cell of 3 people)
      ...enter('SMALL', ['u1', 'u2']), // 2 users
    ];
    const menus = aggregateUsage(events, { preset: 'all' }).menus;
    expect(menus.find(m => m.menuId === 'M')).toMatchObject({ entries: 4, backRate: 0.75, searchEntryRate: 0.75 });
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
    expect(m).toMatchObject({ entries: 4, backRate: 0, searchEntryRate: 0 });
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
