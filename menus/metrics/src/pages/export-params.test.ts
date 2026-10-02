import { describe, expect, it } from 'vitest';
import type { CatalogFilter, Text } from '../endpoints';
import { DOMAIN_LABEL, STATUS_LABEL, exportFilterSummary, exportParams } from './data';

// Table-owned export (#173): the page builds only the endpoint params — catalog filters, the selection ids
// and the table's active sort (export order = page order, UX P2-6).

const sorting = [{ id: 'metricId', desc: false }];
const tx = (text: Text) => text.ko;

describe('metric-catalog export params', () => {
  const filter: CatalogFilter = { q: 'cycle', status: 'published', domain: 'time', lang: 'ko' };

  it('carries the catalog filters, ids and the table sort for a selection export', () => {
    expect(exportParams(filter, { scope: { kind: 'selected', ids: ['cycle_time', 'throughput'] }, sorting }))
      .toEqual({ q: 'cycle', status: 'published', domain: 'time', lang: 'ko', ids: ['cycle_time', 'throughput'], sorting });
  });

  it('uses ids: null for the all-filtered export', () => {
    expect(exportParams(filter, { scope: { kind: 'filtered' }, sorting }))
      .toEqual({ q: 'cycle', status: 'published', domain: 'time', lang: 'ko', ids: null, sorting });
  });
});

describe('metric-catalog export filter summary (#173 review P2-3)', () => {
  it('renders the set filters as the screen labels them and omits unset ones', () => {
    expect(exportFilterSummary({ q: 'cycle', status: 'published', domain: 'time', lang: 'ko' }, 'ko', tx))
      .toEqual([['검색어', 'cycle'], ['상태', STATUS_LABEL.published.ko], ['도메인', DOMAIN_LABEL.time.ko]]);
    expect(exportFilterSummary({ q: 'cycle', status: 'published', domain: 'time', lang: 'ko' }, 'en', text => text.en))
      .toEqual([['Search', 'cycle'], ['Status', STATUS_LABEL.published.en], ['Domain', DOMAIN_LABEL.time.en]]);
    expect(exportFilterSummary({ q: null, status: null, domain: null, lang: 'ko' }, 'ko', tx)).toEqual([]);
  });
});
