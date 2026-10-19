import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineAction, defineEndpoint, type FieldError, type MenuMeta } from '@ap/contracts';
import { createMockAdapter } from './adapter';
import { defineMockAction, serveAction, type AnyMockAction } from './actions';
import { defineMockEndpoint, MockRegistrationError } from './endpoints';
import { getRole, setRole } from './server';
import { USERS, type RoleId } from './world';

type Input = { text: string };
const KEY = '3f2b8a40-6c1e-4d5a-9b7e-1a2b3c4d5e6f';
const OTHER_KEY = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function menuMeta(o: Partial<Pick<MenuMeta, 'id' | 'permission' | 'requiresScope'>> = {}): MenuMeta {
  return {
    id: o.id ?? 'owner', group: 'analytics', label: { ko: '메뉴', en: 'Menu' }, description: { ko: '', en: '' }, path: '/owner',
    permission: o.permission ?? 'analytics:view', requiresScope: o.requiresScope ?? true,
    context: { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' },
    pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  };
}
const registry = { menus: [menuMeta()] };

const query = defineEndpoint<{ term: string }, unknown>({
  id: 'analytics.items', menuId: 'owner', paramKeys: { term: true }, permission: 'analytics:view', requiresScope: true,
  context: {}, kinds: ['collection'], mergeTimeDomain: false,
});
const spec = defineAction<Input, { id: number }>({
  id: 'analytics.save', menuId: 'owner', inputKeys: { text: true }, permission: 'analytics:view',
  requiresScope: true, concurrency: 'version', invalidates: [query],
});
const plainSpec = defineAction<Input, { id: number }>({ ...spec, id: 'analytics.append', concurrency: 'none', invalidates: [] });

// One target row: `version` bumps on every handled write, so a handler call is observable.
let stored: { text: string; version: number } | null;
let handled: number;
let fieldErrors: readonly FieldError[];
const saveAction = () => defineMockAction(spec, {
  version: () => (stored ? String(stored.version) : null),
  validate: () => fieldErrors,
  handle: ({ input }) => { handled += 1; stored = { text: input.text, version: (stored?.version ?? 0) + 1 }; return { data: { id: stored.version }, version: String(stored.version) }; },
});
const appendAction = () => defineMockAction(plainSpec, { handle: () => { handled += 1; return { data: { id: handled }, version: null }; } });

let actions: Map<string, AnyMockAction>;
const req = (over: Record<string, unknown> = {}) =>
  ({ action: 'analytics.save', context: { scopeId: 'MEM' }, input: { text: 'a' }, idempotencyKey: KEY, expectedVersion: '1', ...over });
const call = (r: unknown, role: RoleId = 'engineer') => serveAction(actions, r, undefined, { role, latency: 0 });

let previousRole: RoleId;
beforeEach(() => {
  previousRole = getRole();
  setRole('engineer');
  stored = { text: 'seed', version: 1 };
  handled = 0;
  fieldErrors = [];
  actions = new Map([['analytics.save', saveAction()], ['analytics.append', appendAction()]]);
});
afterEach(() => setRole(previousRole));

describe('serveAction judgment order (ADR-0054)', () => {
  it('answers ok with data and the new version, replayed false', async () => {
    const r = await call(req());
    expect(r).toMatchObject({ outcome: 'ok', data: { id: 2 }, version: '2', fieldErrors: [], replayed: false });
    expect(r.correlationId).toMatch(/^corr-/);
    expect(stored).toEqual({ text: 'a', version: 2 });
  });

  it.each([
    ['a non-object request', 'nope'],
    ['an unexpected top-level key', req({ permission: 'analytics:view' })],
    ['a missing action', (({ action: _a, ...rest }) => rest)(req())],
    ['a missing context', (({ context: _c, ...rest }) => rest)(req())],
    ['a missing input', (({ input: _i, ...rest }) => rest)(req())],
    ['an unregistered action', req({ action: 'analytics.nope' })],
    ['a context key other than scopeId', req({ context: { scopeId: 'MEM', from: 'x' } })],
    ['a missing scopeId on a scoped action', req({ context: {} })],
    ['a non-object input', req({ input: [] })],
    ['a missing expectedVersion on a version action', (({ expectedVersion: _e, ...rest }) => rest)(req())],
    ['expectedVersion on a none action', req({ action: 'analytics.append' })],
    ['scopeId on an unscoped context', req({ action: 'analytics.append', expectedVersion: undefined, context: { scopeId: 'MEM', extra: 1 } })],
  ])('rejects %s as error before the key is looked at', async (_what, request) => {
    // Every case also lacks a valid key at stage 2 only when the shape is fine, so `error` proves shape came first.
    const r = await call(request && typeof request === 'object' ? { ...request, idempotencyKey: 'not-a-uuid' } : request);
    expect(r.outcome).toBe('error');
    expect(r.data).toBeNull();
    expect(handled).toBe(0);
  });

  it('accepts a missing idempotencyKey through the shape stage (it is invalid, not error)', async () => {
    const { idempotencyKey: _k, ...withoutKey } = req();
    expect((await call(withoutKey)).outcome).toBe('invalid');
  });

  it.each([
    ['omitted', undefined, 'required'],
    ['empty', '', 'malformed'],
    ['not a UUID', 'abc', 'malformed'],
  ])('answers invalid at idempotencyKey for a key that is %s, before permission', async (_what, key, code) => {
    const request = key === undefined ? (({ idempotencyKey: _k, ...rest }) => rest)(req()) : req({ idempotencyKey: key });
    const r = await call(request, 'viewer');
    expect(r).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['idempotencyKey'], code }] });
  });

  it('answers forbidden without the permission, before scope', async () => {
    expect((await call(req({ context: { scopeId: 'NOPE' } }), 'viewer')).outcome).toBe('forbidden');
  });

  it.each([['an unknown site', 'NOPE'], ['a null scope', null]])('answers forbidden for %s', async (_what, scopeId) => {
    expect((await call(req({ context: { scopeId } }))).outcome).toBe('forbidden');
    expect(handled).toBe(0);
  });

  it('replays the stored answer with replayed true and runs the handler once', async () => {
    const first = await call(req());
    const again = await call(req());
    expect(again).toEqual({ ...first, replayed: true });
    expect(handled).toBe(1);
  });

  it('replays an action without a version', async () => {
    await call(req({ action: 'analytics.append', expectedVersion: undefined, input: { text: 'a' } }));
    const again = await call(req({ action: 'analytics.append', expectedVersion: undefined, input: { text: 'a' } }));
    expect(again.replayed).toBe(true);
  });

  it.each([
    ['input', { input: { text: 'b' } }],
    ['scopeId', { context: { scopeId: 'FDRY' } }],
    ['expectedVersion', { expectedVersion: '9' }],
  ])('answers error idempotency_key_reuse when the key returns with another %s', async (_what, over) => {
    await call(req());
    const r = await call(req(over));
    expect(r).toMatchObject({ outcome: 'error', message: 'idempotency_key_reuse' });
    expect(handled).toBe(1);
  });

  it('keeps records per actor: another actor with the same key is judged fresh', async () => {
    await call(req());
    expect((await call(req(), 'viewer')).outcome).toBe('forbidden');
  });

  it('keeps a replay a snapshot: a handler rewriting its shared row does not change earlier answers', async () => {
    // The handler returns the one row object it mutates in place, like a store that hands out live rows.
    const row = { text: 'seed' };
    const rowSpec = defineAction<Input, { text: string }>({ ...plainSpec, invalidates: [] });
    actions.set('analytics.append', defineMockAction(rowSpec, { handle: ({ input }) => { row.text = input.text; return { data: row, version: null }; } }));
    const write = (key: string, text: string) => call({ action: 'analytics.append', context: { scopeId: 'MEM' }, input: { text }, idempotencyKey: key });
    const k1 = await write(KEY, 'a');
    await write(OTHER_KEY, 'b');
    expect(k1.data).toEqual({ text: 'a' });
    expect((await write(KEY, 'a')).data).toEqual({ text: 'a' });
  });

  it('keeps a replay a snapshot: mutating a returned answer does not change the next replay', async () => {
    const first = await call(req());
    (first.data as { id: number }).id = 99;
    const replay = await call(req());
    (replay.data as { id: number }).id = 77;
    expect(await call(req())).toMatchObject({ data: { id: 2 }, version: '2', replayed: true });
  });

  it('keeps records per actor: two authorized actors with one key each run the handler', async () => {
    const append = { action: 'analytics.append', expectedVersion: undefined };
    expect(await call(req(append), 'engineer')).toMatchObject({ outcome: 'ok', replayed: false });
    expect(await call(req(append), 'admin')).toMatchObject({ outcome: 'ok', replayed: false });
    expect(handled).toBe(2);
  });

  it('judges permission before replay: a recorded actor who lost the permission is forbidden on retry', async () => {
    const original = USERS.engineer.permissions;
    await call(req());
    try {
      USERS.engineer.permissions = original.filter(p => p !== 'analytics:view');
      expect((await call(req())).outcome).toBe('forbidden');
    } finally {
      USERS.engineer.permissions = original;
    }
  });

  it('judges scope before replay: a recorded actor who lost the grant is forbidden on retry', async () => {
    const original = USERS.engineer.grants;
    await call(req());
    try {
      USERS.engineer.grants = { ...original, MEM: [] };
      expect((await call(req())).outcome).toBe('forbidden');
    } finally {
      USERS.engineer.grants = original;
    }
  });

  it.each([
    ['a BigInt', { text: 'a', n: 1n }],
    ['a cycle', (() => { const c: Record<string, unknown> = { text: 'a' }; c.self = c; return c; })()],
    ['excessive depth', Array.from({ length: 70 }).reduce<unknown>(acc => ({ n: acc }), 'x') as Record<string, unknown>],
  ])('answers error without recording or running the handler for input holding %s', async (_what, input) => {
    const r = await call(req({ action: 'analytics.append', expectedVersion: undefined, input }));
    expect(r.outcome).toBe('error');
    expect(handled).toBe(0);
    expect(await call(req({ action: 'analytics.append', expectedVersion: undefined }))).toMatchObject({ outcome: 'ok', replayed: false });
    expect(handled).toBe(1);
  });

  it('treats a sparse array hole as null: a hole then an empty array under one key is reuse', async () => {
    const append = (items: unknown) => req({ action: 'analytics.append', expectedVersion: undefined, input: { text: items } });
    expect((await call(append(Array(1)))).outcome).toBe('ok');
    expect(await call(append([]))).toMatchObject({ outcome: 'error', message: 'idempotency_key_reuse' });
    expect((await call(append([null]))).replayed).toBe(true);
  });

  it('replays across nested-object key order but treats array order as reuse', async () => {
    const append = (items: unknown) => req({ action: 'analytics.append', expectedVersion: undefined, input: { text: items } });
    await call(append([{ a: 1, b: { c: 1, d: 2 } }, 2]));
    expect((await call(append([{ b: { d: 2, c: 1 }, a: 1 }, 2]))).replayed).toBe(true);
    expect(await call(append([2, { a: 1, b: { c: 1, d: 2 } }]))).toMatchObject({ outcome: 'error', message: 'idempotency_key_reuse' });
  });

  it('judges permission and scope before replay', async () => {
    await call(req());
    expect((await call(req(), 'viewer')).outcome).toBe('forbidden');
    expect((await call(req({ context: { scopeId: 'NOPE' } }))).outcome).toBe('forbidden');
  });

  it('judges replay before input values: a reused key with an extra input key is error, not invalid', async () => {
    await call(req());
    expect((await call(req({ input: { text: 'a', actor: 'x' } }))).outcome).toBe('error');
  });

  it('answers invalid with unexpected_field per key outside inputKeys, before validate and version', async () => {
    fieldErrors = [{ path: ['text'], code: 'too_long' }];
    const r = await call(req({ input: { text: 'a', actor: 'x', at: 'y' }, expectedVersion: 'stale' }));
    expect(r.outcome).toBe('invalid');
    expect(r.fieldErrors).toEqual([{ path: ['actor'], code: 'unexpected_field' }, { path: ['at'], code: 'unexpected_field' }]);
  });

  it('answers invalid with validate field errors before the version check', async () => {
    fieldErrors = [{ path: ['text'], code: 'too_long' }];
    const r = await call(req({ expectedVersion: 'stale' }));
    expect(r).toMatchObject({ outcome: 'invalid', fieldErrors });
  });

  it('answers not_found when the target is missing, before the version comparison', async () => {
    stored = null;
    expect((await call(req())).outcome).toBe('not_found');
  });

  it('answers conflict with the current version when expectedVersion is stale', async () => {
    const r = await call(req({ expectedVersion: '7' }));
    expect(r).toMatchObject({ outcome: 'conflict', version: '1', data: null });
    expect(handled).toBe(0);
  });

  it('records only ok: invalid, conflict, not_found and forbidden are judged again with the same key', async () => {
    expect((await call(req({ input: { text: 'a', x: 1 } }))).outcome).toBe('invalid');
    expect((await call(req({ expectedVersion: '7' }))).outcome).toBe('conflict');
    stored = null;
    expect((await call(req())).outcome).toBe('not_found');
    expect((await call(req(), 'viewer')).outcome).toBe('forbidden');
    stored = { text: 'seed', version: 1 };
    expect(await call(req())).toMatchObject({ outcome: 'ok', replayed: false });
  });

  it('answers error and records nothing when the handler throws', async () => {
    actions.set('analytics.append', defineMockAction(plainSpec, { handle: () => { throw new Error('boom'); } }));
    const r = await call(req({ action: 'analytics.append', expectedVersion: undefined }));
    expect(r.outcome).toBe('error');
  });

  it('rejects with AbortError when the signal aborts during the wait', async () => {
    const controller = new AbortController();
    const pending = serveAction(actions, req(), controller.signal, { role: 'engineer', latency: 50 });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('createMockAdapter action registration', () => {
  const endpoints = [defineMockEndpoint(query, { handle: () => ({}) })];
  const build = (list: AnyMockAction[], menus = registry.menus) => () => createMockAdapter({ endpoints, actions: list, registry: { menus } });

  it('registers and serves an action through menuAction', async () => {
    const adapter = createMockAdapter({ endpoints, actions: [saveAction()], registry });
    setRole('engineer');
    expect((await adapter.menuAction({ action: 'analytics.save', context: { scopeId: 'MEM' }, input: { text: 'a' }, idempotencyKey: OTHER_KEY, expectedVersion: '1' })).outcome).toBe('ok');
  });

  it.each([
    ['a duplicate action id', () => build([saveAction(), saveAction()])],
    ['an unregistered menuId', () => build([defineMockAction({ ...spec, menuId: 'ghost' }, { version: () => '1', handle: () => ({ data: { id: 1 }, version: '1' }) })])],
    ['a permission no menu declares', () => build([defineMockAction({ ...spec, permission: 'notice:view' }, { version: () => '1', handle: () => ({ data: { id: 1 }, version: '1' }) })])],
    ['an unscoped action of a scoped menu', () => build([defineMockAction({ ...spec, requiresScope: false }, { version: () => '1', handle: () => ({ data: { id: 1 }, version: '1' }) })])],
    ['an invalidated query that is not registered', () => build([defineMockAction({ ...spec, invalidates: [defineEndpoint<{ term: string }, unknown>({ ...query, id: 'analytics.other' })] }, { version: () => '1', handle: () => ({ data: { id: 1 }, version: '1' }) })])],
    ['an invalidated query of another menu', () => build(
      [defineMockAction({ ...spec, menuId: 'second' }, { version: () => '1', handle: () => ({ data: { id: 1 }, version: '1' }) })],
      [menuMeta(), menuMeta({ id: 'second' })],
    )],
    ['a version action without a version handler', () => build([defineMockAction(spec, { handle: () => ({ data: { id: 1 }, version: '1' }) })])],
  ])('throws MockRegistrationError for %s', (_what, make) => {
    expect(make()).toThrow(MockRegistrationError);
  });
});
