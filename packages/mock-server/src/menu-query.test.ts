import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineEndpoint, type Capability, type ContextKey, type EndpointSpec, type MenuMeta } from '@ap/contracts';
import { createMockAdapter } from './adapter';
import { defineMockEndpoint, MockRegistrationError, serveEndpoint, type AnyMockEndpoint, type MockEndpoint } from './endpoints';
import { EQUIPMENT, type RoleId } from './world';
import { getRole, setRole, setScenario } from './server';

type Params = { term: string; page?: number };
const allUnsupported: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};

function menuMeta(o: Partial<Pick<MenuMeta, 'id' | 'permission' | 'requiresScope' | 'context'>> = {}): MenuMeta {
  return {
    id: o.id ?? 'owner',
    group: 'analytics',
    label: { ko: '메뉴', en: 'Menu' },
    description: { ko: '', en: '' },
    path: '/owner',
    permission: o.permission ?? 'platform:view',
    requiresScope: o.requiresScope ?? true,
    context: { ...allUnsupported, time: 'apply', ...o.context },
    pageType: 'analysis',
    features: { export: false, savedView: false, annotate: false, compare: false },
    pageKeys: [],
  };
}

const registry = {
  menus: [menuMeta(), menuMeta({ id: 'permission-source', permission: 'notice:view', requiresScope: false })],
};

function makeSpec(id = 'analytics.detail', o: Partial<EndpointSpec<Params, unknown>> = {}): EndpointSpec<Params, unknown> {
  return defineEndpoint<Params, unknown>({
    id,
    menuId: 'owner',
    paramKeys: { term: true, page: true },
    permission: 'platform:view',
    requiresScope: true,
    context: { time: 'apply' },
    kinds: ['collection', 'coverage'],
    mergeTimeDomain: false,
    ...o,
  });
}

function mockEndpoint(
  spec: EndpointSpec<Params, unknown>,
  handle: MockEndpoint<Params, unknown>['handle'] = ({ equipment }) => ({ ids: equipment.map(row => row.equipmentId) }),
): AnyMockEndpoint {
  return defineMockEndpoint(spec, { handle });
}

function request(endpoint = 'analytics.detail', context: Record<string, unknown> = { scopeId: 'ICH' }, params: Record<string, unknown> = { term: 'probe' }) {
  return { endpoint, context, params };
}

let previousRole: RoleId;
beforeEach(() => {
  previousRole = getRole();
  setRole('engineer');
  setScenario('normal');
});
afterEach(() => {
  setScenario('normal');
  setRole(previousRole);
});

describe('serveEndpoint request validation', () => {
  const endpoint = mockEndpoint(makeSpec());
  const endpoints = new Map<string, AnyMockEndpoint>([[endpoint.spec.id, endpoint]]);

  it.each(['permission', 'kinds'])('rejects a top-level %s key', async key => {
    const result = await serveEndpoint(endpoints, { ...request(), [key]: 'client-controlled' }, undefined, { role: 'engineer', latency: 0 });
    expect(result.outcome).toBe('error');
    expect(result.message).toContain(key);
    expect(result.data).toBeNull();
    expect(result.assessments).toEqual([]);
    expect(result.trust).toBeNull();
    expect(result.correlationId).toMatch(/^corr-/);
  });

  it('rejects an unregistered endpoint id', async () => {
    const result = await serveEndpoint(endpoints, request('analytics.missing'), undefined, { role: 'engineer', latency: 0 });
    expect(result.outcome).toBe('error');
    expect(result.message).toContain('unknown endpoint analytics.missing');
  });

  it('rejects params and Context keys outside their allow-lists', async () => {
    const badParams = await serveEndpoint(endpoints, request('analytics.detail', { scopeId: 'ICH' }, { term: 'probe', debug: true }), undefined, { role: 'engineer', latency: 0 });
    expect(badParams.outcome).toBe('error');
    expect(badParams.message).toContain('debug');

    const badContext = await serveEndpoint(endpoints, request('analytics.detail', { scopeId: 'ICH', foo: 'bar' }), undefined, { role: 'engineer', latency: 0 });
    expect(badContext.outcome).toBe('error');
    expect(badContext.message).toContain('foo');
  });
});

describe('serveEndpoint declaration pipeline', () => {
  it('neutralizes non-applied room, condition and selection keys before resolution and handling', async () => {
    const spec = makeSpec('analytics.execution-detail', { context: { time: 'apply' } });
    const handle = vi.fn(({ equipment }: Parameters<MockEndpoint<Params, unknown>['handle']>[0]) => ({ ids: equipment.map(row => row.equipmentId) }));
    const endpoint = mockEndpoint(spec, handle);
    const endpoints = new Map<string, AnyMockEndpoint>([[spec.id, endpoint]]);
    const period = { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };
    const deniedEquipment = EQUIPMENT.find(row => row.site === 'ICH' && row.room === 'DIF-202')!;

    const control = await serveEndpoint(endpoints, request(spec.id, { scopeId: 'ICH', ...period }), undefined, { role: 'engineer', latency: 0 });
    const withIgnoredKeys = await serveEndpoint(endpoints, request(spec.id, {
      scopeId: 'ICH',
      ...period,
      roomNames: ['DIF-202'],
      condition: { axis: 'team', id: 'not-granted-team' },
      selection: [deniedEquipment.equipmentId],
    }), undefined, { role: 'engineer', latency: 0 });

    expect(withIgnoredKeys.outcome).toBe('ok');
    expect({ outcome: withIgnoredKeys.outcome, data: withIgnoredKeys.data }).toEqual({ outcome: control.outcome, data: control.data });
    const received = handle.mock.calls.at(-1)![0];
    expect(received.context.roomNames).toBeNull();
    expect(received.context.condition).toBeNull();
    expect(received.context.selection).toBeNull();
  });

  it('resolves declared applied keys and forbids a denied room', async () => {
    const spec = makeSpec('analytics.room-filter', { context: { time: 'apply', roomNames: 'apply' } });
    const endpoint = mockEndpoint(spec);
    const result = await serveEndpoint(new Map([[spec.id, endpoint]]), request(spec.id, { scopeId: 'ICH', roomNames: ['DIF-202'] }), undefined, { role: 'engineer', latency: 0 });
    expect(result.outcome).toBe('forbidden');
  });

  it('returns one assessment for each declared kind in the declared order', async () => {
    const spec = makeSpec('analytics.ordered-assessments', { kinds: ['coverage', 'collection', 'processing_delay'] });
    const endpoint = mockEndpoint(spec);
    const result = await serveEndpoint(new Map([[spec.id, endpoint]]), request(spec.id), undefined, { role: 'engineer', latency: 0 });
    expect(result.assessments.map(assessment => assessment.kind)).toEqual(spec.kinds);
  });

  it.each(['error', 'too_large'] as const)('checks endpoint permission before the %s scenario', async scenario => {
    const spec = makeSpec('analytics.permission-first', { permission: 'analytics:view' });
    const endpoint = mockEndpoint(spec);
    setScenario(scenario);
    const result = await serveEndpoint(new Map([[spec.id, endpoint]]), request(spec.id), undefined, { role: 'viewer', latency: 0 });
    expect(result.outcome).toBe('forbidden');
    expect(result.message).toContain('analytics:view');
  });

  it('passes params to the handler without changing them', async () => {
    const spec = makeSpec('analytics.params', { requiresScope: false, context: {} });
    const params = { term: 'untouched', page: 4 };
    const handle = vi.fn(({ params: received }: Parameters<MockEndpoint<Params, unknown>['handle']>[0]) => received);
    const endpoint = mockEndpoint(spec, handle);
    const result = await serveEndpoint(new Map([[spec.id, endpoint]]), request(spec.id, {}, params), undefined, { role: 'engineer', latency: 0 });
    expect(result.outcome).toBe('ok');
    expect(handle.mock.calls[0][0].params).toBe(params);
    expect(result.data).toBe(params);
  });

  it('returns an error envelope when an applied roomNames value throws in serve', async () => {
    const spec = makeSpec('analytics.invalid-room-names', { context: { time: 'apply', roomNames: 'apply' } });
    const endpoint = mockEndpoint(spec);
    const result = await serveEndpoint(
      new Map([[spec.id, endpoint]]),
      request(spec.id, { scopeId: 'ICH', roomNames: 'PH-101' }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toBe('invalid request context');
    expect(result.data).toBeNull();
    expect(result.assessments).toEqual([]);
    expect(result.trust).toBeNull();
    expect(result.correlationId).toMatch(/^corr-/);
  });

  it('returns an error envelope when an applied invalid time value throws in serve', async () => {
    const spec = makeSpec('analytics.invalid-time', { context: { time: 'apply' } });
    const endpoint = mockEndpoint(spec);
    const result = await serveEndpoint(
      new Map([[spec.id, endpoint]]),
      request(spec.id, { scopeId: 'ICH', from: 'x', to: '2026-09-26T09:00:00' }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toBe('invalid request context');
    expect(result.data).toBeNull();
    expect(result.assessments).toEqual([]);
    expect(result.trust).toBeNull();
    expect(result.correlationId).toMatch(/^corr-/);
  });

  it('continues to reject an AbortError from the request signal', async () => {
    const endpoint = mockEndpoint(makeSpec('analytics.aborted'));
    const controller = new AbortController();
    const pending = serveEndpoint(
      new Map([[endpoint.spec.id, endpoint]]),
      request(endpoint.spec.id),
      controller.signal,
      { role: 'engineer', latency: 0 },
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('drops scopeId before handling an unscoped endpoint', async () => {
    const spec = makeSpec('analytics.unscoped', { requiresScope: false, context: {} });
    const handle = vi.fn(({ context }: Parameters<MockEndpoint<Params, unknown>['handle']>[0]) => ({ scopeId: context.scopeId }));
    const endpoint = mockEndpoint(spec, handle);
    const result = await serveEndpoint(
      new Map([[spec.id, endpoint]]),
      request(spec.id, { scopeId: 'ICH' }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('ok');
    expect(handle.mock.calls[0][0].context.scopeId).toBeNull();
  });

  it('attaches endpoint source and metricVersion to the successful trust envelope', async () => {
    const spec = makeSpec('analytics.trusted');
    const endpoint = defineMockEndpoint(spec, {
      handle: () => ({ ok: true }),
      source: 'analytics.hourly',
      metricVersion: () => 'v7',
    });
    const result = await serveEndpoint(
      new Map([[spec.id, endpoint]]),
      request(spec.id),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('ok');
    expect(result.trust).toMatchObject({ source: 'analytics.hourly', metricVersion: 'v7' });
  });

  it('returns forbidden before evaluating metricVersion for a caller without permission', async () => {
    const spec = makeSpec('analytics.bad-metric-version-forbidden', { permission: 'analytics:view' });
    const endpoint = defineMockEndpoint(spec, {
      handle: () => ({ ok: true }),
      metricVersion: () => { throw new Error('bad pair'); },
    });
    const result = await serveEndpoint(
      new Map([[spec.id, endpoint]]),
      request(spec.id),
      undefined,
      { role: 'viewer', latency: 0 },
    );

    expect(result.outcome).toBe('forbidden');
    expect(result.message).toContain('analytics:view');
  });

  it('evaluates a throwing metricVersion after the authorized endpoint handler', async () => {
    const spec = makeSpec('analytics.bad-metric-version-authorized', { permission: 'analytics:view' });
    const handle = vi.fn(() => ({ ok: true }));
    const endpoint = defineMockEndpoint(spec, {
      handle,
      metricVersion: () => { throw new Error('bad pair'); },
    });
    const result = await serveEndpoint(
      new Map([[spec.id, endpoint]]),
      request(spec.id),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.data).toBeNull();
    expect(handle).toHaveBeenCalledOnce();
  });

  it('passes the request params to metricVersion', async () => {
    const spec = defineEndpoint<{ v: string }, unknown>({
      id: 'analytics.versioned',
      menuId: 'owner',
      paramKeys: { v: true },
      permission: 'platform:view',
      requiresScope: true,
      context: { time: 'apply' },
      kinds: ['collection', 'coverage'],
      mergeTimeDomain: false,
    });
    const endpoint = defineMockEndpoint(spec, {
      handle: () => ({ ok: true }),
      metricVersion: ({ params }) => `v${params.v}`,
    });
    const result = await serveEndpoint(
      new Map([[spec.id, endpoint]]),
      request(spec.id, { scopeId: 'ICH' }, { v: '9' }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('ok');
    expect(result.trust?.metricVersion).toBe('v9');
  });

  it('preserves malformed endpoint data without calling its empty predicate', async () => {
    const spec = makeSpec('analytics.malformed-empty-check');
    const isEmpty = vi.fn((data: unknown) => (data as { total: number }).total === 0);
    const endpoint = defineMockEndpoint(spec, {
      handle: () => ({ total: 7 }),
      isEmpty,
    });
    const endpoints = new Map([[spec.id, endpoint]]);
    setScenario('malformed');

    const result = await serveEndpoint(
      endpoints,
      request(spec.id),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('ok');
    expect(result.data).toEqual({});
    expect(isEmpty).not.toHaveBeenCalled();
  });
});

describe('createMockAdapter registration', () => {
  it('rejects duplicate endpoint ids', () => {
    const spec = makeSpec('analytics.duplicate');
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec), mockEndpoint(spec)], registry })).toThrow(MockRegistrationError);
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec), mockEndpoint(spec)], registry })).toThrow('analytics.duplicate');
  });

  it('rejects an endpoint whose menu is not registered', () => {
    const spec = makeSpec('analytics.unknown-menu', { menuId: 'missing-menu' });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow(MockRegistrationError);
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow('analytics.unknown-menu');
  });

  it('rejects a permission name that no menu declares', () => {
    const spec = makeSpec('analytics.unknown-permission', { permission: 'analytics:view' });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow(MockRegistrationError);
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow('analytics.unknown-permission');
  });

  it('rejects applied Context that the owning manifest does not apply', () => {
    const spec = makeSpec('analytics.context-mismatch', { context: { time: 'apply', roomNames: 'apply' } });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow(MockRegistrationError);
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow('analytics.context-mismatch');
  });

  it('rejects an endpoint that removes its owning manifest scope requirement', () => {
    const spec = makeSpec('analytics.scope-weakened', { requiresScope: false });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow(MockRegistrationError);
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow('analytics.scope-weakened');
  });

  it('accepts an endpoint permission declared by a menu other than its owner', () => {
    const spec = makeSpec('analytics.cross-permission', { permission: 'notice:view' });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).not.toThrow();
  });

  it('routes menuQuery through the same declared endpoint engine', async () => {
    const spec = makeSpec('analytics.adapter-smoke');
    const endpoint = mockEndpoint(spec, ({ params, equipment }) => ({ term: params.term, count: equipment.length }));
    const adapter = createMockAdapter({ endpoints: [endpoint], registry });
    const result = await adapter.menuQuery({ endpoint: spec.id, context: { scopeId: 'ICH' }, params: { term: 'smoke' } });
    expect(result.outcome).toBe('ok');
    expect(result.data).toEqual({ term: 'smoke', count: expect.any(Number) });
  });
});
