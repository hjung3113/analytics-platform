import { describe, expect, it } from 'vitest';
import type { CatalogFilter } from '../endpoints';
import { exportFilterSummary, exportParams } from './data';

// Table-owned export (#173): the page builds only the endpoint params — the quick search, the selection ids,
// the table's active sort and its conditions (export order = page order, UX P2-6). The file, outcome handling
// and toasts belong to PlatformDataTable.

const sorting = [{ id: 'metricId', desc: false }];
const filters = [{ id: 'status', op: 'in' as const, value: ['published'] }];

describe('metric-catalog export params', () => {
  const filter: CatalogFilter = { q: 'cycle', lang: 'ko' };

  it('carries the quick search, ids and the table sort for a selection export', () => {
    expect(exportParams(filter, { scope: { kind: 'selected', ids: ['cycle_time', 'throughput'] }, sorting }))
      .toEqual({ q: 'cycle', lang: 'ko', ids: ['cycle_time', 'throughput'], sorting });
  });

  it('uses ids: null for the all-filtered export', () => {
    expect(exportParams(filter, { scope: { kind: 'filtered' }, sorting }))
      .toEqual({ q: 'cycle', lang: 'ko', ids: null, sorting });
  });

  it('passes the table conditions through only when the request has them (ADR-0105)', () => {
    expect(exportParams(filter, { scope: { kind: 'filtered' }, sorting, filters }))
      .toEqual({ q: 'cycle', lang: 'ko', ids: null, sorting, filters });
    expect(exportParams(filter, { scope: { kind: 'filtered' }, sorting })).not.toHaveProperty('filters');
  });
});

describe('metric-catalog export params with a select-all scope (#556c)', () => {
  it('refuses the all scope: this table does not enable selectAllResults, and ids: null would export the excluded rows', () => {
    expect(() => exportParams({ q: '', lang: 'ko' } as CatalogFilter, { scope: { kind: 'all', excludedIds: ['cycle_time'] }, sorting })).toThrow(/select-all/);
  });
});

describe('metric-catalog export filter summary (#173 review P2-3)', () => {
  it('carries the quick search and omits an unset one; the conditions are listed by the table itself (필터 · 상태 …)', () => {
    expect(exportFilterSummary({ q: 'cycle', lang: 'ko' }, 'ko')).toEqual([['검색어', 'cycle']]);
    expect(exportFilterSummary({ q: 'cycle', lang: 'en' }, 'en')).toEqual([['Search', 'cycle']]);
    expect(exportFilterSummary({ q: null, lang: 'ko' }, 'ko')).toEqual([]);
  });
});
