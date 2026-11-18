import { expect, it } from 'vitest';
import type { Occurrence, OccurrenceBatch, SiteWallClock } from '../src/index.js';
import { hasKnownOccurrenceInWindow } from '../src/index.js';

const time = (value: string): SiteWallClock => value as SiteWallClock;

function occurrence(start: string, end: string | null): Occurrence {
  return {
    id: 'occ-1',
    equipmentId: 'eq-1',
    kind: 'VISIT',
    start: { at: time(start), seq: 1, evidence: 'observed' },
    end: end === null ? null : { at: time(end), seq: 2, evidence: 'observed' },
    synthetic: false,
    source: { parserContractVersion: '0.4', dataGeneration: 'test' },
  };
}

function batch(watermarkAt: string, records: Occurrence[]): Pick<OccurrenceBatch, 'occurrences' | 'watermark'> {
  return { occurrences: records, watermark: { seq: 2, at: time(watermarkAt) } };
}

it.each([
  {
    name: 'a window after the watermark',
    data: batch('2026-09-01T10:00:00.000', [occurrence('2026-09-01T10:30:00.000', '2026-09-01T10:40:00.000')]),
    window: { from: time('2026-09-01T10:20:00.000'), to: time('2026-09-01T10:50:00.000') },
    expected: false,
  },
  {
    name: 'a window with no overlapping known interval',
    data: batch('2026-01-01T11:00:00.000', [occurrence('2026-01-01T10:00:00.000', '2026-01-01T10:10:00.000')]),
    window: { from: time('2026-01-01T10:20:00.000'), to: time('2026-01-01T10:30:00.000') },
    expected: false,
  },
  {
    name: 'an interval that ends exactly at the window start (exclusive end)',
    data: batch('2026-01-01T11:00:00.000', [occurrence('2026-01-01T10:00:00.000', '2026-01-01T10:20:00.000')]),
    window: { from: time('2026-01-01T10:20:00.000'), to: time('2026-01-01T10:30:00.000') },
    expected: false,
  },
  {
    name: 'a window with a known overlapping interval',
    data: batch('2026-01-01T11:00:00.000', [occurrence('2026-01-01T10:00:00.000', '2026-01-01T10:25:00.000')]),
    window: { from: time('2026-01-01T10:20:00.000'), to: time('2026-01-01T10:30:00.000') },
    expected: true,
  },
])('detects replay data for $name', ({ data, window, expected }) => {
  expect(hasKnownOccurrenceInWindow(data, window)).toBe(expected);
});
