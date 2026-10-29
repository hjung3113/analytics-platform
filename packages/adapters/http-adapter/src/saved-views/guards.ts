import { isForbiddenSavedViewKey, isRecord } from '@ap/contracts';

// Runtime guards that deeply match the wire schemas in `@ap/contract-schemas/src/saved-view-commands.ts` (ADR-0099 section 3).
// This package has no runtime Zod dependency; `__tests__/saved-view-guards.test.ts` proves the equivalence against the schemas.

/** Same bounds as the schema: whole serialized command body, root is depth 0. */
export const COMMAND_MAX_BYTES = 262_144;
export const COMMAND_MAX_DEPTH = 32;
export const IMPORT_ROWS_MAX = 200;
export const TOKEN_MAX = 200;

type Guard = (value: unknown) => boolean;

const str: Guard = (v) => typeof v === 'string';
const num: Guard = (v) => typeof v === 'number' && Number.isFinite(v);
const int: Guard = (v) => typeof v === 'number' && Number.isInteger(v);
const bool: Guard = (v) => typeof v === 'boolean';
const id: Guard = (v) => typeof v === 'string' && v.length > 0;
const lit = (expected: unknown): Guard => (v) => v === expected;
const oneOf = (...allowed: string[]): Guard => (v) => typeof v === 'string' && allowed.includes(v);
const nullable = (guard: Guard): Guard => (v) => v === null || guard(v);
const arrayOf = (guard: Guard): Guard => (v) => Array.isArray(v) && v.every(guard);
const anyOf = (...guards: Guard[]): Guard => (v) => guards.some((guard) => guard(v));
const recordOf = (guard: Guard): Guard => (v) => isRecord(v) && Object.values(v).every(guard);
const strings = arrayOf(str);

/** Strict object: every required key present and valid, optional keys valid when present (`undefined` counts as absent), no other key. */
function strict(required: Record<string, Guard>, optional: Record<string, Guard> = {}): Guard {
  return (v) => {
    if (!isRecord(v)) return false;
    for (const key of Object.keys(v)) if (!Object.hasOwn(required, key) && !Object.hasOwn(optional, key)) return false;
    for (const [key, guard] of Object.entries(required)) if (!guard(v[key])) return false;
    for (const [key, guard] of Object.entries(optional)) if (v[key] !== undefined && !guard(v[key])) return false;
    return true;
  };
}

/** Lone surrogates and NUL cannot be stored; the server refuses them, so the client refuses to send them. */
export function isWellFormedText(value: string): boolean {
  if (value.includes('\u0000')) return false;
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

/** Finite JSON whose strings (values and key names) are well formed. Iterative: a hostile value cannot overflow the stack. */
const json: Guard = (root) => {
  const pending: unknown[] = [root];
  for (let node = pending.pop(); ; node = pending.pop()) {
    if (typeof node === 'number') {
      if (!Number.isFinite(node)) return false;
    } else if (typeof node === 'string') {
      if (!isWellFormedText(node)) return false;
    } else if (Array.isArray(node)) {
      pending.push(...node);
    } else if (isRecord(node) && (Object.getPrototypeOf(node) === Object.prototype || Object.getPrototypeOf(node) === null)) {
      for (const [key, child] of Object.entries(node)) {
        if (!isWellFormedText(key)) return false;
        pending.push(child);
      }
    } else if (node !== null && typeof node !== 'boolean') return false;
    if (pending.length === 0) return true;
  }
};

function hasForbiddenKey(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(([key, child]) => (!Array.isArray(value) && isForbiddenSavedViewKey(key)) || hasForbiddenKey(child));
}
const noForbiddenKeys = (guard: Guard): Guard => (v) => guard(v) && !hasForbiddenKey(v);
const text: Guard = (v) => typeof v === 'string' && isWellFormedText(v);
const textList: Guard = arrayOf(text);

const context: Guard = noForbiddenKeys(
  strict(
    {},
    {
      from: nullable(text),
      to: nullable(text),
      selection: nullable(textList),
      lineNames: nullable(textList),
      prcGroups: nullable(textList),
      roomNames: nullable(textList),
      membershipBasis: nullable(lit('asOf')),
      condition: nullable((v) => isRecord(v) && Object.entries(v).every(([k, axis]) => isWellFormedText(k) && Array.isArray(axis) && axis.length > 0 && axis.every(text))),
      relativePeriod: strict({ hours: num }),
    },
  ),
);
const pairs: Guard = (v) => Array.isArray(v) && v.every((pair) => Array.isArray(pair) && pair.length === 2 && text(pair[0]) && text(pair[1]) && !isForbiddenSavedViewKey(pair[0] as string));
const keyMap: Guard = (v) => isRecord(v) && Object.entries(v).every(([k, list]) => isWellFormedText(k) && !isForbiddenSavedViewKey(k) && textList(list));
const page = anyOf(pairs, keyMap);
const chartOptions = noForbiddenKeys((v) => isRecord(v) && json(v));
const layout = noForbiddenKeys(json);
const name: Guard = (v) => typeof v === 'string' && v.trim() !== '' && isWellFormedText(v);
const menuId: Guard = (v) => typeof v === 'string' && v.length > 0 && isWellFormedText(v);

export const isSavedViewDraft: Guard = (v) =>
  isRecord(v) &&
  (v['kind'] === 'condition-set'
    ? strict({ schemaVersion: lit(1), kind: lit('condition-set'), name, context })(v)
    : strict({ schemaVersion: lit(1), kind: lit('menu-view'), name, menuId, menuSchemaVersion: int, context, page, chartOptions, layout, panels: json })(v));

const patch = strict({}, { name: text, menuSchemaVersion: int, context, page, chartOptions, layout, panels: json });
const visibility: Guard = (v) =>
  isRecord(v) &&
  (v['kind'] === 'private' || v['kind'] === 'official'
    ? strict({ kind: lit(v['kind']) })(v)
    : v['kind'] === 'people'
      ? strict({ kind: lit('people'), userIds: textList })(v)
      : v['kind'] === 'groups'
        ? strict({ kind: lit('groups'), groupIds: textList })(v)
        : false);

/** Bytes (UTF-8) of the serialized value, the measure the server applies to a command body. */
export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** False at the first value deeper than the bound (root is 0, scalar leaves included). Iterative. */
export function withinDepth(value: unknown, max = COMMAND_MAX_DEPTH): boolean {
  const pending: [unknown, number][] = [[value, 0]];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [node, depth] = next;
    if (depth > max) return false;
    if (typeof node !== 'object' || node === null) continue;
    for (const child of Array.isArray(node) ? node : Object.values(node)) pending.push([child, depth + 1]);
  }
  return true;
}

export const withinCommandBounds = (body: unknown): boolean => withinDepth(body) && jsonBytes(body) <= COMMAND_MAX_BYTES;

// ---- commands (what this client may send) ----

const key = strict({ menuId: nullable(menuId) });
const expected = { expectedVersion: int };
const cmd = (op: string, shape: Record<string, Guard>, optional: Record<string, Guard> = {}): Guard => strict({ version: lit(1), op: lit(op), ...shape }, optional);
const importRow = strict({ legacyKey: (v) => typeof v === 'string' && v.length >= 1 && v.length <= TOKEN_MAX && isWellFormedText(v), draft: isSavedViewDraft });
const importDefault = strict({ key, legacyKey: (v) => typeof v === 'string' && v.length >= 1 && v.length <= TOKEN_MAX && isWellFormedText(v) });
const importLocal: Guard = (v) => {
  if (!cmd('importLocal', { importToken: (t) => typeof t === 'string' && t.length >= 1 && t.length <= TOKEN_MAX && isWellFormedText(t), rows: (r) => Array.isArray(r) && r.length <= IMPORT_ROWS_MAX && r.every(importRow), defaults: (d) => Array.isArray(d) && d.length <= IMPORT_ROWS_MAX && d.every(importDefault) })(v)) return false;
  const rows = (v as { rows: { legacyKey: string }[] }).rows;
  const keys = new Set(rows.map((row) => row.legacyKey));
  return keys.size === rows.length && (v as { defaults: { legacyKey: string }[] }).defaults.every((d) => keys.has(d.legacyKey));
};
const commandGuards: Guard[] = [
  cmd('list', { key }),
  cmd('get', { id: text }),
  cmd('save', { draft: isSavedViewDraft }),
  cmd('update', { id: text, patch, ...expected }),
  cmd('remove', { id: text }),
  cmd('setDefault', { key, id: nullable(text) }),
  cmd('getDefaultId', { key }),
  cmd('setVisibility', { id: text, visibility, ...expected }),
  cmd('requestOfficial', { id: text, ...expected }),
  cmd('decide', { id: text, decision: oneOf('approve', 'reject'), ...expected }, { note: text }),
  cmd('revoke', { id: text, ...expected }),
  cmd('listApprovalRequests', { key }),
  cmd('listGroups', {}),
  cmd('createGroup', { name: text, memberIds: textList }),
  cmd('updateGroup', { id: text, patch: strict({}, { name: text, addMembers: textList, removeMembers: textList }) }),
  cmd('searchPeople', { query: text }),
  importLocal,
];
/** The whole outgoing body: bounds first (like the server), then the exact strict command shape. */
export const isSavedViewCommand: Guard = (body) => withinCommandBounds(body) && commandGuards.some((guard) => guard(body));

// ---- responses ----

const capabilities = strict({ canView: bool, canCopy: bool, canEdit: bool, canShare: bool, canApprove: bool, canRevoke: bool }, { reason: str });
const record = { id, schemaVersion: lit(1), name: str, ownerId: str, version: int, updatedAt: num, visibility, approval: oneOf('none', 'pending', 'approved', 'rejected'), context };
const approvalNote = { approvalNote: str };
const savedView: Guard = (v) =>
  isRecord(v) &&
  (v['kind'] === 'condition-set'
    ? strict({ ...record, kind: lit('condition-set') }, approvalNote)(v)
    : strict({ ...record, kind: lit('menu-view'), menuId: id, menuSchemaVersion: int, page, chartOptions, layout, panels: json }, approvalNote)(v));
const entry = strict({ view: savedView, capabilities }, { denied: lit(false) });
const denied = strict({ id, denied: lit(true), reason: str });
const listItem = anyOf(entry, denied);
const approvalRequest = strict({ viewId: id, requestedBy: str, requestedAt: num, targetVersion: int, changes: strings }, { rejectReason: str });
const member = strict({ userId: str, displayName: str, affiliation: str });
const groupEntry = strict({
  group: strict({ id, kind: oneOf('org-team', 'custom'), name: str, memberCount: int }, { managerIds: strings }),
  members: arrayOf(member),
  capabilities: strict({ canView: bool, canEditMembers: bool, canRename: bool, canDelete: bool }),
});
const result = (value: Guard): Guard =>
  anyOf(strict({ ok: lit(true), value }), strict({ ok: lit(false), reason: oneOf('conflict', 'forbidden', 'unavailable', 'invalid') }, { detail: str }));
const importOutcome = strict({
  results: arrayOf(
    anyOf(
      strict({ legacyKey: str, status: oneOf('imported', 'already_imported'), id }),
      strict({ legacyKey: str, status: lit('rejected'), reason: oneOf('invalid', 'forbidden', 'unavailable') }, { detail: str }),
    ),
  ),
  defaults: arrayOf(strict({ key, legacyKey: str, id })),
});

export const responseGuards = {
  list: arrayOf(listItem),
  get: nullable(listItem),
  save: result(entry),
  update: result(entry),
  remove: result(lit(null)),
  setDefault: result(lit(null)),
  getDefaultId: nullable(str),
  setVisibility: result(entry),
  requestOfficial: result(entry),
  decide: result(entry),
  revoke: result(entry),
  listApprovalRequests: arrayOf(approvalRequest),
  listGroups: arrayOf(groupEntry),
  createGroup: result(groupEntry),
  updateGroup: result(groupEntry),
  searchPeople: arrayOf(member),
  importLocal: result(importOutcome),
} as const satisfies Record<string, Guard>;
export type SavedViewOp = keyof typeof responseGuards;
