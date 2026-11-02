/**
 * The 권한/역할 page's filter fields (ADR-0105, #1217 node e2): 역할 (a column, exact and case-sensitive) and 권한 (not a column, one value from the
 * registry). Both live in the hidden repeated page key `filter`; `toAccessQuery` maps them to the typed `accessDirectory` port query, the port is unchanged.
 */
import type { AccessDirectoryQuery, AccessSortField, ColumnFilter, ColumnFilterSpec, PageSort, Permission, Text } from '@ap/contracts';
import { BAD_TOKEN, invalidText } from './token';

export const ACCESS_FILTER_IDS = ['role', 'permission'] as const;

export function accessFilterSpecs(permissions: readonly string[]): Record<(typeof ACCESS_FILTER_IDS)[number], ColumnFilterSpec> {
  return {
    role: { kind: 'text', ops: ['equals'], caseSensitive: true },
    permission: { kind: 'enum', options: permissions.map(value => ({ value, label: value })), ops: ['in'], multiple: false },
  };
}


export type AccessPage = { page: number; pageSize: number; sorting: readonly PageSort[] };

/** `ColumnFilter[]` → the typed port query; a condition the port cannot express throws instead of being dropped. */
export function toAccessQuery(filters: readonly ColumnFilter[], { page, pageSize, sorting }: AccessPage): AccessDirectoryQuery {
  const query: AccessDirectoryQuery = {};
  for (const filter of filters) {
    if (filter.id === 'role') {
      if (filter.op !== 'equals') throw new RangeError(`toAccessQuery: role takes "equals", got "${filter.op}"`);
      query.role = filter.value;
    } else if (filter.id === 'permission') {
      if (filter.op !== 'in' || filter.value.length !== 1) throw new RangeError('toAccessQuery: permission takes exactly one value');
      query.permission = filter.value[0] as Permission;
    } else throw new RangeError(`toAccessQuery: unknown field "${filter.id}"`);
  }
  const sort = sorting[0];
  if (sort) query.sort = { field: sort.id as AccessSortField, desc: sort.desc };
  return { ...query, page, pageSize };
}

/** The port's value rules, checked before any query (address and editor): the role token and registry membership of the permission (what the old `?permission=` check did). */
export const accessValueCheck = (permissions: readonly string[]) => (filter: ColumnFilter): Text | null => {
  if (filter.id === 'role' && filter.op === 'equals' && invalidText(filter.value)) return BAD_TOKEN;
  if (filter.id === 'permission' && filter.op === 'in' && !filter.value.every(v => permissions.includes(v))) return { ko: '등록되지 않은 권한입니다.', en: 'This permission is not registered.' };
  return null;
};
