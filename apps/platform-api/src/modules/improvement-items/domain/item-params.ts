// Param judgments of the improvement item reads. Every refusal is a message for the engine's params judgment
// (`error` outcome), never an empty page.

import { unsafeText } from '../../../lib/text-safety.js';
import { PAGE_SIZE_MAX, parseListParams } from '../../../lib/list-params/list-params.js';
import type { ListQuery } from '../../../lib/list-params/types.js';
import { ITEM_FILTER_SPECS, TARGET_KINDS, TEXT_FIELD_MAX } from './item-filters.js';

export const ITEM_SORT_IDS = ['itemNo', 'createdAt', 'updatedAt', 'status'] as const;
export const ITEM_DEFAULT_SORT = { id: 'createdAt', desc: true } as const;
export const LIST_PARAM_KEYS = ['q', 'page', 'pageSize', 'sorting', 'filters', 'targetKind', 'targetKey'] as const;
export const DETAIL_PARAM_KEYS = ['itemId', 'itemNo'] as const;
export const EVENT_PARAM_KEYS = ['itemId', 'page', 'pageSize', 'order'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_NO_MAX = 2_147_483_647;

type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });

export interface ItemListQuery extends ListQuery {
  target: { kind: string; externalKey: string } | null;
}
export type ItemListParse = { ok: true; value: ItemListQuery } | Fail;

/** `targetKind` + `targetKey` are the per-equipment history filter: both or neither. */
export function parseItemListParams(params: Record<string, unknown>): ItemListParse {
  const parsed = parseListParams(params, ITEM_SORT_IDS, ITEM_FILTER_SPECS, ITEM_DEFAULT_SORT);
  if (!parsed.ok) return parsed;
  const { targetKind, targetKey } = params;
  if (targetKind === undefined && targetKey === undefined) return { ok: true, value: { ...parsed.value, target: null } };
  if (targetKind === undefined || targetKey === undefined) return fail('targetKind and targetKey come together');
  if (typeof targetKind !== 'string' || !(TARGET_KINDS as readonly string[]).includes(targetKind)) {
    return fail(`targetKind must be one of ${TARGET_KINDS.join(', ')}`);
  }
  if (
    typeof targetKey !== 'string' ||
    targetKey.trim() === '' ||
    targetKey.length > TEXT_FIELD_MAX ||
    unsafeText(targetKey)
  ) {
    return fail(`targetKey must be non-blank text of at most ${TEXT_FIELD_MAX} characters`);
  }
  return { ok: true, value: { ...parsed.value, target: { kind: targetKind, externalKey: targetKey } } };
}

export type DetailKey = { itemId: string } | { itemNo: number };
export type DetailParse = { ok: true; value: DetailKey } | Fail;

/** Exactly one of `itemId` (uuid) or `itemNo` (positive integer, or `IM-12` / `12` text). */
export function parseDetailParams(params: Record<string, unknown>): DetailParse {
  const { itemId, itemNo } = params;
  if ((itemId === undefined) === (itemNo === undefined)) return fail('give exactly one of itemId or itemNo');
  if (itemId !== undefined) {
    return typeof itemId === 'string' && UUID.test(itemId) ? { ok: true, value: { itemId } } : fail('itemId must be a uuid string');
  }
  let no: number | null = null;
  if (typeof itemNo === 'number') no = Number.isInteger(itemNo) ? itemNo : null;
  else if (typeof itemNo === 'string') {
    const match = /^(?:im-?)?(\d{1,10})$/i.exec(itemNo.trim());
    no = match ? Number(match[1]) : null;
  }
  if (no === null || no < 1 || no > ITEM_NO_MAX) return fail('itemNo must be a positive integer or IM-<n>');
  return { ok: true, value: { itemNo: no } };
}

export interface EventQuery {
  itemId: string;
  page: number;
  pageSize: number;
  order: 'asc' | 'desc';
}
export type EventParse = { ok: true; value: EventQuery } | Fail;

export function parseEventParams(params: Record<string, unknown>): EventParse {
  const { itemId } = params;
  if (typeof itemId !== 'string' || !UUID.test(itemId)) return fail('itemId must be a uuid string');
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) {
    return fail('page must be a non-negative integer (0-based)');
  }
  const pageSize = params.pageSize === undefined ? 50 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return fail(`pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}`);
  }
  const order = params.order === undefined ? 'desc' : params.order;
  if (order !== 'asc' && order !== 'desc') return fail("order must be 'asc' or 'desc'");
  return { ok: true, value: { itemId, page, pageSize, order } };
}
