import { memoryStorage } from '@ap/kernel/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserPreferenceKey, decodeCollapse, migrateCollapseSections, readBrowserPreference } from '../browserPreference';

afterEach(() => { vi.unstubAllGlobals(); });
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
describe('browser preference migration', () => {
  it.each(['page-filter-collapsed', 'page-head-collapsed', 'query-bar-collapsed', 'sidebar-collapsed', 'columns'])('migrates %s once for the current account', kind => {
    const oldKey = kind === 'columns' ? 'table-a' : `platform:${kind}:table-a`;
    const key = browserPreferenceKey(kind, 'alice', 'table-a');
    localStorage.setItem(oldKey, 'true');
    expect(readBrowserPreference(key, { legacyKey: oldKey, decode: raw => raw === 'true' ? true : null, fallback: false })).toBe(true);
    expect(localStorage.getItem(key)).toBe('true');
    expect(localStorage.getItem(oldKey)).toBeNull();
    localStorage.setItem(oldKey, 'false');
    expect(readBrowserPreference(key, { legacyKey: oldKey, decode: raw => raw === 'true' ? true : null, fallback: false })).toBe(true);
  });
  it('uses anon without a session and separates accounts', () => {
    expect(browserPreferenceKey('columns', undefined, 't')).toBe('platform:columns:v1:anon:t');
    expect(browserPreferenceKey('columns', 'bob', 't')).not.toBe(browserPreferenceKey('columns', 'alice', 't'));
  });
  it('deletes an invalid legacy value', () => {
    localStorage.setItem('old', 'broken');
    expect(readBrowserPreference('new', { legacyKey: 'old', decode: () => null, fallback: false })).toBe(false);
    expect(localStorage.getItem('old')).toBeNull();
  });
  it('survives refused storage', () => {
    const getter = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readBrowserPreference('new', { legacyKey: 'old', decode: () => true, fallback: false })).toBe(false);
    getter.mockRestore();
  });
});

it('consumes a valid legacy choice even when the destination write is refused', () => {
  localStorage.setItem('old', 'true');
  const setter = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(readBrowserPreference('new', { legacyKey: 'old', decode: raw => raw === 'true' ? true : null, fallback: false })).toBe(true);
  expect(localStorage.getItem('old')).toBeNull();
  expect(readBrowserPreference('bob', { legacyKey: 'old', decode: decodeCollapse, fallback: false })).toBe(false);
  expect(readBrowserPreference('new', { legacyKey: 'old', decode: decodeCollapse, fallback: false })).toBe(true);
  setter.mockRestore();
});


it.each(['true', 'broken'])('cleans a coexisting legacy value %s while preserving the current key', legacy => {
  localStorage.setItem('alice', 'false');
  localStorage.setItem('old', legacy);
  expect(readBrowserPreference('alice', { legacyKey: 'old', decode: decodeCollapse, fallback: true })).toBe(false);
  expect(localStorage.getItem('old')).toBeNull();
  expect(readBrowserPreference('bob', { legacyKey: 'old', decode: decodeCollapse, fallback: false })).toBe(false);
});

it.each([undefined, 'alice'])('isolates a refused write and deletion from the next account (first owner %s)', owner => {
  const key = browserPreferenceKey('sidebar-collapsed', owner);
  localStorage.setItem('old', 'true');
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(readBrowserPreference(key, { legacyKey: 'old', decode: decodeCollapse, fallback: false })).toBe(true);
  expect(readBrowserPreference(browserPreferenceKey('sidebar-collapsed', 'bob'), { legacyKey: 'old', decode: decodeCollapse, fallback: false })).toBe(false);
  expect(readBrowserPreference(key, { legacyKey: 'old', decode: decodeCollapse, fallback: false })).toBe(true);
});

it('consumes an anonymous migration before sign-in', () => {
  localStorage.setItem('old', 'true');
  expect(readBrowserPreference(browserPreferenceKey('sidebar-collapsed', undefined), { legacyKey: 'old', decode: decodeCollapse, fallback: false })).toBe(true);
  expect(readBrowserPreference(browserPreferenceKey('sidebar-collapsed', 'alice'), { legacyKey: 'old', decode: decodeCollapse, fallback: false })).toBe(false);
});

it('consumes a partially migrated analysis list and retains the original owner fallback', () => {
  const key = browserPreferenceKey('analysis-collapsed', 'alice', 'menu');
  localStorage.setItem('old', '["a","b"]');
  const setItem = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((k, value) => {
    if (k.endsWith(':b')) throw new Error('blocked');
    setItem(k, value);
  });
  const read = (destination: string) => readBrowserPreference<string[]>(destination, {
    legacyKey: 'old', decode: raw => JSON.parse(raw) as string[], fallback: [],
    migrate: ids => migrateCollapseSections(destination, ids),
  });
  expect(read(key)).toEqual(['a', 'b']);
  expect(localStorage.getItem(`${key}:a`)).toBe('true');
  expect(localStorage.getItem(`${key}:b`)).toBeNull();
  expect(localStorage.getItem('old')).toBeNull();
  expect(read(browserPreferenceKey('analysis-collapsed', 'bob', 'menu'))).toEqual([]);
  expect(read(key)).toEqual(['a', 'b']);
});
