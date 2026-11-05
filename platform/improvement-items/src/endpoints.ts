/** Client-safe mirrors of the improvement menu dispatch contract (#1328 d). */
import { defineAction, defineEndpoint, menuPermission, type ColumnFilterSpec, type PageResult, type TableQuery } from '@ap/contracts';

export const IMPROVEMENT_ITEMS_MENU_ID = 'improvement-items';
export const MANAGE_PERMISSION = menuPermission('improvement:manage');
export const STATUSES = ['open', 'in_progress', 'done', 'verified', 'dropped'] as const;
export type Status = typeof STATUSES[number];
export type Effect = 'effective' | 'ineffective' | 'inconclusive';
export type Target = { kind: 'equipment' | 'process'; externalKey: string; displayName: string };
export type Origin = { menuId: string; context: Record<string, unknown> };
export type ItemRow = {
  id: string; itemNo: number; problem: string; action: string | null; actionDate: string | null; status: Status;
  assignee: { id: string; displayName: string } | null; quest: { id: string; titleSnapshot: string } | null;
  origin: Origin | null; targets: Target[]; effectResult: Effect | null; effectNote: string | null;
  effectCompareLink: string | null; dropReason: string | null; version: string;
  createdBy: string; createdAt: string; updatedBy: string; updatedAt: string;
};
export type ItemEvent = { id: string; seq: number; eventType: string; actor: { id: string; displayName: string }; occurredAt: string; changes: Record<string, unknown>; reason: string | null };
export type ListParams = Omit<TableQuery, 'groupBy'> & { q?: string | null; targetKind?: Target['kind']; targetKey?: string };
export type DetailParams = { itemId?: string; itemNo?: number | string };
export type EventParams = { itemId: string; page?: number; pageSize?: number; order?: 'asc' | 'desc' };
export type CreateInput = { problem: string; action?: string | null; actionDate?: string | null; assigneeId?: string | null; questId?: string | null; questTitle?: string | null; origin?: Origin | null; targets?: Target[] };
export type UpdateInput = { itemId: string; problem?: string; action?: string | null; actionDate?: string | null; origin?: Origin | null; targets?: Target[] };
export type StatusInput = { itemId: string; status: Status; action?: string | null; actionDate?: string | null; effect?: { result: Effect; note?: string | null; compareLink?: string | null }; reason?: string };
export type CreateResult = { itemId: string; itemNo: number; version: string };
export type WriteResult = { version: string };
export const SORT_IDS = ['itemNo', 'createdAt', 'updatedAt', 'status'] as const;
export const filterSpecs: Record<string, ColumnFilterSpec> = {
  status: { kind: 'enum', options: STATUSES.map(value => ({ value, label: value })), ops: ['in', 'notIn'] },
  assignee: { kind: 'enum', options: [], ops: ['in', 'notIn', 'isEmpty', 'isNotEmpty'] },
  questId: { kind: 'enum', options: [], ops: ['in', 'notIn'] },
  questLinked: { kind: 'enum', options: [{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }], ops: ['in'], multiple: false },
  origin: { kind: 'enum', options: [], ops: ['in', 'notIn'] },
};
const readBase = { menuId: IMPROVEMENT_ITEMS_MENU_ID, permission: 'platform:view' as const, requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false };
export const itemsEndpoint = defineEndpoint<ListParams, PageResult<ItemRow>>({ ...readBase, id: 'improvement.items', paramKeys: { q: true, page: true, pageSize: true, sorting: true, filters: true, targetKind: true, targetKey: true } });
export const detailEndpoint = defineEndpoint<DetailParams, ItemRow | null>({ ...readBase, id: 'improvement.itemDetail', paramKeys: { itemId: true, itemNo: true } });
export const eventsEndpoint = defineEndpoint<EventParams, PageResult<ItemEvent>>({ ...readBase, id: 'improvement.itemEvents', paramKeys: { itemId: true, page: true, pageSize: true, order: true } });
export const endpointSpecs = [itemsEndpoint, detailEndpoint, eventsEndpoint] as const;
const writeBase = { menuId: IMPROVEMENT_ITEMS_MENU_ID, permission: MANAGE_PERMISSION, requiresScope: false, invalidates: endpointSpecs };
export const itemCreate = defineAction<CreateInput, CreateResult>({ ...writeBase, id: 'improvement.itemCreate', concurrency: 'none', inputKeys: { problem: true, action: true, actionDate: true, assigneeId: true, questId: true, questTitle: true, origin: true, targets: true } });
export const itemUpdate = defineAction<UpdateInput, WriteResult>({ ...writeBase, id: 'improvement.itemUpdate', concurrency: 'version', inputKeys: { itemId: true, problem: true, action: true, actionDate: true, origin: true, targets: true } });
export const itemSetStatus = defineAction<StatusInput, WriteResult>({ ...writeBase, id: 'improvement.itemSetStatus', concurrency: 'version', inputKeys: { itemId: true, status: true, action: true, actionDate: true, effect: true, reason: true } });
export const itemReopen = defineAction<{ itemId: string; reason: string }, WriteResult>({ ...writeBase, id: 'improvement.itemReopen', concurrency: 'version', inputKeys: { itemId: true, reason: true } });
export const itemAssign = defineAction<{ itemId: string; assigneeId: string | null }, WriteResult>({ ...writeBase, id: 'improvement.itemAssign', concurrency: 'version', inputKeys: { itemId: true, assigneeId: true } });
export const itemLinkQuest = defineAction<{ itemId: string; questId: string | null; questTitle: string | null }, WriteResult>({ ...writeBase, id: 'improvement.itemLinkQuest', concurrency: 'version', inputKeys: { itemId: true, questId: true, questTitle: true } });
export const actionSpecs = [itemCreate, itemUpdate, itemSetStatus, itemReopen, itemAssign, itemLinkQuest] as const;
export const FORWARD: Record<Status, readonly Status[]> = { open: ['in_progress', 'dropped'], in_progress: ['done', 'dropped'], done: ['verified', 'dropped'], verified: ['dropped'], dropped: [] };
export const REOPEN: Partial<Record<Status, Status>> = { done: 'in_progress', verified: 'done', dropped: 'open' };
