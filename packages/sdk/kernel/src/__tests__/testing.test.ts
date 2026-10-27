import { describe, expect, it } from 'vitest';
import { memoryStorage, testAdapter } from '../testing';

// PlatformAdapter.session() is a store snapshot: the same object until the session changes
// (packages/sdk/contracts/src/adapter/adapter.ts). The builder's default must honor that — one session per
// adapter, not per read.
describe('testAdapter default session identity (#265)', () => {
  it('returns the same session object per adapter and a fresh session per builder call', () => {
    const adapter = testAdapter();
    expect(adapter.session()).toBe(adapter.session());
    expect(testAdapter().session()).not.toBe(adapter.session());
  });
});

describe('memoryStorage', () => {
  it('round-trips values, enumerates keys, and isolates instances', () => {
    const storage = memoryStorage();
    expect(storage.getItem('missing')).toBeNull();
    expect(storage.key(0)).toBeNull();
    storage.setItem('a', 'one');
    storage.setItem('b', 'two');
    storage.setItem('a', 'updated');
    expect(storage.getItem('a')).toBe('updated');
    expect(storage.length).toBe(2);
    expect(storage.key(0)).toBe('a');
    expect(storage.key(1)).toBe('b');
    expect(storage.key(2)).toBeNull();
    expect(memoryStorage().getItem('a')).toBeNull();
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
    expect(storage.key(0)).toBe('b');
    storage.clear();
    expect(storage.length).toBe(0);
    expect(storage.getItem('b')).toBeNull();
  });
});

it('provides empty paged metadata and ordered missing-ID resolutions by default', async () => {
  const adapter = testAdapter();
  expect(await adapter.listAxisOptions({ scopeId: 'S', axisId: 'custom', limit: 50 })).toEqual({ items: [], nextCursor: null });
  expect(await adapter.searchEquipment({ scopeId: 'S', roomNames: null, lineNames: null, prcGroups: null, condition: null, membershipBasis: null, limit: 50 })).toEqual({ items: [], nextCursor: null });
  expect(await adapter.resolveSelection({ scopeId: 'S', ids: ['b', 'a', 'b'] })).toEqual({ items: [{ id: 'b', status: 'not_found' }, { id: 'a', status: 'not_found' }] });
});
