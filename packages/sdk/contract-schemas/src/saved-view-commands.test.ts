import { isForbiddenSavedViewKey, validateSavedView } from '@ap/contracts';
import type { ApprovalRequestInfo, GroupMember, Result, SavedViewEntry, SavedViewListItem, SavedViewStore, ViewGroupEntry } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod/v4';
import {
  SAVED_VIEW_COMMAND_MAX_BYTES,
  SAVED_VIEW_COMMAND_MAX_DEPTH,
  SCHEMA_FILES,
  isForbiddenSavedViewWireKey,
  savedViewCommandSchema,
  savedViewDraftSchema,
  savedViewResponseSchemas,
} from './index.ts';
import type { SavedViewOp } from './index.ts';

const V = { version: 1 } as const;
const key = { menuId: 'm1' };
const condDraft = { schemaVersion: 1, kind: 'condition-set', name: 'Set', context: { from: '2026-10-01T00:00:00', to: null, selection: ['a'], membershipBasis: null } };
const menuDraft = {
  schemaVersion: 1, kind: 'menu-view', name: 'View', menuId: 'm1', menuSchemaVersion: 2,
  context: { relativePeriod: { hours: 24 }, condition: { axis: ['x'] } }, page: { tab: ['a'] }, chartOptions: { stack: true }, layout: [], panels: { anything: 'goes', draftX: 1 },
};
const view = { id: 'v1', schemaVersion: 1, kind: 'condition-set', name: 'Set', ownerId: 'u1', version: 3, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none', context: {} };
const caps = { canView: true, canCopy: true, canEdit: true, canShare: true, canApprove: false, canRevoke: false };
const entry = { view, capabilities: caps };
const group = { group: { id: 'g1', kind: 'custom', name: 'G', memberCount: 1, managerIds: ['u1'] }, members: [{ userId: 'u1', displayName: 'U', affiliation: '' }], capabilities: { canView: true, canEditMembers: true, canRename: true, canDelete: true } };
const person = { userId: 'u1', displayName: 'U', affiliation: '' };
const approval = { viewId: 'v1', requestedBy: 'u1', requestedAt: 1, targetVersion: 2, changes: ['x'] };
const denied = { id: 'v2', denied: true, reason: 'no access' };
const importCommand = { ...V, op: 'importLocal', importToken: 't1', rows: [{ legacyKey: 'k1', draft: condDraft }], defaults: [{ key: { menuId: null }, legacyKey: 'k1' }] };

const commands: Record<string, unknown> = {
  list: { ...V, op: 'list', key }, get: { ...V, op: 'get', id: 'v1' }, save: { ...V, op: 'save', draft: menuDraft },
  update: { ...V, op: 'update', id: 'v1', patch: { name: 'n', panels: null }, expectedVersion: 3 }, remove: { ...V, op: 'remove', id: 'v1' },
  setDefault: { ...V, op: 'setDefault', key: { menuId: null }, id: null }, getDefaultId: { ...V, op: 'getDefaultId', key },
  setVisibility: { ...V, op: 'setVisibility', id: 'v1', visibility: { kind: 'groups', groupIds: ['g1'] }, expectedVersion: 1 },
  requestOfficial: { ...V, op: 'requestOfficial', id: 'v1', expectedVersion: 1 }, decide: { ...V, op: 'decide', id: 'v1', decision: 'reject', note: 'why', expectedVersion: 1 },
  revoke: { ...V, op: 'revoke', id: 'v1', expectedVersion: 1 }, listApprovalRequests: { ...V, op: 'listApprovalRequests', key }, listGroups: { ...V, op: 'listGroups' },
  createGroup: { ...V, op: 'createGroup', name: 'G', memberIds: ['u1'] }, updateGroup: { ...V, op: 'updateGroup', id: 'g1', patch: { addMembers: ['u2'] } },
  searchPeople: { ...V, op: 'searchPeople', query: 'ki' }, importLocal: importCommand,
};
const ok = <T>(value: T) => ({ ok: true, value });
const fail = (reason: string) => ({ ok: false, reason, detail: 'd' });
const responses: Record<SavedViewOp, [unknown, unknown]> = {
  list: [[entry, denied], [{ id: 'v2', denied: true, reason: 'r', name: 'leak' }]], get: [null, { ...entry, view: { ...view, ownerId: 1 } }],
  save: [ok(entry), fail('nope')], update: [fail('conflict'), ok(null)], remove: [ok(null), ok(entry)], setDefault: [ok(null), { ok: true }],
  getDefaultId: [null, 5], setVisibility: [ok(entry), { ok: true, value: entry, extra: 1 }], requestOfficial: [ok(entry), ok({})], decide: [fail('forbidden'), fail('x')],
  revoke: [ok(entry), ok(undefined)], listApprovalRequests: [[approval], [{ ...approval, requestedBy: undefined }]], listGroups: [[group], [{ ...group, members: [{ userId: 'u' }] }]],
  createGroup: [ok(group), ok(entry)], updateGroup: [fail('invalid'), ok(group.members)], searchPeople: [[person], [{ ...person, role: 'admin' }]],
  importLocal: [ok({ results: [{ legacyKey: 'k1', status: 'imported', id: 's1' }, { legacyKey: 'k2', status: 'rejected', reason: 'invalid' }], defaults: [{ key: { menuId: null }, legacyKey: 'k1', id: 's1' }] }), ok({ results: [{ legacyKey: 'k1', status: 'imported' }], defaults: [] })],
};

// Compile-time: every parsed response is assignable to the port's resolved type (type-only imports).
type Resolved<K extends keyof SavedViewStore> = Awaited<ReturnType<SavedViewStore[K]>>;
type Parsed<K extends SavedViewOp> = z.infer<(typeof savedViewResponseSchemas)[K]>;
export const _assignable = (a: {
  list: Parsed<'list'>; get: Parsed<'get'>; save: Parsed<'save'>; update: Parsed<'update'>; remove: Parsed<'remove'>; setDefault: Parsed<'setDefault'>; getDefaultId: Parsed<'getDefaultId'>;
  setVisibility: Parsed<'setVisibility'>; requestOfficial: Parsed<'requestOfficial'>; decide: Parsed<'decide'>; revoke: Parsed<'revoke'>; listApprovalRequests: Parsed<'listApprovalRequests'>;
  listGroups: Parsed<'listGroups'>; createGroup: Parsed<'createGroup'>; updateGroup: Parsed<'updateGroup'>; searchPeople: Parsed<'searchPeople'>;
}): { [K in keyof typeof a]: Resolved<K> } => a;
export const _shapes = (e: Parsed<'save'>, l: Parsed<'list'>, g: Parsed<'createGroup'>, p: Parsed<'listApprovalRequests'>, m: Parsed<'searchPeople'>): [Result<SavedViewEntry>, readonly SavedViewListItem[], Result<ViewGroupEntry>, readonly ApprovalRequestInfo[], readonly GroupMember[]] => [e, l, g, p, m];

const parse = (body: unknown) => savedViewCommandSchema.safeParse(body);
const withDraft = (draft: unknown) => ({ ...V, op: 'save', draft });
const deep = (n: number): unknown => (n === 0 ? 1 : { a: deep(n - 1) });

describe('saved-view commands', () => {
  it('ops are exactly the store methods plus importLocal', () => {
    expect(Object.keys(commands).sort()).toEqual([...Object.keys(savedViewResponseSchemas)].sort());
    const storeMethods = ['list', 'get', 'save', 'update', 'remove', 'setDefault', 'getDefaultId', 'setVisibility', 'requestOfficial', 'decide', 'revoke', 'listApprovalRequests', 'listGroups', 'createGroup', 'updateGroup', 'searchPeople'];
    expect(Object.keys(savedViewResponseSchemas).filter((op) => op !== 'importLocal').sort()).toEqual([...storeMethods].sort());
  });

  it.each(Object.entries(commands))('accepts a valid %s command', (_op, body) => {
    expect(parse(body).success).toBe(true);
  });

  it.each(Object.entries(responses))('%s response: valid shape passes, wrong shape fails', (op, [good, bad]) => {
    const schema = savedViewResponseSchemas[op as SavedViewOp];
    expect(schema.safeParse(good).success).toBe(true);
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it('rejects forged identity and unknown op/version', () => {
    expect(parse({ ...V, op: 'list', key: { userId: 'u9', menuId: 'm1' } }).success).toBe(false);
    expect(parse({ ...V, op: 'save', draft: { ...condDraft, ownerId: 'u9' } }).success).toBe(false);
    expect(parse({ ...V, op: 'save', draft: { ...condDraft, visibility: { kind: 'official' } } }).success).toBe(false);
    expect(parse({ ...V, op: 'save', draft: { ...condDraft, id: 'v9', version: 1 } }).success).toBe(false);
    expect(parse({ ...commands.get as object, actor: 'u9' }).success).toBe(false);
    expect(parse({ ...V, op: 'query', sql: 'x' }).success).toBe(false);
    expect(parse({ ...commands.get as object, version: 2 }).success).toBe(false);
    expect(parse({ ...commands.get as object, version: undefined }).success).toBe(false);
  });

  it('keeps menuId nullable in keys and requires the expected version on writes', () => {
    expect(parse({ ...V, op: 'list', key: { menuId: null } }).success).toBe(true);
    expect(parse({ ...V, op: 'list', key: {} }).success).toBe(false);
    expect(parse({ ...V, op: 'revoke', id: 'v1' }).success).toBe(false);
    expect(parse({ ...V, op: 'decide', id: 'v1', decision: 'maybe', expectedVersion: 1 }).success).toBe(false);
  });

  it('draft discriminants: condition sets have no menu fields, menu views need them', () => {
    expect(parse(withDraft({ ...condDraft, page: {} })).success).toBe(false);
    for (const missing of ['menuId', 'menuSchemaVersion', 'page', 'chartOptions', 'layout', 'panels']) {
      const { [missing]: _drop, ...rest } = menuDraft as Record<string, unknown>;
      expect(parse(withDraft(rest)).success, missing).toBe(false);
    }
    expect(parse(withDraft({ ...menuDraft, name: '  ' })).success).toBe(false);
    expect(parse(withDraft({ ...menuDraft, kind: 'board' })).success).toBe(false);
    expect(parse(withDraft({ ...menuDraft, schemaVersion: 2 })).success).toBe(false);
  });

  it('Context: relative and absolute periods pass, scopeId and unknown keys are not savable', () => {
    expect(parse(withDraft({ ...condDraft, context: { relativePeriod: { hours: 6 } } })).success).toBe(true);
    expect(parse(withDraft({ ...condDraft, context: { from: '2026-10-01T00:00:00', to: '2026-10-02T00:00:00' } })).success).toBe(true);
    expect(parse(withDraft({ ...condDraft, context: { scopeId: 's1' } })).success).toBe(false);
    expect(parse(withDraft({ ...condDraft, context: { lotIds: [] } })).success).toBe(false);
    expect(parse(withDraft({ ...condDraft, context: { relativePeriod: { hours: 6, extra: 1 } } })).success).toBe(false);
    expect(parse(withDraft({ ...condDraft, context: { condition: { axis: [] } } })).success).toBe(false);
  });

  it('forbidden keys: same names as the SDK, page and nested, Scope-named keys allowed, panels opaque', () => {
    for (const k of ['hoverRow', 'zoomLevel', 'modalOpen', 'openModal', 'draftFilter', 'rows', 'rawData', 'engineState', 'dockLayout', 'scopeId', 'scope', 'rowsX', 'Rows']) {
      expect(isForbiddenSavedViewWireKey(k), k).toBe(isForbiddenSavedViewKey(k));
    }
    for (const bad of [{ ...menuDraft, page: { hoverRow: ['a'] } }, { ...menuDraft, page: [['dockX', 'a']] }, { ...menuDraft, chartOptions: { nested: { rows: [] } } }, { ...menuDraft, layout: [{ engineState: 1 }] }]) {
      expect(parse(withDraft(bad)).success).toBe(false);
      expect(validateSavedView(bad).ok).toBe(false);
    }
    const scoped = { ...menuDraft, page: { scopeId: ['s1'], scope: ['x'] }, chartOptions: { scope: 'all' }, layout: { scopeId: 'x' } };
    expect(parse(withDraft(scoped)).success).toBe(true);
    expect(validateSavedView(scoped).ok).toBe(true);
    expect(parse(withDraft(menuDraft)).success).toBe(true);
    expect(validateSavedView(menuDraft).ok).toBe(true);
  });

  it('accepts what the SDK validator accepts and rejects what it rejects (examples)', () => {
    for (const d of [condDraft, menuDraft, { ...menuDraft, page: [['tab', 'a']], layout: null, panels: null }]) {
      expect(validateSavedView(d).ok).toBe(true);
      expect(savedViewDraftSchema.safeParse(d).success).toBe(true);
    }
    for (const d of [{ ...condDraft, context: { from: 5 } }, { ...menuDraft, panels: Number.POSITIVE_INFINITY }, { ...menuDraft, page: { tab: 'a' } }]) {
      expect(validateSavedView(d).ok).toBe(false);
      expect(savedViewDraftSchema.safeParse(d).success).toBe(false);
    }
  });

  it('finite JSON only: non-finite numbers are refused', () => {
    expect(parse(withDraft({ ...menuDraft, layout: Number.NaN })).success).toBe(false);
    expect(parse(withDraft({ ...menuDraft, panels: [Number.POSITIVE_INFINITY] })).success).toBe(false);
  });

  it('transport bounds reject an SDK-valid draft with a recoverable invalid result (depth)', () => {
    const tooDeep = { ...menuDraft, layout: deep(SAVED_VIEW_COMMAND_MAX_DEPTH) };
    expect(validateSavedView(tooDeep).ok).toBe(true);
    const result = parse(withDraft(tooDeep));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('deep');
    expect(parse(withDraft({ ...menuDraft, layout: deep(SAVED_VIEW_COMMAND_MAX_DEPTH - 3) })).success).toBe(true);
  });

  it('transport bounds reject an SDK-valid draft with a recoverable invalid result (bytes)', () => {
    const tooBig = { ...menuDraft, panels: 'x'.repeat(SAVED_VIEW_COMMAND_MAX_BYTES) };
    expect(validateSavedView(tooBig).ok).toBe(true);
    const result = parse(withDraft(tooBig));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('bytes');
    expect(parse(withDraft({ ...menuDraft, panels: 'x'.repeat(1000) })).success).toBe(true);
  });

  it('import: stable token, per-row legacy keys, defaults must point at rows, no foreign authority', () => {
    expect(parse({ ...importCommand, importToken: '' }).success).toBe(false);
    expect(parse({ ...importCommand, rows: [...importCommand.rows, importCommand.rows[0]] }).success).toBe(false);
    expect(parse({ ...importCommand, defaults: [{ key, legacyKey: 'zz' }] }).success).toBe(false);
    expect(parse({ ...importCommand, rows: [{ legacyKey: 'k1', draft: condDraft, ownerId: 'u9' }] }).success).toBe(false);
    expect(parse({ ...importCommand, rows: [{ legacyKey: 'k1', draft: { ...condDraft, visibility: { kind: 'official' } } }] }).success).toBe(false);
    expect(parse({ ...importCommand, rows: [{ legacyKey: 'k1', draft: { ...condDraft, kind: 'board' } }] }).success).toBe(false);
    expect(parse({ ...importCommand, rows: [], defaults: [] }).success).toBe(true);
  });

  it('import outcome: partial replay maps committed rows to ids, rejected rows carry no id', () => {
    const schema = savedViewResponseSchemas.importLocal;
    const replay = ok({ results: [{ legacyKey: 'k1', status: 'already_imported', id: 's1' }, { legacyKey: 'k2', status: 'rejected', reason: 'forbidden', detail: 'd' }], defaults: [] });
    expect(schema.safeParse(replay).success).toBe(true);
    expect(schema.safeParse(ok({ results: [{ legacyKey: 'k2', status: 'rejected', reason: 'invalid', id: 's2' }], defaults: [] })).success).toBe(false);
    expect(schema.safeParse(fail('unavailable')).success).toBe(true);
  });

  it('conflict and denied entries carry no title', () => {
    expect(savedViewResponseSchemas.update.safeParse(fail('conflict')).success).toBe(true);
    expect(savedViewResponseSchemas.update.safeParse({ ok: false, reason: 'conflict', title: 'secret' }).success).toBe(false);
    expect(savedViewResponseSchemas.get.safeParse({ ...denied, name: 'leak' }).success).toBe(false);
    expect(savedViewResponseSchemas.get.safeParse(denied).success).toBe(true);
  });

  it('is registered as JSON Schema artifacts', () => {
    for (const file of ['savedViewCommand', 'savedViewDraft', 'savedViewPatch', 'savedView', 'savedViewEntry', 'savedViewListItem', 'savedViewImportOutcome', 'viewVisibility']) expect(Object.keys(SCHEMA_FILES)).toContain(file);
  });
});
