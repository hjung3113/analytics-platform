import { describe, expect, it } from 'vitest';
import type { ColumnFilter } from '@ap/contracts';
import { catalogFilterDeclarations, catalogFilterOptions, catalogValueCheck } from './filter-fields';

// ADR-0105 (#1218): 상태·도메인 are pinned enum conditions of the hidden repeated `filter` key.
describe('metric catalog filter declarations (#1218)', () => {
  it('declares 상태 and 도메인 as pinned enum fields with one in-value', () => {
    expect(catalogFilterDeclarations.map(field => field.id)).toEqual(['status', 'domain']);
    for (const field of catalogFilterDeclarations) {
      expect(field.pinned).toBe(true);
      expect(field.spec).toMatchObject({ kind: 'enum', ops: ['in'], multiple: false });
      expect(field.spec && field.spec.kind === 'enum' && field.spec.options.map(option => option.value)).toEqual(
        field.id === 'status' ? ['draft', 'published', 'deprecated'] : ['productivity', 'time', 'movement', 'quality', 'maintenance'],
      );
    }
  });

  it('keeps the raw enum tokens off the URL spec and localizes the editor options', () => {
    expect(catalogFilterOptions('status', 'ko')).toEqual([
      { value: 'draft', label: '초안' }, { value: 'published', label: '발행' }, { value: 'deprecated', label: '폐기' },
    ]);
    expect(catalogFilterOptions('domain', 'en')).toEqual([
      { value: 'productivity', label: 'Productivity' }, { value: 'time', label: 'Time' }, { value: 'movement', label: 'Movement' },
      { value: 'quality', label: 'Quality' }, { value: 'maintenance', label: 'Maintenance' },
    ]);
  });

  it.each([
    ['status', ['draft', 'published'], null],
    ['domain', ['time'], null],
    ['status', ['bogus'], '등록되지 않은 발행 상태입니다.'],
    ['domain', ['quality', 'nope'], '등록되지 않은 도메인입니다.'],
  ] as const)('value check for %s %j → %s', (id, value, expected) => {
    const filter: ColumnFilter = { id, op: 'in', value: [...value] };
    const verdict = catalogValueCheck(filter);
    expect(verdict?.ko ?? null).toBe(expected);
  });

  it('ignores other field ids and operators (the codec owns them)', () => {
    expect(catalogValueCheck({ id: 'ghost', op: 'in', value: ['x'] })).toBeNull();
    expect(catalogValueCheck({ id: 'status', op: 'isEmpty' })).toBeNull();
  });
});
