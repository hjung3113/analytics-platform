/**
 * The 권한/역할 page's filter fields (ADR-0105, #1217 node e2): 역할 (a column, exact and case-sensitive) and 권한 (not a column, one value from the
 * registry). Both live in the hidden repeated page key `filter`; `toAccessQuery` maps them to the typed `accessDirectory` port query, the port is unchanged.
 */
import type { AccessDirectoryQuery, AccessSortField, ColumnFilter, ColumnFilterSpec, PageSort, Permission } from '@ap/contracts';
import { invalidText } from './access-query';

export const ACCESS_FILTER_IDS = ['role', 'permission'] as const;

export function accessFilterSpecs(permissions: readonly string[]): Record<(typeof ACCESS_FILTER_IDS)[number], ColumnFilterSpec> {
  return {
    role: { kind: 'text', ops: ['equals'], caseSensitive: true },
    permission: { kind: 'enum', options: permissions.map(value => ({ value, label: value })), ops: ['in'], multiple: false },
  };
}

/** The old `?role=` / `?permission=` keys as conditions, read for one release and rewritten away (P8); a value the old screen rejected is rejected, never repaired. */
export const accessLegacyKeys = (permissions: readonly string[]) => [
  { key: 'role', toFilter: (raw: string): ColumnFilter | null => (invalidText(raw) ? null : { id: 'role', op: 'equals', value: raw }) },
  { key: 'permission', toFilter: (raw: string): ColumnFilter | null => (permissions.includes(raw) ? { id: 'permission', op: 'in', value: [raw] } : null) },
];

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
