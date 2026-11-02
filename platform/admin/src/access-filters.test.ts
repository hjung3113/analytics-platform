import { describe, expect, it } from 'vitest';
import { parseFilterParams, type ColumnFilter } from '@ap/contracts';
import { accessFilterSpecs, accessValueCheck, toAccessQuery } from './access-filters';

const permissions = ['platform:view', 'console:access'];
const page = { page: 2, pageSize: 25, sorting: [] };

describe('toAccessQuery (P5)', () => {
  it('no conditions: only the page', () => {
    expect(toAccessQuery([], page)).toEqual({ page: 2, pageSize: 25 });
  });
  it('role (exact), permission (one value) and the sort', () => {
    expect(toAccessQuery([{ id: 'role', op: 'equals', value: 'Engineer' }, { id: 'permission', op: 'in', value: ['console:access'] }], { page: 1, pageSize: 25, sorting: [{ id: 'grantCount', desc: true }] }))
      .toEqual({ role: 'Engineer', permission: 'console:access', sort: { field: 'grantCount', desc: true }, page: 1, pageSize: 25 });
  });
  it.each<[string, ColumnFilter]>([
    ['an undeclared field', { id: 'name', op: 'equals', value: 'x' }],
    ['a wrong op on role', { id: 'role', op: 'contains', value: 'x' }],
    ['two permissions', { id: 'permission', op: 'in', value: ['a', 'b'] }],
  ])('%s throws instead of being dropped', (_name, filter) => {
    expect(() => toAccessQuery([filter], page)).toThrow(RangeError);
  });
});

describe('access specs', () => {
  const specs = accessFilterSpecs(permissions);
  it('role is exact case-sensitive text; permission is one registry value', () => {
    expect(specs.role).toMatchObject({ kind: 'text', ops: ['equals'], caseSensitive: true });
    expect(specs.permission).toMatchObject({ kind: 'enum', ops: ['in'], multiple: false, options: permissions.map(value => ({ value, label: value })) });
    expect(parseFilterParams(['permission:in:platform:view~console:access'], specs).ok).toBe(false);
  });
});

describe('accessValueCheck (the port rules, before any query)', () => {
  const check = accessValueCheck(permissions);
  it.each<ColumnFilter>([
    { id: 'role', op: 'equals', value: 'a b' },
    { id: 'role', op: 'equals', value: 'x'.repeat(81) },
    { id: 'permission', op: 'in', value: ['ghost:view'] },
  ])('refuses %j', filter => {
    expect(check(filter)).not.toBeNull();
  });
  it.each<ColumnFilter>([
    { id: 'role', op: 'equals', value: 'Engineer' },
    { id: 'permission', op: 'in', value: ['console:access'] },
  ])('allows %j', filter => {
    expect(check(filter)).toBeNull();
  });
});
