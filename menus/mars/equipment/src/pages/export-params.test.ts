import { describe, expect, it } from 'vitest';
import type { EquipmentFilter } from '../endpoints';
import { exportFilterSummary, exportParams } from './data';

// Table-owned export (#173): the page builds only the endpoint params — filters, the selection ids and the
// table's active sort (export order = page order, UX P2-6). The file, outcome handling and toasts belong to
// PlatformDataTable.

const sorting = [{ id: 'equipmentId', desc: true }];

describe('equipment-master export params', () => {
  const filter: EquipmentFilter = { q: 'etch' };

  it('carries the page filters, ids and the table sort for a selection export', () => {
    expect(exportParams(filter, { scope: { kind: 'selected', ids: ['MEM-PHOTO-0103', 'MEM-ETCH-0102'] }, sorting }))
      .toEqual({ q: 'etch', ids: ['MEM-PHOTO-0103', 'MEM-ETCH-0102'], sorting });
  });

  it('uses ids: null for the all-filtered export so the server reads the whole filtered set', () => {
    expect(exportParams(filter, { scope: { kind: 'filtered' }, sorting }))
      .toEqual({ q: 'etch', ids: null, sorting });
  });
});

describe('equipment-master export params with a select-all scope (#556c)', () => {
  it('maps the all scope to excludedIds with ids: null, so the server reads the whole filtered set minus the exclusions', () => {
    const filter: EquipmentFilter = { q: 'etch' };
    const filters = [{ id: 'status', op: 'in' as const, value: ['active'] }];
    expect(exportParams(filter, { scope: { kind: 'all', excludedIds: ['MEM-1'] }, sorting, filters }))
      .toEqual({ q: 'etch', ids: null, excludedIds: ['MEM-1'], sorting, filters });
  });
});

describe('equipment-master export params with column filters (#556b)', () => {
  it('passes the column filters through only when the request has them', () => {
    const filters = [{ id: 'status', op: 'in' as const, value: ['active'] }];
    const filter: EquipmentFilter = { q: '' };
    expect(exportParams(filter, { scope: { kind: 'filtered' }, sorting, filters }))
      .toEqual({ q: '', ids: null, sorting, filters });
    expect(exportParams(filter, { scope: { kind: 'filtered' }, sorting })).not.toHaveProperty('filters');
  });
});

describe('equipment-master export filter summary (#173 review P2-3)', () => {
  it('renders the search as the screen labels it and omits an unset one; conditions are listed by the table', () => {
    expect(exportFilterSummary({ q: 'etch' }, 'ko'))
      .toEqual([['검색어', 'etch']]);
    expect(exportFilterSummary({ q: 'etch' }, 'en'))
      .toEqual([['Search', 'etch']]);
    expect(exportFilterSummary({ q: '' }, 'ko')).toEqual([]);
  });
});
