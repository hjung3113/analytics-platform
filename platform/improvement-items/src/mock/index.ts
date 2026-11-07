/** Deterministic menu-owned fixtures; production screens never import this module. */
import { filterRows, validateFilters, type ActionSpec, type FieldError, type PageResult } from '@ap/contracts';
import { MockActionInvalid, defineMockAction, defineMockEndpoint, type AnyMockAction, type AnyMockEndpoint } from '@ap/mock-server';
import { FORWARD, REOPEN, SORT_IDS, actionSpecs, detailEndpoint, eventsEndpoint, filterSpecs, itemCreate, itemsEndpoint, type CreateInput, type ItemEvent, type ItemRow, type ListParams, type Status, type StatusInput, type Target, type UpdateInput } from '../endpoints';
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
const blank = (x: string | null | undefined): boolean => x === null || x === undefined || x.trim() === '';
const field = (name: string, code = 'required'): FieldError => ({ path: [name], code });
const fieldAt = (path: string[], code = 'required'): FieldError => ({ path, code });
type Check = FieldError | null;
/** Text safety mirrored from the server (`platform-port/text-safety.ts`): NUL and lone UTF-16 surrogates. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const unsafe = (v: string): boolean => v.includes('\u0000') || LONE_SURROGATE.test(v);
const len = (v: string): number => [...v].length;
const PROBLEM_MAX = 500, LONG_MAX = 2000, SHORT_MAX = 200, TARGETS_MAX = 50, CONTEXT_MAX_BYTES = 8 * 1024, CONTEXT_MAX_DEPTH = 8;
const EFFECT_RESULTS = ['effective', 'ineffective', 'inconclusive'];
const TARGET_KINDS = ['equipment', 'process'];
const STATUSES = Object.keys(FORWARD) as Status[];
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Backend mirror of the server's `appRelativePath`: an app-relative, same-origin path. */
const appRelative = (value: string): boolean => {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('#') || value.includes('\\') || value.includes('//')) return false;
  if (/[\u0000-\u001F\u007F]/.test(value)) return false;
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return false; }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return false;
  if (decoded.includes('#') || decoded.includes('\\') || decoded.includes('//')) return false;
  if (/[\u0000-\u001F\u007F]/.test(decoded)) return false;
  return !(decoded.split('?')[0] ?? '').includes(':');
};
const isDay = (v: unknown): boolean => {
  if (typeof v !== 'string') return false;
  const m = DAY.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
};
/** A required, non-blank text key: absent/null/non-string → required (#1411); unsafe → malformed; over the bound → too_long; blank → required. */
const requiredText = (v: unknown, max: number, path: string[]): Check => {
  if (v === undefined) return fieldAt(path);
  if (typeof v !== 'string') return fieldAt(path, 'required');
  if (unsafe(v)) return fieldAt(path, 'malformed');
  if (len(v) > max) return fieldAt(path, 'too_long');
  return v.trim() === '' ? fieldAt(path) : null;
};
/** Optional key of a non-nullable text: absent → fine, then `requiredText` rules. */
const optionalText = (v: unknown, max: number, path: string[]): Check => (v === undefined ? null : requiredText(v, max, path));
/** `clearableText`: absent → untouched; null or a blank text clears; non-string → required; unsafe → malformed; over the bound → too_long. */
const clearableText = (v: unknown, max: number, path: string[]): Check => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return fieldAt(path, 'required');
  if (unsafe(v)) return fieldAt(path, 'malformed');
  return len(v) > max ? fieldAt(path, 'too_long') : null;
};
/** Nullable UUID value: absent → required unless optional; null clears; otherwise a UUID string. */
const nullableUuid = (v: unknown, path: string[], optional: boolean): Check => {
  if (v === undefined) return optional ? null : fieldAt(path);
  if (v === null) return null;
  return typeof v !== 'string' ? fieldAt(path, 'required') : !UUID.test(v) ? fieldAt(path, 'malformed') : null;
};
const itemIdCheck = (v: unknown): Check => (v === undefined || typeof v !== 'string' ? field('itemId') : !UUID.test(v) ? field('itemId', 'malformed') : null);
const clearableDay = (v: unknown, name: string): Check => (v === undefined || v === null ? null : isDay(v) ? null : field(name, 'malformed'));
const safeJson = (node: unknown, depth: number): boolean => {
  if (depth > CONTEXT_MAX_DEPTH) return false;
  if (node === null || typeof node === 'number' || typeof node === 'boolean') return true;
  if (typeof node === 'string') return !unsafe(node);
  if (Array.isArray(node)) return node.every(child => safeJson(child, depth + 1));
  if (typeof node === 'object') return Object.entries(node).every(([key, child]) => !unsafe(key) && safeJson(child, depth + 1));
  return false;
};
const contextCheck = (v: unknown, path: string[]): Check => {
  if (v === undefined) return fieldAt(path);
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return fieldAt(path, 'malformed');
  if (new TextEncoder().encode(JSON.stringify(v)).length > CONTEXT_MAX_BYTES) return fieldAt(path, 'too_long');
  return safeJson(v, 1) ? null : fieldAt(path, 'malformed');
};
const originCheck = (v: unknown, name: string): Check => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return field(name, 'malformed');
  const o: Record<string, unknown> = v as Record<string, unknown>; // narrowed to a plain object above
  if (Object.keys(o).some(key => key !== 'menuId' && key !== 'context')) return field(name, 'malformed');
  return requiredText(o.menuId, SHORT_MAX, [name, 'menuId']) ?? contextCheck(o.context, [name, 'context']);
};
const targetCheck = (t: unknown, path: string[]): Check => {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return fieldAt(path, 'malformed');
  const o: Record<string, unknown> = t as Record<string, unknown>; // narrowed to a plain object above
  if (Object.keys(o).some(key => key !== 'kind' && key !== 'externalKey' && key !== 'displayName')) return fieldAt(path, 'malformed');
  if (o.kind === undefined) return fieldAt([...path, 'kind']);
  if (typeof o.kind !== 'string' || !TARGET_KINDS.includes(o.kind)) return fieldAt([...path, 'kind'], 'malformed');
  const displayName: Check = o.displayName === undefined ? fieldAt([...path, 'displayName'])
    : typeof o.displayName !== 'string' || unsafe(o.displayName) ? fieldAt([...path, 'displayName'], 'malformed')
    : len(o.displayName) > SHORT_MAX ? fieldAt([...path, 'displayName'], 'too_long') : null;
  return requiredText(o.externalKey, SHORT_MAX, [...path, 'externalKey']) ?? displayName;
};
/** The server's `requiredText`/`bounded` transforms trim target texts before its duplicate check and storage (C3). */
const trimTargets = (targets: readonly Target[]): Target[] => targets.map(t => ({ kind: t.kind, externalKey: t.externalKey.trim(), displayName: t.displayName.trim() }));
const targetsCheck = (v: unknown, name: string): Check => {
  if (v === undefined) return null;
  if (!Array.isArray(v)) return field(name, 'malformed');
  if (v.length > TARGETS_MAX) return field(name, 'too_many');
  const singles = v.map((t, i) => targetCheck(t, [name, String(i)]));
  const bad = singles.find(single => single !== null);
  if (bad) return bad;
  const seen = new Set<string>();
  for (const [i, t] of trimTargets(v as Target[]).entries()) {
    const key = `${t.kind}\u0000${t.externalKey}`;
    if (seen.has(key)) return fieldAt([name, String(i)], 'duplicate');
    seen.add(key);
  }
  return null;
};
const compareLinkCheck = (v: unknown, path: string[]): Check => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || unsafe(v)) return fieldAt(path, 'malformed');
  if (len(v) > LONG_MAX) return fieldAt(path, 'too_long');
  const text = v.trim();
  return text === '' || appRelative(text) ? null : fieldAt(path, 'malformed');
};
const effectCheck = (v: unknown, name: string): Check => {
  if (v === undefined) return null;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return field(name, 'malformed');
  const o: Record<string, unknown> = v as Record<string, unknown>; // narrowed to a plain object above
  if (Object.keys(o).some(key => key !== 'result' && key !== 'note' && key !== 'compareLink')) return field(name, 'malformed');
  if (o.result === undefined) return fieldAt([name, 'result']);
  if (typeof o.result !== 'string' || !EFFECT_RESULTS.includes(o.result)) return fieldAt([name, 'result'], 'malformed');
  return clearableText(o.note, LONG_MAX, [name, 'note']) ?? compareLinkCheck(o.compareLink, [name, 'compareLink']);
};
/** `questPair`: exactly one of the two keys present → required on the missing one. */
const questPair = (input: { questId?: unknown; questTitle?: unknown }): Check => {
  const hasId = input.questId !== undefined && input.questId !== null;
  const hasTitle = input.questTitle !== undefined && input.questTitle !== null;
  return hasId === hasTitle ? null : fieldAt([hasId ? 'questTitle' : 'questId']);
};
/** Nullable required-text key: absent → required when the key is required; null clears; then `requiredText` rules. */
const nullableRequiredText = (v: unknown, max: number, path: string[], keyRequired: boolean): Check => {
  if (v === undefined) return keyRequired ? fieldAt(path) : null;
  if (v === null) return null;
  return requiredText(v, max, path);
};
/** The input-only mirror of the server's `validateItemInput` (zod schemas of `domain/item-input.ts`): everything that needs
 * no row, so a stale version is answered `conflict` and not this. Codes and paths follow the server's `fieldErrors`. */
function inputErrors(op: string, input: Record<string, unknown>): FieldError[] {
  const out: Check[] = [];
  if (op === 'itemCreate') {
    out.push(input.problem === undefined ? field('problem') : optionalText(input.problem, PROBLEM_MAX, ['problem']));
    out.push(clearableText(input.action, LONG_MAX, ['action']));
    out.push(clearableDay(input.actionDate, 'actionDate'));
    out.push(nullableUuid(input.assigneeId, ['assigneeId'], true));
    out.push(questPair(input));
    out.push(nullableRequiredText(input.questId, SHORT_MAX, ['questId'], false));
    out.push(nullableRequiredText(input.questTitle, SHORT_MAX, ['questTitle'], false));
    out.push(originCheck(input.origin, 'origin'));
    out.push(targetsCheck(input.targets, 'targets'));
    // Q2: an item names where it came from or what it concerns (DB-free, judged in validate like the server).
    if (!input.origin && !(Array.isArray(input.targets) && input.targets.length)) out.push(field('origin', 'required_or_target'));
  }
  if (op === 'itemUpdate') {
    const value = input as unknown as UpdateInput; // wire input narrowed by the op's inputKeys
    out.push(itemIdCheck(value.itemId));
    out.push(optionalText(value.problem, PROBLEM_MAX, ['problem']));
    out.push(clearableText(value.action, LONG_MAX, ['action']));
    out.push(clearableDay(value.actionDate, 'actionDate'));
    out.push(originCheck(value.origin, 'origin'));
    out.push(targetsCheck(value.targets, 'targets'));
  }
  if (op === 'itemSetStatus') {
    const value = input as unknown as StatusInput; // wire input narrowed by the op's inputKeys
    out.push(itemIdCheck(value.itemId));
    out.push(value.status === undefined ? field('status') : typeof value.status !== 'string' || !STATUSES.includes(value.status) ? field('status', 'malformed') : null);
    out.push(clearableText(value.action, LONG_MAX, ['action']));
    out.push(clearableDay(value.actionDate, 'actionDate'));
    out.push(effectCheck(value.effect, 'effect'));
    out.push(optionalText(value.reason, LONG_MAX, ['reason']));
  }
  if (op === 'itemReopen') {
    out.push(itemIdCheck(input.itemId));
    out.push(requiredText(input.reason, LONG_MAX, ['reason']));
  }
  if (op === 'itemAssign') out.push(itemIdCheck(input.itemId), nullableUuid(input.assigneeId, ['assigneeId'], false));
  if (op === 'itemLinkQuest') {
    out.push(itemIdCheck(input.itemId));
    out.push(questPair(input));
    out.push(nullableRequiredText(input.questId, SHORT_MAX, ['questId'], true));
    out.push(nullableRequiredText(input.questTitle, SHORT_MAX, ['questTitle'], true));
  }
  const seen = new Set<string>();
  const result: FieldError[] = [];
  for (const error of out) {
    if (error === null) continue;
    const key = error.path.join('.');
    if (!seen.has(key)) { seen.add(key); result.push(error); }
  }
  return result;
}
/** The row-dependent judgments of the server's `handle` phase, after the lock. The mock engine throws them as
 * `MockActionInvalid`, so a stale expectedVersion is answered `conflict` first — never row-state `invalid`. */
function rowErrors(op: string, row: ItemRow, value: UpdateInput | StatusInput | { itemId: string; reason: string } | { itemId: string; assigneeId: string | null } | { itemId: string; questId: string | null; questTitle: string | null }): FieldError[] {
  const input = value as Record<string, unknown>;
  if (op === 'itemSetStatus') {
    const s = value as StatusInput;
    if (!FORWARD[row.status].includes(s.status)) return [field('status', 'illegal_transition')];
    const applicable: Record<string, boolean> = { action: s.status === 'in_progress' || s.status === 'done', actionDate: s.status === 'done', effect: s.status === 'verified', reason: s.status === 'dropped' };
    const stray = Object.entries(applicable).filter(([key]) => input[key] !== undefined && !applicable[key]).map(([key]) => field(key, 'not_applicable'));
    if (stray.length > 0) return stray;
    const errors: FieldError[] = [];
    const action = s.action === undefined ? row.action : s.action;
    const actionDate = s.actionDate === undefined ? row.actionDate : s.actionDate;
    const effect = s.status === 'verified' ? (s.effect ?? null) : null;
    const dropReason = s.status === 'dropped' ? (s.reason ?? null) : row.dropReason;
    if (['in_progress', 'done', 'verified'].includes(s.status) && blank(action)) errors.push(field('action'));
    if (['done', 'verified'].includes(s.status) && actionDate === null) errors.push(field('actionDate'));
    // `verified` always carries a fresh effect: a stale one from before a reopen does not count.
    if (s.status === 'verified' && effect === null) errors.push(field('effect'));
    if (s.status === 'dropped' && blank(dropReason)) errors.push(field('reason'));
    return errors;
  }
  if (op === 'itemReopen') return REOPEN[row.status] ? [] : [field('status', 'illegal_transition')];
  if (op === 'itemUpdate') {
    const errors: FieldError[] = [];
    if (['in_progress', 'done', 'verified'].includes(row.status) && blank((value as UpdateInput).action === undefined ? row.action : (value as UpdateInput).action)) errors.push(field('action'));
    if (['done', 'verified'].includes(row.status) && ((value as UpdateInput).actionDate === undefined ? row.actionDate : (value as UpdateInput).actionDate) === null) errors.push(field('actionDate'));
    const origin = input.origin === undefined ? row.origin : (input.origin as UpdateInput['origin']);
    const targets = input.targets === undefined ? row.targets : (input.targets as UpdateInput['targets']);
    if (!((origin)) && !(targets && targets.length)) errors.push(field('origin', 'required_or_target'));
    return errors;
  }
  return [];
}
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
const create = defineMockAction(itemCreate, { validate: input => inputErrors('itemCreate', input), handle: ({ input, actor }) => {
  const n = rows.length + 1;
  const row: ItemRow = { id: itemId(n), itemNo: n, problem: input.problem.trim(), action: input.action ?? null, actionDate: input.actionDate ?? null, status: 'open', assignee: input.assigneeId ? { id: input.assigneeId, displayName: input.assigneeId } : null, quest: input.questId ? { id: input.questId, titleSnapshot: input.questTitle! } : null, origin: input.origin ?? null, targets: input.targets ? trimTargets(input.targets) : [], effectResult: null, effectNote: null, effectCompareLink: null, dropReason: null, version: '1', createdBy: actor, updatedBy: actor, createdAt: at, updatedAt: at };
  rows.push(row); record(row, actor, 'created', {});
  return { data: { itemId: row.id, itemNo: n, version: row.version }, version: null };
} });
const writes = actionSpecs.slice(1).map(spec => defineMockAction(spec as ActionSpec<Record<string, unknown> & { itemId: string }, unknown>, {
  version: ({ input }) => find(input)?.version ?? null,
  validate: input => inputErrors(spec.id.split('.')[1]!, input),
  handle: ({ input, actor }) => {
    const row = find(input)!; const before = structuredClone(row); const op = spec.id.split('.')[1]!;
    const refuses = rowErrors(op, row, input);
    if (refuses.length > 0) throw new MockActionInvalid(refuses);
    if (op === 'itemUpdate') for (const key of ['problem', 'action', 'actionDate', 'origin', 'targets'] as const) if (input[key] !== undefined) Object.assign(row, { [key]: key === 'targets' ? trimTargets(input.targets as Target[]) : input[key] });
    if (op === 'itemSetStatus') {
      const s = input as StatusInput; row.status = s.status;
      if (s.action !== undefined) row.action = s.action; if (s.actionDate !== undefined) row.actionDate = s.actionDate;
      if (s.effect) { row.effectResult = s.effect.result; row.effectNote = s.effect.note?.trim() || null; row.effectCompareLink = s.effect.compareLink?.trim() || null; }
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
