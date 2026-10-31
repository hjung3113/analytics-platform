import { describe, expect, it } from 'vitest';
import { columnFilter, fields } from './data';
import { equipmentPageFilterFields } from './filter-fields';

// ADR-0104 / §15: one field is never declared in both filter systems (page filters vs. column filters).
describe('equipment column filters (#556b)', () => {
  it('declares no column filter on a field the page already filters', () => {
    const pageKeys = equipmentPageFilterFields({ values: { q: '', status: '', maker: '' }, set: () => {}, makers: [], lang: 'ko' }).map(f => f.key);
    const overlap = fields.map(f => f.key).filter(key => pageKeys.includes(key) && columnFilter(key) !== undefined);
    expect(overlap).toEqual([]);
  });

  it('gives the 라인 column an enum filter whose options are the mock lines', () => {
    expect(columnFilter('line')).toEqual({ kind: 'enum', options: ['L1', 'L2', 'L3', 'L4'].map(value => ({ value, label: value })) });
  });
});
