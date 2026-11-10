import { describe, expect, it } from 'vitest';

import { resolveTopViewLink } from '../domain/topview-resolution.js';

const row = (id: string, fromReleaseOrder: number | null) => ({ tieKey: id, fromReleaseOrder });

describe('resolveTopViewLink', () => {
  it('unlinked: no rows', () => expect(resolveTopViewLink([], 3)).toBeNull());
  it('model default only: any target and no target resolve to it', () => {
    const d = row('d', null);
    expect(resolveTopViewLink([d], 3)).toBe(d);
    expect(resolveTopViewLink([d], null)).toBe(d);
  });
  it('no default and every SW row above the target: unlinked', () => {
    expect(resolveTopViewLink([row('a', 5)], 3)).toBeNull();
  });
  it('picks the row at the target, below it, or the greatest one at or below it', () => {
    const [d, a, b, c] = [row('d', null), row('a', 2), row('b', 4), row('c', 7)] as const;
    const rows = [c, d, a, b];
    expect(resolveTopViewLink(rows, 4)).toBe(b); // at
    expect(resolveTopViewLink(rows, 6)).toBe(b); // gap between 4 and 7
    expect(resolveTopViewLink(rows, 2)).toBe(a);
    expect(resolveTopViewLink(rows, 9)).toBe(c);
  });
  it('a target below every SW row falls back to the model default', () => {
    const d = row('d', null);
    expect(resolveTopViewLink([row('a', 5), d], 3)).toBe(d);
  });
  it('a target without SW versions ignores SW rows', () => {
    const d = row('d', null);
    expect(resolveTopViewLink([row('a', 1), d], null)).toBe(d);
  });
  it('equal release orders tie on the smaller key', () => {
    expect(resolveTopViewLink([row('z', 3), row('m', 3)], 5)?.tieKey).toBe('m');
  });
});
