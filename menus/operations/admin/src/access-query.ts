/**
 * Page-key vocabulary and parser for the console access directory (issue #49, 06 §6.1). Pure and
 * node-runnable: the screen calls it before loadPage, and an invalid wire value alerts instead of
 * substituting (same pattern as audit-query). Absent = unset. The value domains mirror the server's
 * `Invalid access filter` list (design §2): the role filter and `focus` are plain search tokens
 * (1..80 chars, no URL/whitespace marks) and a well-formed token that matches nobody is valid — it
 * answers `empty`, never a parse error.
 */
import { PERMISSIONS, type AccessSortField, type PageSort, type Permission } from '@ap/contracts';
import { parsePageIndex, parseTableSort } from '@ap/components';

/** The five page keys of `admin-roles`; the reset button clears exactly these. */
export const ACCESS_PAGE_KEYS = ['role', 'permission', 'sort', 'page', 'focus'] as const;

/** Sortable columns only — the server sorts, the client never re-sorts a page. */
const SORT_FIELDS = ['name', 'role', 'permissionCount', 'grantCount'] satisfies readonly AccessSortField[];


export type AccessFilters = {
  role: string | null;
  permission: Permission | null;
};

export type ParsedAccessKeys =
  | { ok: true; filters: AccessFilters; sorting: PageSort[]; page: number | null; focus: string | null }
  | { ok: false };

/** True when the operator text is not a plain token: empty, over 80 chars, or URL/whitespace-bearing. */
const invalidText = (value: string): boolean => !value || value.length > 80 || /[?#&\s]/.test(value);

/** The screen's URL keys, validated without coercion. Anything the server would reject with
 *  `Invalid access filter` is already invalid here, so a bad value never reaches the adapter. */
export function parseAccessKeys(raw: {
  role: string | null; permission: string | null; sort: string | null; page: string | null; focus: string | null;
}): ParsedAccessKeys {
  const parsedSort = parseTableSort(raw.sort, SORT_FIELDS);
  const parsedPage = parsePageIndex(raw.page);
  if (!parsedSort.ok || !parsedPage.ok) return { ok: false };
  if (raw.role !== null && invalidText(raw.role)) return { ok: false };
  if (raw.permission !== null && !(PERMISSIONS as readonly string[]).includes(raw.permission)) return { ok: false };
  // `focus` selects the drawer row; it is never sent to accessDirectory. Same token grammar as `role`,
  // so a malformed focus fails the page parse (adapter not called) while an unknown one is the drawer alert.
  if (raw.focus !== null && invalidText(raw.focus)) return { ok: false };
  return {
    ok: true,
    filters: { role: raw.role, permission: raw.permission as Permission | null },
    sorting: parsedSort.sorting,
    page: parsedPage.page === 1 ? null : parsedPage.page,
    focus: raw.focus,
  };
}
