// Read side of the improvement items (#1328 a): `improvement.*` tables only (plus the actor display name), every
// statement scoped to the session's workspace. Nothing here writes.

import { type SQL, and, asc, count, desc, eq, exists, ilike, inArray, isNotNull, isNull, notInArray, or } from 'drizzle-orm';
import { type AnyPgColumn, alias } from 'drizzle-orm/pg-core';

import { actors } from '../../../db/schema/core.js';
import { improvementItemEvents, improvementItemTargets, improvementItems } from '../../../db/schema/improvement.js';
import type { Tx } from '../../../db/tx.js';
import { UUID_REGEX } from '../../../lib/http-headers.js';
import type { FilterCondition } from '../../../lib/list-params/catalog-filters.js';
import type { Page } from '../../../lib/list-params/types.js';
import { escapeLikePattern } from '../../../lib/sql-like.js';
import type { DetailKey, EventQuery, ItemListQuery } from '../domain/item-params.js';

export interface ItemTargetRow {
  kind: string;
  externalKey: string;
  displayName: string;
}
export interface ItemRow {
  id: string;
  itemNo: number;
  problem: string;
  action: string | null;
  /** `YYYY-MM-DD`, a calendar day without a time zone. */
  actionDate: string | null;
  status: string;
  assignee: { id: string; displayName: string } | null;
  quest: { id: string; titleSnapshot: string } | null;
  origin: { menuId: string; context: unknown } | null;
  effectResult: string | null;
  effectNote: string | null;
  effectCompareLink: string | null;
  dropReason: string | null;
  targets: ItemTargetRow[];
  version: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}
export interface ItemEventRow {
  id: string;
  seq: number;
  eventType: string;
  actor: { id: string; displayName: string };
  occurredAt: string;
  changes: unknown;
  reason: string | null;
}

const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

const i = improvementItems;
const t = improvementItemTargets;
const assignee = alias(actors, 'assignee');

function itemSelect(tx: Tx) {
  return tx
    .select({ item: i, assigneeName: assignee.displayName })
    .from(i)
    .leftJoin(assignee, and(eq(assignee.id, i.assigneeId), eq(assignee.workspaceId, i.workspaceId)))
    .$dynamic();
}
type Joined = Awaited<ReturnType<typeof itemSelect>>[number];

function toRow(row: Joined, targets: ItemTargetRow[]): ItemRow {
  const x = row.item;
  return {
    id: x.id,
    itemNo: x.itemNo,
    problem: x.problem,
    action: x.action,
    actionDate: x.actionDate,
    status: x.status,
    assignee: x.assigneeId === null ? null : { id: x.assigneeId, displayName: row.assigneeName ?? '' },
    quest: x.questId === null ? null : { id: x.questId, titleSnapshot: x.questTitleSnapshot ?? '' },
    origin: x.originMenuId === null ? null : { menuId: x.originMenuId, context: x.originContext },
    effectResult: x.effectResult,
    effectNote: x.effectNote,
    effectCompareLink: x.effectCompareLink,
    dropReason: x.dropReason,
    targets,
    version: String(x.rowVersion),
    createdBy: x.createdBy,
    createdAt: iso(x.createdAt),
    updatedBy: x.updatedBy,
    updatedAt: iso(x.updatedAt),
  };
}

async function targetsOf(tx: Tx, workspaceId: string, itemIds: string[]): Promise<Map<string, ItemTargetRow[]>> {
  const byItem = new Map<string, ItemTargetRow[]>();
  if (itemIds.length === 0) return byItem;
  const rows = await tx
    .select()
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), inArray(t.itemId, itemIds)))
    .orderBy(asc(t.kind), asc(t.externalKey));
  for (const r of rows) {
    const list = byItem.get(r.itemId) ?? [];
    list.push({ kind: r.kind, externalKey: r.externalKey, displayName: r.displayNameSnapshot });
    byItem.set(r.itemId, list);
  }
  return byItem;
}

/** `in` / `notIn` over a nullable column: `notIn` drops rows without a value too. `isEmpty` / `isNotEmpty` test the null. */
function columnFilter(column: AnyPgColumn, condition: FilterCondition | undefined): SQL | undefined {
  if (!condition) return undefined;
  switch (condition.op) {
    case 'in':
      return inArray(column, condition.values);
    case 'notIn':
      return and(isNotNull(column), notInArray(column, condition.values));
    case 'isEmpty':
      return isNull(column);
    default:
      return isNotNull(column);
  }
}

function textFilter(q: string | null): SQL | undefined {
  if (q === null || q.trim() === '') return undefined;
  const pattern = `%${escapeLikePattern(q.trim())}%`;
  return or(ilike(i.problem, pattern), ilike(i.action, pattern));
}

export async function listItems(tx: Tx, q: ItemListQuery): Promise<Page<ItemRow>> {
  const c = q.conditions;
  const where = and(
    eq(i.workspaceId, q.workspaceId),
    columnFilter(i.status, c.status),
    columnFilter(i.assigneeId, c.assignee),
    columnFilter(i.questId, c.questId),
    c.questLinked ? (c.questLinked.values[0] === 'true' ? isNotNull(i.questId) : isNull(i.questId)) : undefined,
    columnFilter(i.originMenuId, c.origin),
    q.target
      ? exists(
          tx
            .select({ one: t.id })
            .from(t)
            .where(
              and(
                eq(t.workspaceId, i.workspaceId),
                eq(t.itemId, i.id),
                eq(t.kind, q.target.kind),
                eq(t.externalKey, q.target.externalKey),
              ),
            ),
        )
      : undefined,
    textFilter(q.q),
  );
  const sortable: Record<string, AnyPgColumn> = {
    itemNo: i.itemNo,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    status: i.status,
  };
  // item_no is unique per workspace, so the tie-break makes every order total and a page never repeats a row.
  const rows = await itemSelect(tx)
    .where(where)
    .orderBy(...q.sorting.map((s) => (s.desc ? desc : asc)(sortable[s.id] as AnyPgColumn)), desc(i.itemNo))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx.select({ n: count() }).from(i).where(where);
  const targets = await targetsOf(tx, q.workspaceId, rows.map((r) => r.item.id));
  return { total: Number(totalRow?.n ?? 0), rows: rows.map((r) => toRow(r, targets.get(r.item.id) ?? [])) };
}

/** One item with its targets; null when it does not exist in the workspace. */
export async function getItemDetail(tx: Tx, workspaceId: string, key: DetailKey): Promise<ItemRow | null> {
  const [found] = await itemSelect(tx)
    .where(and(eq(i.workspaceId, workspaceId), 'itemId' in key ? eq(i.id, key.itemId) : eq(i.itemNo, key.itemNo)))
    .limit(1);
  if (!found) return null;
  const targets = await targetsOf(tx, workspaceId, [found.item.id]);
  return toRow(found, targets.get(found.item.id) ?? []);
}

/** The body-free identity of one item for a notification subject reference (#1328 e1): number and status only,
 * never the problem/action text. Null when the id is not a uuid or the item is not in the workspace. */
export async function getItemReference(
  tx: Tx,
  workspaceId: string,
  itemId: string,
): Promise<{ itemNo: number; status: string } | null> {
  if (!UUID_REGEX.test(itemId)) return null;
  const [row] = await tx
    .select({ itemNo: i.itemNo, status: i.status })
    .from(i)
    .where(and(eq(i.workspaceId, workspaceId), eq(i.id, itemId)))
    .limit(1);
  return row ?? null;
}

/** The history of one item, `occurred_at` then `seq` in the asked direction. */
export async function listItemEvents(tx: Tx, workspaceId: string, q: EventQuery): Promise<Page<ItemEventRow>> {
  const e = improvementItemEvents;
  const actor = alias(actors, 'event_actor');
  const where = and(eq(e.workspaceId, workspaceId), eq(e.itemId, q.itemId));
  const dir = q.order === 'asc' ? asc : desc;
  const rows = await tx
    .select({ event: e, actorName: actor.displayName })
    .from(e)
    .leftJoin(actor, and(eq(actor.id, e.actorId), eq(actor.workspaceId, e.workspaceId)))
    .where(where)
    .orderBy(dir(e.occurredAt), dir(e.seq))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx.select({ n: count() }).from(e).where(where);
  return {
    total: Number(totalRow?.n ?? 0),
    rows: rows.map(({ event, actorName }) => ({
      id: event.id,
      seq: Number(event.seq),
      eventType: event.eventType,
      actor: { id: event.actorId, displayName: actorName ?? '' },
      occurredAt: iso(event.occurredAt),
      changes: event.changes,
      reason: event.reason,
    })),
  };
}
