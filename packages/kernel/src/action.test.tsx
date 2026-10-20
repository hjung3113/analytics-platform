import { StrictMode, useLayoutEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineAction, defineEndpoint, type ActionOutcome, type ActionResponse, type ActionResult, type MenuAction, type MenuQuery, type Session } from '@ap/contracts';
import { useMenuAction, type MenuActionState } from './action';
import { I18nProvider } from './i18n';
import { PaneScreenProvider, PlatformProvider } from './platform';
import { useMenuQuery, type QueryState } from './query';
import { createRegistry } from './registry';
import { noContext, testAdapter, testSession, testSpace } from './testing';

type Input = { text: string; nested: { n: number } };
const endpoint = (id: string) => defineEndpoint<{ page: number }, { id: string }>({
  id, menuId: 'home', paramKeys: { page: true }, permission: 'platform:view', requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});
const listEndpoint = endpoint('fx.list');
const otherEndpoint = endpoint('fx.other');
const action = (over: Partial<Parameters<typeof defineAction<Input, { id: string }>>[0]> = {}) => defineAction<Input, { id: string }>({
  id: 'fx.save', menuId: 'home', inputKeys: { text: true, nested: true }, permission: 'platform:view', requiresScope: false, concurrency: 'none', invalidates: [listEndpoint], ...over,
});
const plain = action();
const versioned = action({ id: 'fx.save-v', concurrency: 'version' });
const scoped = action({ id: 'fx.save-s', requiresScope: true });

const meta = { description: { ko: '', en: '' }, icon: House, permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'analysis' as const, pageKeys: [] };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ ...meta, id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, path: '/', features: { export: false, savedView: false, annotate: false, compare: false, board: true } }],
});

const response = (outcome: ActionOutcome, over: Partial<ActionResponse<{ id: string }>> = {}): ActionResponse<{ id: string }> => ({
  outcome, data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'c', ...over,
});

type Sent = { request: MenuAction<Input>; args: unknown[]; resolve: (r: ActionResponse<{ id: string }>) => void; reject: (e: unknown) => void };
const input = (): Input => ({ text: 'a', nested: { n: 1 } });

function setup(ui: (probe: Probes, show: boolean) => React.ReactNode) {
  const sent: Sent[] = [];
  const queries: MenuQuery[] = [];
  const listeners = new Set<() => void>();
  const sessions = Object.fromEntries(['user-a', 'user-b'].map((id): [string, Session] => [id, testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } })]));
  let user = 'user-a';
  const session = (id: string) => sessions[id];
  const adapter = testAdapter({
    session: () => session(user), subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    menuQuery: vi.fn(async (request: MenuQuery) => { queries.push(request); return { outcome: 'ok' as const, data: { call: queries.length } as never, assessments: [], trust: null, correlationId: 'q' }; }),
    menuAction: vi.fn((request: MenuAction, ...args: unknown[]) => new Promise<ActionResponse<unknown>>((resolve, reject) => { sent.push({ request: request as MenuAction<Input>, args, resolve, reject }); })),
  });
  const probes: Probes = { action: undefined as never, lists: new Map() };
  const tree = (show: boolean) => (
    <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{ui(probes, show)}</PlatformProvider></I18nProvider>
  );
  const view = render(tree(true));
  return {
    adapter, sent, queries, probes,
    unmount: () => view.rerender(tree(false)),
    switchUser: () => act(() => { user = 'user-b'; listeners.forEach(l => l()); }),
  };
}
type Probes = { action: MenuActionState<Input, { id: string }>; lists: Map<string, QueryState<{ id: string }>> };

function Writer({ probes, spec = plain }: { probes: Probes; spec?: typeof plain }) {
  const state = useMenuAction(spec);
  useLayoutEffect(() => { probes.action = state; });
  return null;
}
function Reader({ probes, spec }: { probes: Probes; spec: typeof listEndpoint }) {
  const state = useMenuQuery(spec, { page: 1 });
  useLayoutEffect(() => { probes.lists.set(spec.id, state); });
  return null;
}
const both = (spec = plain) => (probes: Probes, show = true) => <><Reader probes={probes} spec={listEndpoint} /><Reader probes={probes} spec={otherEndpoint} />{show && <Writer probes={probes} spec={spec} />}</>;
const flush = () => act(async () => { await Promise.resolve(); });
const settle = <T,>(promise: Promise<T>) => promise.then(value => ({ value }), (error: unknown) => ({ error }));
const isAbort = (outcome: object) => 'error' in outcome && outcome.error instanceof DOMException && outcome.error.name === 'AbortError';

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const data = new Map<string, string>();
    vi.stubGlobal(name, { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; } });
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('useMenuAction: request', () => {
  it('sends the declared request once with a fresh key per run and no abort signal', async () => {
    const t = setup(both());
    await flush();
    let first!: Promise<ActionResult<{ id: string }>>;
    act(() => { first = t.probes.action.run(input()); });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].args).toEqual([]);
    expect(t.sent[0].request).toEqual({ action: 'fx.save', context: {}, input: input(), idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    await act(async () => { t.sent[0].resolve(response('ok')); await first; });
    act(() => { void t.probes.action.run(input()); });
    expect(t.sent[1].request.idempotencyKey).not.toBe(t.sent[0].request.idempotencyKey);
  });

  it('carries expectedVersion only for a versioned action and throws RangeError before any call otherwise', async () => {
    const t = setup(both(versioned));
    await flush();
    expect(() => t.probes.action.run(input())).toThrow(RangeError);
    act(() => { void t.probes.action.run(input(), { expectedVersion: 'v7' }); });
    expect(t.sent[0].request.expectedVersion).toBe('v7');
    expect(t.sent).toHaveLength(1);
    const u = setup(both());
    await flush();
    expect(() => u.probes.action.run(input(), { expectedVersion: 'v7' })).toThrow(RangeError);
    expect(u.sent).toHaveLength(0);
  });

  it('answers not_ready without an adapter call or retry while the Scope is not validated', async () => {
    const t = setup(both(scoped));
    await flush();
    expect(t.probes.action.ready).toBe(false);
    const result = await t.probes.action.run(input());
    expect(result).toMatchObject({ outcome: 'error', message: expect.stringContaining('not_ready') });
    expect(result.retry).toBeUndefined();
    expect(t.sent).toHaveLength(0);
  });

  it('turns an adapter rejection into unknown with retry', async () => {
    const t = setup(both());
    await flush();
    let promise!: Promise<ActionResult<{ id: string }>>;
    act(() => { promise = t.probes.action.run(input()); });
    await act(async () => { t.sent[0].reject(new Error('down')); await settle(promise); });
    const result = await promise;
    expect(result).toMatchObject({ outcome: 'unknown', message: 'Error: down' });
    expect(result.retry).toBeTypeOf('function');
  });

  it('single-flights run: two runs reach the adapter once and share the promise; pending toggles', async () => {
    const t = setup(both());
    await flush();
    let a!: Promise<unknown>; let b!: Promise<unknown>;
    act(() => { a = t.probes.action.run(input()); b = t.probes.action.run({ text: 'other', nested: { n: 2 } }); });
    expect(a).toBe(b);
    expect(t.sent).toHaveLength(1);
    expect(t.probes.action.pending).toBe(true);
    await act(async () => { t.sent[0].resolve(response('ok')); await a; });
    expect(t.probes.action.pending).toBe(false);
  });
});

describe('useMenuAction: retry', () => {
  it.each<ActionOutcome>(['ok', 'invalid', 'conflict', 'forbidden', 'not_found'])('has no retry on %s', async outcome => {
    const t = setup(both());
    await flush();
    let promise!: Promise<ActionResult<{ id: string }>>;
    act(() => { promise = t.probes.action.run(input()); });
    await act(async () => { t.sent[0].resolve(response(outcome)); await promise; });
    expect((await promise).retry).toBeUndefined();
  });

  it.each<ActionOutcome>(['error', 'unknown'])('resends the identical request after %s, even if the caller mutated its input', async outcome => {
    const t = setup(both());
    await flush();
    const mine = input();
    let promise!: Promise<ActionResult<{ id: string }>>;
    act(() => { promise = t.probes.action.run(mine); });
    mine.nested.n = 99;
    await act(async () => { t.sent[0].resolve(response(outcome)); await promise; });
    const result = await promise;
    let again!: Promise<ActionResult<{ id: string }>>;
    act(() => { again = result.retry!(); });
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1].request).toBe(t.sent[0].request);
    expect(t.sent[1].request.input.nested.n).toBe(1);
    // A retry of the retry resends the same request again, and overlapping retry/retry and retry/run are one send.
    await act(async () => { t.sent[1].resolve(response('error')); await again; });
    const second = await again;
    let r1!: Promise<unknown>; let r2!: Promise<unknown>;
    act(() => { r1 = second.retry!(); r2 = second.retry!(); });
    expect(r1).toBe(r2);
    expect(t.probes.action.pending).toBe(true);
    act(() => { expect(t.probes.action.run(input())).toBe(r1); });
    expect(t.sent).toHaveLength(3);
    expect(t.sent[2].request).toBe(t.sent[0].request);
  });

  it('rejects a retained retry with AbortError and no send after unmount', async () => {
    const t = setup(both());
    await flush();
    let promise!: Promise<ActionResult<{ id: string }>>;
    act(() => { promise = t.probes.action.run(input()); });
    await act(async () => { t.sent[0].resolve(response('error')); await promise; });
    const { retry } = await promise;
    t.unmount();
    expect(isAbort(await settle(retry!()))).toBe(true);
    expect(t.sent).toHaveLength(1);
  });

  it('rejects a retained retry after the session generation changed', async () => {
    const t = setup(both());
    await flush();
    let promise!: Promise<ActionResult<{ id: string }>>;
    act(() => { promise = t.probes.action.run(input()); });
    await act(async () => { t.sent[0].resolve(response('error')); await promise; });
    const { retry } = await promise;
    t.switchUser();
    expect(isAbort(await settle(retry!()))).toBe(true);
    expect(t.sent).toHaveLength(1);
  });
});

describe('useMenuAction: lifetime and generation', () => {
  it('rejects AbortError on unmount while the adapter call still completes and invalidation runs', async () => {
    const t = setup(both());
    await flush();
    let promise!: Promise<ActionResult<{ id: string }>>;
    act(() => { promise = t.probes.action.run(input()); });
    const outcome = settle(promise);
    t.unmount();
    expect(isAbort(await outcome)).toBe(true);
    const before = t.queries.length;
    await act(async () => { t.sent[0].resolve(response('ok')); });
    await flush();
    expect(t.adapter.menuAction).toHaveBeenCalledTimes(1);
    expect(t.queries).toHaveLength(before + 1);
  });

  it('rejects AbortError when the session generation changes before the answer, but still invalidates', async () => {
    const t = setup(both());
    await flush();
    let promise!: Promise<ActionResult<{ id: string }>>;
    act(() => { promise = t.probes.action.run(input()); });
    const outcome = settle(promise);
    t.switchUser();
    expect(isAbort(await outcome)).toBe(true);
    await flush();
    expect(t.probes.action.pending).toBe(false);
    const before = t.queries.length;
    await act(async () => { t.sent[0].resolve(response('ok')); });
    await flush();
    expect(t.adapter.menuAction).toHaveBeenCalledTimes(1);
    expect(t.queries).toHaveLength(before + 1);
  });
});

describe('refresh epochs', () => {
  it.each<[ActionOutcome, boolean]>([
    ['ok', true], ['conflict', true], ['unknown', true],
    ['invalid', false], ['forbidden', false], ['not_found', false], ['error', false],
  ])('%s refetches the invalidated query only: %s', async (outcome, refetches) => {
    const t = setup(both());
    await flush();
    const prior = t.probes.lists.get('fx.list')!.response;
    expect(prior).not.toBeNull();
    const calls = t.queries.length;
    let promise!: Promise<ActionResult<{ id: string }>>;
    act(() => { promise = t.probes.action.run(input()); });
    await act(async () => { t.sent[0].resolve(response(outcome)); await promise; });
    if (!refetches) { expect(t.queries).toHaveLength(calls); return; }
    await flush();
    expect(t.queries).toHaveLength(calls + 1);
    expect(t.probes.lists.get('fx.list')!.response).not.toBe(prior);
  });

  it('keeps the prior result while refreshing and leaves other endpoints alone', async () => {
    const t = setup(both());
    await flush();
    const priorOther = t.probes.lists.get('fx.other')!.response;
    const prior = t.probes.lists.get('fx.list')!.response;
    let hold!: () => void;
    t.adapter.menuQuery = vi.fn(() => new Promise(resolve => { hold = () => resolve({ outcome: 'ok', data: null as never, assessments: [], trust: null, correlationId: 'r' }); })) as never;
    let promise!: Promise<ActionResult<{ id: string }>>;
    act(() => { promise = t.probes.action.run(input()); });
    await act(async () => { t.sent[0].resolve(response('ok')); await promise; });
    await flush();
    expect(t.probes.lists.get('fx.list')).toMatchObject({ status: 'refreshing', response: prior });
    expect(t.probes.lists.get('fx.other')).toMatchObject({ status: 'done', response: priorOther });
    await act(async () => { hold(); });
    expect(t.probes.lists.get('fx.list')!.status).toBe('done');
  });

  it('refreshes the main screen and a sibling pane from one write (the store is app-wide)', async () => {
    const sent: MenuAction[] = [];
    let resolveAction!: (r: ActionResponse<unknown>) => void;
    let queries = 0;
    const adapter = testAdapter({
      menuQuery: vi.fn(async () => ({ outcome: 'ok' as const, data: { call: ++queries } as never, assessments: [], trust: null, correlationId: 'q' })),
      menuAction: vi.fn((request: MenuAction) => { sent.push(request); return new Promise<ActionResponse<unknown>>(resolve => { resolveAction = resolve; }); }),
    });
    const seen: Record<string, QueryState<{ id: string }>> = {};
    let run!: () => Promise<unknown>;
    function Main() { const state = useMenuQuery(listEndpoint, { page: 1 }); const w = useMenuAction(plain); useLayoutEffect(() => { seen.main = state; run = () => w.run(input()); }); return null; }
    function Side() { const state = useMenuQuery(listEndpoint, { page: 1 }); const unrelated = useMenuQuery(otherEndpoint, { page: 1 }); useLayoutEffect(() => { seen.side = state; seen.unrelated = unrelated; }); return null; }
    render(
      <StrictMode><I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
        <Main />
        <PaneScreenProvider paneId="p1" screen={{ menuId: 'home', params: {}, query: '' }} onChange={() => {}} onLeave={() => {}}><Side /></PaneScreenProvider>
      </PlatformProvider></I18nProvider></StrictMode>,
    );
    await flush();
    const priors = { main: seen.main.response, side: seen.side.response, unrelated: seen.unrelated.response };
    const before = queries;
    let promise!: Promise<unknown>;
    act(() => { promise = run(); });
    await act(async () => { resolveAction(response('ok')); await promise; });
    await flush();
    expect(sent).toHaveLength(1);
    expect(queries).toBe(before + 2);
    expect(seen.main.response).not.toBe(priors.main);
    expect(seen.side.response).not.toBe(priors.side);
    expect(seen.unrelated.response).toBe(priors.unrelated);
  });
});
