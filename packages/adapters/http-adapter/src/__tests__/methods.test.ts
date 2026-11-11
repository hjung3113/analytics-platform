import type { PlatformAdapter } from '@ap/contracts';
import { uploadedFileSchema } from '@ap/contract-schemas/source';
import { UPLOAD_FILE_MAX_BYTES } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import { ACTION_OK, ENVELOPE, json, ready, type Call } from './test-support.js';

const REF = { type: 'equipment', id: 'EQ 1/2', scopeId: 'fab-a' };
const PAGE = { items: [], nextCursor: null };
const USAGE_EVENT = { name: 'entry', menuId: 'home', spaceId: null, path: '/home', at: 1, sessionId: 's1' } as const;
const REPORT = { correlationId: 'client-abc', menuId: 'home', spaceId: null, path: '/home', name: 'Error' };

const TEXT = { ko: '제목', en: 'Title' };
const NOTICE_CREATE = { title: TEXT, content: TEXT, scopeId: null, until: '2026-10-30T00:00:00', idempotencyKey: 'k-1' };
const NOTICE_DELETE = { id: 'N-1', expectedVersion: 'v1', idempotencyKey: 'k-2' };
const UPLOADED = { id: 'f-1', name: 'a.batch.json', size: 2, mimeType: 'application/json' };

type Http = { method: 'GET' | 'POST'; path: string; search?: string; body?: unknown; csrf?: boolean; keepalive?: boolean; correlationId?: string; multipart?: boolean };
type Row = { http: Http | null; reply?: unknown; call: (a: PlatformAdapter) => unknown };

/** Every PlatformAdapter member, once. `satisfies` makes a missing member a type error; the runtime check below pins the keys. */
const TABLE = {
  session: { http: null, call: (a) => a.session() },
  publishedMetrics: { http: null, call: (a) => a.publishedMetrics() },
  defaultRangeTo: { http: null, call: (a) => a.defaultRangeTo() },
  subscribe: { http: null, call: (a) => a.subscribe(() => undefined)() },
  validateScope: {
    http: { method: 'GET', path: '/api/v1/platform/scopes/fab%2Fa/check' },
    reply: { status: 'valid', grantedRooms: [] },
    call: (a) => a.validateScope('fab/a'),
  },
  contextOptions: {
    http: { method: 'GET', path: '/api/v1/platform/context-options', search: '?scopeId=fab-a' },
    reply: { stgroup: [], team: [], makerModel: [] },
    call: (a) => a.contextOptions('fab-a'),
  },
  evaluateSelection: {
    http: { method: 'POST', path: '/api/v1/platform/selection/evaluate', body: { scopeId: 'fab-a' } },
    reply: { inCondition: [], outOfCondition: [] },
    call: (a) => a.evaluateSelection({ scopeId: 'fab-a' } as never),
  },
  listAxisOptions: {
    http: { method: 'POST', path: '/api/v1/platform/axis-options', body: { scopeId: 'fab-a', axisId: 'room', limit: 10 } },
    reply: PAGE,
    call: (a) => a.listAxisOptions({ scopeId: 'fab-a', axisId: 'room', limit: 10 }),
  },
  searchEquipment: {
    http: { method: 'POST', path: '/api/v1/platform/equipment-search', body: { scopeId: 'fab-a', limit: 5 } },
    reply: PAGE,
    call: (a) => a.searchEquipment({ scopeId: 'fab-a', limit: 5 } as never),
  },
  resolveSelection: {
    http: { method: 'POST', path: '/api/v1/platform/selection-resolve', body: { scopeId: 'fab-a', ids: ['e1'] } },
    reply: { items: [] },
    call: (a) => a.resolveSelection({ scopeId: 'fab-a', ids: ['e1'] }),
  },
  getEntity: { http: { method: 'POST', path: '/api/v1/platform/entity', body: REF }, reply: ENVELOPE, call: (a) => a.getEntity(REF) },
  menuQuery: {
    http: { method: 'POST', path: '/api/v1/menu-query', body: { endpoint: 'e.x', context: {}, params: {} } },
    reply: ENVELOPE,
    call: (a) => a.menuQuery({ endpoint: 'e.x', context: {}, params: {} } as never),
  },
  menuAction: {
    http: { method: 'POST', path: '/api/v1/menu-action', csrf: true, body: { action: 'g.n', context: {}, input: {}, idempotencyKey: 'k1' } },
    reply: ACTION_OK,
    call: (a) => a.menuAction({ action: 'g.n', context: {}, input: {}, idempotencyKey: 'k1' }),
  },
  recordUsage: {
    http: { method: 'POST', path: '/api/v1/platform/usage-events', csrf: true, keepalive: true, body: { events: [USAGE_EVENT] } },
    reply: { accepted: 1 },
    call: (a) => a.recordUsage([USAGE_EVENT]),
  },
  reportClientError: {
    http: { method: 'POST', path: '/api/v1/platform/client-errors', csrf: true, body: REPORT, correlationId: 'client-abc' },
    reply: { accepted: true },
    call: (a) => a.reportClientError(REPORT),
  },
  usageSummary: {
    http: { method: 'GET', path: '/api/v1/platform/usage-summary', search: '?preset=all' },
    reply: ENVELOPE,
    call: (a) => a.usageSummary({ preset: 'all' }),
  },
  usageNextScreens: {
    http: { method: 'POST', path: '/api/v1/platform/usage-next-screens', body: { menuId: 'mars:lot.view', includeBack: true } },
    reply: ENVELOPE,
    call: (a) => a.usageNextScreens({ menuId: 'mars:lot.view', includeBack: true }),
  },
  auditTrail: {
    http: { method: 'POST', path: '/api/v1/platform/audit-trail/search', body: { page: 2 } },
    reply: ENVELOPE,
    call: (a) => a.auditTrail({ page: 2 }),
  },
  entityAudit: { http: { method: 'POST', path: '/api/v1/platform/entity/audit', body: REF }, reply: ENVELOPE, call: (a) => a.entityAudit(REF) },
  accessDirectory: {
    http: { method: 'POST', path: '/api/v1/platform/access-directory/search', body: { role: 'admin' } },
    reply: ENVELOPE,
    call: (a) => a.accessDirectory({ role: 'admin' }),
  },
  listAnnotations: {
    http: { method: 'GET', path: '/api/v1/platform/annotations', search: '?chartId=c1&scopeId=fab-a' },
    reply: ENVELOPE,
    call: (a) => a.listAnnotations({ chartId: 'c1', scopeId: 'fab-a' }),
  },
  saveAnnotation: {
    http: { method: 'POST', path: '/api/v1/platform/annotations', csrf: true, body: { chartId: 'c1', scopeId: 'fab-a', from: 'a', to: 'b', text: 't' } },
    reply: ENVELOPE,
    call: (a) => a.saveAnnotation({ chartId: 'c1', scopeId: 'fab-a', from: 'a', to: 'b', text: 't' }),
  },
  deleteAnnotation: {
    http: { method: 'POST', path: '/api/v1/platform/annotations/delete', csrf: true, body: { chartId: 'c1', scopeId: 'fab-a', id: 'n1' } },
    reply: ENVELOPE,
    call: (a) => a.deleteAnnotation({ chartId: 'c1', scopeId: 'fab-a', id: 'n1' }),
  },
  readPreferences: {
    http: { method: 'GET', path: '/api/v1/platform/preferences' },
    reply: ENVELOPE,
    call: (a) => a.readPreferences(),
  },
  patchPreferences: {
    http: { method: 'POST', path: '/api/v1/platform/preferences/patch', csrf: true, body: { set: { lang: 'ko' }, remove: ['recents'] } },
    reply: ENVELOPE,
    call: (a) => a.patchPreferences({ set: { lang: 'ko' }, remove: ['recents'] }),
  },
  importPreferences: {
    http: { method: 'POST', path: '/api/v1/platform/preferences/import', csrf: true, body: { values: { lang: 'ko' } } },
    reply: ENVELOPE,
    call: (a) => a.importPreferences({ values: { lang: 'ko' } }),
  },
  lookupPeople: {
    http: { method: 'POST', path: '/api/v1/platform/people/lookup', body: { ids: ['u1', 'u2'] } },
    reply: { items: [] },
    call: (a) => a.lookupPeople(['u1', 'u2']),
  },
  listNotices: { http: { method: 'GET', path: '/api/v1/platform/notices' }, reply: ENVELOPE, call: (a) => a.listNotices() },
  saveNotice: {
    http: { method: 'POST', path: '/api/v1/platform/notices/save', csrf: true, body: NOTICE_CREATE },
    reply: ACTION_OK,
    call: (a) => a.saveNotice(NOTICE_CREATE),
  },
  deleteNotice: {
    http: { method: 'POST', path: '/api/v1/platform/notices/delete', csrf: true, body: NOTICE_DELETE },
    reply: ACTION_OK,
    call: (a) => a.deleteNotice(NOTICE_DELETE),
  },
  uploadFile: {
    http: { method: 'POST', path: '/api/v1/platform/files', csrf: true, multipart: true },
    reply: { ...ACTION_OK, data: UPLOADED },
    call: (a) => a.uploadFile?.({ file: new Blob(['{}'], { type: 'application/json' }), name: 'a.batch.json', idempotencyKey: 'k-3' }),
  },
} satisfies Record<keyof PlatformAdapter, Row>;

const entries = Object.entries(TABLE as Record<string, Row>);
const rows = entries.filter((entry): entry is [string, Row & { http: Http }] => entry[1].http !== null);
const syncRows = entries.filter(([, row]) => row.http === null);

describe('method table', () => {
  it('covers exactly the members of the adapter the package returns', async () => {
    const { adapter } = await ready(() => json({}));
    expect(Object.keys(adapter).sort()).toEqual(Object.keys(TABLE).sort());
  });

  it.each(rows)('%s sends the contract request', async (_name, row) => {
    const { adapter, sent } = await ready(() => json(row.reply));
    await row.call(adapter);
    const [call] = sent() as [Call];
    expect(sent()).toHaveLength(1);
    expect(call.method).toBe(row.http.method);
    expect(call.path).toBe(row.http.path);
    expect(call.search).toBe(row.http.search ?? '');
    expect(call.body).toEqual(row.http.body);
    expect(call.headers['X-Correlation-Id']).toMatch(row.http.correlationId ? new RegExp(`^${row.http.correlationId}$`) : /^req-[0-9a-f]{16}-[0-9a-f]{12}$/);
    expect(call.headers['X-CSRF-Token']).toBe(row.http.csrf ? 't1' : undefined);
    expect(call.init.credentials).toBe('same-origin');
    expect(call.init.redirect).toBe('manual');
    expect(call.init.keepalive).toBe(row.http.keepalive ? true : undefined);
    expect(call.url.startsWith('/')).toBe(true);
    expect(call.headers['Content-Type']).toBe(row.http.method === 'POST' && !row.http.multipart ? 'application/json' : undefined);
  });

  it.each(syncRows)('%s never touches the network', async (_name, row) => {
    const { adapter, sent } = await ready(() => json({}));
    row.call(adapter);
    expect(sent()).toEqual([]);
  });

  it('sends no user id or actor on any request and ignores unknown keys of a response', async () => {
    const { adapter, sent } = await ready(() => json({ ...ENVELOPE, extra: 'x' }));
    const result = await adapter.menuQuery({ endpoint: 'e.x', context: {}, params: {} } as never);
    expect(result).toEqual(ENVELOPE);
    for (const call of sent()) {
      expect(JSON.stringify(call.body ?? '')).not.toMatch(/userId|actor/);
      expect(Object.keys(call.headers).map((h) => h.toLowerCase())).not.toContain('x-user-id');
    }
  });

  it('usageSummary with a range sends epoch ms from/to', async () => {
    const { adapter, sent } = await ready(() => json(ENVELOPE));
    await adapter.usageSummary({ from: 1000, to: 2000 });
    expect(sent()[0]!.search).toBe('?from=1000&to=2000');
  });

  it('usageNextScreens leaves includeBack out of the body when it is not given', async () => {
    const { adapter, sent } = await ready(() => json(ENVELOPE));
    await adapter.usageNextScreens({ menuId: 'home' });
    expect(sent()[0]!.body).toEqual({ menuId: 'home' });
    expect('includeBack' in (sent()[0]!.body as object)).toBe(false);
  });

  it('entityAudit carries the cursor in the body only when one is given', async () => {
    const { adapter, sent } = await ready(() => json(ENVELOPE));
    await adapter.entityAudit({ ...REF, cursor: undefined });
    await adapter.entityAudit({ ...REF, cursor: 'c-1' });
    expect(sent()[0]!.body).toEqual(REF);
    expect('cursor' in (sent()[0]!.body as object)).toBe(false);
    expect(sent()[1]!.body).toEqual({ ...REF, cursor: 'c-1' });
  });

  it('listAnnotations without a scope leaves scopeId out so the server answers forbidden', async () => {
    const { adapter, sent } = await ready(() => json(ENVELOPE));
    await adapter.listAnnotations({ chartId: 'c1', scopeId: null });
    expect(sent()[0]!.search).toBe('?chartId=c1');
  });

  it('notice writes carry the idempotency key and the version as headers, and the key in the body', async () => {
    const { adapter, sent } = await ready(() => json(ACTION_OK));
    await adapter.saveNotice({ ...NOTICE_CREATE, id: 'N-1', expectedVersion: 'v3' });
    await adapter.deleteNotice(NOTICE_DELETE);
    const [save, remove] = sent() as [Call, Call];
    expect(save.headers['Idempotency-Key']).toBe('k-1');
    expect(save.headers['If-Match']).toBe('v3');
    expect(remove.headers['Idempotency-Key']).toBe('k-2');
    expect(remove.headers['If-Match']).toBe('v1');
    expect(sent().map((c) => c.headers['X-CSRF-Token'])).toEqual(['t1', 't1']);
  });

  it('a create sends no If-Match', async () => {
    const { adapter, sent } = await ready(() => json(ACTION_OK));
    await adapter.saveNotice(NOTICE_CREATE);
    expect(sent()[0]!.headers['If-Match']).toBeUndefined();
  });

  it('a notice write whose answer is lost is unknown, not error (the write may have applied)', async () => {
    const { adapter } = await ready(() => json({}, { status: 503 }));
    expect(await adapter.saveNotice(NOTICE_CREATE)).toMatchObject({ outcome: 'unknown', data: null });
  });

  it('uploadFile sends one multipart file part with the key and CSRF headers and no Content-Type, and returns the stored file', async () => {
    const { adapter, sent } = await ready(() => json({ ...ACTION_OK, data: UPLOADED, replayed: true }));
    const result = await adapter.uploadFile?.({ file: new Blob(['{}'], { type: 'application/json' }), name: 'a.batch.json', idempotencyKey: 'k-3' });
    expect(result).toMatchObject({ outcome: 'ok', data: UPLOADED, replayed: true });
    const [call] = sent() as [Call];
    expect(call.headers['Idempotency-Key']).toBe('k-3');
    expect(call.headers['X-CSRF-Token']).toBe('t1');
    expect(Object.keys(call.headers).map((h) => h.toLowerCase())).not.toContain('content-type');
    const form = call.init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect([...form.keys()]).toEqual(['file']);
    const part = form.get('file') as File;
    expect(part.name).toBe('a.batch.json');
    expect(part.type).toBe('application/json');
    expect(await part.text()).toBe('{}');
  });

  it('uploadFile passes a judged refusal through, treats a lost answer as unknown and an ok without a file as a broken response', async () => {
    const input = { file: new Blob(['x'], { type: 'application/json' }), name: 'a.json', idempotencyKey: 'k-4' };
    const refused = await ready(() => json({ ...ACTION_OK, outcome: 'invalid', data: null, version: null, fieldErrors: [{ path: ['file'], code: 'too_large' }] }));
    expect(await refused.adapter.uploadFile?.(input)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['file'], code: 'too_large' }] });
    const lost = await ready(() => json({}, { status: 503 }));
    expect(await lost.adapter.uploadFile?.(input)).toMatchObject({ outcome: 'unknown', data: null });
    const broken = await ready(() => json({ ...ACTION_OK, data: { id: 'f-1' } }));
    expect(await broken.adapter.uploadFile?.(input)).toMatchObject({ outcome: 'unknown', data: null, message: 'invalid_response' });
  });

  it.each<[string, unknown]>([
    ['valid', UPLOADED],
    ['empty size', { ...UPLOADED, size: 0 }],
    ['size at the cap', { ...UPLOADED, size: UPLOAD_FILE_MAX_BYTES }],
    ['size over the cap', { ...UPLOADED, size: UPLOAD_FILE_MAX_BYTES + 1 }],
    ['negative size', { ...UPLOADED, size: -1 }],
    ['fractional size', { ...UPLOADED, size: 1.5 }],
    ['non-finite size', { ...UPLOADED, size: Number.POSITIVE_INFINITY }],
    ['empty id', { ...UPLOADED, id: '' }],
    ['empty name', { ...UPLOADED, name: '' }],
    ['empty mimeType', { ...UPLOADED, mimeType: '' }],
    ['extra key', { ...UPLOADED, extra: 1 }],
    ['missing mimeType', { id: 'f-1', name: 'a', size: 2 }],
    ['string size', { ...UPLOADED, size: '2' }],
    ['array', [UPLOADED]],
  ])('uploadFile accepts exactly what the wire schema accepts: %s', async (_name, data) => {
    const { adapter } = await ready(() => json({ ...ACTION_OK, data }));
    const result = await adapter.uploadFile?.({ file: new Blob(['{}'], { type: 'application/json' }), name: 'a.json', idempotencyKey: 'k-5' });
    expect(result?.outcome === 'ok').toBe(uploadedFileSchema.safeParse(data).success);
  });

  it('lookupPeople returns the items and turns a judged 4xx into a PortError', async () => {
    const member = { userId: 'u1', displayName: 'Kim', affiliation: 'Fab' };
    const ok = await ready(() => json({ items: [member] }));
    expect(await ok.adapter.lookupPeople(['u1'])).toEqual([member]);
    const bad = await ready(() => json({ code: 'invalid_input', message: 'too many ids', field: 'ids' }, { status: 400 }));
    await expect(bad.adapter.lookupPeople(['u1'])).rejects.toMatchObject({ code: 'invalid_input', field: 'ids' });
  });

  it('forwards the AbortSignal of the preference, people and notice reads', async () => {
    const controller = new AbortController();
    const { adapter, sent } = await ready(() => json(ENVELOPE));
    await adapter.readPreferences(controller.signal);
    await adapter.listNotices(controller.signal);
    expect(sent().every((c) => c.init.signal !== undefined && c.init.signal !== null)).toBe(true);
    controller.abort();
    await expect(adapter.readPreferences(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('every port sends its own request even for an argument it cannot read (backend drift guard calls with a placeholder)', async () => {
    const placeholder = { toString: () => 'x' } as never;
    const { adapter, sent } = await ready(() => json({ items: [] }));
    const calls = [
      () => adapter.readPreferences(placeholder), () => adapter.listNotices(placeholder), () => adapter.patchPreferences(placeholder), () => adapter.importPreferences(placeholder), () => adapter.lookupPeople(placeholder),
      () => adapter.saveNotice(placeholder), () => adapter.deleteNotice(placeholder),
    ];
    for (const call of calls) expect(() => { void Promise.resolve(call()).catch(() => undefined); }).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent()).toHaveLength(calls.length);
  });
});
