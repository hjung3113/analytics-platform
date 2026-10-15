import { describe, expect, it } from 'vitest';
import type { CatalogRow, Lang, Text } from '../endpoints';
import { DOMAIN_LABEL, STATUS_LABEL } from './data';
import { catalogColumns } from './columns';

// #173 review P3-8: the exportValue labels had no coverage — removing one would silently change export text.

const row: CatalogRow = {
  metricId: 'cycle_time', nameKo: '사이클타임', nameEn: 'Cycle time', nameSort: 'cycle_time',
  domain: 'time', grain: 'equipment × hour', numerator: 'run_minutes', denominator: 'runs',
  publishedPointer: '3', catalogVersion: '3', draftVersion: '4', status: 'published',
  ownerId: 'u1', owner: '생산팀', updatedAt: '2026-10-01T09:30:00+09:00',
};

const columnById = (lang: Lang) => {
  const columns = catalogColumns({ lang, linkTo: () => '/metrics/cycle_time', tx: (text: Text) => text[lang] });
  return Object.fromEntries(columns.map(column => [column.id, column])) as Record<string, (typeof columns)[number]>;
};

describe('metric catalog columns exportValue labels (#173 P3-8)', () => {
  it('exports the same labels the cells show: name by language, domain and status via tx, pointer v3, updatedAt minute-precision', () => {
    const ko = columnById('ko');
    expect(ko.nameSort.exportValue!(row)).toBe('사이클타임');
    expect(ko.domain.exportValue!(row)).toBe(DOMAIN_LABEL.time.ko);
    expect(ko.status.exportValue!(row)).toBe(STATUS_LABEL.published.ko);
    expect(ko.publishedPointer.exportValue!(row)).toBe('v3');
    expect(ko.updatedAt.exportValue!(row)).toBe('2026-10-01 09:30');

    const en = columnById('en');
    expect(en.nameSort.exportValue!(row)).toBe('Cycle time');
    expect(en.domain.exportValue!(row)).toBe(DOMAIN_LABEL.time.en);
    expect(en.status.exportValue!(row)).toBe(STATUS_LABEL.published.en);
  });

  it('a metric without a published pointer exports an empty cell, not the screen-only muted “없음”', () => {
    const ko = columnById('ko');
    expect(ko.publishedPointer.exportValue!({ ...row, publishedPointer: null })).toBeNull();
  });

  it('columns without exportValue fall back to row[id] (metricId, grain, owner stay machine values)', () => {
    const ko = columnById('ko');
    expect(ko.metricId.exportValue).toBeUndefined();
    expect(ko.grain.exportValue).toBeUndefined();
    expect(ko.owner.exportValue).toBeUndefined();
  });
});
