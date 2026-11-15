import { describe, expect, it } from 'vitest';
import { filterBlock, filterRow } from './filterData';
import type { HwTimeBlock } from '../endpoints';
const row = { id: 'EQ-001', equipmentId: 'EQ-001', values: { PM1: 2, PM2: null, PM3: 4 }, total: null,
  judgements: { PM1: { value: 2, status: 'normal' as const, lower: 1, upper: 3 }, PM2: { value: null, status: 'unjudgeable' as const, lower: null, upper: null } } };
describe('checked HW Time series', () => {
  it('filters values, totals and server judgements together, including an empty selection', () => {
    expect(filterRow(row, ['PM1'])).toMatchObject({ values: { PM1: 2 }, total: 2, judgements: { PM1: row.judgements.PM1 } });
    expect(filterRow(row, ['PM1']).judgements).not.toHaveProperty('PM2');
    expect(filterRow(row, []).total).toBeNull();
    expect(filterRow(row, ['PM1', 'PM2']).total).toBeNull();
  });
  it('filters block series and recomputes only the checked series totals', () => {
    const block: HwTimeBlock = { rows: [row], series: ['PM1', 'PM2', 'PM3'].map(id => ({ id, name: id, color: 'chart-blue' })), totals: { values: row.values, total: null } };
    expect(filterBlock(block, ['PM3']).series.map(s => s.id)).toEqual(['PM3']);
    expect(filterBlock(block, ['PM3']).totals).toEqual({ values: { PM3: 4 }, total: 4 });
  });
});
