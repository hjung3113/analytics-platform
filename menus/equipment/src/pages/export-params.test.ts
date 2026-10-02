import { describe, expect, it } from 'vitest';
import type { EquipmentFilter } from '../endpoints';
import { exportFilterSummary, exportParams } from './data';

// Table-owned export (#173): the page builds only the endpoint params — filters, the selection ids and the
// table's active sort (export order = page order, UX P2-6). The file, outcome handling and toasts belong to
// PlatformDataTable.

const sorting = [{ id: 'equipmentId', desc: true }];

describe('equipment-master export params', () => {
  const filter: EquipmentFilter = { q: 'etch', status: 'active', maker: 'ACME' };

  it('carries the page filters, ids and the table sort for a selection export', () => {
    expect(exportParams(filter, { scope: { kind: 'selected', ids: ['ICH-PHOTO-0103', 'ICH-ET-102'] }, sorting }))
      .toEqual({ q: 'etch', status: 'active', maker: 'ACME', ids: ['ICH-PHOTO-0103', 'ICH-ET-102'], sorting });
  });

  it('uses ids: null for the all-filtered export so the server reads the whole filtered set', () => {
    expect(exportParams(filter, { scope: { kind: 'filtered' }, sorting }))
      .toEqual({ q: 'etch', status: 'active', maker: 'ACME', ids: null, sorting });
  });
});

describe('equipment-master export filter summary (#173 review P2-3)', () => {
  it('renders the set filters as the screen labels them and omits unset ones', () => {
    expect(exportFilterSummary({ q: 'etch', status: 'active', maker: 'ACME' }, 'ko'))
      .toEqual([['검색어', 'etch'], ['상태', '사용중'], ['Maker', 'ACME']]);
    expect(exportFilterSummary({ q: 'etch', status: 'active', maker: 'ACME' }, 'en'))
      .toEqual([['Search', 'etch'], ['Status', 'Active'], ['Maker', 'ACME']]);
    expect(exportFilterSummary({ q: '', status: '', maker: '' }, 'ko')).toEqual([]);
  });
});
