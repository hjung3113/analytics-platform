/** Deterministic menu-owned fixtures; production screens never import this module. */
import { filterRows, validateFilters, type ActionSpec, type FieldError, type PageResult } from '@ap/contracts';
import { defineMockAction, defineMockEndpoint, type AnyMockAction, type AnyMockEndpoint } from '@ap/mock-server';
import { FORWARD, REOPEN, SORT_IDS, actionSpecs, detailEndpoint, eventsEndpoint, filterSpecs, itemCreate, itemsEndpoint, type CreateInput, type ItemEvent, type ItemRow, type ListParams, type Status, type StatusInput } from '../endpoints';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const at = '2026-11-05T01:00:00.000Z';
const itemId = (n: number) => `13280000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let rows: ItemRow[] = [];
let events: Map<string, ItemEvent[]>;
let seq = 0;
export function resetItems() {
  seq = 0; events = new Map();
  rows = (['open', 'in_progress', 'done', 'verified', 'dropped'] as const).map((status, i) => ({
    id: itemId(i + 1), itemNo: i + 1, problem: ['이송 대기 시간 증가', '반복 동작의 편차 증가', '조치 후 처리량 확인', '공정 조건 조정', '중복 기록'][i]!,
    action: i ? '설비 조건 점검 및 조정' : null, actionDate: i >= 2 ? '2026-11-04' : null, status,
    assignee: { id: 'admin', displayName: '관리자' }, quest: i > 0 && i < 4 ? { id: ['Q-1', 'Q-DOWN', 'Q-404'][i - 1]!, titleSnapshot: '대기 시간 줄이기' } : null,
    origin: { menuId: 'cycle-time', context: { scopeId: 'MEM', from: '2026-11-01T00:00:00', to: '2026-11-05T00:00:00' } },
    targets: [{ kind: 'equipment', externalKey: 'EQ-01', displayName: '설비 EQ-01' }],
    effectResult: i === 3 ? 'effective' : null, effectNote: null, effectCompareLink: null, dropReason: i === 4 ? '중복' : null,
    version: '1', createdBy: 'admin', createdAt: at, updatedBy: 'admin', updatedAt: at,
  }));
}
resetItems();
const blank = (x: unknown) => typeof x !== 'string' || x.trim() === '';
const field = (name: string, code = 'required'): FieldError => ({ path: [name], code });
function listMessage(p: ListParams): string | null {
  if (p.q != null && (typeof p.q !== 'string' || p.q.length > 200)) return 'q must be text <= 200';
  if (!Number.isInteger(p.page ?? 0) || (p.page ?? 0) < 0 || !Number.isInteger(p.pageSize ?? 50) || (p.pageSize ?? 50) < 1 || (p.pageSize ?? 50) > 200) return 'invalid page';
  if (p.sorting !== undefined && (!Array.isArray(p.sorting) || p.sorting.length > 3 || p.sorting.some(s => !SORT_IDS.includes(s.id as typeof SORT_IDS[number]) || typeof s.desc !== 'boolean') || new Set(p.sorting.map(s => s.id)).size !== p.sorting.length)) return 'invalid sorting';
  if (p.filters !== undefined && !Array.isArray(p.filters)) return 'invalid filters';
  const check = validateFilters(p.filters ?? [], filterSpecs);
  if (!check.ok) return `invalid filter ${check.filter.id}`;
  for (const f of p.filters ?? []) {
    if (f.op !== 'in' && f.op !== 'notIn') continue;
    if (f.value.length > 200 || f.value.some(v => f.id === 'status' ? !Object.keys(FORWARD).includes(v) : f.id === 'assignee' ? v !== 'me' && !UUID.test(v) : f.id === 'questLinked' ? v !== 'true' && v !== 'false' : blank(v) || v.length > 200)) return 'invalid filter value';
  }
  if ((p.targetKind === undefined) !== (p.targetKey === undefined) || (p.targetKind !== undefined && (!['equipment', 'process'].includes(p.targetKind) || blank(p.targetKey) || p.targetKey!.length > 200))) return 'invalid target';
  return null;
}
function list(p: ListParams, actor: string): PageResult<ItemRow> {
  const q = (p.q ?? '').toLowerCase();
  const filters = p.filters?.map(f => f.id === 'assignee' && (f.op === 'in' || f.op === 'notIn') ? { ...f, value: f.value.map(v => v === 'me' ? actor : v.toLowerCase()) } : f);
  const cell = (r: ItemRow, id: string) => ({ status: r.status, assignee: r.assignee?.id, questId: r.quest?.id, questLinked: String(r.quest !== null), origin: r.origin?.menuId })[id];
  const found = filterRows(rows.filter(r => `${r.problem}\n${r.action ?? ''}`.toLowerCase().includes(q) && (!p.targetKind || r.targets.some(t => t.kind === p.targetKind && t.externalKey === p.targetKey))), filters, cell, { specs: filterSpecs });
  const sorting = p.sorting?.length ? p.sorting : [{ id: 'createdAt', desc: true }];
  found.sort((a, b) => { for (const s of sorting) { const x = a[s.id as 'itemNo'], y = b[s.id as 'itemNo']; if (x !== y) return (x < y ? -1 : 1) * (s.desc ? -1 : 1); } return b.itemNo - a.itemNo; });
  const page = p.page ?? 0, size = p.pageSize ?? 50;
  return structuredClone({ rows: found.slice(page * size, (page + 1) * size), total: found.length });
}
export const improvementItemsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(itemsEndpoint, { mart: false, validate: ({ params }) => listMessage(params), handle: ({ params, actor }) => list(params, actor), isEmpty: d => d.total === 0 }),
  defineMockEndpoint(detailEndpoint, { mart: false, validate: ({ params: p }) => (p.itemId === undefined) === (p.itemNo === undefined) || (p.itemId !== undefined && !UUID.test(p.itemId)) || (p.itemNo !== undefined && !/^(?:IM-)?[1-9]\d*$/i.test(String(p.itemNo))) ? 'invalid detail key' : null,
    handle: ({ params: p }) => structuredClone(rows.find(r => p.itemId ? r.id === p.itemId.toLowerCase() : r.itemNo === Number(String(p.itemNo).replace(/^IM-/i, ''))) ?? null) }),
  defineMockEndpoint(eventsEndpoint, { mart: false, validate: ({ params: p }) => !UUID.test(p.itemId) || (p.order !== undefined && !['asc', 'desc'].includes(p.order)) || !Number.isInteger(p.page ?? 0) || (p.page ?? 0) < 0 || !Number.isInteger(p.pageSize ?? 50) || (p.pageSize ?? 50) < 1 || (p.pageSize ?? 50) > 200 ? 'invalid events params' : null,
    handle: ({ params: p }) => { const all = [...(events.get(p.itemId) ?? [])].sort((a, b) => (a.seq - b.seq) * (p.order === 'asc' ? 1 : -1)); return structuredClone({ rows: all.slice((p.page ?? 0) * (p.pageSize ?? 50), ((p.page ?? 0) + 1) * (p.pageSize ?? 50)), total: all.length }); } }),
];
function record(row: ItemRow, actor: string, eventType: string, before: object, reason: string | null = null) {
  const n = ++seq;
  row.updatedAt = new Date(Date.parse(at) + n * 1000).toISOString(); row.updatedBy = actor;
  const event: ItemEvent = { id: itemId(1000 + n), seq: n, eventType, actor: { id: actor, displayName: actor }, occurredAt: row.updatedAt, changes: { before, after: structuredClone(row) }, reason };
  events.set(row.id, [...(events.get(row.id) ?? []), event]);
}
const find = (input: { itemId: string }) => rows.find(r => r.id === input.itemId.toLowerCase());
function errors(op: string, input: Record<string, unknown>): FieldError[] {
  const out: FieldError[] = [];
  for (const key of ['problem', 'action', 'reason', 'questId', 'questTitle']) {
    const v = input[key];
    if (v !== undefined && v !== null && (typeof v !== 'string' || v.includes('\u0000') || [...v].length > (key === 'problem' ? 500 : key.startsWith('quest') ? 200 : 2000))) out.push(field(key, 'malformed'));
  }
  if (op === 'itemCreate' || input.problem !== undefined) { if (blank(input.problem)) out.push(field('problem')); }
  if (input.actionDate !== undefined && input.actionDate !== null && (typeof input.actionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.actionDate) || Number.isNaN(Date.parse(input.actionDate)) || new Date(input.actionDate).toISOString().slice(0, 10) !== input.actionDate)) out.push(field('actionDate', 'malformed'));
  if (input.assigneeId != null && (typeof input.assigneeId !== 'string' || !UUID.test(input.assigneeId))) out.push(field('assigneeId', 'malformed'));
  if (input.origin != null && (typeof input.origin !== 'object' || Array.isArray(input.origin) || blank((input.origin as { menuId?: unknown }).menuId) || typeof (input.origin as { context?: unknown }).context !== 'object' || (input.origin as { context?: unknown }).context === null)) out.push(field('origin', 'malformed'));
  if (input.targets !== undefined && (!Array.isArray(input.targets) || input.targets.length > 50 || input.targets.some(t => typeof t !== 'object' || t === null || !['equipment', 'process'].includes(t.kind) || blank(t.externalKey) || blank(t.displayName)))) out.push(field('targets', 'malformed'));
  if ((input.questId == null) !== (input.questTitle == null) || (input.questId != null && (blank(input.questId) || blank(input.questTitle)))) out.push(field('questId', 'required'));
  if (op === 'itemCreate' && !input.origin && !(Array.isArray(input.targets) && input.targets.length)) out.push(field('origin', 'required_or_target'));
  if (op !== 'itemCreate' && (typeof input.itemId !== 'string' || !UUID.test(input.itemId))) return [...out, field('itemId', 'malformed')];
  const row = typeof input.itemId === 'string' ? find(input as { itemId: string }) : undefined;
  if (!row) return out;
  if (op === 'itemSetStatus') {
    const s = input as StatusInput;
    if (!FORWARD[row.status].includes(s.status)) out.push(field('status', 'illegal_transition'));
    if (['in_progress', 'done'].includes(s.status) && blank(s.action === undefined ? row.action : s.action)) out.push(field('action'));
    if (s.status === 'done' && !(s.actionDate === undefined ? row.actionDate : s.actionDate)) out.push(field('actionDate'));
    if (s.status === 'verified' && (!s.effect || !['effective', 'ineffective', 'inconclusive'].includes(s.effect.result))) out.push(field('effect'));
    if (s.status === 'dropped' && blank(s.reason)) out.push(field('reason'));
    for (const [key, applicable] of Object.entries({ action: ['in_progress', 'done'].includes(s.status), actionDate: s.status === 'done', effect: s.status === 'verified', reason: s.status === 'dropped' })) if (input[key] !== undefined && !applicable) out.push(field(key, 'not_applicable'));
  }
  if (op === 'itemReopen' && (!REOPEN[row.status] || blank(input.reason))) out.push(field(!REOPEN[row.status] ? 'status' : 'reason', !REOPEN[row.status] ? 'illegal_transition' : 'required'));
  if (op === 'itemUpdate') {
    if (!((input.origin === undefined ? row.origin : input.origin)) && !(input.targets === undefined ? row.targets.length : (input.targets as unknown[])?.length)) out.push(field('origin', 'required_or_target'));
    if (['in_progress', 'done', 'verified'].includes(row.status) && blank(input.action === undefined ? row.action : input.action)) out.push(field('action'));
    if (['done', 'verified'].includes(row.status) && !(input.actionDate === undefined ? row.actionDate : input.actionDate)) out.push(field('actionDate'));
  }
  return out;
}
const create = defineMockAction(itemCreate, { validate: input => errors('itemCreate', input), handle: ({ input, actor }) => {
  const n = rows.length + 1;
  const row: ItemRow = { id: itemId(n), itemNo: n, problem: input.problem.trim(), action: input.action ?? null, actionDate: input.actionDate ?? null, status: 'open', assignee: input.assigneeId ? { id: input.assigneeId, displayName: input.assigneeId } : null, quest: input.questId ? { id: input.questId, titleSnapshot: input.questTitle! } : null, origin: input.origin ?? null, targets: input.targets ?? [], effectResult: null, effectNote: null, effectCompareLink: null, dropReason: null, version: '1', createdBy: actor, updatedBy: actor, createdAt: at, updatedAt: at };
  rows.push(row); record(row, actor, 'created', {});
  return { data: { itemId: row.id, itemNo: n, version: row.version }, version: null };
} });
const writes = actionSpecs.slice(1).map(spec => defineMockAction(spec as ActionSpec<Record<string, unknown> & { itemId: string }, unknown>, {
  version: ({ input }) => find(input)?.version ?? null,
  validate: input => errors(spec.id.split('.')[1]!, input),
  handle: ({ input, actor }) => {
    const row = find(input)!; const before = structuredClone(row); const op = spec.id.split('.')[1]!;
    if (op === 'itemUpdate') for (const key of ['problem', 'action', 'actionDate', 'origin', 'targets'] as const) if (input[key] !== undefined) Object.assign(row, { [key]: input[key] });
    if (op === 'itemSetStatus') {
      const s = input as StatusInput; row.status = s.status;
      if (s.action !== undefined) row.action = s.action; if (s.actionDate !== undefined) row.actionDate = s.actionDate;
      if (s.effect) { row.effectResult = s.effect.result; row.effectNote = s.effect.note ?? null; row.effectCompareLink = s.effect.compareLink ?? null; }
      if (s.status === 'dropped') row.dropReason = s.reason!;
    }
    if (op === 'itemReopen') row.status = REOPEN[row.status] as Status;
    if (op === 'itemAssign') row.assignee = input.assigneeId ? { id: input.assigneeId as string, displayName: input.assigneeId as string } : null;
    if (op === 'itemLinkQuest') row.quest = input.questId ? { id: input.questId as string, titleSnapshot: input.questTitle as string } : null;
    if (JSON.stringify(row) !== JSON.stringify(before)) {
      row.version = String(Number(row.version) + 1);
      record(row, actor, ({ itemUpdate: 'updated', itemSetStatus: 'status_changed', itemReopen: 'reopened', itemAssign: 'assigned', itemLinkQuest: 'quest_linked' })[op]!, before, typeof input.reason === 'string' ? input.reason : null);
    }
    return { data: { version: row.version }, version: row.version };
  },
}));
export const improvementItemsActionsMock: readonly AnyMockAction[] = [create, ...writes];
