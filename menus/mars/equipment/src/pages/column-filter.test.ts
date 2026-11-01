import { describe, expect, it } from 'vitest';
import { equipmentFilterSpecs } from '../endpoints';
import { columnFilter, fields, filterSpecs, legacyFilterKeys, pinnedFilterKeys } from './data';

// ADR-0104/0105: every filterable field is declared once (endpoints.ts carries the wire meaning, data.ts the words); 상태 and Maker are fields too.
describe('equipment filter fields (#1217)', () => {
  it('declares exactly the wire fields as filterable columns', () => {
    expect(fields.map(f => f.key).filter(key => columnFilter(key) !== undefined).sort()).toEqual(Object.keys(equipmentFilterSpecs).sort());
  });

  it('gives the 라인 column an enum filter whose options are the mock lines', () => {
    expect(columnFilter('line')).toMatchObject({ kind: 'enum', options: ['L1', 'L2', 'L3', 'L4'].map(value => ({ value, label: value })) });
  });

  it('makes 상태 an enum over the four statuses labelled per language, with only in/notIn', () => {
    expect(columnFilter('status', [], 'ko')).toEqual({ kind: 'enum', ops: ['in', 'notIn'], options: [
      { value: 'active', label: '사용중' }, { value: 'idle', label: '대기' }, { value: 'maintenance', label: '정비' }, { value: 'retired', label: '사용중지' },
    ] });
    expect(columnFilter('status', [], 'en')).toMatchObject({ options: expect.arrayContaining([{ value: 'active', label: 'Active' }]) });
  });

  it('takes the Maker options from the makers endpoint', () => {
    expect(columnFilter('maker', ['TEL', 'AMAT'])).toMatchObject({ kind: 'enum', options: [{ value: 'TEL', label: 'TEL' }, { value: 'AMAT', label: 'AMAT' }] });
    expect(filterSpecs([], 'ko').maker).toMatchObject({ options: [] });
  });

  it('pins 상태 and Maker only', () => {
    expect(pinnedFilterKeys).toEqual(['status', 'maker']);
  });

  it('keeps the wire ops whitelist narrower than the kind (P11): no endsWith on text, no number ops on dates', () => {
    expect(equipmentFilterSpecs.model).toMatchObject({ kind: 'text', ops: expect.not.arrayContaining(['endsWith']) });
    expect(equipmentFilterSpecs.validFrom).toMatchObject({ kind: 'date', ops: ['between', 'before', 'after', 'isEmpty'] });
  });
});

describe('equipment legacy filter keys (ADR-0105 §6, P8)', () => {
  const byKey = Object.fromEntries(legacyFilterKeys.map(entry => [entry.key, entry.toFilter]));

  it('converts status= and maker= to one-value `in` conditions', () => {
    expect(legacyFilterKeys.map(entry => entry.key)).toEqual(['status', 'maker']);
    expect(byKey.status!('active')).toEqual({ id: 'status', op: 'in', value: ['active'] });
    expect(byKey.maker!('TEL')).toEqual({ id: 'maker', op: 'in', value: ['TEL'] });
  });
});
