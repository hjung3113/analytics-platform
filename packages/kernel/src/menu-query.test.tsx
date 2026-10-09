import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect, useState } from 'react';
import { defineEndpoint, type ApiResponse, type AssessmentKind, type EndpointSpec, type MenuQuery, type PlatformAdapter, type ScopeCheck, type Session } from '@ap/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { type MenuFetch, type QueryState, useEntityQuery, useMenuFetch, useMenuQuery } from './query';
import { createRegistry } from './registry';
import { testAdapter, testSpace } from './test-support';

type Params = { page: number; sort?: string };
type QueryData = { call: number; context: MenuQuery['context']; params: Params };

const params: Params = { page: 1, sort: 'cycle' };
const endpoint: EndpointSpec<Params, QueryData> = defineEndpoint<Params, QueryData>({
  id: 'fixture.list',
  menuId: 'home',
  paramKeys: { page: true, sort: true },
  permission: 'platform:view',
  requiresScope: false,
  context: { time: 'apply' },
  kinds: ['collection', 'coverage'],
  mergeTimeDomain: false,
});

function makeRegistry(time: 'apply' | 'unsupported') {
  return createRegistry({
    spaces: [testSpace()],
    groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
    menus: [{
      id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' },
      path: '/', icon: House, permission: 'platform:view', requiresScope: false,
      context: {
        time, roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
        lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
      },
      pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
    }],
  });
}

const registry = makeRegistry('unsupported');
const periodRegistry = makeRegistry('apply');

type Answer = (request: MenuQuery, call: number) => ApiResponse<QueryData>;
type FixtureOptions = { answer?: Answer; validateScope?: PlatformAdapter['validateScope'] };

function fixture(options: FixtureOptions = {}) {
  const make = (id: string): Session => ({
    user: { id, name: id, title: { ko: id, en: id }, permissions: ['platform:view'] },
    scopes: [],
  });
  const sessions = { a: make('user-a'), b: make('user-b') };
  let current: Session = sessions.a;
  const listeners = new Set<() => void>();
  const requests: MenuQuery[] = [];
  const answer: Answer = options.answer ?? ((request, call) => ({
    outcome: 'ok',
    data: { call, context: request.context, params: request.params as Params },
    assessments: endpoint.kinds.map(kind => ({ kind, state: 'clear' as const })),
    trust: null,
    correlationId: `fixture-${call}`,
  }));
  const adapter = testAdapter({
    menuQuery: vi.fn(async (request: MenuQuery, _signal?: AbortSignal) => {
      requests.push(request);
      return answer(request, requests.length);
    }),
    session: () => current,
    validateScope: options.validateScope ?? (async () => ({ status: 'valid', grantedRooms: [] })),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  return {
    adapter,
    requests,
    switchTo: (key: keyof typeof sessions) => { current = sessions[key]; listeners.forEach(listener => listener()); },
    replaceWithSameUser: () => {
      current = { ...current, user: { ...current.user, permissions: [...current.user.permissions] } };
      listeners.forEach(listener => listener());
    },
  };
}

type ProbeProps = {
  spec?: EndpointSpec<Params, QueryData>;
  enabled?: boolean;
  onQuery?: (query: QueryState<QueryData>) => void;
};

function QueryProbe({ spec = endpoint, enabled = true, onQuery }: ProbeProps) {
  const { global, setGlobal } = usePlatform();
  const query = useMenuQuery(spec, params, enabled);
  onQuery?.(query);
  return (
    <>
      <p data-testid="query">{query.status}:{query.response?.data?.call ?? '-'}</p>
      <p data-testid="outcome">{query.response?.outcome ?? '-'}</p>
      <p data-testid="message">{query.response?.message ?? '-'}</p>
      <p data-testid="period">{global.from ?? '-'}|{global.to ?? '-'}</p>
      <button type="button" data-testid="non-applied" onClick={() => setGlobal({ roomNames: ['ETCH'] })}>room</button>
      <button type="button" data-testid="applied" onClick={() => setGlobal({ from: '2026-09-25T00:00:00', to: '2026-09-26T00:00:00' })}>from</button>
    </>
  );
}

function mount(f: ReturnType<typeof fixture>, props: ProbeProps = {}, selectedRegistry = registry) {
  return render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={selectedRegistry}><QueryProbe {...props} /></PlatformProvider></I18nProvider>);
}

function response(outcome: ApiResponse<QueryData>['outcome'], kinds: AssessmentKind[], correlationId = 'server-correlation'): ApiResponse<QueryData> {
  return {
    outcome,
    data: outcome === 'ok' ? { call: 1, context: {}, params } : null,
    assessments: kinds.map(kind => ({ kind, state: 'clear' })),
    trust: null,
    correlationId,
  };
}

function MenuQueryNoInferTypeProbe() {
  // @ts-expect-error Params are fixed by the endpoint declaration, not inferred from this bad literal.
  useMenuQuery(endpoint, { page: 'not-a-number' });
  return null;
}
void MenuQueryNoInferTypeProbe;

beforeEach(() => {
  window.history.replaceState(null, '', '/?v=1&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
    key: () => null,
    get length() { return data.size; },
  });
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('useMenuQuery identity and request shape', () => {
  it('sends only endpoint, projected Context, and params', async () => {
    const f = fixture();
    mount(f);
    expect(await screen.findByText('done:1')).toBeTruthy();

    const request = f.requests[0];
    expect(Object.keys(request).sort()).toEqual(['context', 'endpoint', 'params']);
    expect(request).toEqual({ endpoint: endpoint.id, context: { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' }, params });
    expect(request.context).not.toHaveProperty('roomNames');
    expect(request.context).not.toHaveProperty('permission');
    expect(request).not.toHaveProperty('kinds');
  });

  it('does not refetch for a Context key the endpoint does not apply and keeps the result visible', async () => {
    const f = fixture();
    mount(f);
    expect(await screen.findByText('done:1')).toBeTruthy();

    act(() => screen.getByTestId('non-applied').click());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('query').textContent).toBe('done:1');
    expect(f.requests).toHaveLength(1);
  });

  it('hides the previous result when an applied key changes, then requests with the new Context', async () => {
    const f = fixture();
    mount(f);
    expect(await screen.findByText('done:1')).toBeTruthy();

    act(() => screen.getByTestId('applied').click());
    expect(screen.getByTestId('query').textContent).toBe('loading:-');
    expect(await screen.findByText('done:2')).toBeTruthy();
    expect(f.requests).toHaveLength(2);
    expect(f.requests[1].context.from).toBe('2026-09-25T00:00:00');
  });

  it('hides the previous result immediately after a role/session switch', async () => {
    const f = fixture();
    mount(f);
    expect(await screen.findByText('done:1')).toBeTruthy();

    act(() => f.switchTo('b'));
    expect(screen.getByTestId('query').textContent).toBe('loading:-');
    expect(await screen.findByText('done:2')).toBeTruthy();
  });

  it('waits for the selected Scope to be validated before querying', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    let finishValidation!: (check: ScopeCheck) => void;
    const validation = new Promise<ScopeCheck>(resolve => { finishValidation = resolve; });
    const f = fixture({ validateScope: async () => validation });
    mount(f, { spec: { ...endpoint, requiresScope: true } });

    await act(async () => { await Promise.resolve(); });
    expect(f.requests).toHaveLength(0);

    act(() => finishValidation({ status: 'valid', grantedRooms: [] }));
    expect(await screen.findByText('done:1')).toBeTruthy();
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].context.scopeId).toBe('ICH');
  });

  it('queries an endpoint that does not require Scope when no Scope is selected', async () => {
    const f = fixture();
    mount(f);
    expect(await screen.findByText('done:1')).toBeTruthy();
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].context).not.toHaveProperty('scopeId');
  });

  it('does not query for a new user until that user has validated the selected Scope', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    let finishUserBValidation!: (check: ScopeCheck) => void;
    const userBValidation = new Promise<ScopeCheck>(resolve => { finishUserBValidation = resolve; });
    let validationCount = 0;
    const f = fixture({
      validateScope: async () => {
        validationCount++;
        return validationCount === 1 ? { status: 'valid', grantedRooms: [] } : userBValidation;
      },
    });
    mount(f, { spec: { ...endpoint, requiresScope: true } });
    expect(await screen.findByText('done:1')).toBeTruthy();
    expect(f.requests).toHaveLength(1);

    act(() => f.switchTo('b'));
    await act(async () => { await Promise.resolve(); });
    expect(validationCount).toBe(2);
    expect(f.requests).toHaveLength(1);

    act(() => finishUserBValidation({ status: 'valid', grantedRooms: [] }));
    expect(await screen.findByText('done:2')).toBeTruthy();
    expect(f.requests).toHaveLength(2);
  });

  it('does not query for a replacement same-ID session until that session validates Scope', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    const replacementValidations: Array<(check: ScopeCheck) => void> = [];
    let validationCount = 0;
    const f = fixture({
      validateScope: async () => {
        validationCount++;
        if (validationCount === 1) return { status: 'valid', grantedRooms: [] };
        return new Promise<ScopeCheck>(resolve => replacementValidations.push(resolve));
      },
    });
    mount(f, { spec: { ...endpoint, requiresScope: true } });
    expect(await screen.findByText('done:1')).toBeTruthy();
    expect(f.requests).toHaveLength(1);

    act(() => f.replaceWithSameUser());
    await act(async () => { await Promise.resolve(); });
    expect(validationCount).toBe(2);
    expect(f.requests).toHaveLength(1);

    // A late result for the replaced session must not validate the current session.
    act(() => f.replaceWithSameUser());
    await act(async () => { await Promise.resolve(); });
    expect(validationCount).toBe(3);
    await act(async () => {
      replacementValidations[0]({ status: 'valid', grantedRooms: [] });
      await Promise.resolve();
    });
    expect(f.requests).toHaveLength(1);

    act(() => replacementValidations[1]({ status: 'valid', grantedRooms: [] }));
    expect(await screen.findByText('done:2')).toBeTruthy();
    expect(f.requests).toHaveLength(2);
  });

  it('does not query a changed URL Scope until that Scope validates', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    let finishXiaValidation!: (check: ScopeCheck) => void;
    const xiaValidation = new Promise<ScopeCheck>(resolve => { finishXiaValidation = resolve; });
    const f = fixture({
      validateScope: async scopeId => scopeId === 'ICH'
        ? { status: 'valid', grantedRooms: [] }
        : xiaValidation,
    });
    mount(f, { spec: { ...endpoint, requiresScope: true } });
    expect(await screen.findByText('done:1')).toBeTruthy();
    expect(f.requests).toHaveLength(1);

    act(() => {
      window.history.replaceState(null, '', '/?v=1&scopeId=XIA&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => { await Promise.resolve(); });
    expect(f.requests).toHaveLength(1);

    act(() => finishXiaValidation({ status: 'valid', grantedRooms: [] }));
    expect(await screen.findByText('done:2')).toBeTruthy();
    expect(f.requests).toHaveLength(2);
    expect(f.requests[0].context.scopeId).toBe('ICH');
    expect(f.requests[1].context.scopeId).toBe('XIA');
  });

  it('waits for the default period before querying a time-applying endpoint', async () => {
    window.history.replaceState(null, '', '/');
    const f = fixture();
    mount(f, { spec: endpoint }, periodRegistry);

    expect(await screen.findByText('2026-09-25T09:00:00|2026-09-26T09:00:00')).toBeTruthy();
    await act(async () => { await Promise.resolve(); });
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].context).toMatchObject({ from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' });
  });

  it('does not query while disabled', async () => {
    const f = fixture();
    mount(f, { enabled: false });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('query').textContent).toBe('loading:-');
    expect(f.requests).toHaveLength(0);
  });
});

describe('useMenuQuery assessment contract', () => {
  it.each([
    { label: 'missing', kinds: ['collection'] as AssessmentKind[] },
    { label: 'extra', kinds: ['collection', 'coverage', 'time_domain'] as AssessmentKind[] },
    { label: 'duplicate', kinds: ['collection', 'collection'] as AssessmentKind[] },
  ])('returns a contract error for $label assessment kinds', async ({ kinds }) => {
    const serverResponse = response('ok', kinds);
    const f = fixture({ answer: () => serverResponse });
    const observed: QueryState<QueryData>[] = [];
    mount(f, { onQuery: query => { observed.push(query); } });
    expect(await screen.findByText('done:-')).toBeTruthy();

    expect(screen.getByTestId('outcome').textContent).toBe('error');
    expect(observed.at(-1)?.response).toMatchObject({
      outcome: 'error', data: null, trust: null, assessments: [], correlationId: 'server-correlation',
      message: `contract_violation: assessments [${kinds.join(', ')}] ≠ declared [collection, coverage]`,
    });
  });

  it('checks assessment kinds for empty responses too', async () => {
    const serverResponse = response('empty', ['collection']);
    const f = fixture({ answer: () => serverResponse });
    const observed: QueryState<QueryData>[] = [];
    mount(f, { onQuery: query => { observed.push(query); } });
    expect(await screen.findByText('done:-')).toBeTruthy();
    expect(observed.at(-1)?.response?.outcome).toBe('error');
  });

  it('passes through an explicit-empty response requested by an applied empty set', async () => {
    window.history.replaceState(null, '', '/?v=1&roomSelection=none&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    const serverResponse = response('empty', []);
    const f = fixture({ answer: () => serverResponse });
    const observed: QueryState<QueryData>[] = [];
    const roomEndpoint = { ...endpoint, context: { ...endpoint.context, roomNames: 'apply' as const } };
    mount(f, { spec: roomEndpoint, onQuery: query => { observed.push(query); } });
    expect(await screen.findByText('done:-')).toBeTruthy();

    expect(screen.getByTestId('outcome').textContent).toBe('empty');
    expect(observed.at(-1)?.response).toBe(serverResponse);
    expect(f.requests[0].context.roomNames).toEqual([]);
  });

  it('rejects the explicit-empty response shape when the request had no applied empty set', async () => {
    const serverResponse = response('empty', []);
    const f = fixture({ answer: () => serverResponse });
    const observed: QueryState<QueryData>[] = [];
    const roomEndpoint = { ...endpoint, context: { ...endpoint.context, roomNames: 'apply' as const } };
    mount(f, { spec: roomEndpoint, onQuery: query => { observed.push(query); } });
    expect(await screen.findByText('done:-')).toBeTruthy();

    expect(f.requests[0].context.roomNames).toBeNull();
    expect(observed.at(-1)?.response).toMatchObject({
      outcome: 'error', trust: null, assessments: [],
      message: 'contract_violation: assessments [] ≠ declared [collection, coverage]',
    });
  });

  it('still rejects an empty response with trust and missing assessment kinds', async () => {
    const serverResponse = response('empty', []);
    serverResponse.trust = {
      updatedAt: '2026-09-26T09:00:00', dataThrough: null, coverage: null,
      provisional: false, source: 'fixture',
    };
    const f = fixture({ answer: () => serverResponse });
    const observed: QueryState<QueryData>[] = [];
    mount(f, { onQuery: query => { observed.push(query); } });
    expect(await screen.findByText('done:-')).toBeTruthy();

    expect(observed.at(-1)?.response).toMatchObject({
      outcome: 'error', trust: null, assessments: [],
      message: 'contract_violation: assessments [] ≠ declared [collection, coverage]',
    });
  });

  it('passes through an exact multiset even when assessment order differs', async () => {
    const serverResponse = response('ok', ['coverage', 'collection']);
    const f = fixture({ answer: () => serverResponse });
    const observed: QueryState<QueryData>[] = [];
    mount(f, { onQuery: query => { observed.push(query); } });
    expect(await screen.findByText('done:1')).toBeTruthy();
    expect(observed.at(-1)?.response).toBe(serverResponse);
  });

  it('passes through forbidden responses with empty assessments', async () => {
    const serverResponse = response('forbidden', []);
    const f = fixture({ answer: () => serverResponse });
    const observed: QueryState<QueryData>[] = [];
    mount(f, { onQuery: query => { observed.push(query); } });
    expect(await screen.findByText('done:-')).toBeTruthy();
    expect(screen.getByTestId('outcome').textContent).toBe('forbidden');
    expect(observed.at(-1)?.response).toBe(serverResponse);
  });
});

function FetchProbe({ spec = endpoint, onFetch }: { spec?: EndpointSpec<Params, QueryData>; onFetch: (fetcher: MenuFetch<Params, QueryData>) => void }) {
  const { setGlobal } = usePlatform();
  const fetcher = useMenuFetch(spec);
  onFetch(fetcher);
  return (
    <>
      <p data-testid="ready">{String(fetcher.ready)}</p>
      <button type="button" data-testid="applied" onClick={() => setGlobal({ from: '2026-09-25T00:00:00', to: '2026-09-26T00:00:00' })}>from</button>
    </>
  );
}

function mountFetch(f: ReturnType<typeof fixture>, spec: EndpointSpec<Params, QueryData> = endpoint) {
  let latest!: MenuFetch<Params, QueryData>;
  render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><FetchProbe spec={spec} onFetch={fetcher => { latest = fetcher; }} /></PlatformProvider></I18nProvider>);
  return () => latest;
}

describe('useMenuFetch (caller-driven: table loadPage, export)', () => {
  it('sends nothing until called, then the same request shape as useMenuQuery', async () => {
    const f = fixture();
    const fetcher = mountFetch(f);
    await act(async () => { await Promise.resolve(); });
    expect(f.requests).toHaveLength(0);

    const result = await fetcher().fetch({ page: 2 });
    expect(result.outcome).toBe('ok');
    expect(f.requests).toEqual([{ endpoint: endpoint.id, context: { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' }, params: { page: 2 } }]);
  });

  it('projects the Context current at call time', async () => {
    const f = fixture();
    const fetcher = mountFetch(f);
    act(() => screen.getByTestId('applied').click());
    await fetcher().fetch({ page: 1 });
    expect(f.requests[0].context).toEqual({ from: '2026-09-25T00:00:00', to: '2026-09-26T00:00:00' });
  });

  it('answers not_ready without reaching the adapter while Scope is unvalidated', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    let finishValidation!: (check: ScopeCheck) => void;
    const validation = new Promise<ScopeCheck>(resolve => { finishValidation = resolve; });
    const f = fixture({ validateScope: async () => validation });
    const fetcher = mountFetch(f, { ...endpoint, requiresScope: true });

    expect(screen.getByTestId('ready').textContent).toBe('false');
    const early = await fetcher().fetch({ page: 1 });
    expect(early).toMatchObject({ outcome: 'error', data: null, assessments: [], trust: null });
    expect(early.message).toMatch(/^not_ready: fixture\.list/);
    expect(f.requests).toHaveLength(0);

    act(() => finishValidation({ status: 'valid', grantedRooms: [] }));
    expect(await screen.findByText('true')).toBeTruthy();
    expect((await fetcher().fetch({ page: 1 })).outcome).toBe('ok');
    expect(f.requests[0].context.scopeId).toBe('ICH');
  });

  it('applies the same assessment contract as useMenuQuery', async () => {
    const f = fixture({ answer: () => response('ok', ['collection']) });
    const fetcher = mountFetch(f);
    expect(await fetcher().fetch({ page: 1 })).toMatchObject({
      outcome: 'error', message: 'contract_violation: assessments [collection] ≠ declared [collection, coverage]',
    });
  });
});

describe('Scope validation failure (#167)', () => {
  function ScopeProbe() {
    const { scope, retryScope, setGlobal } = usePlatform();
    const query = useMenuQuery({ ...endpoint, requiresScope: true }, params);
    return (
      <>
        <p data-testid="scope">{scope.status}</p>
        <p data-testid="query">{query.status}:{query.response?.data?.call ?? '-'}</p>
        <button type="button" data-testid="retry" onClick={retryScope}>retry</button>
        <button type="button" data-testid="switch" onClick={() => setGlobal({ scopeId: 'XIA' })}>switch</button>
      </>
    );
  }
  const mountScope = (f: ReturnType<typeof fixture>) =>
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><ScopeProbe /></PlatformProvider></I18nProvider>);

  it('ends in error when validateScope rejects, sends no Scope-requiring query, and retryScope re-validates', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    let fail = true;
    let validations = 0;
    const f = fixture({ validateScope: async () => { validations++; if (fail) throw new Error('down'); return { status: 'valid', grantedRooms: [] }; } });
    mountScope(f);
    expect(await screen.findByText('error')).toBeTruthy();
    await act(async () => { await Promise.resolve(); });
    expect(f.requests).toHaveLength(0);
    expect(screen.getByTestId('query').textContent).toBe('loading:-');

    fail = false;
    act(() => screen.getByTestId('retry').click());
    expect(screen.getByTestId('scope').textContent).toBe('validating');
    expect(await screen.findByText('done:1')).toBeTruthy();
    expect(screen.getByTestId('scope').textContent).toBe('valid');
    expect(validations).toBe(2);
    expect(f.requests).toHaveLength(1);
  });

  it('treats an adapter-internal AbortError (Kernel signal not aborted) as error', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    const f = fixture({ validateScope: async () => { throw Object.assign(new Error('timeout'), { name: 'AbortError' }); } });
    mountScope(f);
    expect(await screen.findByText('error')).toBeTruthy();
  });

  it('ignores a late valid for a superseded Scope (adapter ignores the signal)', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    let finishIch!: (check: ScopeCheck) => void;
    const f = fixture({
      validateScope: scopeId => scopeId === 'ICH'
        ? new Promise<ScopeCheck>(resolve => { finishIch = resolve; })
        : new Promise<ScopeCheck>(() => {}),
    });
    const setItem = vi.spyOn(window.localStorage, 'setItem');
    mountScope(f);
    act(() => screen.getByTestId('switch').click());
    expect(screen.getByTestId('scope').textContent).toBe('validating');
    await act(async () => { finishIch({ status: 'valid', grantedRooms: [] }); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId('scope').textContent).toBe('validating');
    expect(setItem.mock.calls.filter(([key]) => key.startsWith('platform:lastScope:'))).toHaveLength(0);
  });

  it('never turns a superseded validation into error', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    let finishXia!: (check: ScopeCheck) => void;
    const f = fixture({
      validateScope: (scopeId, signal) => scopeId === 'ICH'
        // Rejects only when aborted, with a non-AbortError reason, like an adapter that rethrows its own error.
        ? new Promise<ScopeCheck>((_, reject) => signal?.addEventListener('abort', () => reject(new Error('cancelled'))))
        : new Promise<ScopeCheck>(resolve => { finishXia = resolve; }),
    });
    mountScope(f);
    expect(screen.getByTestId('scope').textContent).toBe('validating');
    act(() => screen.getByTestId('switch').click());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId('scope').textContent).toBe('validating');
    act(() => finishXia({ status: 'valid', grantedRooms: [] }));
    expect(await screen.findByText('valid')).toBeTruthy();
  });
});

describe('Adapter-internal AbortError in queries (#183: only the Kernel signal cancels)', () => {
  function AbortProbe() {
    const { setGlobal } = usePlatform();
    const query = useMenuQuery(endpoint, params);
    return (
      <>
        <p data-testid="query">{query.status}:{query.response?.data?.call ?? '-'}</p>
        <p data-testid="outcome">{query.response?.outcome ?? '-'}</p>
        <button type="button" data-testid="retry" onClick={query.refetch}>retry</button>
        <button type="button" data-testid="period" onClick={() => setGlobal({ from: '2026-09-25T00:00:00', to: '2026-09-26T00:00:00' })}>period</button>
      </>
    );
  }
  const mountAbort = (f: { adapter: PlatformAdapter }) =>
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><AbortProbe /></PlatformProvider></I18nProvider>);

  // jsdom's DOMException is not `instanceof Error`, so both shapes are covered; the DOMException variant is
  // the one the pre-#183 check (`error instanceof DOMException && error.name === 'AbortError'`) discarded.
  it.each([
    ['a DOMException AbortError', () => new DOMException('timeout', 'AbortError')],
    ['an Error named AbortError', () => Object.assign(new Error('timeout'), { name: 'AbortError' })],
  ])('turns %s from the adapter into the error outcome with retry', async (_label, make) => {
    let calls = 0;
    const f = fixture({ answer: () => {
      calls++;
      if (calls === 1) throw make();
      return response('ok', [...endpoint.kinds]);
    } });
    mountAbort(f);
    // The query resolves with the error envelope (status `done`, `outcome: 'error'`) instead of hanging in loading.
    expect(await screen.findByText('done:-')).toBeTruthy();
    expect(screen.getByTestId('outcome').textContent).toBe('error');
    act(() => screen.getByTestId('retry').click());
    expect(await screen.findByText('done:1')).toBeTruthy();
  });

  it('keeps a Kernel-caused abort silent (Context change mid-flight)', async () => {
    const f = fixture();
    let calls = 0;
    // Like fetch against a server: the first request hangs until the Kernel aborts it, then rejects with an
    // AbortError; the replacement request resolves normally.
    f.adapter.menuQuery = (request, signal) => {
      calls++;
      if (calls > 1) {
        return Promise.resolve({ outcome: 'ok' as const, data: { call: calls, context: request.context, params: request.params as Params }, assessments: endpoint.kinds.map(kind => ({ kind, state: 'clear' as const })), trust: null, correlationId: `fixture-${calls}` });
      }
      // new Promise form: @ap/tsconfig base lib is ES2022, so Promise.withResolvers is unavailable.
      return new Promise<ApiResponse<QueryData>>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    };
    mountAbort(f);
    await act(async () => {}); // the first request hangs until the Kernel aborts it
    act(() => screen.getByTestId('period').click());
    expect(await screen.findByText('done:2')).toBeTruthy();
    expect(screen.getByTestId('outcome').textContent).toBe('ok');
  });

  it('keeps a Kernel-caused abort silent (enabled → false mid-flight, identity unchanged)', async () => {
    const f = fixture();
    let calls = 0;
    // Like fetch against a server: the request hangs until the Kernel aborts it, then rejects with an
    // AbortError. Unlike the Context change above, no replacement request follows — the query is disabled,
    // so the identity of the key never changes and a recorded result would stay visible.
    f.adapter.menuQuery = (_request, signal) => {
      calls++;
      // new Promise form: @ap/tsconfig base lib is ES2022, so Promise.withResolvers is unavailable.
      return new Promise<ApiResponse<QueryData>>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    };
    function ToggleProbe() {
      const [enabled, setEnabled] = useState(true);
      const query = useMenuQuery(endpoint, params, enabled);
      return (
        <>
          <p data-testid="query">{query.status}:{query.response?.data?.call ?? '-'}</p>
          <p data-testid="outcome">{query.response?.outcome ?? '-'}</p>
          <button type="button" data-testid="off" onClick={() => setEnabled(false)}>off</button>
        </>
      );
    }
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><ToggleProbe /></PlatformProvider></I18nProvider>);
    await act(async () => {}); // the request hangs until the Kernel aborts it
    expect(calls).toBe(1);
    act(() => screen.getByTestId('off').click());
    // A disabled query shows no result at all; recording the rejection as `done` + `outcome: 'error'` on the
    // unchanged identity is the regression this pins.
    await act(async () => {});
    expect(screen.getByTestId('query').textContent).toBe('loading:-');
    expect(screen.getByTestId('outcome').textContent).toBe('-');
  });
});

describe('Scope switch mask equals the next effect state (#183)', () => {
  it('masks a switch to a Scope-less URL as the select-Scope state (never 검증 중) with no previous grantedRooms', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    let fail = false;
    const f = fixture({ validateScope: async () => { if (fail) throw new Error('down'); return { status: 'valid', grantedRooms: ['R1'] }; } });
    const frames: string[] = [];
    function MaskProbe() {
      const { scope, retryScope, setGlobal } = usePlatform();
      // useLayoutEffect runs on every commit before the passive validation effect, so the frame right after
      // setGlobal samples the mask. Consecutive duplicates collapse: the mask and the effect's value being
      // identical is exactly the property under test.
      useLayoutEffect(() => {
        const frame = `${scope.status}|${String(scope.scopeId)}|${scope.grantedRooms.join(',')}`;
        if (frames[frames.length - 1] !== frame) frames.push(frame);
      });
      return (
        <>
          <p data-testid="scope">{scope.status}:{scope.scopeId ?? 'null'}:{scope.grantedRooms.join(',')}</p>
          <button type="button" data-testid="retry" onClick={retryScope}>retry</button>
          <button type="button" data-testid="pick" onClick={() => setGlobal({ scopeId: 'ICH' })}>pick</button>
          <button type="button" data-testid="clear" onClick={() => setGlobal({ scopeId: null })}>clear</button>
        </>
      );
    }
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><MaskProbe /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('valid:ICH:R1')).toBeTruthy();

    // Leaving a valid Scope that had granted rooms: the very next frame is already the select-Scope state and
    // carries neither the previous scopeId nor its rooms.
    frames.length = 0;
    act(() => screen.getByTestId('clear').click());
    expect(frames).toEqual(['none|null|']);

    // From a Scope in error, a Scope-less URL never shows 검증 중 either.
    fail = true;
    act(() => screen.getByTestId('pick').click());
    expect(await screen.findByText('error:ICH:')).toBeTruthy();
    frames.length = 0;
    act(() => screen.getByTestId('clear').click());
    expect(frames).toEqual(['none|null|']);
    expect(screen.getByTestId('scope').textContent).toBe('none:null:');
  });
});

describe('Session-only change mask equals the next effect state (#186)', () => {
  it('after a session switch with the same scopeId the frame is the validating mask, never the old session valid, and a status-gated consumer fires no request in it', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    const f = fixture();
    const entities = vi.fn(async (): Promise<ApiResponse<string>> => ({ outcome: 'ok', data: 'd1', assessments: [], trust: null, correlationId: 'fixture' }));
    f.adapter.getEntity = entities;
    const frames: string[] = [];
    function SessionProbe() {
      const { scope } = usePlatform();
      // EquipmentDetail's gate (#186): only `scope.status === 'valid'` enables the destination read.
      useEntityQuery({ type: 'device', id: 'd1', scopeId: null }, 'header', scope.status === 'valid');
      // Same recorder as the #183 test: useLayoutEffect samples every commit, including the frame right
      // after the subscribe notification and before the passive validation effect runs.
      useLayoutEffect(() => {
        const frame = `${scope.status}|${String(scope.scopeId)}|${scope.grantedRooms.join(',')}`;
        if (frames[frames.length - 1] !== frame) frames.push(frame);
      });
      return <p data-testid="scope">{scope.status}:{scope.scopeId ?? 'null'}:{scope.grantedRooms.join(',')}</p>;
    }
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><SessionProbe /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('valid:ICH:')).toBeTruthy();
    await waitFor(() => expect(entities).toHaveBeenCalledTimes(1));

    // Role switch with the same scopeId: the frame before revalidation must not present the previous
    // session's `valid` (no stale rooms either) and the status-gated request must wait.
    frames.length = 0;
    entities.mockClear();
    act(() => f.switchTo('b'));
    expect(frames).toEqual(['validating|ICH|']);
    expect(entities).not.toHaveBeenCalled();
    expect(await screen.findByText('valid:ICH:')).toBeTruthy(); // revalidated for the new session
    await waitFor(() => expect(entities).toHaveBeenCalledTimes(1)); // exactly one request, after revalidation
  });

  it('after a session switch with no Scope the mask stays the select-Scope state', async () => {
    window.history.replaceState(null, '', '/?v=1&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    const f = fixture();
    const frames: string[] = [];
    function NoScopeProbe() {
      const { scope } = usePlatform();
      useLayoutEffect(() => {
        const frame = `${scope.status}|${String(scope.scopeId)}|${scope.grantedRooms.join(',')}`;
        if (frames[frames.length - 1] !== frame) frames.push(frame);
      });
      return <p data-testid="scope">{scope.status}:{scope.scopeId ?? 'null'}:{scope.grantedRooms.join(',')}</p>;
    }
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><NoScopeProbe /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('none:null:')).toBeTruthy();
    frames.length = 0;
    act(() => f.switchTo('b'));
    // The effect sets { scopeId: null, status: 'none', validatedFor: session }; the mask shows exactly that.
    expect(frames).toEqual(['none|null|']);
    expect(screen.getByTestId('scope').textContent).toBe('none:null:');
  });

  it('after a re-login (replaceWithSameUser: same user id, new session object) the frame is the validating mask and a status-gated consumer fires no request in it', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    const f = fixture();
    const entities = vi.fn(async (): Promise<ApiResponse<string>> => ({ outcome: 'ok', data: 'd1', assessments: [], trust: null, correlationId: 'fixture' }));
    f.adapter.getEntity = entities;
    const frames: string[] = [];
    function ReLoginProbe() {
      const { scope } = usePlatform();
      // Same gate as the switchTo case: only `scope.status === 'valid'` enables the destination read.
      useEntityQuery({ type: 'device', id: 'd1', scopeId: null }, 'header', scope.status === 'valid');
      useLayoutEffect(() => {
        const frame = `${scope.status}|${String(scope.scopeId)}|${scope.grantedRooms.join(',')}`;
        if (frames[frames.length - 1] !== frame) frames.push(frame);
      });
      return <p data-testid="scope">{scope.status}:{scope.scopeId ?? 'null'}:{scope.grantedRooms.join(',')}</p>;
    }
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><ReLoginProbe /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('valid:ICH:')).toBeTruthy();
    await waitFor(() => expect(entities).toHaveBeenCalledTimes(1));

    // Re-login (the case the docs name): scopeId, user.id and the query key are unchanged, so only
    // `validatedFor !== session` can mask the frame — the old session's `valid` must not leak and the
    // gated request must wait for the revalidation.
    frames.length = 0;
    entities.mockClear();
    act(() => f.replaceWithSameUser());
    expect(frames).toEqual(['validating|ICH|']);
    expect(entities).not.toHaveBeenCalled();
    expect(await screen.findByText('valid:ICH:')).toBeTruthy(); // revalidated for the new session object
    await waitFor(() => expect(entities).toHaveBeenCalledTimes(1)); // exactly one request, after revalidation
  });
});
