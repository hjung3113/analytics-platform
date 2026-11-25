import { CUSTOM_GROUP_FIXED_MAX, PANEL_INSTANCES_MAX, PANEL_INSTANCE_INPUTS_MAX, PANEL_INSTANCE_TOKEN_MAX, isForbiddenSavedViewKey, readMenuViewPanels, validateSavedView } from '@ap/contracts';
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
  savedViewPatchSchema,
  savedViewResponseSchemas,
} from './index.ts';
import type { SavedViewOp } from './index.ts';
import { MAX_VIEW_TABLES, MAX_TABLE_KEY_LENGTH, MAX_GROUP_BASIS_LENGTH, MAX_COLUMN_GROUPS, MAX_GROUP_ID_LENGTH, MAX_GROUP_MEMBERS, MAX_GROUP_LABEL_LENGTH, MIN_GROUP_WIDTH } from '@ap/contracts';
import {
  CUSTOM_GROUP_FIXED_MAX as WIRE_CUSTOM_GROUP_FIXED_MAX,
  PANEL_INSTANCES_MAX as WIRE_PANEL_INSTANCES_MAX,
  PANEL_INSTANCE_INPUTS_MAX as WIRE_PANEL_INSTANCE_INPUTS_MAX,
  PANEL_INSTANCE_TOKEN_MAX as WIRE_PANEL_INSTANCE_TOKEN_MAX,
  TABLE_VIEW_CAPS,
} from './saved-view-commands.ts';

const V = { version: 1 } as const;
const key = { menuId: 'm1' };
const condDraft = { schemaVersion: 1, kind: 'condition-set', name: 'Set', context: { from: '2026-10-01T00:00:00', to: null, selection: ['a'], membershipBasis: null } };
const declared = {
  id: 'A', source: { kind: 'declared', panel: 'other-menu/panel' }, inputs: [],
  outputs: [{ key: 'time.range', dimension: 'time', shape: 'range' }, { key: 'lots', dimension: 'lot', shape: 'set' }],
};
const chart = {
  id: 'B', source: { kind: 'chart', config: { anything: ['goes', null], scope: 'all' } },
  inputs: [{ key: 'period', mode: 'follow', from: 'A.time.range' }],
  outputs: [{ key: 'time', dimension: 'time', shape: 'range' }],
};
const held = {
  id: 'C', source: { kind: 'declared', panel: 'local' }, outputs: [],
  inputs: [
    { key: 'lots', mode: 'hold', from: 'A.lots', value: { shape: 'set', values: ['L1', 'L2'] } },
    { key: 'period', mode: 'hold', from: 'B.time', value: { shape: 'range', from: '2026-11-25T00:00:00', to: '2026-11-26T00:00:00' } },
  ],
};
const panels = { version: 1, instances: [declared, chart, held] };
const menuDraft = {
  schemaVersion: 1, kind: 'menu-view', name: 'View', menuId: 'm1', menuSchemaVersion: 2,
  context: { relativePeriod: { hours: 24 }, condition: { axis: ['x'] } }, page: { tab: ['a'] }, chartOptions: { stack: true }, layout: [], panels,
};

const withChartConfig = (config: unknown) => ({ ...panels, instances: [declared, { ...chart, source: { ...chart.source, config } }, held] });

describe('saved panel instances (#2760)', () => {
  const withB = (patch: Partial<typeof chart>) => ({ ...panels, instances: [declared, { ...chart, ...patch }, held] });
  const withEdge = (from: string) => withB({ inputs: [{ ...chart.inputs[0]!, from }] });
  const withSet = (values: string[]) => ({
    ...panels, instances: [declared, chart, { ...held, inputs: [{ key: 'lots', from: 'A.lots', mode: 'hold', value: { shape: 'set', values } }] }],
  });
  const update = (raw: unknown) => savedViewCommandSchema.safeParse({ ...V, op: 'update', id: 'v1', expectedVersion: 1, patch: { panels: raw } });
  const invalidPanels = (raw: unknown, message?: string) => {
    const contract = validateSavedView({ ...menuDraft, panels: raw });
    const wire = savedViewDraftSchema.safeParse({ ...menuDraft, panels: raw });
    const patch = savedViewPatchSchema.safeParse({ panels: raw });
    expect(contract.ok).toBe(false);
    expect(wire.success).toBe(false);
    expect(patch.success).toBe(false);
    expect(update(raw).success).toBe(false);
    if (message !== undefined) {
      expect(contract).toMatchObject({ reason: 'invalid', detail: message });
      expect(wire.error?.issues.map(issue => issue.message)).toContain(message);
      expect(patch.error?.issues.map(issue => issue.message)).toContain(message);
    }
  };

  it('pins matching validation limits', () => {
    expect([WIRE_PANEL_INSTANCES_MAX, WIRE_PANEL_INSTANCE_INPUTS_MAX, WIRE_PANEL_INSTANCE_TOKEN_MAX, WIRE_CUSTOM_GROUP_FIXED_MAX])
      .toEqual([PANEL_INSTANCES_MAX, PANEL_INSTANCE_INPUTS_MAX, PANEL_INSTANCE_TOKEN_MAX, CUSTOM_GROUP_FIXED_MAX]);
  });

  it('round-trips a declared range, a chart following it, and held set and range selections', () => {
    const draft = { ...menuDraft, panels: JSON.parse(JSON.stringify(panels)) };
    expect(validateSavedView(draft)).toEqual({ ok: true, value: menuDraft });
    expect(savedViewDraftSchema.parse(draft)).toEqual(menuDraft);
    expect(update(panels).success).toBe(true);
  });

  it('preserves all JSON keys in opaque chart config', () => {
    const draft = { ...menuDraft, panels: withChartConfig(JSON.parse('{"constructor": "kind", "nested": {"__proto__": {"enabled": true}}}')) };
    expect(savedViewDraftSchema.parse(draft)).toEqual(draft);
  });

  it('refuses sparse chart config arrays before serialization', () => {
    const raw = withChartConfig({ values: Array(1) });
    expect(validateSavedView({ ...menuDraft, panels: raw }).ok).toBe(false);
    expect(savedViewDraftSchema.safeParse({ ...menuDraft, panels: raw }).success).toBe(false);
    expect(readMenuViewPanels(raw)).toEqual({ status: 'legacy', reason: 'unreadable' });
  });

  it.each([
    ['panels instance ids must be unique', { ...panels, instances: [declared, declared] }],
    ['panels instance ids must not contain "."', withB({ id: 'B.child' })],
    ['panels output keys must be unique per instance', withB({ outputs: [chart.outputs[0]!, chart.outputs[0]!] })],
    ['panels input keys must be unique per instance', withB({ inputs: [chart.inputs[0]!, chart.inputs[0]!] })],
    ['panels input from must name an existing instance output', withEdge('missing.time')],
    ['panels input from must name an existing instance output', withEdge('A.missing')],
    ['panels input from must name an existing instance output', withEdge('A')],
    ['panels input from must not name its own instance', withEdge('B.time')],
    ['panels connections must not contain a cycle', {
      ...panels, instances: [{ ...declared, inputs: [{ key: 'time', from: 'B.time', mode: 'hold', value: { shape: 'range', from: 'start', to: 'end' } }] }, chart, held],
    }],
    ['panels held selection shape must match the referenced output', {
      ...panels, instances: [declared, chart, { ...held, inputs: [{ ...held.inputs[0]!, from: 'A.time.range' }] }],
    }],
  ] as const)('rejects %s on save and update', (message, raw) => invalidPanels(raw, message));

  it.each([
    ['instances', { ...panels, instances: Array.from({ length: 25 }, (_, n) => ({ ...declared, id: String(n) })) }],
    ['inputs', withB({ inputs: Array.from({ length: 17 }, (_, n) => ({ ...chart.inputs[0]!, key: String(n) })) })],
    ['outputs', withB({ outputs: Array.from({ length: 17 }, (_, n) => ({ ...chart.outputs[0]!, key: String(n) })) })],
    ['id length', withB({ id: 'x'.repeat(201) })],
    ['input key length', withB({ inputs: [{ ...chart.inputs[0]!, key: 'x'.repeat(201) }] })],
    ['output key length', withB({ outputs: [...chart.outputs, { key: 'x'.repeat(201), dimension: 'time', shape: 'range' }] })],
    ['dimension length', withB({ outputs: [{ ...chart.outputs[0]!, dimension: 'x'.repeat(201) }] })],
    ['source panel length', { ...panels, instances: [{ ...declared, source: { ...declared.source, panel: 'x'.repeat(201) } }, chart, held] }],
    ['blank id', withB({ id: ' ' })],
    ['blank input key', withB({ inputs: [{ ...chart.inputs[0]!, key: ' ' }] })],
    ['blank output key', withB({ outputs: [...chart.outputs, { key: ' ', dimension: 'time', shape: 'range' }] })],
    ['blank dimension', withB({ outputs: [{ ...chart.outputs[0]!, dimension: ' ', shape: 'range' }] })],
    ['blank source panel', { ...panels, instances: [{ ...declared, source: { ...declared.source, panel: ' ' } }, chart, held] }],
    ['oversized held set', withSet(Array.from({ length: 5_001 }, (_, n) => String(n)))],
    ['empty held set', withSet([])],
    ['duplicate held set values', withSet(['L1', 'L1'])],
    ['blank held set value', withSet([' '])],
    ['blank held range end', { ...panels, instances: [declared, chart, { ...held, inputs: [{ key: 'period', from: 'B.time', mode: 'hold', value: { shape: 'range', from: 'start', to: ' ' } }] }] }],
    ['non-object chart config', withChartConfig([])],
    ['legacy object', { anything: 'goes' }],
    ['future version', { ...panels, version: 2 }],
  ])('rejects invalid %s', (_name, raw) => invalidPanels(raw));

  it('reads a valid configuration or the declared-panel default', () => {
    expect(readMenuViewPanels(null)).toEqual({ status: 'default' });
    expect(readMenuViewPanels(undefined)).toEqual({ status: 'default' });
    expect(readMenuViewPanels(panels)).toEqual({ status: 'ok', panels });
  });

  it.each([[{ anything: 'goes' }], [[1]], ['x'], [{ ...panels, version: 2 }]])('reports unreadable legacy panels %j', raw => {
    expect(readMenuViewPanels(raw)).toEqual({ status: 'legacy', reason: 'unreadable' });
  });

  it('reports a legacy value even when reading its properties throws', () => {
    const raw = { get version() { throw new Error('unreadable'); } };
    expect(readMenuViewPanels(raw)).toEqual({ status: 'legacy', reason: 'unreadable' });
  });
});

describe('table view state (#2492)', () => {
  it('pins the schema cap copy to contracts', () => {
    expect(TABLE_VIEW_CAPS).toEqual({ tables: MAX_VIEW_TABLES, key: MAX_TABLE_KEY_LENGTH, basis: MAX_GROUP_BASIS_LENGTH, items: MAX_COLUMN_GROUPS, id: MAX_GROUP_ID_LENGTH, members: MAX_GROUP_MEMBERS, label: MAX_GROUP_LABEL_LENGTH, width: MIN_GROUP_WIDTH });
  });
  const groups = { basis: '[]', items: [{ id: 'u:a', label: 'Group', members: ['a'], width: 60 }] };
  const accepts = (tables: unknown) => {
    const draft = { ...menuDraft, tables };
    return [validateSavedView(draft).ok, savedViewDraftSchema.safeParse(draft).success];
  };
  it('accepts declared preference keys and explicit declared groups', () => {
    expect(accepts({ draftList: { groups }, empty: {} })).toEqual([true, true]);
  });
  it.each([
    { a: { unknown: 1 } }, { a: { groups: { ...groups, unknown: 1 } } },
    { a: { groups: { ...groups, items: [{ ...groups.items[0], unknown: 1 }] } } },
    { a: { groups: { ...groups, basis: 'a'.repeat(16_385) } } },
    { a: { groups: { ...groups, items: Array.from({ length: 201 }, (_, n) => ({ id: `g${n}`, members: [] })) } } },
    { a: { groups: { ...groups, items: [{ id: '', members: [] }] } } },
    { a: { groups: { ...groups, items: [{ id: 'x'.repeat(201), members: [] }] } } },
    { a: { groups: { ...groups, items: [{ id: 'u:a', members: [] }] } } },
    { a: { groups: { ...groups, items: [{ id: 'x', label: ' ', members: [] }] } } },
    { a: { groups: { ...groups, items: [{ id: 'x', label: 'a'.repeat(61), members: [] }] } } },
    { a: { groups: { ...groups, items: [{ id: 'x', members: [''] }] } } },
    { a: { groups: { ...groups, items: [{ id: 'x', members: ['a'.repeat(201)] }] } } },
    { a: { groups: { ...groups, items: [{ id: 'x', members: Array(501).fill('a') }] } } },
    { a: { groups: { ...groups, items: [groups.items[0], groups.items[0]] } } },
    { a: { groups: { ...groups, items: [{ ...groups.items[0], width: 59 }] } } },
    { a: { groups: { ...groups, items: [{ ...groups.items[0], width: Infinity }] } } },
    { '': {} }, { ['a'.repeat(201)]: {} }, Object.fromEntries(Array.from({ length: 21 }, (_, n) => [`t${n}`, {}])),
  ])('refuses malformed tables %j', tables => expect(accepts(tables)).toEqual([false, false]));
  it('accepts each inclusive cap boundary', () => {
    const boundary = { basis: 'a'.repeat(16_384), items: Array.from({ length: 200 }, (_, n) => ({ id: String(n).padEnd(200, 'x'), label: ` ${'a'.repeat(60)} `, members: Array(500).fill('a'.repeat(200)), width: 60 })) };
    expect(accepts({ ['a'.repeat(200)]: { groups: boundary } })).toEqual([true, true]);
    expect(accepts(Object.fromEntries(Array.from({ length: 20 }, (_, n) => [`t${n}`, {}])))).toEqual([true, true]);
  });
});
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

  it('forbidden keys: same names as the SDK in chartOptions/layout/chart config (#2760), Scope-named keys allowed', () => {
    for (const k of ['hoverRow', 'zoomLevel', 'modalOpen', 'openModal', 'draftFilter', 'rows', 'rawData', 'engineState', 'dockLayout', 'scopeId', 'scope', 'rowsX', 'Rows']) {
      expect(isForbiddenSavedViewWireKey(k), k).toBe(isForbiddenSavedViewKey(k));
    }
    const rawConfig = { version: 1, instances: [{ ...chart, inputs: [], source: { kind: 'chart', config: { nested: { rawData: [1] } } } }] };
    for (const bad of [{ ...menuDraft, chartOptions: { nested: { rows: [] } } }, { ...menuDraft, layout: [{ engineState: 1 }] }, { ...menuDraft, panels: rawConfig }]) {
      expect(parse(withDraft(bad)).success).toBe(false);
      expect(validateSavedView(bad).ok).toBe(false);
    }
    expect(savedViewPatchSchema.safeParse({ panels: rawConfig }).success).toBe(false);
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
    expect(parse(withDraft({ ...menuDraft, panels: withChartConfig({ value: Number.POSITIVE_INFINITY }) })).success).toBe(false);
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
    const tooBig = { ...menuDraft, panels: withChartConfig({ text: 'x'.repeat(SAVED_VIEW_COMMAND_MAX_BYTES) }) };
    expect(validateSavedView(tooBig).ok).toBe(true);
    const result = parse(withDraft(tooBig));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('bytes');
    expect(parse(withDraft({ ...menuDraft, panels: withChartConfig({ text: 'x'.repeat(1000) }) })).success).toBe(true);
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
