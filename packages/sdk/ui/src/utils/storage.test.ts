import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readLocalStorage, writeLocalStorage } from './storage';

// Node's own experimental `localStorage` shadows jsdom's here, so each test installs a plain in-memory one.
let store: Map<string, string>;
let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
beforeEach(() => {
  store = new Map();
  storage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
    removeItem: key => { store.delete(key); },
  };
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('readLocalStorage', () => {
  it('passes the raw value — null when the key is absent — to decode', () => {
    const decode = vi.fn((raw: string | null) => raw ?? 'absent');
    expect(readLocalStorage('k', decode, 'fallback')).toBe('absent');
    expect(decode).toHaveBeenCalledWith(null);
    store.set('k', 'v');
    expect(readLocalStorage('k', decode, 'fallback')).toBe('v');
  });

  it('returns the fallback when storage throws', () => {
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const decode = vi.fn(() => 'decoded');
    expect(readLocalStorage('k', decode, 'fallback')).toBe('fallback');
    expect(decode).not.toHaveBeenCalled();
  });

  it('returns the fallback when storage is missing altogether', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readLocalStorage('k', raw => raw, 'fallback')).toBe('fallback');
  });

  it('returns the fallback when decode throws (bad JSON)', () => {
    store.set('k', '{not json');
    expect(readLocalStorage('k', raw => JSON.parse(raw ?? '[]') as unknown, 'fallback')).toBe('fallback');
  });
});

describe('writeLocalStorage', () => {
  it('sets a string and removes the key for null', () => {
    expect(writeLocalStorage('k', '1')).toBe(true);
    expect(store.get('k')).toBe('1');
    expect(writeLocalStorage('k', null)).toBe(true);
    expect(store.has('k')).toBe(false);
  });

  it('returns false instead of throwing when storage refuses', () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    vi.spyOn(storage, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(writeLocalStorage('k', '1')).toBe(false);
    expect(writeLocalStorage('k', null)).toBe(false);
  });
});
