import { describe, expect, it } from 'vitest';
import type { ColumnFilter } from '@ap/contracts';
import { tableExportParams } from '../PlatformDataTable';

const sorting = [{ id: 'name', desc: false }];
const filters: ColumnFilter[] = [{ id: 'status', op: 'in', value: ['run'] }];

describe('tableExportParams (#1974)', () => {
  it('passes a selected scope as its ids', () => {
    expect(tableExportParams({ scope: { kind: 'selected', ids: ['a', 'b'] }, sorting })).toEqual({ ids: ['a', 'b'], sorting });
  });

  it('turns a filtered scope into ids: null', () => {
    expect(tableExportParams({ scope: { kind: 'filtered' }, sorting })).toEqual({ ids: null, sorting });
  });

  it('turns an all scope into ids: null plus excludedIds when the table declared selectAll', () => {
    expect(tableExportParams({ scope: { kind: 'all', excludedIds: ['x'] }, sorting }, { selectAll: true }))
      .toEqual({ ids: null, excludedIds: ['x'], sorting });
  });

  it('refuses an all scope from a table that did not declare selectAll, so excluded rows are never exported', () => {
    expect(() => tableExportParams({ scope: { kind: 'all', excludedIds: ['x'] }, sorting })).toThrow(/selectAll/);
    expect(() => tableExportParams({ scope: { kind: 'all', excludedIds: [] }, sorting }, { selectAll: false })).toThrow(/selectAll/);
  });

  it('carries column filters only when the request has some', () => {
    expect(tableExportParams({ scope: { kind: 'filtered' }, sorting, filters })).toEqual({ ids: null, sorting, filters });
    expect(tableExportParams({ scope: { kind: 'filtered' }, sorting, filters: [] })).not.toHaveProperty('filters');
    expect(tableExportParams({ scope: { kind: 'filtered' }, sorting })).not.toHaveProperty('filters');
  });
});
