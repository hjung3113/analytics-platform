// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ColumnFilterSpec } from '@ap/contracts';
import { useTableFilterDeclaration, type TableFilterDeclaration } from '../useTableFilterDeclaration';

const role: ColumnFilterSpec = { kind: 'text', ops: ['equals'], caseSensitive: true };
const permission: ColumnFilterSpec = { kind: 'enum', options: [], ops: ['in'], multiple: false };
const validate = () => null;
const fields: readonly TableFilterDeclaration[] = [
  { id: 'role', label: { ko: '역할', en: 'Role' }, spec: role, pinned: true },
  { id: 'permission', label: 'Permission', spec: permission, pinned: 2, column: false },
  { id: 'at', label: { ko: '시각', en: 'At' }, spec: { kind: 'instant', ops: ['between'] }, entry: { timeZone: 'Asia/Seoul', precision: 'second' } },
];

describe('useTableFilterDeclaration (#1233)', () => {
  it('derives URL specs, labels and validation plus column and non-column pieces', () => {
    const { result } = renderHook(() => useTableFilterDeclaration('conditions', fields, { lang: 'ko', validate }));
    expect(result.current.urlFilters).toEqual({ key: 'conditions', specs: { role, permission, at: fields[2]!.spec }, labels: { role: '역할', permission: 'Permission', at: '시각' }, validate });
    expect(result.current.filterColumnProps('role')).toEqual({ id: 'role', header: '역할', filterLabel: '역할', filter: role, filterPinned: true });
    expect(result.current.filterColumnProps('at').filterEntry).toBe(fields[2]!.entry);
    expect(() => result.current.filterColumnProps('displayOnly')).toThrow(/undeclared id/);
    expect(result.current.filterFields).toEqual([{ id: 'permission', label: { ko: 'Permission', en: 'Permission' }, spec: permission, pinned: 2 }]);
  });

  it('keeps all derived identities on rerender and resolves labels when language changes', () => {
    const { result, rerender } = renderHook(({ lang }: { lang: 'ko' | 'en' }) => useTableFilterDeclaration('filter', fields, { lang, validate }), { initialProps: { lang: 'ko' } });
    const first = result.current;
    rerender({ lang: 'ko' });
    expect(result.current).toBe(first);
    expect(result.current.urlFilters.specs).toBe(first.urlFilters.specs);
    expect(result.current.urlFilters.labels).toBe(first.urlFilters.labels);
    expect(result.current.urlFilters.validate).toBe(validate);
    expect(result.current.filterColumnProps('role')).toBe(first.filterColumnProps('role'));
    rerender({ lang: 'en' });
    expect(result.current.urlFilters.labels).toEqual({ role: 'Role', permission: 'Permission', at: 'At' });
    expect(result.current.filterColumnProps('role').header).toBe('Role');
  });

  it('retains labels for display-only fields in invalid-URL warnings without making them filterable', () => {
    const { result } = renderHook(() => useTableFilterDeclaration('filter', [{ id: 'room', label: { ko: 'room_name', en: 'room_name' } }], { lang: 'ko' }));
    expect(result.current.urlFilters.labels).toEqual({ room: 'room_name' });
    expect(result.current.urlFilters.specs).toEqual({});
    expect(result.current.filterColumnProps('room')).toEqual({ id: 'room', header: 'room_name' });
    expect(result.current.filterFields).toEqual([]);
  });

  it('updates when spec inputs change and allows late enum choices without changing the URL spec', () => {
    const { result, rerender } = renderHook(({ declarations }) => useTableFilterDeclaration('filter', declarations, { lang: 'ko', validate }), { initialProps: { declarations: fields } });
    const options = [{ value: 'p', label: 'P' }];
    expect(result.current.filterColumnProps('permission', options).filter).toEqual({ ...permission, options });
    expect(result.current.urlFilters.specs.permission).toBe(permission);
    const nextRole: ColumnFilterSpec = { kind: 'text', ops: ['contains'] };
    rerender({ declarations: [{ ...fields[0]!, spec: nextRole }] });
    expect(result.current.urlFilters.specs.role).toBe(nextRole);
    expect(result.current.filterColumnProps('role').filter).toBe(nextRole);
  });
});
