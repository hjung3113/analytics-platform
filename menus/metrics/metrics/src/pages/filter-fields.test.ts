import { describe, expect, it, vi } from 'vitest';
import { metricCatalogHasActiveFilters, metricCatalogPageFilterFields, resetMetricCatalogPageFilters } from './filter-fields';

describe('metric catalog PageFilterBar URL fields (#54)', () => {
  it('writes q/status/domain keys, resets page on changes, and clears all filter keys', () => {
    const setPage = vi.fn();
    const fields = metricCatalogPageFilterFields({
      q: null, status: null, domain: 'bogus', lang: 'en', tx: text => text.en, setPage,
    });
    const q = fields.find(field => field.key === 'q');
    const status = fields.find(field => field.key === 'status');
    const domain = fields.find(field => field.key === 'domain');
    expect(q?.kind).toBe('search');
    expect(status?.kind).toBe('select');
    expect(domain?.kind).toBe('select');
    if (q?.kind !== 'search' || status?.kind !== 'select' || domain?.kind !== 'select') throw new Error('Expected metric filter field kinds');

    expect(domain.value).toBe('bogus');
    q.onValueChange('yield');
    status.onValueChange('published');
    domain.onValueChange('quality');
    expect(setPage.mock.calls).toEqual([
      [{ q: 'yield', page: null }, { replace: true }],
      [{ status: 'published', page: null }],
      [{ domain: 'quality', page: null }],
    ]);

    resetMetricCatalogPageFilters(setPage);
    expect(setPage).toHaveBeenLastCalledWith({ q: null, status: null, domain: null, page: null });
  });

  it('does not create an empty reset action for an empty q URL value', () => {
    expect(metricCatalogHasActiveFilters('', null, null)).toBe(false);
    expect(metricCatalogHasActiveFilters(null, 'published', null)).toBe(true);
  });
});
