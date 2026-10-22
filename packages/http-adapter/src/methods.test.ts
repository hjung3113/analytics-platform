import type { PlatformAdapter } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import { ACTION_OK, ENVELOPE, json, ready, type Call } from './test-support.js';

const REF = { type: 'equipment', id: 'EQ 1/2', scopeId: 'fab-a' };
const PAGE = { items: [], nextCursor: null };
const USAGE_EVENT = { name: 'entry', menuId: 'home', spaceId: null, path: '/home', at: 1, sessionId: 's1' } as const;
const REPORT = { correlationId: 'client-abc', menuId: 'home', spaceId: null, path: '/home', name: 'Error' };

type Http = { method: 'GET' | 'POST'; path: string; search?: string; body?: unknown; csrf?: boolean; keepalive?: boolean; correlationId?: string };
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
    expect(call.headers['Content-Type']).toBe(row.http.method === 'POST' ? 'application/json' : undefined);
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

  it('listAnnotations without a scope leaves scopeId out so the server answers forbidden', async () => {
    const { adapter, sent } = await ready(() => json(ENVELOPE));
    await adapter.listAnnotations({ chartId: 'c1', scopeId: null });
    expect(sent()[0]!.search).toBe('?chartId=c1');
  });
});
