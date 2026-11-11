import { describe, expect, it } from 'vitest';
import { hostWallClock, readHostProps } from '../src/host-props.js';
import { mergePages } from '../src/replay-load.js';
import { batch, pages } from './replay-fixture.js';

describe('hostWallClock', () => {
  it.each([
    ['2026-01-01T10:30:00', '2026-01-01T10:30:00.000'],
    ['2026-01-01T10:30:00.250', '2026-01-01T10:30:00.250'],
    ['2026-01-01T10:30:00Z', null],
    ['2026-01-01', null],
  ])('%s → %s', (input, expected) => {
    expect(hostWallClock(input)).toBe(expected);
  });
});

describe('readHostProps', () => {
  const read = (global: { from: string | null; to: string | null }) => readHostProps({ pageParam: () => null, global: global as never }).time;
  it('pads the host time once, never invents a range', () => {
    expect(read({ from: '2026-01-01T10:00:00', to: '2026-01-01T10:30:00' }))
      .toEqual({ kind: 'applied', from: '2026-01-01T10:00:00.000', to: '2026-01-01T10:30:00.000' });
    expect(read({ from: '2026-01-01T10:00:00', to: null })).toEqual({ kind: 'missing' });
    expect(read({ from: '2026-01-01T11:00:00', to: '2026-01-01T10:30:00' }).kind).toBe('invalid');
    expect(read({ from: '2026-02-30T10:00:00', to: '2026-02-30T11:00:00' }).kind).toBe('invalid');
  });
});

describe('mergePages', () => {
  it('concatenates in server page order, keeps the first page window, takes the greatest Watermark, drops the token', () => {
    const [first, second] = pages();
    const merged = mergePages([second, first]);
    expect(merged.occurrences.map((o) => o.id)).toEqual([...second.occurrences, ...first.occurrences].map((o) => o.id));
    expect(merged.watermark).toEqual(batch.watermark);
    expect(merged.continuationToken).toBeUndefined();
    expect(mergePages([first, second]).issues).toEqual(batch.issues);
  });

  it('rejects a later page that names another window or equipment', () => {
    const [first, second] = pages();
    expect(() => mergePages([first, { ...second, dataGeneration: 'g2' }])).toThrow(/dataGeneration/);
    expect(() => mergePages([first, { ...second, equipmentId: 'eq-other' }])).toThrow(/equipmentId/);
  });
});
