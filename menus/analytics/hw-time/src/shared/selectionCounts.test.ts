import { describe, expect, it } from 'vitest';
import type { HwTimeBlock } from '../endpoints';
import { selectionCounts } from './selectionCounts';

const block = (rows: HwTimeBlock['rows']): HwTimeBlock => ({ series: [], rows, totals: { values: {}, total: null } });

describe('selectionCounts', () => {
  it('counts distinct equipment; an equipment with only unmeasured values is selected, not evaluated; auxiliary rows are skipped', () => {
    const counts = selectionCounts(block([
      { id: 'EQ-001.H1', equipmentId: 'EQ-001', values: { a: 1 }, total: 1 },
      { id: 'EQ-001.H2', equipmentId: 'EQ-001', values: { a: 2 }, total: 2 },
      { id: 'EQ-002.H1', equipmentId: 'EQ-002', values: { a: null }, total: null },
      { id: 'EQ-003.MEG', equipmentId: 'EQ-003', auxiliary: { kind: 'MEG', label: 'MEG 4.0317' }, values: { a: 9 }, total: 9 },
    ]));
    expect(counts).toEqual({ ko: '선택 2 · 평가 1', en: 'Selected 2 · Evaluated 1' });
  });
});
