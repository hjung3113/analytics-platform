import { PortError, type MenuAction } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import { bootstrapHttpAdapter } from '../index.js';
import { ACTION_OK, bootstrapBody, ENVELOPE, json, ready, server } from './test-support.js';

const QUERY = { endpoint: 'e.x', context: {}, params: {} } as never;
const REQ: MenuAction = { action: 'g.n', context: { scopeId: 'fab-a' }, input: {}, idempotencyKey: '7b6c1d6e-0000-4000-8000-000000000000' };
const SERVER_ID = { 'X-Correlation-Id': 'srv-7' };
const ASSESSMENT = { kind: 'coverage', state: 'clear' };
const TRUST = { updatedAt: '2026-10-02T09:00:00', dataThrough: null, coverage: null, provisional: false, source: 'dw' };

const UNSAFE: [string, string][] = [
  ['a URL', 'see https://internal.example/private?token=secret'],
  ['a multiline stack', 'Error: boom\n    at run (/srv/app.js:1:1)'],
  ['201 characters', 'x'.repeat(201)],
];
const SAFE = ['a short sentence is fine', 'rate_limited', 'x'.repeat(200)];

describe('server message boundary (contract §2.1)', () => {
  it.each(UNSAFE)('envelope: %s is redacted, the rest is kept', async (_name, message) => {
    const { adapter } = await ready(() => json({ ...ENVELOPE, outcome: 'error', message }));
    expect(await adapter.menuQuery(QUERY)).toEqual({ ...ENVELOPE, outcome: 'error', message: 'server_message_redacted' });
  });
  it.each(SAFE)('envelope: %s passes through', async (message) => {
    const { adapter } = await ready(() => json({ ...ENVELOPE, outcome: 'error', message }));
    expect((await adapter.menuQuery(QUERY)).message).toBe(message);
  });
  it.each(UNSAFE)('action: %s is redacted, the rest is kept', async (_name, message) => {
    const { adapter } = await ready(() => json({ ...ACTION_OK, outcome: 'invalid', message }));
    expect(await adapter.menuAction(REQ)).toMatchObject({ ...ACTION_OK, outcome: 'invalid', message: 'server_message_redacted' });
  });
  it.each(SAFE)('action: %s passes through', async (message) => {
    const { adapter } = await ready(() => json({ ...ACTION_OK, outcome: 'invalid', message }));
    expect((await adapter.menuAction(REQ)).message).toBe(message);
  });
  it.each(UNSAFE)('PortError: %s is redacted', async (_name, message) => {
    const { adapter } = await ready(() => json({ code: 'invalid_input', message, field: 'limit' }, { status: 400 }));
    const error = await adapter.searchEquipment({ scopeId: 'a', limit: 1 } as never).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({ code: 'invalid_input', message: 'server_message_redacted', field: 'limit' });
  });
  it.each([['URL', 'https://internal.example/x'], ['newline', 'a\nb'], ['long', 'f'.repeat(101)]])('PortError: an unsafe field (%s) is dropped', async (_name, field) => {
    const { adapter } = await ready(() => json({ code: 'invalid_input', message: 'bad', field }, { status: 400 }));
    const error = await adapter.searchEquipment({ scopeId: 'a', limit: 1 } as never).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'invalid_input', message: 'bad' });
    expect((error as PortError).field).toBeUndefined();
  });
  it.each(SAFE)('PortError: %s passes through', async (message) => {
    const { adapter } = await ready(() => json({ code: 'invalid_input', message }, { status: 400 }));
    const error = await adapter.searchEquipment({ scopeId: 'a', limit: 1 } as never).catch((e: unknown) => e);
    expect(error).toMatchObject({ message });
  });
});

const without = <T extends object>(body: T, key: string) => Object.fromEntries(Object.entries(body).filter(([k]) => k !== key));

describe('envelope structure (C3)', () => {
  it('a valid envelope with assessments and trust passes through unchanged', async () => {
    const body = { ...ENVELOPE, assessments: [{ ...ASSESSMENT, detail: 'd', explainsEmpty: true }], trust: { ...TRUST, metricVersion: '1' } };
    const { adapter } = await ready(() => json(body));
    expect(await adapter.menuQuery(QUERY)).toEqual(body);
  });
  it('data may be null or any value, but the key must be present', async () => {
    const { adapter } = await ready(() => json({ ...ENVELOPE, data: null }));
    expect((await adapter.menuQuery(QUERY)).outcome).toBe('ok');
  });
  it.each<[string, object]>([
    ['missing data', without(ENVELOPE, 'data')],
    ['missing assessments', without(ENVELOPE, 'assessments')],
    ['missing trust', without(ENVELOPE, 'trust')],
    ['missing correlationId', without(ENVELOPE, 'correlationId')],
    ['missing outcome', without(ENVELOPE, 'outcome')],
    ['assessments with a null entry', { ...ENVELOPE, assessments: [null] }],
    ['assessment without kind', { ...ENVELOPE, assessments: [{ state: 'clear' }] }],
    ['assessment with an unknown state', { ...ENVELOPE, assessments: [{ kind: 'coverage', state: 'maybe' }] }],
    ['assessment with a non-string detail', { ...ENVELOPE, assessments: [{ ...ASSESSMENT, detail: 1 }] }],
    ['trust that is an empty object', { ...ENVELOPE, trust: {} }],
    ['trust without updatedAt', { ...ENVELOPE, trust: without(TRUST, 'updatedAt') }],
    ['trust with a string coverage', { ...ENVELOPE, trust: { ...TRUST, coverage: '1' } }],
    ['trust with a non-boolean provisional', { ...ENVELOPE, trust: { ...TRUST, provisional: 'no' } }],
  ])('%s is invalid_envelope', async (_name, body) => {
    const { adapter } = await ready(() => json(body, { headers: SERVER_ID }));
    expect(await adapter.menuQuery(QUERY)).toEqual({ outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'srv-7', message: 'invalid_envelope' });
  });
});

describe('action response structure (C3)', () => {
  it.each<[string, object]>([
    ['missing data', without(ACTION_OK, 'data')],
    ['missing version', without(ACTION_OK, 'version')],
    ['missing fieldErrors', without(ACTION_OK, 'fieldErrors')],
    ['missing replayed', without(ACTION_OK, 'replayed')],
    ['missing correlationId', without(ACTION_OK, 'correlationId')],
    ['fieldErrors with a null entry', { ...ACTION_OK, fieldErrors: [null] }],
    ['fieldErrors entry with a string path', { ...ACTION_OK, fieldErrors: [{ path: 'a', code: 'x' }] }],
    ['fieldErrors entry without code', { ...ACTION_OK, fieldErrors: [{ path: ['a'] }] }],
  ])('%s is unknown', async (_name, body) => {
    const { adapter } = await ready(() => json(body, { headers: SERVER_ID }));
    expect(await adapter.menuAction(REQ)).toEqual({ outcome: 'unknown', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'srv-7', message: 'invalid_envelope' });
  });
  it('valid fieldErrors pass through', async () => {
    const body = { ...ACTION_OK, outcome: 'invalid', fieldErrors: [{ path: ['a', 'b'], code: 'required' }] };
    const { adapter } = await ready(() => json(body));
    expect(await adapter.menuAction(REQ)).toEqual(body);
  });
});

const user = bootstrapBody().session.user;
const BAD_BOOTSTRAP: [string, object][] = [
  ['session.user is empty', { ...bootstrapBody(), session: { user: {}, scopes: [] } }],
  ['user.id is empty', { ...bootstrapBody(), session: { user: { ...user, id: '' }, scopes: [] } }],
  ['user.permissions is missing', { ...bootstrapBody(), session: { user: without(user, 'permissions'), scopes: [] } }],
  ['user.permissions has a non-string', { ...bootstrapBody(), session: { user: { ...user, permissions: [1] }, scopes: [] } }],
  ['user.title lacks en', { ...bootstrapBody(), session: { user: { ...user, title: { ko: 'x' } }, scopes: [] } }],
  ['a scope lacks label', { ...bootstrapBody(), session: { user, scopes: [{ id: 's', grantedRooms: 1, totalRooms: 2 }] } }],
  ['a scope has a string grantedRooms', { ...bootstrapBody(), session: { user, scopes: [{ id: 's', label: 'S', grantedRooms: '1', totalRooms: 2 }] } }],
  ['a published metric lacks metricId', { ...bootstrapBody(), publishedMetrics: [{ publishedVersion: '1' }] }],
  ['a published metric lacks publishedVersion', { ...bootstrapBody(), publishedMetrics: [{ metricId: 'm' }] }],
  ['defaultRangeTo carries a zone', { ...bootstrapBody(), defaultRangeTo: '2026-10-02T09:00:00Z' }],
  ['defaultRangeTo is not a date', { ...bootstrapBody(), defaultRangeTo: 'today' }],
  ['defaultRangeTo is missing', without(bootstrapBody(), 'defaultRangeTo')],
  ['defaultRangeTo is undefined-like empty string', { ...bootstrapBody(), defaultRangeTo: '' }],
  ['defaultRangeTo is a number', { ...bootstrapBody(), defaultRangeTo: 0 }],
  ['sessionVersion is empty', { ...bootstrapBody(), sessionVersion: '' }],
  ['csrfToken is empty', { ...bootstrapBody(), csrfToken: '' }],
];

describe('bootstrap structure (C2)', () => {
  it('a null defaultRangeTo is ready and stays null: the server has no anchor (ADR-0098)', async () => {
    const s = server(() => json({ ...bootstrapBody(), defaultRangeTo: null }));
    const result = await bootstrapHttpAdapter({ fetch: s.fetch });
    if (result.kind !== 'ready') throw new Error(result.kind);
    expect(result.adapter.defaultRangeTo()).toBeNull();
  });

  it('a full body with scopes, metrics and unknown keys is ready', async () => {
    const body = {
      ...bootstrapBody(),
      session: { user, scopes: [{ id: 's', label: 'S', grantedRooms: 1, totalRooms: 2, extra: 1 }] },
      publishedMetrics: [{ metricId: 'm', publishedVersion: null }],
      generation: 'g',
    };
    const s = server(() => json(body));
    expect((await bootstrapHttpAdapter({ fetch: s.fetch })).kind).toBe('ready');
  });

  it.each(BAD_BOOTSTRAP)('initial: %s is unavailable', async (_name, body) => {
    const s = server(() => json(body, { headers: SERVER_ID }));
    expect(await bootstrapHttpAdapter({ fetch: s.fetch })).toEqual({ kind: 'unavailable', correlationId: 'srv-7' });
  });

  it.each(BAD_BOOTSTRAP)('refresh: %s keeps the snapshot, does not notify, and backs off', async (_name, bad) => {
    let boots = 0;
    const { adapter, calls } = await ready(
      () => new Response('', { status: 401 }),
      {},
      () => (boots++ === 0 ? json(bootstrapBody()) : json({ sessionVersion: 'v2', csrfToken: 't2', ...bad })),
    );
    const before = adapter.session();
    const onChange = () => {
      throw new Error('must not be called');
    };
    adapter.subscribe(onChange);
    await adapter.menuQuery(QUERY);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const bootstraps = () => calls.filter((c) => c.path.endsWith('/platform/bootstrap')).length;
    expect(bootstraps()).toBe(2);
    expect(adapter.session()).toBe(before);
    await adapter.menuQuery(QUERY);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bootstraps()).toBe(2); // inside the 5 s failure backoff
  });
});
