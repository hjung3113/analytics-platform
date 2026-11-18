import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry } from '../registry/registry';
import { memoryStorage, testAdapter, testMenu, testSpace } from '../testing';

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

describe('testMenu (#2514 Q8)', () => {
  const groups = [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }];
  it('registers as is, also as an analysis menu, because the query defaults to live', () => {
    expect(() => createRegistry({ spaces: [testSpace()], groups, menus: [testMenu(), testMenu({ id: 'chart', path: '/chart', primary: false, pageType: 'analysis' })] })).not.toThrow();
  });
  it('overrides the given fields and merges features', () => {
    const menu = testMenu({ id: 'export-menu', features: { export: true } });
    expect(menu.id).toBe('export-menu');
    expect(menu.features).toEqual({ export: true, savedView: false, annotate: false, compare: false });
    expect(menu.query).toEqual({ mode: 'live' });
  });
});
