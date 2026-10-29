import { describe, expect, it } from 'vitest';
import { savedViewCommandSchema, savedViewResponseSchemas } from '@ap/contract-schemas/source';
import { TransportError } from '../calls/calls.js';
import { isSavedViewCommand, responseGuards, withinDepth } from '../saved-views/guards.js';
import { bootstrapBody, json, server, type Handler } from './test-support.js';
import { bootstrapHttpAdapter } from '../index.js';

const PATH = '/api/v1/platform/saved-views/commands';
const menuDraft = { schemaVersion: 1, kind: 'menu-view', name: 'v', menuId: 'home', menuSchemaVersion: 1, context: { roomNames: ['A'] }, page: [['k', 'v']], chartOptions: { a: 1 }, layout: null, panels: [{ x: 1 }] };
const view = { id: 'v1', kind: 'menu-view', schemaVersion: 1, name: 'v', ownerId: 'u1', version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none', context: {}, menuId: 'home', menuSchemaVersion: 1, page: [], chartOptions: {}, layout: null, panels: null };
const caps = { canView: true, canCopy: true, canEdit: true, canShare: true, canApprove: false, canRevoke: false };
const entry = { view, capabilities: caps };
const group = { group: { id: 'g1', kind: 'custom', name: 'g', memberCount: 1 }, members: [{ userId: 'u1', displayName: 'U', affiliation: '' }], capabilities: { canView: true, canEditMembers: true, canRename: true, canDelete: true } };
const ok = (value: unknown) => ({ ok: true, value });
const key = { userId: 'u1', menuId: 'home' };
const v1 = { expectedVersion: 1 };

type Case = { op: string; run: (s: Awaited<ReturnType<typeof open>>['store']) => Promise<unknown>; body: Record<string, unknown>; reply: unknown };
const cases: Case[] = [
  { op: 'list', run: (s) => s.list(key), body: { key: { menuId: 'home' } }, reply: [entry, { id: 'd', denied: true, reason: 'r' }] },
  { op: 'get', run: (s) => s.get('v1'), body: { id: 'v1' }, reply: null },
  { op: 'save', run: (s) => s.save(menuDraft as never), body: { draft: menuDraft }, reply: ok(entry) },
  { op: 'update', run: (s) => s.update('v1', { name: 'n' }, v1), body: { id: 'v1', patch: { name: 'n' }, expectedVersion: 1 }, reply: ok(entry) },
  { op: 'remove', run: (s) => s.remove('v1'), body: { id: 'v1' }, reply: ok(null) },
  { op: 'setDefault', run: (s) => s.setDefault(key, 'v1'), body: { key: { menuId: 'home' }, id: 'v1' }, reply: ok(null) },
  { op: 'getDefaultId', run: (s) => s.getDefaultId(key), body: { key: { menuId: 'home' } }, reply: 'v1' },
  { op: 'setVisibility', run: (s) => s.setVisibility('v1', { kind: 'people', userIds: ['u2'] }, v1), body: { id: 'v1', visibility: { kind: 'people', userIds: ['u2'] }, expectedVersion: 1 }, reply: ok(entry) },
  { op: 'requestOfficial', run: (s) => s.requestOfficial('v1', v1), body: { id: 'v1', expectedVersion: 1 }, reply: ok(entry) },
  { op: 'decide', run: (s) => s.decide('v1', 'approve', 'ok', v1), body: { id: 'v1', decision: 'approve', note: 'ok', expectedVersion: 1 }, reply: ok(entry) },
  { op: 'revoke', run: (s) => s.revoke('v1', v1), body: { id: 'v1', expectedVersion: 1 }, reply: ok(entry) },
  { op: 'listApprovalRequests', run: (s) => s.listApprovalRequests({ userId: 'u1', menuId: null }), body: { key: { menuId: null } }, reply: [{ viewId: 'v1', requestedBy: 'u2', requestedAt: 1, targetVersion: 2, changes: ['c'] }] },
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
    const big = { ...menuDraft, panels: 'x'.repeat(262_144) };
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
  const base = { version: 1, op: 'save', draft: menuDraft };
  const variants: [string, unknown][] = [
    ['valid', base],
    ['unknown op', { ...base, op: 'drop' }],
    ['forged id', { ...base, id: 'x' }],
    ['unknown draft key', { ...base, draft: { ...menuDraft, ownerId: 'u9' } }],
    ['forbidden chartOptions key (nested)', { ...base, draft: { ...menuDraft, chartOptions: { a: { hoverRow: 1 } } } }],
    ['forbidden page key', { ...base, draft: { ...menuDraft, page: [['zoomLevel', '1']] } }],
    ['scopeId in context', { ...base, draft: { ...menuDraft, context: { scopeId: 'S' } } }],
    ['panels with forbidden-looking keys is opaque', { ...base, draft: { ...menuDraft, panels: { hoverX: 1 } } }],
    ['bad visibility enum', { version: 1, op: 'setVisibility', id: 'a', visibility: { kind: 'everyone' }, expectedVersion: 1 }],
    ['extra visibility key', { version: 1, op: 'setVisibility', id: 'a', visibility: { kind: 'private', userIds: [] }, expectedVersion: 1 }],
    ['bad decision', { version: 1, op: 'decide', id: 'a', decision: 'maybe', expectedVersion: 1 }],
    ['key with userId', { version: 1, op: 'list', key: { menuId: null, userId: 'u1' } }],
    ['blank name', { ...base, draft: { ...menuDraft, name: '  ' } }],
    ['too deep', { ...base, draft: { ...menuDraft, layout: deepArray(31) } }],
    ['condition-set with page', { ...base, draft: { schemaVersion: 1, kind: 'condition-set', name: 'n', context: {}, page: [] } }],
    ['import duplicate legacyKey', { version: 1, op: 'importLocal', importToken: 't', rows: [{ legacyKey: 'a', draft: menuDraft }, { legacyKey: 'a', draft: menuDraft }], defaults: [] }],
    ['import default without row', { version: 1, op: 'importLocal', importToken: 't', rows: [], defaults: [{ key: { menuId: null }, legacyKey: 'a' }] }],
  ];
  function deepArray(depth: number): unknown { let v: unknown = 1; for (let i = 0; i < depth; i += 1) v = [v]; return v; }
  it.each(variants)('command: %s', (_name, body) => {
    expect(isSavedViewCommand(body)).toBe(savedViewCommandSchema.safeParse(body).success);
  });

  it('rejects an unsafe-Unicode name that the schema alone cannot express', () => {
    expect(isSavedViewCommand({ ...base, draft: { ...menuDraft, name: 'a\u0000b' } })).toBe(false);
    expect(isSavedViewCommand({ ...base, draft: { ...menuDraft, name: 'a\ud800b' } })).toBe(false);
  });

  const replies: [keyof typeof responseGuards, string, unknown][] = [
    ['list', 'valid', [entry]],
    ['list', 'entry extra key', [{ ...entry, extra: 1 }]],
    ['list', 'capabilities missing', [{ view, capabilities: { canView: true } }]],
    ['list', 'bad visibility', [{ ...entry, view: { ...view, visibility: { kind: 'x' } } }]],
    ['list', 'forbidden nested layout key', [{ ...entry, view: { ...view, layout: { dockLeft: 1 } } }]],
    ['getDefaultId', 'number', 5],
    ['save', 'bad reason', { ok: false, reason: 'nope' }],
    ['save', 'ok with value extra', { ok: true, value: { ...entry, more: 1 } }],
    ['listGroups', 'bad kind', [{ ...group, group: { ...group.group, kind: 'dept' } }]],
    ['importLocal', 'valid', ok({ results: [{ legacyKey: 'k', status: 'rejected', reason: 'invalid' }], defaults: [] })],
    ['importLocal', 'imported without id', ok({ results: [{ legacyKey: 'k', status: 'imported' }], defaults: [] })],
    ['importLocal', 'rejected with id', ok({ results: [{ legacyKey: 'k', status: 'rejected', reason: 'invalid', id: 'x' }], defaults: [] })],
  ];
  it.each(replies)('response %s: %s', (op, _name, value) => {
    expect(responseGuards[op](value)).toBe(savedViewResponseSchemas[op].safeParse(value).success);
  });

  it('measures depth with the root at 0', () => {
    expect(withinDepth(deepArray(33))).toBe(false);
    expect(withinDepth(deepArray(32))).toBe(true);
  });
});
