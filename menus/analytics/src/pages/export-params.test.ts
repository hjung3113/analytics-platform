import { describe, expect, it } from 'vitest';
import type { SlowFilter } from '../endpoints';
import { exportParams, exportRowsWhenConfirmed } from './cycleData';

// Table-owned export (#173): the page builds only the endpoint params — page filters plus the selection
// execution keys (the same codec as the table row id, executionKey).

describe('cycle-time export params', () => {
  const filter: SlowFilter = { tail: 'p95', granularity: 'hour', bucket: '2026-09-25T10:00:00', bin: { from: '45-60', to: '60-75' } };

  it('carries the page filters and execution keys for a selection export', () => {
    expect(exportParams(filter, { kind: 'selected', ids: ['ICH-PHOTO-0103|2026-09-25T10:00:00'] }))
      .toEqual({ ...filter, ids: ['ICH-PHOTO-0103|2026-09-25T10:00:00'] });
  });

  it('uses ids: null for the all-filtered export', () => {
    expect(exportParams(filter, { kind: 'filtered' })).toEqual({ ...filter, ids: null });
  });

  it('offers no export reader while the metric version is unconfirmed (D-9: no export menu, not a header-only file)', () => {
    const read = () => Promise.resolve(null);
    expect(exportRowsWhenConfirmed(null, read)).toBeUndefined();
    expect(exportRowsWhenConfirmed('3', read)).toBe(read);
  });
});
