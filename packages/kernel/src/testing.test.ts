import { describe, expect, it } from 'vitest';
import { memoryStorage } from './testing';

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
