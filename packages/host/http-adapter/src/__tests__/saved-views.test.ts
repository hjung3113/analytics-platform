import { describe, expect, it } from 'vitest';
import { validateSavedView } from '@ap/contracts';
import { savedViewCommandSchema, savedViewResponseSchemas } from '@ap/contract-schemas/source';
import { lineChartConfig, rejectedChartConfigCases, storedPanelCases, unicodePanelCases } from '@ap/contracts/testing/saved-view-panels';
import { TransportError } from '../calls/calls.js';
import { isSavedViewCommand, responseGuards, withinDepth } from '../saved-views/guards.js';
import { bootstrapBody, json, server, type Handler } from './test-support.js';
import { bootstrapHttpAdapter } from '../index.js';

const PATH = '/api/v1/platform/saved-views/commands';
const menuDraft = { schemaVersion: 1, kind: 'menu-view', name: 'v', menuId: 'home', menuSchemaVersion: 1, context: { roomNames: ['A'] }, page: [['k', 'v']], chartOptions: { a: 1 }, layout: null, panels: { version: 1, instances: [{ id: 'a', source: { kind: 'declared', panel: 'trend' }, inputs: [], outputs: [] }] } };
const view = { id: 'v1', kind: 'menu-view', schemaVersion: 1, name: 'v', ownerId: 'u1', version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none', context: {}, menuId: 'home', menuSchemaVersion: 1, page: [], chartOptions: {}, layout: null, panels: null };
const caps = { canView: true, canCopy: true, canEdit: true, canShare: true, canApprove: false, canRevoke: false };
const entry = { view, capabilities: caps };
const myMenuEntry = { ...entry, view: { ...view, myMenu: true } };
const group = { group: { id: 'g1', kind: 'custom', name: 'g', memberCount: 1 }, members: [{ userId: 'u1', displayName: 'U', affiliation: '' }], capabilities: { canView: true, canEditMembers: true, canRename: true, canDelete: true } };
const ok = (value: unknown) => ({ ok: true, value });
const key = { userId: 'u1', menuId: 'home' };
const v1 = { expectedVersion: 1 };

describe('strict table state across contract, schemas and HTTP guards (#2492)', () => {
  const group = { id: 'u:g', label: 'G', members: ['a'], width: 60 };
  const tablesWith = (change: object) => ({ draftList: { groups: { basis: '[]', items: [group], ...change } } });
  const valid = [undefined, {}, { draftList: {} }, tablesWith({}), tablesWith({ basis: 'a'.repeat(16_384) }),
    tablesWith({ items: Array.from({ length: 200 }, (_, n) => ({ id: `${n}`, members: [] })) }),
    tablesWith({ items: [{ id: 'x'.repeat(200), label: ` ${'a'.repeat(60)} `, members: ['a'.repeat(200)], width: 60 }] }),
    tablesWith({ items: [{ ...group, members: Array(500).fill('a') }] }),
    { ['a'.repeat(200)]: {} }, Object.fromEntries(Array.from({ length: 20 }, (_, n) => [`t${n}`, {}]))];
  const invalid = [{ '': {} }, { ['a'.repeat(201)]: {} }, Object.fromEntries(Array.from({ length: 21 }, (_, n) => [`t${n}`, {}])),
    { draftList: { extra: 1 } }, { draftList: { groups: { basis: '', items: [], extra: 1 } } },
    tablesWith({ basis: 'a'.repeat(16_385) }), tablesWith({ items: Array.from({ length: 201 }, (_, n) => ({ id: `${n}`, members: [] })) }),
    ...[{ ...group, extra: 1 }, { ...group, id: '' }, { ...group, id: 'x'.repeat(201) }, { ...group, label: ' ' },
      { ...group, label: 'a'.repeat(61) }, { ...group, label: undefined }, { ...group, width: 59 }, { ...group, width: Infinity },
      { ...group, members: Array(501).fill('a') }, { ...group, members: [''] }, { ...group, members: ['a'.repeat(201)] }].map(item => tablesWith({ items: [item] })),
    tablesWith({ items: [group, group] })];
  it.each([...valid.map(tables => ({ tables, accepted: true })), ...invalid.map(tables => ({ tables, accepted: false }))])('boundary case $accepted %#', ({ tables, accepted }) => {
    const tableField = tables === undefined ? {} : { tables };
    const draft = { ...menuDraft, ...tableField };
    const save = { version: 1, op: 'save', draft };
    const update = { version: 1, op: 'update', id: 'v1', expectedVersion: 1, patch: tableField };
    const response = { ...entry, view: { ...view, ...tableField } };
    expect(validateSavedView(draft).ok).toBe(accepted);
    expect(savedViewCommandSchema.safeParse(save).success).toBe(accepted);
    expect(isSavedViewCommand(save)).toBe(accepted);
    if (tables !== undefined) {
      expect(savedViewCommandSchema.safeParse(update).success).toBe(accepted);
      expect(isSavedViewCommand(update)).toBe(accepted);
    }
    expect(savedViewResponseSchemas.get.safeParse(response).success).toBe(accepted);
    expect(responseGuards.get(response)).toBe(accepted);
  });
});

type Case = { op: string; run: (s: Awaited<ReturnType<typeof open>>['store']) => Promise<unknown>; body: Record<string, unknown>; reply: unknown };
const cases: Case[] = [
  { op: 'listMyMenus', run: async (s) => s.listMyMenus?.('u1'), body: {}, reply: [myMenuEntry] },
  { op: 'list', run: (s) => s.list(key), body: { key: { menuId: 'home' } }, reply: [entry, { id: 'd', denied: true, reason: 'r' }] },
  { op: 'get', run: (s) => s.get('v1'), body: { id: 'v1' }, reply: null },
  { op: 'save', run: (s) => s.save(menuDraft as never), body: { draft: menuDraft }, reply: ok(entry) },
  { op: 'update', run: (s) => s.update('v1', { name: 'n' }, v1), body: { id: 'v1', patch: { name: 'n' }, expectedVersion: 1 }, reply: ok(entry) },
  { op: 'remove', run: (s) => s.remove('v1'), body: { id: 'v1' }, reply: ok(null) },
  { op: 'setDefault', run: (s) => s.setDefault(key, 'v1'), body: { key: { menuId: 'home' }, id: 'v1' }, reply: ok(null) },
  { op: 'getDefaultId', run: (s) => s.getDefaultId(key), body: { key: { menuId: 'home' } }, reply: 'v1' },
  { op: 'setVisibility', run: (s) => s.setVisibility('v1', { kind: 'people', userIds: ['u2'] }, v1), body: { id: 'v1', visibility: { kind: 'people', userIds: ['u2'] }, expectedVersion: 1 }, reply: ok(entry) },
  { op: 'withdraw', run: async (s) => s.withdraw?.('v1', v1), body: { id: 'v1', expectedVersion: 1 }, reply: ok({ ...entry, capabilities: { ...caps, canWithdraw: false } }) },
  { op: 'requestOfficial', run: (s) => s.requestOfficial('v1', v1), body: { id: 'v1', expectedVersion: 1 }, reply: ok(entry) },
  { op: 'decide', run: (s) => s.decide('v1', 'approve', 'ok', v1), body: { id: 'v1', decision: 'approve', note: 'ok', expectedVersion: 1 }, reply: ok(entry) },
  { op: 'revoke', run: (s) => s.revoke('v1', v1), body: { id: 'v1', expectedVersion: 1 }, reply: ok(entry) },
  { op: 'listApprovalRequests', run: (s) => s.listApprovalRequests({ userId: 'u1', menuId: null }), body: { key: { menuId: null } }, reply: [{ viewId: 'v1', requestedBy: 'u2', requestedAt: 1, targetVersion: 2, changes: ['c'], approverSpace: 'bravo' }] },
  { op: 'listGroups', run: (s) => s.listGroups(), body: {}, reply: [group] },
  { op: 'createGroup', run: (s) => s.createGroup({ name: 'g', memberIds: ['u2'] }), body: { name: 'g', memberIds: ['u2'] }, reply: ok(group) },
  { op: 'updateGroup', run: (s) => s.updateGroup('g1', { addMembers: ['u2'] }), body: { id: 'g1', patch: { addMembers: ['u2'] } }, reply: ok(group) },
  { op: 'searchPeople', run: (s) => s.searchPeople('kim', new AbortController().signal), body: { query: 'kim' }, reply: [{ userId: 'u2', displayName: 'K', affiliation: '' }] },
];

async function open(handler: Handler = () => json(null)) {
  const s = server((call) => (call.path === '/api/v1/platform/bootstrap' ? json(bootstrapBody()) : handler(call)));
  const result = await bootstrapHttpAdapter({ fetch: s.fetch });
  if (result.kind !== 'ready') throw new Error('not ready');
  return { ...result, ...s };
}

describe('HTTP saved-view store (#1105)', () => {
  const request = { viewId: 'v1', requestedBy: 'u1', requestedAt: 1, targetVersion: 2, changes: [] };
  const approvedCopy = { ...view, visibility: { kind: 'official' }, approval: 'approved' };

  it.each([
    ['omitted', request, true],
    ['valid', { ...request, approvedCopy }, true],
    ['malformed', { ...request, approvedCopy: { ...approvedCopy, page: 'invalid' } }, false],
  ] as const)('validates an %s approved copy in the approval response', async (_case, item, accepted) => {
    const response = [item];
    const { store } = await open(() => json(response));
    const result = store.listApprovalRequests(key);
    if (accepted) await expect(result).resolves.toEqual(response);
    else await expect(result).rejects.toMatchObject({ message: 'invalid_response' });
    expect(savedViewResponseSchemas.listApprovalRequests.safeParse(response).success).toBe(accepted);
  });

  it('transports custom-group drafts and kind keys without leaking the actor', async () => {
    const draft = { schemaVersion: 1, kind: 'custom-group', name: 'Targets', savedScopeId: 'S', target: { fixed: ['e1'] } } as const;
    const customEntry = { view: { ...draft, id: 'g', ownerId: 'u1', version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none' }, capabilities: caps };
    const saved = await open(() => json(ok(customEntry)));
    expect(await saved.store.save(draft)).toEqual(ok(customEntry));
    expect(savedViewCommandSchema.safeParse(saved.sent()[0]?.body).success).toBe(true);
    const listed = await open(() => json([customEntry]));
    expect(await listed.store.list({ userId: 'u1', menuId: null, kind: 'custom-group' })).toEqual([customEntry]);
    expect(listed.sent()[0]?.body).toEqual({ version: 1, op: 'list', key: { menuId: null, kind: 'custom-group' } });
    for (const target of [{ fixed: [] }, { fixed: ['e1', 'e1'] }, { rule: { customGroup: ['g'] } }, { rule: { model: [''] } }, { fixed: ['e1'], rule: {} }]) {
      const body = { version: 1, op: 'save', draft: { ...draft, target } };
      expect(isSavedViewCommand(body)).toBe(false);
      expect(savedViewCommandSchema.safeParse(body).success).toBe(false);
    }
    const response = { ...customEntry, view: { ...customEntry.view, visibility: { kind: 'official' } } };
    expect(responseGuards.get(response)).toBe(false);
    expect(savedViewResponseSchemas.get.safeParse(response).success).toBe(false);
  });
  it.each(cases)('$op sends the exact strict body with the current CSRF token and no actor, and returns the guarded reply', async ({ op, run, body, reply }) => {
    const { store, sent } = await open(() => json(reply));
    expect(await run(store)).toEqual(reply);
    const call = sent()[0]!;
    expect(call.path).toBe(PATH);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ version: 1, op, ...body });
    expect(call.headers['X-CSRF-Token']).toBe('t1');
    expect(JSON.stringify(call.body)).not.toMatch(/userId"?:"u1"|ownerId/);
    expect(savedViewCommandSchema.safeParse(call.body).success).toBe(true);
    expect(savedViewResponseSchemas[op as keyof typeof savedViewResponseSchemas].safeParse(reply).success).toBe(true);
  });

  it('does not send a My Menus request for another actor', async () => {
    const { store, sent } = await open(() => json([myMenuEntry]));
    expect(await store.listMyMenus?.('u2')).toEqual([]);
    expect(sent()).toEqual([]);
  });

  it('importLocal sends the strict body and returns the per-row outcome', async () => {
    const outcome = { results: [{ legacyKey: 'k1', status: 'imported', id: 's1' }], defaults: [{ key: { menuId: 'home' }, legacyKey: 'k1', id: 's1' }] };
    const { importLocal, sent } = await open(() => json(ok(outcome)));
    const command = { importToken: 't', rows: [{ legacyKey: 'k1', draft: menuDraft as never }], defaults: [{ key: { menuId: 'home' }, legacyKey: 'k1' }] };
    expect(await importLocal(command)).toEqual(ok(outcome));
    expect(sent()[0]!.body).toEqual({ version: 1, op: 'importLocal', ...command });
    expect(savedViewCommandSchema.safeParse(sent()[0]!.body).success).toBe(true);
  });

  it('answers a request for another actor without any network call: reads empty, default null, mutations forbidden', async () => {
    const { store, sent } = await open();
    const other = { userId: 'someone-else', menuId: 'home' };
    expect(await store.list(other)).toEqual([]);
    expect(await store.listApprovalRequests(other)).toEqual([]);
    expect(await store.getDefaultId(other)).toBeNull();
    expect(await store.setDefault(other, 'v1')).toEqual({ ok: false, reason: 'forbidden' });
    expect(sent()).toHaveLength(0);
  });

  it('drops a reply that arrives after the session actor changed', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let boots = 0;
    const s = server(async (c) => {
      if (c.path === '/api/v1/platform/bootstrap') {
        boots += 1;
        const body = bootstrapBody(boots === 1 ? 'v1' : 'v2');
        return json(boots === 1 ? body : { ...body, session: { ...body.session, user: { ...body.session.user, id: 'u2' } } });
      }
      if ((c.body as { op: string }).op === 'getDefaultId') return new Response('', { status: 401 });
      await gate;
      return json(ok(entry));
    });
    const r = await bootstrapHttpAdapter({ fetch: s.fetch });
    if (r.kind !== 'ready') throw new Error('not ready');
    const saved = r.store.save(menuDraft as never);
    await r.store.getDefaultId(key).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.adapter.session().user.id).toBe('u2');
    release();
    expect(await saved).toEqual({ ok: false, reason: 'forbidden' });
  });

  it.each<[string, Handler]>([
    ['a strict-invalid nested reply', () => json([{ ...entry, view: { ...view, extra: 1 } }])],
    ['a denied shape that leaks a name', () => json([{ id: 'd', denied: true, reason: 'r', name: 'secret' }])],
    ['an unknown approval enum', () => json([{ ...entry, view: { ...view, approval: 'maybe' } }])],
    ['a non-JSON reply', () => new Response('<html>', { status: 200 })],
  ])('a read with %s rejects a sanitized TransportError', async (_name, handler) => {
    const { store } = await open(handler);
    await expect(store.list(key)).rejects.toBeInstanceOf(TransportError);
    await expect(store.list(key)).rejects.toMatchObject({ message: 'invalid_response' });
  });

  it.each<[string, Handler, string]>([
    ['500', () => new Response('boom', { status: 500 }), 'unavailable'],
    ['401', () => new Response('', { status: 401 }), 'unavailable'],
    ['403 csrf', () => new Response('', { status: 403 }), 'unavailable'],
    ['network', () => Promise.reject(new TypeError('x')), 'unavailable'],
    ['invalid reply', () => json({ ok: true, value: { nope: 1 } }), 'unavailable'],
    ['422 malformed', () => new Response('{"code":"validation.malformed_request"}', { status: 422 }), 'invalid'],
  ])('a mutation answered by %s maps to %s and is sent once (no replay)', async (_name, handler, reason) => {
    const { store, sent } = await open(handler);
    expect(await store.save(menuDraft as never)).toMatchObject({ ok: false, reason });
    expect(sent()).toHaveLength(1);
  });

  it('keeps a domain failure as the server answered it', async () => {
    const { store } = await open(() => json({ ok: false, reason: 'conflict' }));
    expect(await store.update('v1', { name: 'n' }, v1)).toEqual({ ok: false, reason: 'conflict' });
  });

  it('refuses an over-bound draft as invalid without sending it', async () => {
    const { store, sent } = await open();
    const big = { ...menuDraft, chartOptions: { note: 'x'.repeat(262_144) } };
    expect(await store.save(big as never)).toMatchObject({ ok: false, reason: 'invalid' });
    let deep: unknown = 1;
    for (let i = 0; i < 40; i += 1) deep = [deep];
    expect(await store.save({ ...menuDraft, layout: deep } as never)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(sent()).toHaveLength(0);
  });

  it('aborts searchPeople with the Kernel signal as an AbortError', async () => {
    const { store } = await open();
    const controller = new AbortController();
    controller.abort();
    await expect(store.searchPeople('k', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('guards equal the wire schemas', () => {
  it.each(storedPanelCases)('projects $label consistently on get and update', ({ stored, read, rename }) => {
    const get = { ...entry, view: { ...view, ...read } };
    const updated = ok({ ...get, view: { ...get.view, name: rename, version: 2 } });
    expect(savedViewResponseSchemas.get.safeParse(get).success).toBe(true);
    expect(responseGuards.get(get)).toBe(true);
    expect(savedViewResponseSchemas.list.safeParse([get]).success).toBe(true);
    expect(responseGuards.list([get])).toBe(true);
    expect(savedViewResponseSchemas.update.safeParse(updated).success).toBe(true);
    expect(responseGuards.update(updated)).toBe(true);
    const raw = { ...entry, view: { ...view, panels: stored } };
    const readable = !('panelsUnreadable' in read);
    expect(savedViewResponseSchemas.get.safeParse(raw).success).toBe(readable);
    expect(responseGuards.get(raw)).toBe(readable);
  });

  const base = { version: 1, op: 'save', draft: menuDraft };
  const variants: [string, unknown][] = [
    ['valid', base],
    ['unknown op', { ...base, op: 'drop' }],
    ['forged id', { ...base, id: 'x' }],
    ['unknown draft key', { ...base, draft: { ...menuDraft, ownerId: 'u9' } }],
    ['forbidden chartOptions key (nested)', { ...base, draft: { ...menuDraft, chartOptions: { a: { hoverRow: 1 } } } }],
    ['applied page key with transient-looking name', { ...base, draft: { ...menuDraft, page: [['zoomLevel', '1']] } }],
    ['scopeId in context', { ...base, draft: { ...menuDraft, context: { scopeId: 'S' } } }],
    ['panels saved before the panel-instance format (#2760)', { ...base, draft: { ...menuDraft, panels: { hoverX: 1 } } }],
    ['unknown key in a chart panel config (#2745)', { ...base, draft: { ...menuDraft, panels: { version: 1, instances: [{ id: 'a', source: { kind: 'chart', config: { ...lineChartConfig, a: { hoverRow: 1 } } }, inputs: [], outputs: [] }] } } }],
    ['panel input naming a missing output (#2760)', { ...base, draft: { ...menuDraft, panels: { version: 1, instances: [{ id: 'a', source: { kind: 'declared', panel: 'p' }, inputs: [{ key: 'k', mode: 'follow', from: 'b.x' }], outputs: [] }] } } }],
    ['update with an old panels value (#2760)', { version: 1, op: 'update', id: 'a', patch: { panels: [1] }, expectedVersion: 1 }],
    ['bad visibility enum', { version: 1, op: 'setVisibility', id: 'a', visibility: { kind: 'everyone' }, expectedVersion: 1 }],
    ['extra visibility key', { version: 1, op: 'setVisibility', id: 'a', visibility: { kind: 'private', userIds: [] }, expectedVersion: 1 }],
    ['bad decision', { version: 1, op: 'decide', id: 'a', decision: 'maybe', expectedVersion: 1 }],
    ['key with userId', { version: 1, op: 'list', key: { menuId: null, userId: 'u1' } }],
    ['blank name', { ...base, draft: { ...menuDraft, name: '  ' } }],
    ['too deep', { ...base, draft: { ...menuDraft, layout: deepArray(31) } }],
    ['condition-set with page', { ...base, draft: { schemaVersion: 1, kind: 'condition-set', name: 'n', context: {}, page: [] } }],
    ['import duplicate legacyKey', { version: 1, op: 'importLocal', importToken: 't', rows: [{ legacyKey: 'a', draft: menuDraft }, { legacyKey: 'a', draft: menuDraft }], defaults: [] }],
    ['import default without row', { version: 1, op: 'importLocal', importToken: 't', rows: [], defaults: [{ key: { menuId: null }, legacyKey: 'a' }] }],
    ['empty command id', { version: 1, op: 'get', id: '' }],
    ['empty setDefault id', { version: 1, op: 'setDefault', key: { menuId: null }, id: '' }],
    ['null setDefault id', { version: 1, op: 'setDefault', key: { menuId: null }, id: null }],
    ['empty key menuId (wire key allows it)', { version: 1, op: 'list', key: { menuId: '' } }],
    ['empty draft menuId (draft needs one)', { ...base, draft: { ...menuDraft, menuId: '' } }],
    ['empty import default key menuId', { version: 1, op: 'importLocal', importToken: 't', rows: [{ legacyKey: 'a', draft: menuDraft }], defaults: [{ key: { menuId: '' }, legacyKey: 'a' }] }],
    ['expectedVersion max safe integer', { version: 1, op: 'revoke', id: 'a', expectedVersion: Number.MAX_SAFE_INTEGER }],
    ['expectedVersion beyond max safe integer', { version: 1, op: 'revoke', id: 'a', expectedVersion: Number.MAX_SAFE_INTEGER + 1 }],
    ['expectedVersion min safe integer', { version: 1, op: 'revoke', id: 'a', expectedVersion: Number.MIN_SAFE_INTEGER }],
    ['expectedVersion beyond min safe integer', { version: 1, op: 'revoke', id: 'a', expectedVersion: Number.MIN_SAFE_INTEGER - 1 }],
    ['fractional expectedVersion', { version: 1, op: 'revoke', id: 'a', expectedVersion: 1.5 }],
    ['draft menuSchemaVersion beyond safe integer', { ...base, draft: { ...menuDraft, menuSchemaVersion: Number.MAX_SAFE_INTEGER + 1 } }],
    ['patch menuSchemaVersion beyond safe integer', { version: 1, op: 'update', id: 'a', patch: { menuSchemaVersion: 2 ** 60 }, expectedVersion: 1 }],
    ['patch menuSchemaVersion max safe integer', { version: 1, op: 'update', id: 'a', patch: { menuSchemaVersion: Number.MAX_SAFE_INTEGER }, expectedVersion: 1 }],
  ];
  function deepArray(depth: number): unknown { let v: unknown = 1; for (let i = 0; i < depth; i += 1) v = [v]; return v; }
  it.each(variants)('command: %s', (_name, body) => {
    expect(isSavedViewCommand(body)).toBe(savedViewCommandSchema.safeParse(body).success);
  });

  it.each([
    ['draft', { ...base, draft: { ...menuDraft, panelsUnreadable: true } }],
    ['patch', { version: 1, op: 'update', id: 'a', patch: { panelsUnreadable: true }, expectedVersion: 1 }],
    ['import row', { version: 1, op: 'importLocal', importToken: 't', rows: [{ legacyKey: 'k', draft: menuDraft, panelsUnreadable: true }], defaults: [] }],
    ['import draft', { version: 1, op: 'importLocal', importToken: 't', rows: [{ legacyKey: 'k', draft: { ...menuDraft, panelsUnreadable: true } }], defaults: [] }],
  ])('rejects the response-only panels flag in a %s', (_name, body) => {
    expect(isSavedViewCommand(body)).toBe(false);
    expect(savedViewCommandSchema.safeParse(body).success).toBe(false);
  });

  it.each(rejectedChartConfigCases)('refuses to send a $label, like the wire schema (#2745)', ({ panels }) => {
    const body = { ...base, draft: { ...menuDraft, panels } };
    expect(savedViewCommandSchema.safeParse(body).success).toBe(false);
    expect(isSavedViewCommand(body)).toBe(false);
  });

  it.each(unicodePanelCases)('refuses to send $label', ({ panels }) => {
    const body = { ...base, draft: { ...menuDraft, panels } };
    expect(savedViewCommandSchema.safeParse(body).success).toBe(true);
    expect(isSavedViewCommand(body)).toBe(false);
  });

  it('rejects an unsafe-Unicode name that the schema alone cannot express', () => {
    expect(isSavedViewCommand({ ...base, draft: { ...menuDraft, name: 'a\u0000b' } })).toBe(false);
    expect(isSavedViewCommand({ ...base, draft: { ...menuDraft, name: 'a\ud800b' } })).toBe(false);
  });

  const replies: [keyof typeof responseGuards, string, unknown][] = [
    ['listMyMenus', 'denied entry', [{ id: 'v1', denied: true, reason: 'no-access' }]],
    ['listMyMenus', 'stored false', [{ ...myMenuEntry, view: { ...myMenuEntry.view, myMenu: false } }]],
    ['list', 'valid', [entry]],
    ['list', 'unreadable panels flag', [{ ...entry, view: { ...view, panelsUnreadable: true } }]],
    ['list', 'false panels flag', [{ ...entry, view: { ...view, panelsUnreadable: false } }]],
    ['list', 'entry extra key', [{ ...entry, extra: 1 }]],
    ['list', 'capabilities missing', [{ view, capabilities: { canView: true } }]],
    ['list', 'bad visibility', [{ ...entry, view: { ...view, visibility: { kind: 'x' } } }]],
    ['list', 'forbidden nested layout key', [{ ...entry, view: { ...view, layout: { dockLeft: 1 } } }]],
    ['getDefaultId', 'number', 5],
    ['save', 'bad reason', { ok: false, reason: 'nope' }],
    ['save', 'ok with value extra', { ok: true, value: { ...entry, more: 1 } }],
    ['listGroups', 'bad kind', [{ ...group, group: { ...group.group, kind: 'dept' } }]],
    ['save', 'version max safe integer', ok({ ...entry, view: { ...view, version: Number.MAX_SAFE_INTEGER } })],
    ['save', 'version beyond max safe integer', ok({ ...entry, view: { ...view, version: Number.MAX_SAFE_INTEGER + 1 } })],
    ['save', 'menuSchemaVersion beyond safe integer', ok({ ...entry, view: { ...view, menuSchemaVersion: 2 ** 60 } })],
    ['save', 'empty view id', ok({ ...entry, view: { ...view, id: '' } })],
    ['save', 'empty view menuId', ok({ ...entry, view: { ...view, menuId: '' } })],
    ['list', 'denied empty id', [{ id: '', denied: true, reason: 'r' }]],
    ['listGroups', 'memberCount max safe integer', [{ ...group, group: { ...group.group, memberCount: Number.MAX_SAFE_INTEGER } }]],
    ['listGroups', 'memberCount beyond safe integer', [{ ...group, group: { ...group.group, memberCount: Number.MAX_SAFE_INTEGER + 1 } }]],
    ['listApprovalRequests', 'targetVersion beyond safe integer', [{ viewId: 'v1', requestedBy: 'u', requestedAt: 1, targetVersion: 2 ** 60, changes: [] }]],
    ['listApprovalRequests', 'empty viewId', [{ viewId: '', requestedBy: 'u', requestedAt: 1, targetVersion: 1, changes: [] }]],
    ['importLocal', 'default key empty menuId', ok({ results: [], defaults: [{ key: { menuId: '' }, legacyKey: 'k', id: 'x' }] })],
    ['importLocal', 'imported with empty id', ok({ results: [{ legacyKey: 'k', status: 'imported', id: '' }], defaults: [] })],
    ['importLocal', 'valid', ok({ results: [{ legacyKey: 'k', status: 'rejected', reason: 'invalid' }], defaults: [] })],
    ['importLocal', 'imported without id', ok({ results: [{ legacyKey: 'k', status: 'imported' }], defaults: [] })],
    ['importLocal', 'rejected with id', ok({ results: [{ legacyKey: 'k', status: 'rejected', reason: 'invalid', id: 'x' }], defaults: [] })],
  ];
  it.each(replies)('response %s: %s', (op, _name, value) => {
    expect(responseGuards[op](value)).toBe(savedViewResponseSchemas[op].safeParse(value).success);
  });

  it.each<[string, unknown]>([
    ['an unmarked menu view', entry],
    ['a condition set', { capabilities: caps, view: { id: 's1', kind: 'condition-set', schemaVersion: 1, name: 'Set', ownerId: 'u1', version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none', context: {} } }],
    ['a marked menu view with canView false', { ...myMenuEntry, capabilities: { ...caps, canView: false } }],
  ])('rejects %s in My Menus responses in both validators', (_name, invalidEntry) => {
    const reply = [invalidEntry];
    expect.soft(savedViewResponseSchemas.listMyMenus.safeParse(reply).success, 'wire schema').toBe(false);
    expect.soft(responseGuards.listMyMenus(reply), 'HTTP guard').toBe(false);
  });

  it.each([
    [{}, true],
    [{ approverSpace: 'bravo' }, true],
    [{ approverSpace: '' }, false],
  ] as const)('validates the optional approval stage space %j', (stage, valid) => {
    const reply = [{ viewId: 'v1', requestedBy: 'u2', requestedAt: 1, targetVersion: 2, changes: [], ...stage }];
    expect(savedViewResponseSchemas.listApprovalRequests.safeParse(reply).success).toBe(valid);
    expect(responseGuards.listApprovalRequests(reply)).toBe(valid);
  });

  it('measures depth with the root at 0', () => {
    expect(withinDepth(deepArray(33))).toBe(false);
    expect(withinDepth(deepArray(32))).toBe(true);
  });
});


describe('KER-26 saved-view name equivalence', () => {
  const names = ['zoomFrom', 'draftId', 'rows', 'dockSide', 'hoverSeries', 'rawData', 'engineState', 'modalOpen', 'openModal'];
  it.each(names)('accepts page and Condition names %s across contracts, wire and guards', key => {
    for (const page of [[[key, 'applied']], { [key]: ['applied'] }]) {
      const draft = { ...menuDraft, page, context: { condition: { [key]: ['E1'] } } };
      expect(validateSavedView(draft).ok).toBe(true);
      const save = { version: 1, op: 'save', draft };
      expect(savedViewCommandSchema.safeParse(save).success).toBe(true);
      expect(isSavedViewCommand(save)).toBe(true);
      const update = { version: 1, op: 'update', id: 'v1', expectedVersion: 1, patch: { page, context: draft.context } };
      expect(savedViewCommandSchema.safeParse(update).success).toBe(true);
      expect(isSavedViewCommand(update)).toBe(true);
      const reply = ok({ ...entry, view: { ...view, page, context: draft.context } });
      expect(savedViewResponseSchemas.save.safeParse(reply).success).toBe(true);
      expect(responseGuards.save(reply)).toBe(true);
    }
    const conditionSet = { schemaVersion: 1, kind: 'condition-set', name: 'Set', context: { condition: { [key]: ['E1'] } } };
    expect(validateSavedView(conditionSet).ok).toBe(true);
    expect(savedViewCommandSchema.safeParse({ version: 1, op: 'save', draft: conditionSet }).success).toBe(true);
    expect(isSavedViewCommand({ version: 1, op: 'save', draft: conditionSet })).toBe(true);
  });
  it.each(names)('still rejects free-form chartOptions/layout name %s', key => {
    for (const field of ['chartOptions', 'layout']) {
      const draft = { ...menuDraft, [field]: { nested: [{ [key]: 1 }] } };
      expect(validateSavedView(draft).ok).toBe(false);
      const command = { version: 1, op: 'save', draft };
      expect(savedViewCommandSchema.safeParse(command).success).toBe(false);
      expect(isSavedViewCommand(command)).toBe(false);
      const reply = ok({ ...entry, view: { ...view, [field]: draft[field as keyof typeof draft] } });
      expect(savedViewResponseSchemas.save.safeParse(reply).success).toBe(false);
      expect(responseGuards.save(reply)).toBe(false);
    }
  });
  it.each([
    { context: { condition: { dockType: [] } } },
    { context: { condition: { dockType: [1] } } },
    { context: { scopeId: 'other' } },
    { page: { zoomFrom: [1] } },
    { page: [['draftId', 1]] },
  ])('preserves Context and page value validation: %j', patch => {
    const draft = { ...menuDraft, ...patch };
    expect(validateSavedView(draft).ok).toBe(false);
    const command = { version: 1, op: 'save', draft };
    expect(savedViewCommandSchema.safeParse(command).success).toBe(false);
    expect(isSavedViewCommand(command)).toBe(false);
  });
});

describe('one text rule for every saved-view string, panels and tables included (#2991)', () => {
  const panels = (panel: string) => ({ version: 1, instances: [{ id: 'a', source: { kind: 'declared', panel }, inputs: [], outputs: [] }] });
  const cases: [string, Record<string, unknown>, boolean][] = [
    ['a supplementary character in the name', { name: 'v 😀' }, true],
    ['a NUL in a declared panel reference', { panels: panels('trend\u0000') }, false],
    ['an unpaired surrogate in a table key', { tables: { ['table\ud800']: {} } }, false],
    ['a NUL in a table group member', { tables: { draftList: { groups: { basis: '[]', items: [{ id: 'u:g', label: 'G', members: ['a\u0000'] }] } } } }, false],
    ['an unpaired surrogate in a layout array', { layout: ['\udc00'] }, false],
  ];
  it.each(cases)('%s: the SDK, the save, update and import guards agree', (_label, change, accepted) => {
    const draft = { ...menuDraft, ...change };
    expect(validateSavedView(draft).ok).toBe(accepted);
    expect(isSavedViewCommand({ version: 1, op: 'save', draft })).toBe(accepted);
    expect(isSavedViewCommand({ version: 1, op: 'update', id: 'v1', expectedVersion: 1, patch: change })).toBe(accepted);
    expect(isSavedViewCommand({ version: 1, op: 'importLocal', importToken: 't', rows: [{ legacyKey: 'k', draft }], defaults: [] })).toBe(accepted);
  });
  it('reads arrays by index like JSON: a hidden index is judged, an extra named property is not', () => {
    const hidden = ['ok'];
    Object.defineProperty(hidden, 0, { value: 'a\u0000b', enumerable: false });
    const extra = Object.assign(['ok'], { note: 'a\u0000b' });
    for (const [layout, accepted] of [[hidden, false], [extra, true]] as const) {
      const draft = { ...menuDraft, layout };
      expect(validateSavedView(draft).ok).toBe(accepted);
      expect(isSavedViewCommand({ version: 1, op: 'save', draft })).toBe(accepted);
    }
  });
});

describe('validateSavedView stays a one-argument callback (#2991)', () => {
  it('judges every draft strictly when passed to map, which supplies an index', () => {
    const results = [menuDraft, { ...menuDraft, name: 'a\u0000' }].map(validateSavedView);
    expect(results.map(r => r.ok)).toEqual([true, false]);
    expect(validateSavedView({ ...menuDraft, name: 'a\u0000' }, { allowMalformedText: true }).ok).toBe(true);
  });
});
