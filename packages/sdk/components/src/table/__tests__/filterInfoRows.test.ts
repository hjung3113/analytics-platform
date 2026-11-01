import { describe, expect, it } from 'vitest';
import type { ColumnFilter, ColumnFilterSpec } from '@ap/contracts';
import { filterInfoRows } from '../columnFilters';
import { FILTER_OP_LABELS } from '../filterOps';
import { FILTER_OPS_BY_KIND } from '@ap/contracts';

const enumSpec: ColumnFilterSpec = { kind: 'enum', options: [{ value: 'a', label: '사용' }] };

describe('filterInfoRows (XLSX 조회 정보, ADR-0105)', () => {
  it('names a column by its header and a non-column field by its label with one 「필터 · 」 prefix', () => {
    const filters: ColumnFilter[] = [{ id: 'name', op: 'contains', value: 'x' }, { id: 'state', op: 'in', value: ['a'] }, { id: 'ghost', op: 'isEmpty' }];
    const rows = filterInfoRows(filters, [{ id: 'name', header: '이름' }, { id: 'state', label: '상태', filter: enumSpec }], 'ko');
    expect(rows).toEqual([['필터 · 이름', '포함 "x"'], ['필터 · 상태', '사용'], ['필터 · ghost', '비어 있음']]);
    expect(filterInfoRows([{ id: 'name', op: 'contains', value: 'x' }], [{ id: 'name', header: 'Name' }], 'en')).toEqual([['Filter · Name', 'contains "x"']]);
  });

  it('prints the editor wording for the new operators', () => {
    const rows = filterInfoRows([
      { id: 'a', op: 'notContains', value: 'x' }, { id: 'b', op: 'gt', value: 3 }, { id: 'c', op: 'before', value: '2026-01-01' }, { id: 'd', op: 'notIn', value: ['p', 'q'] }, { id: 'e', op: 'isNotEmpty' },
    ], [], 'ko');
    expect(rows.map(r => r[1])).toEqual(['포함하지 않음 x', '초과 3', '이전 2026-01-01', '다음 중 아님 p, q', '비어 있지 않음']);
  });

  it('has a Korean and English word for every operator of the vocabulary', () => {
    for (const ops of Object.values(FILTER_OPS_BY_KIND)) for (const op of ops) {
      expect(FILTER_OP_LABELS[op].ko).not.toBe('');
      expect(FILTER_OP_LABELS[op].en).not.toBe('');
    }
  });

  it('prints an instant bound with the field entry: seconds and zone; without entry the minute form in the viewer zone', () => {
    const filters: ColumnFilter[] = [{ id: 'at', op: 'between', value: { from: '2026-09-24T00:00:05Z', to: '2026-09-24T00:00:10Z' } }];
    const spec: ColumnFilterSpec = { kind: 'instant' };
    expect(filterInfoRows(filters, [{ id: 'at', label: '시각', filter: spec, entry: { timeZone: 'Asia/Seoul', precision: 'second' } }], 'ko')[0]![1]).toBe('26. 9. 24. 오전 9:00:05 ~ 26. 9. 24. 오전 9:00:10');
    expect(filterInfoRows(filters, [{ id: 'at', label: '시각', filter: spec, entry: { timeZone: 'Asia/Seoul' } }], 'ko')[0]![1]).toBe('26. 9. 24. 오전 9:00 ~ 26. 9. 24. 오전 9:00');
  });
});
