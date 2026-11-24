import { describe, expect, it } from 'vitest';
import type { ColumnFilter } from '@ap/contracts';
import { applyRunPanelFilters, changeRunPanelFilters, runPanelFilterFields } from './runPanelFilters';

const rows = [
  { id: 'a', equipmentId: 'MEM-PHOTO-0103', at: '2026-09-19T12:00:00', value: 8, judgement: { status: 'over' as const } },
  { id: 'b', equipmentId: 'MEM-PHOTO-0105', at: '2026-09-20T12:00:00', value: 1, judgement: { status: 'under' as const } },
  { id: 'c', equipmentId: 'MEM-PHOTO-0103', at: '2026-09-21T12:00:00', value: 3, judgement: { status: 'normal' as const } },
];
const fields = runPanelFilterFields(['MEM-PHOTO-0103', 'MEM-PHOTO-0105'], 'ko');

describe('panel-only narrowing via SDK column filter grammar', () => {
  it.each([
    [{ id: 'equipment', op: 'in', value: ['MEM-PHOTO-0103'] }, ['a', 'c']],
    [{ id: 'status', op: 'in', value: ['outside'] }, ['a', 'b']],
    [{ id: 'value', op: 'between', value: [2, 9] }, ['a', 'c']],
    [{ id: 'date', op: 'between', value: { from: '2026-09-19', to: '2026-09-21' } }, ['a', 'b']],
  ] as [ColumnFilter, string[]][])('applies %j to fetched run or daily rows without adding data', (filter, ids) => {
    const result = applyRunPanelFilters(rows, [filter], fields);
    expect(result.validation.ok).toBe(true);
    expect(result.rows.map(p => p.id)).toEqual(ids);
    expect(rows).toHaveLength(3);
  });
  it('uses AND and clears back to the inherited menu population', () => {
    let filters: ColumnFilter[] = [];
    filters = changeRunPanelFilters(filters, [{ id: 'equipment', op: 'in', value: ['MEM-PHOTO-0103'] }], fields).filters;
    filters = changeRunPanelFilters(filters, [...filters, { id: 'status', op: 'in', value: ['outside'] }], fields).filters;
    expect(applyRunPanelFilters(rows, filters, fields).rows.map(p => p.id)).toEqual(['a']);
    filters = changeRunPanelFilters(filters, filters.filter(f => f.id !== 'status'), fields).filters;
    expect(filters).toHaveLength(1);
    expect(applyRunPanelFilters(rows, [], fields).rows).toEqual(rows);
  });
  it('keeps the last valid state on an invalid onChange(next) and resets with an empty next array', () => {
    const before: ColumnFilter[] = [{ id: 'equipment', op: 'in', value: ['MEM-PHOTO-0103'] }];
    const rejected = changeRunPanelFilters(before, [{ id: 'equipment', op: 'in', value: ['outside-menu'] }], fields);
    expect(rejected.validation.ok).toBe(false);
    expect(rejected.filters).toEqual(before);
    expect(changeRunPanelFilters(before, [], fields).filters).toEqual([]);
  });
  it.each([
    { id: 'equipment', op: 'in', value: ['outside-menu'] },
    { id: 'status', op: 'in', value: ['normal'] },
    { id: 'value', op: 'between', value: [9, 2] },
    { id: 'date', op: 'between', value: { from: '2026-09-21', to: '2026-09-19' } },
    { id: 'equipment', op: 'notIn', value: ['MEM-PHOTO-0103'] },
  ] as ColumnFilter[])('rejects invalid %j without falling back to the unfiltered population', filter => {
    const result = applyRunPanelFilters(rows, [filter], fields);
    expect(result.validation.ok).toBe(false);
    expect(result.rows).toEqual([]);
  });
});
