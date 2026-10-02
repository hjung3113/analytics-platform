import { describe, expect, it } from 'vitest';
import type { CatalogFilter } from '../endpoints';
import { exportParams } from './data';

// Table-owned export (#173): the page builds only the endpoint params — catalog filters plus the selection ids.

describe('metric-catalog export params', () => {
  const filter: CatalogFilter = { q: 'cycle', status: 'published', domain: 'time', lang: 'ko' };

  it('carries the catalog filters and ids for a selection export', () => {
    expect(exportParams(filter, { kind: 'selected', ids: ['cycle_time', 'throughput'] }))
      .toEqual({ q: 'cycle', status: 'published', domain: 'time', lang: 'ko', ids: ['cycle_time', 'throughput'] });
  });

  it('uses ids: null for the all-filtered export', () => {
    expect(exportParams(filter, { kind: 'filtered' })).toEqual({ q: 'cycle', status: 'published', domain: 'time', lang: 'ko', ids: null });
  });
});
