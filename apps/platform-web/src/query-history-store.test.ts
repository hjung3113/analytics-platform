import { beforeEach, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import type { QueryHistoryEntry, QueryHistoryKey } from '@ap/contracts';
import { createLocalQueryHistoryStore, queryHistoryStorageKey } from './query-history-store';

const key: QueryHistoryKey = { userId: 'u', menuId: 'menu', scopeId: null };
const event = (id: string, time = 1): QueryHistoryEntry => ({ id, query: `?v=1&filter=${id}`, schemaVersion: 1, lastAppliedAt: time, count: 1 });
const storage = memoryStorage();
beforeEach(() => { storage.clear(); vi.restoreAllMocks(); });
// Emulates the browser origin lock; requests serialize across independent store instances.
let tail = Promise.resolve();
const locks = { request: async <T,>(name: string, callback: () => T | Promise<T>): Promise<T> => {
  void name;
  const result = tail.then(callback); tail = result.then(() => undefined, () => undefined); return result;
} };
const store = () => createLocalQueryHistoryStore(() => storage, locks, () => 2);
it('round trips, merges occurrences and separates unambiguous user/menu/Scope tuples', async () => {
  const a = store(); const b = store();
  await Promise.all([a.record(key, event('a')), b.record(key, event('a', 2))]);
  expect(await a.list(key)).toEqual([{ ...event('a', 2), count: 2 }]);
  expect(await a.list({ ...key, userId: 'v' })).toEqual([]);
  expect(await a.list({ ...key, scopeId: 'null' })).toEqual([]);
  expect(queryHistoryStorageKey({ ...key, userId: 'a:b', menuId: 'c' })).not.toBe(queryHistoryStorageKey({ ...key, userId: 'a', menuId: 'b:c' }));
});
it('caps at 20 with deterministic time/count/id/query ties and never merges hash collisions', async () => {
  const a = store();
  for (let i = 0; i < 22; i++) await a.record(key, event(String(i).padStart(2, '0'), 1));
  const list = await a.list(key);
  expect(list).toHaveLength(20);
  expect(list[0].id).toBe('00'); expect(list[19].id).toBe('19');
  await a.record(key, { ...event('00'), query: '?v=1&filter=collision' });
  expect((await a.list(key)).filter(e => e.id === '00')).toHaveLength(2);
});
it('serializes record/clear and independent instance mutations without resurrecting removed events', async () => {
  const a = store(); const b = store();
  await Promise.all([a.record(key, event('old')), b.clear(key), a.record(key, event('new'))]);
  expect((await b.list(key)).map(e => e.id)).toEqual(['new']);
  await b.remove(key, 'new'); expect(await a.list(key)).toEqual([]);
});
it.each(['{bad', JSON.stringify({ schemaVersion: 1, entries: [{ ...event('bad'), count: 0 }] }), JSON.stringify({ schemaVersion: 1, entries: [{ ...event('bad'), lastAppliedAt: -1 }] })])('reads malformed data as empty, preserves it on remove, then replaces on a record', async raw => {
  storage.setItem(queryHistoryStorageKey(key), raw);
  const a = store(); expect(await a.list(key)).toEqual([]);
  await a.remove(key, 'bad'); expect(storage.getItem(queryHistoryStorageKey(key))).toBe(raw);
  await a.record(key, event('good')); expect((await a.list(key))[0].id).toBe('good');
});
it('never mutates future-version envelopes, even on clear', async () => {
  const raw = JSON.stringify({ schemaVersion: 2, entries: [] }); storage.setItem(queryHistoryStorageKey(key), raw);
  const a = store();
  await expect(a.list(key)).rejects.toThrow('Query history unavailable');
  await expect(a.record(key, event('new'))).rejects.toThrow('Query history unavailable');
  await expect(a.remove(key, 'a')).rejects.toThrow('Query history unavailable');
  await expect(a.clear(key)).rejects.toThrow('Query history unavailable');
  expect(storage.getItem(queryHistoryStorageKey(key))).toBe(raw);
});
it('reports denied reads, quota and missing origin locks with a fixed non-sensitive error', async () => {
  const denied = createLocalQueryHistoryStore(() => { throw new Error('PRIVATE'); }, locks);
  await expect(denied.list(key)).rejects.toThrow(/^Query history unavailable$/);
  const quota = createLocalQueryHistoryStore(() => ({ ...storage, setItem: () => { throw new Error('PRIVATE'); } }), locks);
  await expect(quota.record(key, event('a'))).rejects.toThrow(/^Query history unavailable$/);
  const unlocked = createLocalQueryHistoryStore(() => storage, undefined);
  await expect(unlocked.record(key, event('a'))).rejects.toThrow(/^Query history unavailable$/);
});
