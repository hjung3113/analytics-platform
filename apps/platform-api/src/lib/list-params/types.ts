// Shapes shared by the paged menu reads: the parsed list request and the page it answers with.

import type { FilterConditions } from './catalog-filters.js';

export interface PageSort {
  id: string;
  desc: boolean;
}
export interface ListQuery {
  workspaceId: string;
  q: string | null;
  /** Parsed `filters` of the request (ADR-0105); no condition on a field = no constraint (an absent `active` means every row). */
  conditions: FilterConditions;
  page: number;
  pageSize: number;
  sorting: readonly PageSort[];
}

export interface Page<T> {
  rows: T[];
  total: number;
}
