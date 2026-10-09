import { describe, expect, it } from 'vitest';
import type { SlowFilter } from '../endpoints';
import { exportFilterSummary, exportParams, exportRowsWhenConfirmed, qualityLabel } from './cycleData';

// Table-owned export (#173): the page builds only the endpoint params — page filters, the selection
// execution keys (the same codec as the table row id, executionKey) and the table's active sort.

const sorting = [{ id: 'cycleMin', desc: true }];

describe('cycle-time export params', () => {
  const filter: SlowFilter = { tail: 'p95', granularity: 'hour', bucket: '2026-09-25T10:00:00', bin: { from: '45-60', to: '60-75' } };

  it('carries the page filters, execution keys and the table sort for a selection export', () => {
    expect(exportParams(filter, { scope: { kind: 'selected', ids: ['ICH-PHOTO-0103|2026-09-25T10:00:00'] }, sorting }))
      .toEqual({ ...filter, ids: ['ICH-PHOTO-0103|2026-09-25T10:00:00'], sorting });
  });

  it('uses ids: null for the all-filtered export', () => {
    expect(exportParams(filter, { scope: { kind: 'filtered' }, sorting })).toEqual({ ...filter, ids: null, sorting });
  });

  it('offers no export reader while the metric version is unconfirmed (D-9: no export menu, not a header-only file)', () => {
    const read = () => Promise.resolve(null);
    expect(exportRowsWhenConfirmed(null, read)).toBeUndefined();
    expect(exportRowsWhenConfirmed('3', read)).toBe(read);
  });
});

describe('cycle-time export filter summary (#173 review P2-3)', () => {
  it('labels tail, grain, bucket and histogram exactly as the screen chips do, in the screen order', () => {
    expect(exportFilterSummary({ tail: 'p95', granularity: 'day', bucket: '2026-09-25T10:00:00', bin: { from: '45-60', to: '60-75' } }, true))
      .toEqual([['느린 실행 기준', '≥ P95'], ['집계', '일'], ['버킷', '2026-09-25 10:00:00 → 2026-09-26 10:00:00'], ['분포 구간', '45-60 – 60-75']]);
    expect(exportFilterSummary({ tail: 'all', granularity: 'hour', bucket: null, bin: { from: '90+', to: '90+' } }, false))
      .toEqual([['Slow-execution predicate', 'All executions'], ['Grain', 'Hour'], ['Histogram', '90+']]);
  });
});

describe('quality label (#173 P3-7)', () => {
  it('is the single text for the cell badge and the export value, in both languages', () => {
    expect(qualityLabel('review', true)).toBe('검토 표시');
    expect(qualityLabel('unknown', true)).toBe('미확정');
    expect(qualityLabel('review', false)).toBe('Review flag');
    expect(qualityLabel('unknown', false)).toBe('Unconfirmed');
  });
});
