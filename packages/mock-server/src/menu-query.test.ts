import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineEndpoint, type Capability, type ContextKey, type EndpointSpec, type MenuMeta, type MenuQuery } from '@ap/contracts';
import { createMockAdapter } from './adapter';
import { defineMockEndpoint, MockRegistrationError, MockRequestError, serveEndpoint, type AnyMockEndpoint, type MockEndpoint } from './endpoints';
import { EQUIPMENT, type RoleId } from './world';
import { getRole, setRole, setScenario } from './server';

type Params = { term: string; page?: number };
const PERIOD = { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };
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

function request(
  endpoint = 'analytics.detail',
  context: Record<string, unknown> = { scopeId: 'ICH', ...PERIOD },
  params: Record<string, unknown> = { term: 'probe' },
) {
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

  it('rejects a non-applied roomNames key on a scope-required reference-only endpoint before permission', async () => {
    const spec = makeSpec('analytics.execution-detail', { permission: 'analytics:view', context: {} });
    const handle = vi.fn(() => ({ ok: true }));
    const endpoint = mockEndpoint(spec, handle);
    const result = await serveEndpoint(
      new Map([[spec.id, endpoint]]),
      request(spec.id, { scopeId: 'ICH', roomNames: ['X'] }),
      undefined,
      { role: 'viewer', latency: 200 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toContain('context key roomNames is not applied by analytics.execution-detail');
    expect(handle).not.toHaveBeenCalled();
  });

  it('rejects a non-applied selection key on an endpoint that applies only time', async () => {
    const spec = makeSpec('analytics.time-only');
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: 'ICH', ...PERIOD, selection: [] }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toContain('context key selection is not applied by analytics.time-only');
  });

  it('rejects scopeId on an endpoint that does not require scope', async () => {
    const spec = makeSpec('analytics.unscoped', { requiresScope: false, context: {} });
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: 'ICH' }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toContain('context key scopeId is not applied by analytics.unscoped');
  });

  it('rejects an applied time key that is absent', async () => {
    const spec = makeSpec('analytics.missing-to');
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: 'ICH', from: PERIOD.from }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toContain('to');
  });

  it('rejects an absent from key when time is applied', async () => {
    const spec = makeSpec('analytics.missing-from');
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: 'ICH', to: PERIOD.to }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toContain('from');
  });

  it('rejects a null to key when time is applied', async () => {
    const spec = makeSpec('analytics.null-to');
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: 'ICH', from: PERIOD.from, to: null }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toContain('to');
  });

  it('rejects an absent scopeId key on a scope-required endpoint', async () => {
    const spec = makeSpec('analytics.missing-scope');
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, PERIOD),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toContain('scopeId');
  });

  it('allows a present null scopeId to reach the scope check', async () => {
    const spec = makeSpec('analytics.null-scope');
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: null, ...PERIOD }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('forbidden');
  });

  it('rejects an absent applied roomNames key', async () => {
    const spec = makeSpec('analytics.missing-room', { context: { roomNames: 'apply' } });
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: 'ICH' }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toContain('roomNames');
  });

  it('allows null roomNames when the applied key is present', async () => {
    const spec = makeSpec('analytics.null-room', { context: { roomNames: 'apply' } });
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: 'ICH', roomNames: null }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('ok');
  });

  it('requires both projected metric keys', async () => {
    const spec = makeSpec('analytics.partial-metric', { context: { metric: 'apply' } });
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: 'ICH', metricId: 'cycleTime' }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toContain('metricVersion');
  });

  it('rejects a metric version without a metric id', async () => {
    const spec = makeSpec('analytics.version-without-id', { context: { metric: 'apply' } });
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: 'ICH', metricId: null, metricVersion: '3' }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toContain('context key metricVersion requires metricId');
  });

  it('allows a metric id with a null version (initialization entry)', async () => {
    const spec = makeSpec('analytics.id-without-version', { context: { metric: 'apply' } });
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: 'ICH', metricId: 'cycleTime', metricVersion: null }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('ok');
  });

  it('rejects an in-process undefined applied key like an absent wire key', async () => {
    const spec = makeSpec('analytics.undefined-scope');
    const result = await serveEndpoint(
      new Map([[spec.id, mockEndpoint(spec)]]),
      request(spec.id, { scopeId: undefined, ...PERIOD }),
      undefined,
      { role: 'engineer', latency: 0 },
    );

    expect(result.outcome).toBe('error');
    expect(result.message).toContain('missing context key scopeId');
  });
});

describe('serveEndpoint declaration pipeline', () => {
  it('keeps non-applied Context neutral when a request matches the endpoint projection', async () => {
    const spec = makeSpec('analytics.execution-detail', { context: {} });
    const handle = vi.fn(({ equipment }: Parameters<MockEndpoint<Params, unknown>['handle']>[0]) => ({ ids: equipment.map(row => row.equipmentId) }));
    const endpoint = mockEndpoint(spec, handle);
    const endpoints = new Map<string, AnyMockEndpoint>([[spec.id, endpoint]]);

    const response = await serveEndpoint(endpoints, request(spec.id, { scopeId: 'ICH' }), undefined, { role: 'engineer', latency: 0 });

    expect(response.outcome).toBe('ok');
    const received = handle.mock.calls[0][0];
    expect(received.context.roomNames).toBeNull();
    expect(received.context.condition).toBeNull();
    expect(received.context.selection).toBeNull();
  });

  it('resolves declared applied keys and forbids a denied room', async () => {
    const spec = makeSpec('analytics.room-filter', { context: { time: 'apply', roomNames: 'apply' } });
    const endpoint = mockEndpoint(spec);
    const result = await serveEndpoint(new Map([[spec.id, endpoint]]), request(spec.id, { scopeId: 'ICH', ...PERIOD, roomNames: ['DIFF'] }), undefined, { role: 'engineer', latency: 0 });
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

  it('rejects a params value the endpoint validate hook refuses, before the handler runs (#123)', async () => {
    const spec = makeSpec('analytics.validated', { requiresScope: false, context: {} });
    const handle = vi.fn(() => ({ ok: true }));
    const endpoint = defineMockEndpoint(spec, { handle, validate: ({ params }) => (params.term === 'bad' ? `term ${params.term} is not allowed` : null) });
    const map = new Map([[spec.id, endpoint as AnyMockEndpoint]]);
    const rejected = await serveEndpoint(map, request(spec.id, {}, { term: 'bad' }), undefined, { role: 'engineer', latency: 0 });
    expect(rejected).toMatchObject({ outcome: 'error', message: 'term bad is not allowed', data: null, trust: null, assessments: [] });
    expect(handle).not.toHaveBeenCalled();
    const accepted = await serveEndpoint(map, request(spec.id, {}, { term: 'good' }), undefined, { role: 'engineer', latency: 0 });
    expect(accepted.outcome).toBe('ok');
  });

  it('keeps a throwing validate hook inside the response boundary as an error envelope (#140 review)', async () => {
    const spec = makeSpec('analytics.validate-throws', { requiresScope: false, context: {} });
    const endpoint = defineMockEndpoint(spec, {
      handle: () => ({ ok: true }),
      validate: ({ params }) => ((params as unknown as { term: { trim(): string } }).term.trim() === '' ? 'blank' : null),
    });
    const result = await serveEndpoint(new Map([[spec.id, endpoint as AnyMockEndpoint]]), request(spec.id, {}, { term: 42 }), undefined, { role: 'engineer', latency: 0 });
    expect(result).toMatchObject({ outcome: 'error', data: null, trust: null, assessments: [] });
  });

  it('answers a non-mart endpoint without Data Trust and passes the pinned actor to the handler (#131)', async () => {
    const spec = makeSpec('analytics.nonmart', { requiresScope: false, context: {}, kinds: [] });
    const endpoint = defineMockEndpoint(spec, { mart: false, handle: ({ actor }) => ({ actor }) });
    const result = await serveEndpoint(new Map([[spec.id, endpoint as AnyMockEndpoint]]), request(spec.id, {}, {}), undefined, { role: 'admin', latency: 0 });
    expect(result).toMatchObject({ outcome: 'ok', data: { actor: 'admin' }, trust: null, assessments: [] });
  });

  it('ignores mart dev scenarios on a non-mart endpoint but keeps transport ones', async () => {
    const spec = makeSpec('analytics.nonmart-scenario', { requiresScope: false, context: {}, kinds: [] });
    const map = new Map([[spec.id, defineMockEndpoint(spec, { mart: false, handle: () => ({ rows: 1 }) }) as AnyMockEndpoint]]);
    for (const s of ['empty', 'partial', 'too_large'] as const) {
      setScenario(s);
      expect((await serveEndpoint(map, request(spec.id, {}, {}), undefined, { role: 'engineer', latency: 0 })).outcome).toBe('ok');
    }
    setScenario('error');
    expect((await serveEndpoint(map, request(spec.id, {}, {}), undefined, { role: 'engineer', latency: 0 })).outcome).toBe('error');
    setScenario('normal');
  });

  it('turns a MockRequestError from the handler into an error envelope with its message', async () => {
    const spec = makeSpec('analytics.refuse', { requiresScope: false, context: {} });
    const endpoint = defineMockEndpoint(spec, { handle: () => { throw new MockRequestError('Invalid cursor'); } });
    const result = await serveEndpoint(new Map([[spec.id, endpoint as AnyMockEndpoint]]), request(spec.id, {}, {}), undefined, { role: 'engineer', latency: 0 });
    expect(result).toMatchObject({ outcome: 'error', message: 'Invalid cursor', data: null, trust: null });
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
      request(spec.id, { scopeId: 'ICH', ...PERIOD, roomNames: 'PHOTO' }),
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

  it('does not expose scopeId to an unscoped handler when the request matches its projection', async () => {
    const spec = makeSpec('analytics.unscoped', { requiresScope: false, context: {} });
    const handle = vi.fn(({ context }: Parameters<MockEndpoint<Params, unknown>['handle']>[0]) => ({ scopeId: context.scopeId }));
    const endpoint = mockEndpoint(spec, handle);
    const result = await serveEndpoint(
      new Map([[spec.id, endpoint]]),
      request(spec.id, {}),
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
      request(spec.id, { scopeId: 'ICH', ...PERIOD }, { v: '9' }),
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

describe('serveEndpoint declared limits.maxRows (#175)', () => {
  // Non-paged row-array endpoint shape; the cap is judged on what the handler returns, not on the page.
  const spec = defineEndpoint<{ term: string }, unknown>({
    id: 'analytics.row-capped',
    menuId: 'owner',
    paramKeys: { term: true },
    permission: 'platform:view',
    requiresScope: true,
    context: { time: 'apply', selection: 'apply' },
    kinds: ['collection', 'coverage'],
    mergeTimeDomain: false,
    limits: { maxRows: 2 },
  });
  const request = (context: Record<string, unknown> = { scopeId: 'ICH', selection: null, ...PERIOD }, params: Record<string, unknown> = { term: 'probe' }): MenuQuery =>
    ({ endpoint: spec.id, context, params });
  const endpointsWith = (handle: MockEndpoint<{ term: string }, unknown>['handle']): ReadonlyMap<string, AnyMockEndpoint> =>
    new Map<string, AnyMockEndpoint>([[spec.id, defineMockEndpoint(spec, { handle })]]);
  const send = (endpoints: ReadonlyMap<string, AnyMockEndpoint>, req: MenuQuery) =>
    serveEndpoint(endpoints, req, undefined, { role: 'engineer', latency: 0 });

  it('answers too_large with no data when the whole handler result exceeds maxRows', async () => {
    const result = await send(endpointsWith(({ equipment }) => equipment.map(e => e.equipmentId)), request());
    expect(result.outcome).toBe('too_large'); // the ICH grant alone resolves to more than 2 rows
    expect(result.data).toBeNull();
    expect(result.message).toContain('over the declared maxRows 2');
  });

  it('answers ok when the handler returns exactly maxRows rows', async () => {
    const selection = EQUIPMENT.filter(e => e.site === 'ICH').slice(0, 2).map(e => e.equipmentId);
    const result = await send(endpointsWith(({ equipment }) => equipment.map(e => e.equipmentId)), request({ scopeId: 'ICH', selection, ...PERIOD }));
    expect(result.outcome).toBe('ok');
    expect(result.data as string[]).toHaveLength(2);
  });

  it('judges what the handler returns, not the resolved equipment count (narrowed through Context selection)', async () => {
    // Three selected rows, the handler narrows to two: 2 rows pass a maxRows of 2 even though the resolved set was 3.
    const selection = EQUIPMENT.filter(e => e.site === 'ICH').slice(0, 3).map(e => e.equipmentId);
    const result = await send(endpointsWith(({ equipment }) => equipment.slice(0, 2).map(e => e.equipmentId)), request({ scopeId: 'ICH', selection, ...PERIOD }));
    expect(result.outcome).toBe('ok');
    expect(result.data as string[]).toHaveLength(2);
  });

  // #173 selection export: the ids travel in params and the handler filters on them; the cap judges the filtered
  // handler output, not the resolved set behind the grant (which alone exceeds the cap here).
  it('judges the ids-filtered handler output, not the resolved equipment count (ids in params)', async () => {
    const idsSpec = defineEndpoint<{ ids: string[] }, unknown>({
      id: 'analytics.ids-capped',
      menuId: 'owner',
      paramKeys: { ids: true },
      permission: 'platform:view',
      requiresScope: true,
      context: { time: 'apply' },
      kinds: ['collection', 'coverage'],
      mergeTimeDomain: false,
      limits: { maxRows: 2 },
    });
    const idsRequest = (params: { ids: string[] }): MenuQuery =>
      ({ endpoint: idsSpec.id, context: { scopeId: 'ICH', ...PERIOD }, params });
    const ids = EQUIPMENT.filter(e => e.site === 'ICH').slice(0, 2).map(e => e.equipmentId);
    const endpoints = new Map<string, AnyMockEndpoint>([[
      idsSpec.id,
      defineMockEndpoint(idsSpec, { handle: ({ equipment, params }) => equipment.filter(e => params.ids.includes(e.equipmentId)).map(e => e.equipmentId) }),
    ]]);
    const result = await serveEndpoint(endpoints, idsRequest({ ids }), undefined, { role: 'engineer', latency: 0 });
    expect(result.outcome).toBe('ok');
    expect(result.data as string[]).toEqual(ids);
  });

  it('leaves the malformed dev scenario alone: the client still receives the malformed ok envelope (#101 boundary drills)', async () => {
    setScenario('malformed');
    const result = await send(endpointsWith(({ equipment }) => equipment.map(e => e.equipmentId)), request());
    expect(result.outcome).toBe('ok');
    expect(result.data).toEqual({});
  });

  it('answers contract error when a maxRows endpoint returns a non-array', async () => {
    const result = await send(endpointsWith(() => ({ rows: [] })), request());
    expect(result.outcome).toBe('error');
    expect(result.data).toBeNull();
    expect(result.message).toContain('maxRows');
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

  it.each(['roomNames', 'condition', 'selection', 'lot', 'recipe', 'ppid'] as const)(
    'rejects a scope-free endpoint that applies site-bound %s', key => {
      const context = { [key]: 'apply' } as EndpointSpec<Params, unknown>['context'];
      const spec = makeSpec(`analytics.unscoped-${key}`, { requiresScope: false, context });
      const owner = menuMeta({ requiresScope: false, context: { ...allUnsupported, ...context } });

      expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry: { menus: [owner] } }))
        .toThrow(MockRegistrationError);
      expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry: { menus: [owner] } }))
        .toThrow(new RegExp(`analytics\\.unscoped-${key}.*${key}`));
    },
  );

  it('rejects maxRows declared on a paged endpoint', () => {
    const spec = makeSpec('analytics.paged-maxrows', { limits: { maxRows: 50_000 } });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow(MockRegistrationError);
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow(/analytics\.paged-maxrows.*paged/);
  });

  it('rejects maxRows declared on an endpoint with pageSize but no page', () => {
    const spec = makeSpec('analytics.pagesize-maxrows', {
      paramKeys: { term: true, pageSize: true } as unknown as EndpointSpec<Params, unknown>['paramKeys'],
      limits: { maxRows: 50_000 },
    });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow(MockRegistrationError);
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow(/analytics\.pagesize-maxrows.*paged/);
  });

  // #175 review P3-1: cursor paging bounds rows just like page paging, so the cap is equally meaningless there.
  it('rejects maxRows declared on a cursor-paged endpoint', () => {
    const spec = makeSpec('analytics.cursor-maxrows', {
      paramKeys: { term: true, cursor: true } as unknown as EndpointSpec<Params, unknown>['paramKeys'],
      limits: { maxRows: 50_000 },
    });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow(MockRegistrationError);
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow(/analytics\.cursor-maxrows.*paged/);
  });

  // Non-paged paramKeys (same as the "accepts" test) so the value check is the only thing these pin (#175 review P3-2c).
  it.each([0, -3, 2.5])('rejects a maxRows that is not a positive integer (%s)', maxRows => {
    const spec = makeSpec('analytics.bad-maxrows', {
      paramKeys: { term: true } as EndpointSpec<Params, unknown>['paramKeys'],
      limits: { maxRows },
    });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow(MockRegistrationError);
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).toThrow('positive integer');
  });

  it('accepts maxRows on a non-paged endpoint', () => {
    const spec = makeSpec('analytics.export-maxrows', {
      paramKeys: { term: true } as EndpointSpec<Params, unknown>['paramKeys'],
      limits: { maxRows: 50_000 },
    });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).not.toThrow();
  });

  it('accepts a scope-free endpoint that applies only time', () => {
    const spec = makeSpec('analytics.unscoped-time', { requiresScope: false, context: { time: 'apply' } });
    const owner = menuMeta({ requiresScope: false });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry: { menus: [owner] } })).not.toThrow();
  });

  it('accepts a scope-free endpoint that applies only metric', () => {
    const context = { metric: 'apply' } as EndpointSpec<Params, unknown>['context'];
    const spec = makeSpec('analytics.unscoped-metric', { requiresScope: false, context });
    const owner = menuMeta({ requiresScope: false, context: { ...allUnsupported, time: 'apply', ...context } });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry: { menus: [owner] } })).not.toThrow();
  });

  it('accepts an endpoint permission declared by a menu other than its owner', () => {
    const spec = makeSpec('analytics.cross-permission', { permission: 'notice:view' });
    expect(() => createMockAdapter({ endpoints: [mockEndpoint(spec)], registry })).not.toThrow();
  });

  it('routes menuQuery through the same declared endpoint engine', async () => {
    const spec = makeSpec('analytics.adapter-smoke');
    const endpoint = mockEndpoint(spec, ({ params, equipment }) => ({ term: params.term, count: equipment.length }));
    const adapter = createMockAdapter({ endpoints: [endpoint], registry });
    const result = await adapter.menuQuery({ endpoint: spec.id, context: { scopeId: 'ICH', ...PERIOD }, params: { term: 'smoke' } });
    expect(result.outcome).toBe('ok');
    expect(result.data).toEqual({ term: 'smoke', count: expect.any(Number) });
  });
});


describe('endpoint provisional ownership', () => {
  it.each([
    { from: PERIOD.from, to: PERIOD.to, provisional: false },
    { from: '2026-09-01T09:00:00', to: PERIOD.to, provisional: true },
  ])('uses the hook instead of the period verdict: $provisional', async ({ from, to, provisional }) => {
    const spec = makeSpec('analytics.provisional');
    const data = { total: 7 };
    const hook = vi.fn(() => provisional);
    const endpoint = defineMockEndpoint(spec, { handle: () => data, provisional: hook });
    const result = await serveEndpoint(new Map([[spec.id, endpoint]]), request(spec.id, { scopeId: 'ICH', from, to }), undefined, { latency: 0 });
    expect(result.outcome).toBe('ok');
    expect(result.trust?.provisional).toBe(provisional);
    expect(hook).toHaveBeenCalledExactlyOnceWith({ data, params: { term: 'probe' }, context: expect.objectContaining({ scopeId: 'ICH', from, to, selection: null }) });
  });

  it.each([
    { context: { scopeId: 'ICH', ...PERIOD }, applied: true, expected: true },
    { context: { scopeId: 'ICH', from: '2026-09-01T09:00:00', to: PERIOD.to }, applied: true, expected: false },
    { context: { scopeId: 'ICH' }, applied: false, expected: false },
  ])('keeps the period verdict without a hook: $expected ($applied)', async ({ context, applied, expected }) => {
    const spec = makeSpec('analytics.default-provisional', { context: applied ? { time: 'apply' } : {} });
    const endpoint = mockEndpoint(spec);
    const result = await serveEndpoint(new Map([[spec.id, endpoint]]), request(spec.id, context), undefined, { latency: 0 });
    expect(result.outcome).toBe('ok');
    expect(result.trust?.provisional).toBe(expected);
  });

  it.each(['predicate-empty', 'empty', 'error', 'malformed'] as const)('does not call the hook for %s', async scenario => {
    const spec = makeSpec('analytics.skipped-provisional');
    const hook = vi.fn(() => false);
    const endpoint = defineMockEndpoint(spec, { handle: () => ({ total: 0 }), isEmpty: () => scenario === 'predicate-empty', provisional: hook });
    if (scenario !== 'predicate-empty') setScenario(scenario);
    const result = await serveEndpoint(new Map([[spec.id, endpoint]]), request(spec.id), undefined, { latency: 0 });
    expect(result.outcome).toBe(scenario === 'predicate-empty' ? 'empty' : scenario === 'malformed' ? 'ok' : scenario);
    expect(hook).not.toHaveBeenCalled();
    expect(result.trust?.provisional).toBe(scenario === 'error' ? undefined : true);
  });

  it('does not call the hook on a non-mart endpoint, even with the mart empty scenario on', async () => {
    const spec = makeSpec('analytics.nonmart-provisional', { requiresScope: false, context: {}, kinds: [] });
    const hook = vi.fn(() => false);
    const endpoint = defineMockEndpoint(spec, { mart: false, handle: () => ({ total: 7 }), provisional: hook });
    setScenario('empty');
    const result = await serveEndpoint(new Map([[spec.id, endpoint]]), request(spec.id, {}, {}), undefined, { latency: 0 });
    expect(result.outcome).toBe('ok');
    expect(result.data).toEqual({ total: 7 });
    expect(result.trust).toBeNull();
    expect(hook).not.toHaveBeenCalled();
  });
});
