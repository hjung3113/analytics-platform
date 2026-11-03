import { PUBLIC_VOC_QUERY_MAX, type PublicVocQuery } from '@ap/feature-screens/global-screens';
import { VOC_ID } from '@ap/feature-bridge';

export { VOC_ID };

export type VocPage = { ok: true; query: PublicVocQuery; focus: string | null } | { ok: false; key: string; value: string; unsupported?: true };

/**
 * The page keys of 소통 › VOC (`q`, `mine`, `system`, `focus`) as the feature screens' list query, or the first key whose value is not in its domain.
 * `status` and `sort` are older keys of the previous 내 VOC list. The public list (`GET /vocs/public`) takes only `mine`, `managed_system_id`
 * and `q`, so their meaning cannot be applied across cursor pages (no server change in this node; filtering only the loaded page would change
 * results as pages load). Any value of either key is therefore rejected and preserved (`unsupported`), never ignored: the page says so and
 * offers 「값 지우기」. Reopen condition: the public list API gains status/sort.
 * A bad value is rejected and preserved (06 §6.4, ADR-0071 decision 9): nothing is substituted, so nothing is requested for it.
 */
export function parseVocPage(pageParam: (key: string) => string | null): VocPage {
  const q = pageParam('q') ?? '';
  if (q.length > PUBLIC_VOC_QUERY_MAX) return { ok: false, key: 'q', value: q };

  const rawStatus = pageParam('status');
  if (rawStatus !== null) return { ok: false, key: 'status', value: rawStatus, unsupported: true };

  const rawSort = pageParam('sort');
  if (rawSort !== null) return { ok: false, key: 'sort', value: rawSort, unsupported: true };

  const rawMine = pageParam('mine');
  if (rawMine !== null && rawMine !== 'true') return { ok: false, key: 'mine', value: rawMine };

  const system = pageParam('system');
  if (system !== null && !VOC_ID.test(system)) return { ok: false, key: 'system', value: system };

  const focus = pageParam('focus');
  if (focus !== null && !VOC_ID.test(focus)) return { ok: false, key: 'focus', value: focus };

  return { ok: true, query: { q, mine: rawMine === 'true', systemId: system }, focus };
}

/** A list-query change as a page patch: an empty or default value leaves the URL (`null`). */
export function pagePatch(patch: Partial<PublicVocQuery>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (patch.q !== undefined) out.q = patch.q === '' ? null : patch.q;
  if (patch.mine !== undefined) out.mine = patch.mine ? 'true' : null;
  if (patch.systemId !== undefined) out.system = patch.systemId;
  return out;
}
