/**
 * Vocabulary of the console access directory (issue #49, 06 §6.1). Pure and node-runnable. The role filter and `focus` are plain search tokens
 * (1..80 chars, no URL/whitespace marks) and a well-formed token that matches nobody is valid — it answers `empty`, never a parse error.
 * The page's conditions travel as `filter` (see `access-filters.ts`).
 */
import type { AccessSortField } from '@ap/contracts';

/** Sortable columns only — the server sorts, the client never re-sorts a page. */
export const SORT_FIELDS = ['name', 'role', 'permissionCount', 'grantCount'] satisfies readonly AccessSortField[];
