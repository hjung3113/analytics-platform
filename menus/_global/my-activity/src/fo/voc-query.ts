import {
  MY_VOC_DEFAULT_SORT,
  MY_VOC_QUERY_MAX,
  MY_VOC_SORTS,
  REPORTER_FACING_STATUS_ALL,
  type MyVocQuery,
  type MyVocSort,
} from '@ap/feature-screens/global-screens';
import { VOC_ID } from '@ap/feature-bridge';

export { VOC_ID };

export type MyVocPage = { ok: true; query: MyVocQuery; focus: string | null } | { ok: false; key: string; value: string };

/**
 * The page keys of 내 VOC (`q`, `status`, `sort`, `focus`) as FeedbackOps' list query, or the first key whose value is not in its domain.
 * A bad value is rejected and preserved (06 §6.4, ADR-0071 decision 9): nothing is substituted, so nothing is requested for it.
 */
export function parseMyVocPage(pageParam: (key: string) => string | null): MyVocPage {
  const q = pageParam('q') ?? '';
  if (q.length > MY_VOC_QUERY_MAX) return { ok: false, key: 'q', value: q };

  const rawStatus = pageParam('status');
  const statuses = rawStatus === null ? [] : rawStatus.split(',');
  const known = new Set<string>(REPORTER_FACING_STATUS_ALL);
  if (rawStatus !== null && (statuses.some(status => !known.has(status)) || new Set(statuses).size !== statuses.length)) return { ok: false, key: 'status', value: rawStatus };

  const rawSort = pageParam('sort');
  if (rawSort !== null && !(MY_VOC_SORTS as readonly string[]).includes(rawSort)) return { ok: false, key: 'sort', value: rawSort };

  const focus = pageParam('focus');
  if (focus !== null && !VOC_ID.test(focus)) return { ok: false, key: 'focus', value: focus };

  return { ok: true, query: { q, statuses: statuses as MyVocQuery['statuses'], sort: (rawSort ?? MY_VOC_DEFAULT_SORT) as MyVocSort }, focus };
}

/** A list-query change as a page patch: an empty or default value leaves the URL (`null`). */
export function pagePatch(patch: Partial<MyVocQuery>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (patch.q !== undefined) out.q = patch.q === '' ? null : patch.q;
  if (patch.statuses !== undefined) out.status = patch.statuses.length === 0 ? null : patch.statuses.join(',');
  if (patch.sort !== undefined) out.sort = patch.sort === MY_VOC_DEFAULT_SORT ? null : patch.sort;
  return out;
}
