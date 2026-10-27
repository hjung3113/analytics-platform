import { act, cleanup, render } from '@testing-library/react';
import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineEndpoint, groupId, spaceId, type ApiResponse, type EntityAuditPage, type MenuQuery, type PlatformAdapter, type Session } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PaneScreenProvider, PlatformProvider, useHostPlatform, useQueryEngine } from '../../platform/platform';
import { useAdapterRequest, useEntityAudit, useMenuQuery, usePlatformQuery, type QueryState } from '../query';
import { createRegistry } from '../../registry/registry';
import { noContext, settleQueries, testAdapter, testSession, testSpace } from '../../testing';

// Kernel query engine on TanStack Query (ADR-0086): shared keys, generations, guarded refetch, cancel on disable.

type Params = { page: number };
const endpoint = (id: string) => defineEndpoint<Params, { n: number }>({ id, menuId: 'home', paramKeys: { page: true }, permission: 'platform:view', requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false });
const listEndpoint = endpoint('fx.list');
const otherEndpoint = endpoint('fx.other');

const meta = { description: { ko: '', en: '' }, icon: House, permission: 'platform:view' as const, requiresScope: false, pageType: 'analysis' as const, pageKeys: [] };
const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const group = { id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') };
const registry = createRegistry({ spaces: [testSpace()], groups: [group], menus: [{ ...meta, id: 'home', group: group.id, primary: true, label: { ko: '홈', en: 'Home' }, path: '/', context: noContext, features }] });
const applyRegistry = createRegistry({ spaces: [testSpace()], groups: [group], menus: [{ ...meta, id: 'home', group: group.id, primary: true, label: { ko: '홈', en: 'Home' }, path: '/', context: { ...noContext, time: 'apply' as const }, features, query: { mode: 'apply' as const } }] });

const flush = settleQueries;

type Call = { request: MenuQuery; signal: AbortSignal | undefined; resolve: (n: number) => void; reject: (error: unknown) => void };

function harness(over: Partial<PlatformAdapter> = {}) {
  const calls: Call[] = [];
  const listeners = new Set<() => void>();
  const sessions = Object.fromEntries(['u1', 'u2'].map((id): [string, Session] => [id, testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } })]));
  let current = sessions.u1!;
  const adapter = testAdapter({
    session: () => current,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    menuQuery: vi.fn((request: MenuQuery, signal?: AbortSignal) => new Promise<ApiResponse<unknown>>((resolve, reject) => {
      calls.push({ request, signal, reject, resolve: n => resolve({ outcome: 'ok', data: { n }, assessments: [], trust: null, correlationId: `c${n}` }) });
    })) as never,
    ...over,
  });
  return {
    adapter, calls,
    switchUser: (id: 'u1' | 'u2') => act(() => { current = sessions[id]!; listeners.forEach(listener => listener()); }),
    bumpRevision: () => act(() => { listeners.forEach(listener => listener()); }),
  };
}

function tree(adapter: PlatformAdapter, ui: ReactNode, chosen = registry) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={chosen}>{ui}</PlatformProvider></I18nProvider>;
}

const seen = new Map<string, QueryState<{ n: number }>>();
const trail = new Map<string, number[]>();
function Menu({ id, spec = listEndpoint, page = 1, enabled = true }: { id: string; spec?: typeof listEndpoint; page?: number; enabled?: boolean }) {
  const state = useMenuQuery(spec, { page }, enabled);
  useLayoutEffect(() => {
    seen.set(id, state);
    if (state.response?.data) trail.set(id, [...(trail.get(id) ?? []), state.response.data.n]);
  });
  return null;
}
const state = (id: string) => seen.get(id)!;

beforeEach(() => { window.history.replaceState(null, '', '/'); seen.clear(); trail.clear(); });
afterEach(cleanup);

describe('Kernel query engine (ADR-0086)', () => {
  it('settleQueries (#907): a reply resolved outside act is on screen once it settles', async () => {
    const h = harness();
    render(tree(h.adapter, <Menu id="x" />));
    await settleQueries();
    h.calls[0]!.resolve(5);
    expect(state('x').response?.data?.n).toBeUndefined();
    await settleQueries();
    expect(state('x').response?.data?.n).toBe(5);
  });

  it('settleQueries (#907): runs as an act environment without the flag set and restores the flag afterwards', async () => {
    const flagged = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const before = flagged.IS_REACT_ACT_ENVIRONMENT;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      delete flagged.IS_REACT_ACT_ENVIRONMENT;
      const h = harness();
      render(tree(h.adapter, <Menu id="x" />));
      await settleQueries();
      h.calls[0]!.resolve(6);
      await settleQueries();
      expect(state('x').response?.data?.n).toBe(6);
      expect(flagged.IS_REACT_ACT_ENVIRONMENT).toBeUndefined();
      expect(errors.mock.calls.filter(call => String(call[0]).includes('not configured to support act'))).toEqual([]);
    } finally {
      errors.mockRestore();
      flagged.IS_REACT_ACT_ENVIRONMENT = before;
    }
  });

  it('A1: observers of one shared key share one request; the signal aborts only when the last one leaves', async () => {
    const h = harness();
    const view = render(tree(h.adapter, <><Menu id="x" /><Menu id="y" /></>));
    await flush();
    expect(h.calls).toHaveLength(1);
    await act(async () => { h.calls[0]!.resolve(1); });
    await flush();
    expect(state('x').response).toBe(state('y').response);
    expect(state('x').response?.data?.n).toBe(1);

    const h2 = harness();
    const second = render(tree(h2.adapter, <><Menu id="x" /><Menu id="y" /></>));
    await flush();
    second.rerender(tree(h2.adapter, <Menu id="x" />));
    await flush();
    expect(h2.calls[0]!.signal?.aborted).toBe(false);
    second.rerender(tree(h2.adapter, null));
    await flush();
    expect(h2.calls[0]!.signal?.aborted).toBe(true);
    view.unmount();
  });

  it('A2: two panes of one menu and Context send one request', async () => {
    const h = harness();
    const pane = (id: string) => <PaneScreenProvider paneId={id} screen={{ menuId: 'home', params: {}, query: '' }} onChange={() => {}} onLeave={() => {}}><Menu id={id} /></PaneScreenProvider>;
    render(tree(h.adapter, <>{pane('a')}{pane('b')}</>));
    await flush();
    expect(h.calls).toHaveLength(1);
    await act(async () => { h.calls[0]!.resolve(7); });
    await flush();
    expect([state('a').response?.data?.n, state('b').response?.data?.n]).toEqual([7, 7]);
  });

  it('A3: an identity change hides the prior result at once and the late reply of the old key is never shown', async () => {
    const h = harness();
    const view = render(tree(h.adapter, <Menu id="x" page={1} />));
    await flush();
    await act(async () => { h.calls[0]!.resolve(1); });
    await flush();
    expect(state('x').status).toBe('done');
    view.rerender(tree(h.adapter, <Menu id="x" page={2} />));
    expect(state('x')).toMatchObject({ status: 'loading', response: null, completedAt: null });
    await flush();
    await act(async () => { h.calls[0]!.resolve(99); });
    await flush();
    expect(state('x').response).toBeNull();
    expect(trail.get('x')).not.toContain(99);
  });

  it('A4: back to a key still in memory shows its own result as refreshing with the old completedAt, then done', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1_000);
      const h = harness();
      const view = render(tree(h.adapter, <Menu id="x" page={1} />));
      await flush();
      await act(async () => { h.calls[0]!.resolve(1); });
      await flush();
      const first = state('x').completedAt;
      expect(first).toBe(1_000);
      view.rerender(tree(h.adapter, <Menu id="x" page={2} />));
      await flush();
      await act(async () => { h.calls[1]!.resolve(2); });
      await flush();
      vi.setSystemTime(5_000);
      view.rerender(tree(h.adapter, <Menu id="x" page={1} />));
      await flush();
      expect(h.calls).toHaveLength(3);
      expect(state('x')).toMatchObject({ status: 'refreshing', completedAt: first });
      expect(state('x').response?.data?.n).toBe(1);
      await act(async () => { h.calls[2]!.resolve(3); });
      await flush();
      expect(state('x')).toMatchObject({ status: 'done', completedAt: 5_000 });
      expect(state('x').response?.data?.n).toBe(3);
    } finally { vi.useRealTimers(); }
  });

  it.each([
    ['user switch', (h: ReturnType<typeof harness>) => h.switchUser('u2')],
    ['revision bump', (h: ReturnType<typeof harness>) => h.bumpRevision()],
  ])('A5: a %s drops the cache and no result of the old generation is rendered again', async (_name, change) => {
    const h = harness();
    let keys: () => unknown[];
    function Keys() { const { client } = useQueryEngine(); keys = () => client.getQueryCache().getAll().map(query => query.queryKey[1]); return null; }
    const view = render(tree(h.adapter, <><Menu id="x" /><Keys /></>));
    await flush();
    await act(async () => { h.calls[0]!.resolve(1); });
    await flush();
    expect(state('x').response?.data?.n).toBe(1);
    const before = new Set(keys!());
    await change(h);
    expect(state('x')).toMatchObject({ status: 'loading', response: null });
    await flush();
    expect(new Set(keys!()).size).toBe(1);
    expect([...keys!()].some(key => before.has(key))).toBe(false);
    await act(async () => { h.calls.at(-1)!.resolve(2); });
    await flush();
    expect(trail.get('x')).toEqual([1, 2].slice(0, trail.get('x')!.length));
    expect(trail.get('x')!.at(-1)).toBe(2);
    expect(trail.get('x')!.filter(n => n === 1).length).toBeGreaterThan(0);
    view.unmount();
  });

  it('A6: a write invalidation refetches only that endpoint and keeps the prior result as refreshing', async () => {
    const h = harness();
    let epochs: ReturnType<typeof useHostPlatform>['refreshEpochs'];
    function Epochs() { epochs = useHostPlatform().refreshEpochs; return null; }
    render(tree(h.adapter, <><Menu id="list" /><Menu id="other" spec={otherEndpoint} /><Epochs /></>));
    await flush();
    await act(async () => { h.calls[0]!.resolve(1); h.calls[1]!.resolve(2); });
    await flush();
    const prior = state('list').response;
    act(() => epochs!.bump(['fx.list']));
    await flush();
    expect(h.calls).toHaveLength(3);
    expect(h.calls[2]!.request.endpoint).toBe('fx.list');
    expect(state('list')).toMatchObject({ status: 'refreshing', response: prior });
    expect(state('other').status).toBe('done');
  });

  it('A7: an adapter-internal AbortError is an error envelope, not a superseded request', async () => {
    const h = harness();
    render(tree(h.adapter, <Menu id="x" />));
    await flush();
    await act(async () => { h.calls[0]!.reject(new DOMException('timeout', 'AbortError')); });
    await flush();
    expect(h.calls[0]!.signal?.aborted).toBe(false);
    expect(state('x').status).toBe('done');
    expect(state('x').response).toMatchObject({ outcome: 'error', message: 'AbortError: timeout' });
  });

  it('A8: two timelines on one ref share the first-page read and stay consistent', async () => {
    const page: EntityAuditPage = { events: [], nextCursor: null };
    const entityAudit = vi.fn(async () => ({ outcome: 'ok' as const, data: page, assessments: [], trust: null, correlationId: 'a' }));
    const h = harness({ entityAudit: entityAudit as never });
    const ref = { type: 'equipment', id: 'E1', scopeId: null } as never;
    function Audit({ id }: { id: string }) { const { query } = useEntityAudit(ref); useLayoutEffect(() => { seen.set(id, query as never); }); return null; }
    render(tree(h.adapter, <><Audit id="a" /><Audit id="b" /></>));
    await flush();
    expect(entityAudit).toHaveBeenCalledTimes(1);
    expect(state('a').response).toBe(state('b').response);
    expect(state('a').response?.data).toBe(page as never);
  });

  it('A11a: usePlatformQuery instances with equal pageInputs and different run never share data', async () => {
    const ok = (data: string) => ({ outcome: 'ok' as const, data, assessments: [], trust: null, correlationId: data });
    const runs = { a: vi.fn(async () => ok('A')), b: vi.fn(async () => ok('B')) };
    function Platform({ id }: { id: 'a' | 'b' }) { const query = usePlatformQuery(runs[id], 'same'); useLayoutEffect(() => { seen.set(id, query as never); }); return null; }
    render(tree(harness().adapter, <><Platform id="a" /><Platform id="b" /></>));
    await flush();
    expect(runs.a).toHaveBeenCalledTimes(1);
    expect(runs.b).toHaveBeenCalledTimes(1);
    expect([state('a').response?.data, state('b').response?.data]).toEqual(['A', 'B'] as never);
  });

  it('A11b: a new adapter never returns the old adapter\'s data', async () => {
    const h1 = harness();
    const h2 = harness();
    const view = render(tree(h1.adapter, <Menu id="x" />));
    await flush();
    await act(async () => { h1.calls[0]!.resolve(1); });
    await flush();
    view.rerender(tree(h2.adapter, <Menu id="x" />));
    expect(state('x')).toMatchObject({ status: 'loading', response: null });
    await flush();
    expect(h2.calls).toHaveLength(1);
    await act(async () => { h2.calls[0]!.resolve(2); });
    await flush();
    expect(state('x').response?.data?.n).toBe(2);
    expect(trail.get('x')!.slice(1)).not.toContain(1);
  });

  it('A11c: a not-ready pane next to a ready pane with the same key stays loading and sends no request of its own', async () => {
    const h = harness();
    const pane = (id: string, enabled: boolean) => <PaneScreenProvider paneId={id} screen={{ menuId: 'home', params: {}, query: '' }} onChange={() => {}} onLeave={() => {}}><Menu id={id} enabled={enabled} /></PaneScreenProvider>;
    render(tree(h.adapter, <>{pane('ready', true)}{pane('waiting', false)}</>));
    await flush();
    await act(async () => { h.calls[0]!.resolve(1); });
    await flush();
    expect(h.calls).toHaveLength(1);
    expect(state('ready').status).toBe('done');
    expect(state('waiting')).toMatchObject({ status: 'loading', response: null });
  });

  it('A11d: refetch() and a refreshEpoch change send nothing while the hook is disabled or idle', async () => {
    const h = harness();
    let disabled!: QueryState<unknown>;
    const run = vi.fn(async () => ({ outcome: 'ok' as const, data: 1, assessments: [], trust: null, correlationId: 'x' }));
    function Disabled({ epoch }: { epoch: number }) { disabled = usePlatformQuery(run, null, false, 'context', epoch); return null; }
    const view = render(tree(h.adapter, <Disabled epoch={0} />));
    await flush();
    act(() => disabled.refetch());
    view.rerender(tree(h.adapter, <Disabled epoch={1} />));
    await flush();
    expect(run).not.toHaveBeenCalled();
    expect(disabled.status).toBe('loading');

    const idle = harness();
    render(tree(idle.adapter, <Menu id="idle" />, applyRegistry));
    await flush();
    expect(state('idle').status).toBe('idle');
    act(() => state('idle').refetch());
    await flush();
    expect(idle.calls).toHaveLength(0);
    expect(state('idle').status).toBe('idle');
  });

  it('A11e: a reply landing after the hook was disabled is never shown, and the request is cancelled when no enabled observer is left', async () => {
    const h = harness();
    const view = render(tree(h.adapter, <Menu id="x" enabled />));
    await flush();
    view.rerender(tree(h.adapter, <Menu id="x" enabled={false} />));
    await flush();
    expect(h.calls[0]!.signal?.aborted).toBe(true);
    await act(async () => { h.calls[0]!.resolve(5); });
    await flush();
    expect(state('x')).toMatchObject({ status: 'loading', response: null });
    expect(trail.get('x')).toBeUndefined();
  });

  it('A13: observers of one shared key that all call refetch() share one request and none is aborted', async () => {
    const h = harness();
    render(tree(h.adapter, <><Menu id="x" /><Menu id="y" /></>));
    await flush();
    await act(async () => { h.calls[0]!.resolve(1); });
    await flush();
    act(() => { state('x').refetch(); state('y').refetch(); });
    await flush();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]!.signal?.aborted).toBe(false);
    expect(h.calls[0]!.signal?.aborted).toBe(false);
    await act(async () => { h.calls[1]!.resolve(2); });
    await flush();
    expect([state('x').status, state('y').status]).toEqual(['done', 'done']);
    expect(state('x').response?.data?.n).toBe(2);
  });

  it('F5: a late reply of an old key that was still unresolved at the identity switch is never committed', async () => {
    const h = harness();
    const view = render(tree(h.adapter, <Menu id="x" page={1} />));
    await flush();
    expect(h.calls).toHaveLength(1);
    view.rerender(tree(h.adapter, <Menu id="x" page={2} />));
    await flush();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[0]!.signal?.aborted).toBe(true);
    await act(async () => { h.calls[0]!.resolve(99); });
    await flush();
    expect(state('x')).toMatchObject({ status: 'loading', response: null });
    await act(async () => { h.calls[1]!.resolve(2); });
    await flush();
    expect(state('x').response?.data?.n).toBe(2);
    expect(trail.get('x')).not.toContain(99);
  });

  it.each([
    ['disabled observer first', true],
    ['enabled observer first', false],
  ])('F2: the enabled observer of a shared key unmounts while a disabled one stays (%s): the request is aborted', async (_name, disabledFirst) => {
    const h = harness();
    const off = <Menu id="off" enabled={false} />;
    const on = <Menu id="on" />;
    const view = render(tree(h.adapter, disabledFirst ? <>{off}{on}</> : <>{on}{off}</>));
    await flush();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.signal?.aborted).toBe(false);
    view.rerender(tree(h.adapter, off));
    await flush();
    expect(h.calls[0]!.signal?.aborted).toBe(true);
  });

  it('F3: a Kernel request started offline runs once when the connection returns, with another client mounted', async () => {
    const other = new QueryClient();
    other.mount();
    onlineManager.setOnline(false);
    try {
      const h = harness();
      render(tree(h.adapter, <Menu id="x" />));
      await flush();
      expect(h.calls).toHaveLength(0);
      act(() => onlineManager.setOnline(true));
      await flush();
      expect(h.calls).toHaveLength(1);
      await act(async () => { h.calls[0]!.resolve(1); });
      await flush();
      expect(state('x')).toMatchObject({ status: 'done' });
      expect(state('x').response?.data?.n).toBe(1);
    } finally {
      onlineManager.setOnline(true);
      other.unmount();
    }
  });

  it.each([
    ['the enabled observer unmounts while a disabled one stays', false],
    ['the sole enabled observer becomes disabled', true],
  ])('C1: while offline-paused, when %s the request never reaches the adapter after the connection returns', async (_name, disable) => {
    onlineManager.setOnline(false);
    try {
      const h = harness();
      const off = <Menu id="off" enabled={false} />;
      const view = render(tree(h.adapter, disable ? <Menu id="on" /> : <><Menu id="on" />{off}</>));
      await flush();
      expect(h.calls).toHaveLength(0);
      view.rerender(tree(h.adapter, disable ? <Menu id="on" enabled={false} /> : off));
      await flush();
      act(() => onlineManager.setOnline(true));
      await flush();
      expect(h.calls).toHaveLength(0);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('C2: a group Retry right after a write bump shares one fresh request that the deferred invalidation does not abort', async () => {
    const h = harness();
    let epochs!: ReturnType<typeof useHostPlatform>['refreshEpochs'];
    function Epochs() { epochs = useHostPlatform().refreshEpochs; return null; }
    render(tree(h.adapter, <><Menu id="x" /><Menu id="y" /><Epochs /></>));
    await flush();
    await act(async () => { h.calls[0]!.resolve(1); });
    await flush();
    expect(h.calls).toHaveLength(1);
    act(() => { epochs.bump(['fx.list']); state('x').refetch(); state('y').refetch(); });
    await flush();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]!.signal?.aborted).toBe(false);
    await act(async () => { h.calls[1]!.resolve(2); });
    await flush();
    expect([state('x').status, state('y').status]).toEqual(['done', 'done']);
    expect(state('x').response?.data?.n).toBe(2);
  });

  it('F4: a bump from a descendant effect before the Provider effects ran still causes a post-bump read', async () => {
    const h = harness();
    function Bumper() { const { refreshEpochs } = useHostPlatform(); useEffect(() => { refreshEpochs.bump(['fx.list']); }, [refreshEpochs]); return null; }
    render(tree(h.adapter, <><Menu id="x" /><Bumper /></>));
    await flush();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[0]!.signal?.aborted).toBe(true);
    await act(async () => { h.calls[1]!.resolve(2); });
    await flush();
    expect(state('x').response?.data?.n).toBe(2);
  });

  it('F7: a write bump while the first read is pending supersedes it; its late pre-write reply is never shown; other endpoints are untouched', async () => {
    const h = harness();
    let epochs!: ReturnType<typeof useHostPlatform>['refreshEpochs'];
    function Epochs() { epochs = useHostPlatform().refreshEpochs; return null; }
    render(tree(h.adapter, <><Menu id="list" /><Menu id="other" spec={otherEndpoint} /><Epochs /></>));
    await flush();
    expect(h.calls).toHaveLength(2);
    act(() => epochs.bump(['fx.list']));
    await flush();
    expect(h.calls).toHaveLength(3);
    expect(h.calls[2]!.request.endpoint).toBe('fx.list');
    await act(async () => { h.calls[0]!.resolve(1); });
    await flush();
    expect(state('list').response).toBeNull();
    await act(async () => { h.calls[2]!.resolve(2); h.calls[1]!.resolve(5); });
    await flush();
    expect(state('list').response?.data?.n).toBe(2);
    expect(trail.get('list')).not.toContain(1);
    expect(state('other').response?.data?.n).toBe(5);
    expect(h.calls).toHaveLength(3);
    expect(h.calls[1]!.signal?.aborted).toBe(false);
  });

  it('F6: an identical response object read again at t2 keeps t2 as the accepted time after the hook is disabled', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1_000);
      const same = { outcome: 'ok' as const, data: 1, assessments: [], trust: null, correlationId: 'same' };
      const run = vi.fn(async () => same);
      let current!: QueryState<number>;
      function Probe({ enabled }: { enabled: boolean }) { current = usePlatformQuery<number>(run, null, enabled); return null; }
      const { adapter } = harness();
      const view = render(tree(adapter, <Probe enabled />));
      await flush();
      expect(current.completedAt).toBe(1_000);
      vi.setSystemTime(2_000);
      act(() => current.refetch());
      await flush();
      expect(run).toHaveBeenCalledTimes(2);
      expect(current.completedAt).toBe(2_000);
      view.rerender(tree(adapter, <Probe enabled={false} />));
      await flush();
      expect(current.completedAt).toBe(2_000);
    } finally { vi.useRealTimers(); }
  });

  it('useAdapterRequest: retry hides the data, then loads again; a rejection is the error state', async () => {
    let n = 0;
    let request!: ReturnType<typeof useAdapterRequest<number>>;
    function Req() { request = useAdapterRequest(async () => { n++; if (n === 1) throw new Error('boom'); return n; }, 'k'); return null; }
    render(tree(harness().adapter, <Req />));
    await flush();
    expect(request).toMatchObject({ status: 'error', data: null });
    act(() => request.retry());
    await flush();
    expect(request).toMatchObject({ status: 'done', data: 2 });
  });
});
