import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceId, UsageEvent } from '@ap/contracts';
import {
  aggregateUsage, getRole, recordUsage, resetUsage, setRole, setScenario,
  storedUsage, usageSummary,
} from './server';
import type { RoleId } from './world';

const entry = (over: Partial<UsageEvent> = {}): UsageEvent => ({
  name: 'entry', menuId: 'equipment-master', spaceId: 'operations', path: '/equipment', at: 1_000, sessionId: 'tab-1', ...over,
});

let previousRole: RoleId;
beforeEach(() => { previousRole = getRole(); });
afterEach(() => {
  vi.useRealTimers();
  resetUsage();
  setScenario('normal');
  setRole(previousRole);
});

describe('menu usage (docs/05 메뉴 활용률 계측)', () => {
  it('keeps events across a role switch: two roles produce visits 2, distinctUsers 2', async () => {
    setRole('engineer');
    await recordUsage([entry()]);
    setRole('admin');
    await recordUsage([entry({ sessionId: 'tab-2' })]);
    const summary = aggregateUsage(storedUsage(), { preset: 'all' });
    expect(summary.preset).toBe('all');
    expect(summary.menus).toEqual([
      { menuId: 'equipment-master', visits: 2, distinctUsers: 2, lastUsedAt: storedUsage()[1].receivedAt },
    ]);
  });

  it('dwell changes nothing: visits, distinct users and lastUsedAt count entries only', async () => {
    await recordUsage([entry()]);
    await recordUsage([entry({ name: 'dwell', dwellMs: 120, enteredAt: 1_000 })]);
    const summary = aggregateUsage(storedUsage(), { preset: 'all' });
    expect(summary.menus).toEqual([
      { menuId: 'equipment-master', visits: 1, distinctUsers: 1, lastUsedAt: storedUsage()[0].receivedAt },
    ]);
  });

  it('replaces a dwell with the same (userId, sessionId, menuId, enteredAt)', async () => {
    await recordUsage([entry()]);
    await recordUsage([entry({ name: 'dwell', dwellMs: 120, enteredAt: 1_000 })]);
    await recordUsage([entry({ name: 'dwell', dwellMs: 300, enteredAt: 1_000 })]);
    const dwells = storedUsage().filter(e => e.name === 'dwell');
    expect(dwells).toHaveLength(1);
    expect(dwells[0].dwellMs).toBe(300);
  });

  it('forbids an engineer with data null even when events exist and the scenario is error (permission wins)', async () => {
    await recordUsage([entry()], { role: 'engineer' });
    setScenario('error');
    const res = await usageSummary({ preset: 'all' }, undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('forbidden');
    expect(res.data).toBeNull();
    expect(res.trust).toBeNull();
  });

  it('gives an admin ok with the numbers, and a successful zero (ok, never empty) when nothing matched', async () => {
    await recordUsage([entry()], { role: 'engineer' });
    const res = await usageSummary({ preset: 'all' }, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(res.data?.menus).toEqual([
      { menuId: 'equipment-master', visits: 1, distinctUsers: 1, lastUsedAt: storedUsage()[0].receivedAt },
    ]);
    resetUsage();
    const zero = await usageSummary({ preset: 'all' }, undefined, { role: 'admin', latency: 0 });
    expect(zero.outcome).toBe('ok');
    expect(zero.data?.menus).toEqual([]);
  });

  it('honors the timeout and forbidden scenarios for a permitted reader', async () => {
    setScenario('timeout');
    expect((await usageSummary({ preset: 'all' }, undefined, { role: 'admin', latency: 0 })).outcome).toBe('timeout');
    setScenario('forbidden');
    expect((await usageSummary({ preset: 'all' }, undefined, { role: 'admin', latency: 0 })).outcome).toBe('forbidden');
  });

  it('filters {from,to} on receivedAt: from inclusive, to exclusive', async () => {
    // recordUsage stamps Date.now(), so fake only the clock: deterministic ordering, no real wait.
    vi.useFakeTimers({ toFake: ['Date'] });
    await recordUsage([entry()], { role: 'engineer' });
    vi.advanceTimersByTime(15);
    await recordUsage([entry({ menuId: 'admin-usage', path: '/admin/usage' })], { role: 'admin' });
    vi.useRealTimers();
    const [a, b] = storedUsage();
    expect(b.receivedAt).toBeGreaterThan(a.receivedAt);
    const both = await usageSummary({ from: a.receivedAt, to: b.receivedAt + 1 }, undefined, { role: 'admin', latency: 0 });
    expect(both.data?.preset).toBe('range');
    expect(both.data?.menus.map(m => m.visits)).toEqual([1, 1]);
    const onlyA = await usageSummary({ from: a.receivedAt, to: b.receivedAt }, undefined, { role: 'admin', latency: 0 });
    expect(onlyA.data?.menus).toEqual([
      { menuId: 'equipment-master', visits: 1, distinctUsers: 1, lastUsedAt: a.receivedAt },
    ]);
    const onlyB = await usageSummary({ from: a.receivedAt + 1, to: b.receivedAt + 1 }, undefined, { role: 'admin', latency: 0 });
    expect(onlyB.data?.menus).toEqual([
      { menuId: 'admin-usage', visits: 1, distinctUsers: 1, lastUsedAt: b.receivedAt },
    ]);
  });

  it('errors on from >= to', async () => {
    const res = await usageSummary({ from: 100, to: 100 }, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('error');
    expect(res.data).toBeNull();
  });

  it('accepts 0 and stores nothing for a path containing ?', async () => {
    const res = await recordUsage([entry({ path: '/equipment?x=1' })]);
    expect(res.accepted).toBe(0);
    expect(storedUsage()).toHaveLength(0);
  });

  it('rejects the whole batch when any event is invalid', async () => {
    const good = entry();
    expect((await recordUsage([good, entry({ menuId: 'bad id' })])).accepted).toBe(0);
    expect((await recordUsage([good, entry({ menuId: 'x'.repeat(81) })])).accepted).toBe(0);
    expect((await recordUsage([good, entry({ name: 'dwell', dwellMs: 1 })])).accepted).toBe(0); // dwell without enteredAt
    expect((await recordUsage([good, entry({ spaceId: 'nope' as SpaceId })])).accepted).toBe(0);
    expect((await recordUsage(Array.from({ length: 21 }, () => good))).accepted).toBe(0);
    expect(storedUsage()).toHaveLength(0);
  });

  it('resetUsage clears the store', async () => {
    await recordUsage([entry()]);
    resetUsage();
    expect(storedUsage()).toHaveLength(0);
    expect(aggregateUsage([], { preset: 'all' }).menus).toEqual([]);
  });
});
