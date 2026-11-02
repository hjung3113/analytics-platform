import { describe, expect, it } from 'vitest';
import { exportParams } from './tableData';

// Table-owned export params (#173, #556c): ids for a selection, null for the whole filtered set; a select-all scope is refused
// because this table does not enable selectAllResults (ids: null would export the excluded rows).
const drill = { drillModule: 'PM1', drillMotion: 'Pump' } as Parameters<typeof exportParams>[0];
const sorting = [{ id: 'total', desc: true }];

describe('hw-time table export params', () => {
  it('maps selected ids and the filtered scope', () => {
    expect(exportParams(drill, { scope: { kind: 'selected', ids: ['a'] }, sorting })).toEqual({ ...drill, ids: ['a'], sorting });
    expect(exportParams(drill, { scope: { kind: 'filtered' }, sorting })).toEqual({ ...drill, ids: null, sorting });
  });

  it('refuses the all scope', () => {
    expect(() => exportParams(drill, { scope: { kind: 'all', excludedIds: ['a'] }, sorting })).toThrow(/select-all/);
  });
});
