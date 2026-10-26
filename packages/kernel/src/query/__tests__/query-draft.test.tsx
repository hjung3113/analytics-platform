import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { defineEndpoint, type ApiResponse, groupId, spaceId } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PaneQueryDraftProvider, PaneScreenProvider, PlatformProvider, useHostPlatform, type PaneScreen } from '../../platform/platform';
import { useConditionPreset } from '../condition-preset';
import { useQueryDraft } from '../query-draft';
import { useDrill } from '../../context/drill';
import { useMenuQuery, useMenuFetch, usePlatformQuery, useEntityQuery } from '../query';
import { createRegistry } from '../../registry/registry';
import { noContext, settleQueries, testAdapter, testSession, testSpace } from '../../testing';

const menu = { id: 'home', group: groupId('overview'), primary: true, path: '/', icon: House,
  label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const,
  requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const,
  features: { export: false, savedView: false, annotate: false, compare: false, board: true },
  pageKeys: ['filter', 'page'], contextResetKeys: ['page'], query: { mode: 'apply' as const } };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: menu.label, icon: House, space: spaceId('analytics') }], menus: [menu] });
const endpoint = defineEndpoint<{}, number>({ id: 'fixture.query', menuId: 'home', permission: 'platform:view', requiresScope: false, context: { time: 'apply' }, paramKeys: {}, kinds: [], mergeTimeDomain: false });
let draft: ReturnType<typeof useQueryDraft>;
let platform: ReturnType<typeof useHostPlatform>;
let query: ReturnType<typeof useMenuQuery<{}, number>>;
function Probe() { draft = useQueryDraft(); platform = useHostPlatform(); query = useMenuQuery(endpoint, {}); return null; }
afterEach(cleanup);

it('keeps the default period in draft, commits once, and preserves applied results while editing', async () => {
  window.history.replaceState(null, '', '/');
  const send = vi.fn(async () => ({ outcome: 'ok' as const, data: 7, assessments: [], trust: null, correlationId: 'result' }));
  const push = vi.spyOn(window.history, 'pushState');
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session, menuQuery: send })}><Probe /></PlatformProvider></I18nProvider>);
  expect(query.status).toBe('idle');
  expect(draft.draft.global.from).toBe('2026-09-25T09:00:00');
  expect(window.location.search).toBe('');
  expect(send).not.toHaveBeenCalled();
  act(() => { draft.setDraftPage({ filter: 'one' }); });
  expect(draft.dirty).toEqual(['filter']);
  act(() => { draft.apply(); draft.apply(); });
  await waitFor(() => expect(query.status).toBe('done'));
  expect(push).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(query.completedAt).toEqual(expect.any(Number));
  act(() => draft.setDraftPage({ filter: 'two' }));
  expect(platform.pageParam('filter')).toBe('one');
  expect(query.response?.data).toBe(7);
  act(() => draft.revert());
  expect(draft.dirty).toEqual([]);
  push.mockRestore();
});

const period = '?v=1&from=2026-09-25T09%3A00%3A00&to=2026-09-26T09%3A00%3A00';
const week = { from: '2026-09-19T08:00:00', to: '2026-09-26T08:00:00' };
function mount(url = '/', chosen = registry, over: Parameters<typeof testAdapter>[0] = {}) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  const send = vi.fn(async () => ({ outcome: 'ok' as const, data: 7, assessments: [], trust: null, correlationId: 'result' }));
  const adapter = testAdapter({ session: () => session, menuQuery: send, ...over });
  const view = render(<I18nProvider><PlatformProvider registry={chosen} adapter={adapter}><Probe /></PlatformProvider></I18nProvider>);
  return { send, adapter, view };
}
it('a seeded default period is not a change: entry is clean, an edit counts the period, revert returns to the entry draft (#913)', () => {
  mount('/');
  const entry = { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };
  expect(draft.draft.global).toMatchObject(entry);
  expect(draft.dirty).toEqual([]);
  act(() => draft.setDraftGlobal(week));
  expect(draft.dirty).toEqual(['from', 'to']);
  act(() => draft.revert());
  expect(draft.draft.global).toMatchObject(entry);
  expect(draft.dirty).toEqual([]);
  expect(draft.missing).toEqual([]);
  act(() => draft.setDraftGlobal(entry));
  expect(draft.dirty).toEqual([]);
  act(() => draft.setDraftGlobal(week));
  act(() => draft.reset());
  expect(draft.draft.global).toMatchObject(entry);
  expect(draft.dirty).toEqual([]);
});
it('an applied address that already has a period still counts a changed period', () => {
  mount('/' + period);
  expect(draft.dirty).toEqual([]);
  act(() => draft.setDraftGlobal(week));
  expect(draft.dirty).toEqual(['from', 'to']);
  act(() => draft.revert());
  expect(draft.draft.global).toMatchObject({ from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' });
  expect(draft.dirty).toEqual([]);
});
it.each([
  ['', 'idle'], ['?v=1&extra=value', 'idle'], ['?scopeId=MEM', 'idle'], ['?filter=value', 'idle'],
  ['?ppid=unsupported', 'idle'], [period, 'done'], ['?from=2026-09-25T09:00:00', 'idle'],
  ['?from=bad&to=worse', 'idle'],
] as const)('derives main execution from address %s → %s', async (search, status) => {
  const { send } = mount('/' + search);
  await waitFor(() => expect(query.status).toBe(status));
  expect(send).toHaveBeenCalledTimes(status === 'done' ? 1 : 0);
});
it('rebases on immediate writers and history; same-address navigation keeps pending edits', async () => {
  mount('/' + period + '&filter=applied');
  await waitFor(() => expect(query.status).toBe('done'));
  act(() => draft.setDraftPage({ filter: 'draft' }));
  act(() => platform.navigate(platform.url));
  expect(draft.draft.page).toEqual([['filter', 'draft']]);
  act(() => platform.setPage({ filter: 'external' }));
  expect(draft.draft.page).toEqual([['filter', 'external']]);
  act(() => draft.setDraftPage({ filter: 'discard' }));
  act(() => { window.history.replaceState(null, '', '/' + period + '&filter=back'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(draft.draft.page).toEqual([['filter', 'back']]);
  act(() => draft.reset());
  expect(draft.draft.page).toEqual([]);
  expect(platform.pageParam('filter')).toBe('back');
});
it('compares semantic sets/Condition, drops reset keys immediately, and preserves extras/unsupported Context', async () => {
  mount('/' + period + '&roomNames=B&roomNames=A&page=3&ppid=kept&extra=kept');
  await waitFor(() => expect(query.status).toBe('done'));
  act(() => draft.setDraftGlobal({ roomNames: ['A', 'B', 'A'] }));
  expect(draft.dirty).toEqual([]);
  expect(draft.draft.page).toEqual([['page', '3']]);
  act(() => draft.setDraftGlobal({ from: '2026-09-24T09:00:00' }));
  expect(draft.dirty).toEqual(['from', 'page']);
  expect(draft.draft.page).toEqual([]);
  act(() => draft.apply());
  expect(platform.global.ppid).toBe('kept');
  expect(platform.extras).toEqual([['extra', 'kept']]);
  expect(() => draft.setDraftPage({ unknown: 'bad' })).toThrow(/Undeclared/);
  expect(() => draft.setDraftGlobal({ from: null })).toThrow(/partial_period/);
  expect(() => draft.setDraftGlobal({ metricId: 'id' })).toThrow(/requires metricVersion/);
  expect(() => draft.setDraftGlobal({ condition: { unknown: ['a'] } })).toThrow(/invalid_condition/);
});
it('gates on required page values after dropping contextResetKeys', () => {
  const requiredMenu = { ...menu, query: { mode: 'apply' as const, required: { page: [{ key: 'page', label: { ko: '페이지', en: 'Page' } }] } } };
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [requiredMenu] });
  mount('/' + period + '&page=3', chosen);
  act(() => draft.setDraftGlobal({ from: '2026-09-24T09:00:00' }));
  expect(draft.missing).toEqual([{ key: 'page', label: { ko: '페이지', en: 'Page' } }]);
  expect(draft.canApply).toBe(false);
  const before = platform.url;
  act(() => draft.apply());
  expect(platform.url).toBe(before);
});
it('clears site-bound pending values when Scope changes, then rebases', async () => {
  mount('/' + period + '&scopeId=MEM&roomNames=A');
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: ['pending'], lineNames: ['line'], prcGroups: ['group'] }));
  act(() => platform.setGlobal({ scopeId: 'OTHER' }));
  expect(draft.draft.global).toMatchObject({ scopeId: 'OTHER', roomNames: null, lineNames: null, prcGroups: null, condition: null, membershipBasis: null, selection: null });
  expect(draft.dirty).toEqual([]);
});

it('shares sibling readers of one logical pane, isolates others, and preserves edits across delayed own echoes', async () => {
  const seen = new Map<string, ReturnType<typeof useQueryDraft>>();
  const contexts = new Map<string, ReturnType<typeof useHostPlatform>>();
  const updates = vi.fn();
  let echo: (screen: PaneScreen) => void;
  let select: (id: string) => void;
  let remove: () => void;
  let recreate: () => void;
  function Reader({ id }: { id: string }) { seen.set(id, useQueryDraft()); contexts.set(id, useHostPlatform()); return null; }
  const a = { menuId: 'home', params: {}, query: period };
  function Panes() {
    const [screen, setScreen] = useState(a);
    const [selected, setSelected] = useState('a');
    const [present, setPresent] = useState(true);
    echo = setScreen; select = setSelected; remove = () => setPresent(false); recreate = () => { setScreen(a); setPresent(true); };
    return <PaneQueryDraftProvider screens={{ a: present ? screen : null, b: a }}>
      {present && <PaneScreenProvider paneId="a" screen={screen} onChange={updates} onLeave={() => {}}><Reader id="a" /></PaneScreenProvider>}
      <PaneScreenProvider paneId="b" screen={a} onChange={updates} onLeave={() => {}}><Reader id="b" /></PaneScreenProvider>
      <PaneScreenProvider key={selected} paneId={selected} screen={selected === 'a' ? screen : a} onChange={updates} onLeave={() => {}} countUsage={false}><Reader id="editor" /></PaneScreenProvider>
    </PaneQueryDraftProvider>;
  }
  const session = testSession(['platform:view']);
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })}><Panes /></PlatformProvider></I18nProvider>);
  act(() => seen.get('a')!.setDraftPage({ filter: 'edited' }));
  expect(seen.get('editor')!.draft.page).toEqual([['filter', 'edited']]);
  expect(seen.get('b')!.draft.page).toEqual([]);
  act(() => { seen.get('a')!.apply(); seen.get('editor')!.apply(); });
  expect(updates).toHaveBeenCalledTimes(1);
  expect(updates.mock.calls[0][1]).toBe('push');
  expect(seen.get('a')!.applying).toBe(true);
  await act(async () => {});
  expect(seen.get('a')!.applying).toBe(false);
  act(() => seen.get('editor')!.apply());
  expect(updates).toHaveBeenCalledTimes(1);
  act(() => seen.get('editor')!.setDraftPage({ filter: 'after click' }));
  act(() => select('b'));
  act(() => select('a'));
  expect(seen.get('editor')!.draft.page).toEqual([['filter', 'after click']]);
  act(() => echo(updates.mock.calls[0][0]));
  expect(seen.get('a')!.applying).toBe(false);
  expect(seen.get('a')!.draft.page).toEqual([['filter', 'after click']]);
  act(() => contexts.get('a')!.setPage({ filter: 'external' }));
  act(() => echo(updates.mock.calls[1][0]));
  expect(seen.get('editor')!.draft.page).toEqual([['filter', 'external']]);
  act(() => select('b'));
  act(() => remove());
  act(() => recreate());
  expect(seen.get('a')!.draft.page).toEqual([]);
});
it('keeps reset-key edits after acknowledging a second ordinary Apply with an intervening page edit', () => {
  const session = testSession(['platform:view']);
  const changed = vi.fn();
  let echo!: (value: PaneScreen) => void;
  function Pane() {
    const [value, setValue] = useState<PaneScreen>({ menuId: 'home', params: {}, query: period }); echo = setValue;
    return <PaneQueryDraftProvider screens={{ one: value }}><PaneScreenProvider paneId="one" screen={value} onChange={changed} onLeave={() => {}}><Probe /></PaneScreenProvider></PaneQueryDraftProvider>;
  }
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })}><Pane /></PlatformProvider></I18nProvider>);
  act(() => { draft.setDraftPage({ filter: 'first' }); draft.apply(); });
  expect(changed).toHaveBeenCalledTimes(1);
  act(() => echo(changed.mock.calls[0][0]));
  act(() => { draft.setDraftGlobal({ from: '2026-09-24T09:00:00' }); draft.apply(); });
  expect(changed).toHaveBeenCalledTimes(2);
  act(() => draft.setDraftPage({ filter: 'after click' }));
  act(() => echo(changed.mock.calls[1][0]));
  expect(draft.draft.global.from).toBe('2026-09-24T09:00:00');
  expect(platform.global.from).toBe('2026-09-24T09:00:00');
  act(() => draft.setDraftPage({ page: '7' }));
  expect(draft.draft.page).toEqual([['filter', 'after click'], ['page', '7']]);
});
it.each(['', '?v=1&extra=value', '?scopeId=MEM', '?filter=value', '?ppid=unsupported', period, '?from=2026-09-25T09:00:00', '?from=bad&to=worse'])('derives pane execution from the applied address %s', async search => {
  const session = testSession(['platform:view']);
  const send = vi.fn(async () => ({ outcome: 'ok' as const, data: 7, assessments: [], trust: null, correlationId: 'result' }));
  const changed = vi.fn();
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session, menuQuery: send })}>
    <PaneQueryDraftProvider screens={{ a: { menuId: 'home', params: {}, query: search } }}>
      <PaneScreenProvider paneId="a" screen={{ menuId: 'home', params: {}, query: search }} onChange={changed} onLeave={() => {}}><Probe /></PaneScreenProvider>
    </PaneQueryDraftProvider>
  </PlatformProvider></I18nProvider>);
  await waitFor(() => expect(query.status).toBe(search === period ? 'done' : 'idle'));
  expect(send).toHaveBeenCalledTimes(search === period ? 1 : 0);
  expect(changed).not.toHaveBeenCalled();
});
it('keeps auxiliary requests accessible while menu fetch, refetch and invalidation cannot open the apply gate', async () => {
  let fetcher: ReturnType<typeof useMenuFetch<{}, number>>;
  const auxiliary = vi.fn(async () => ({ outcome: 'ok' as const, data: 1, assessments: [], trust: null, correlationId: 'aux' }));
  function Requests() { fetcher = useMenuFetch(endpoint); usePlatformQuery(auxiliary); useEntityQuery({ type: 'metric', id: 'm', scopeId: null }); return <Probe />; }
  const session = testSession(['platform:view']);
  const menuQuery = vi.fn(); const getEntity = vi.fn(auxiliary);
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session, menuQuery, getEntity })}><Requests /></PlatformProvider></I18nProvider>);
  expect(fetcher!.ready).toBe(false);
  expect(await fetcher!.fetch({})).toMatchObject({ outcome: 'error', message: expect.stringContaining('not_ready') });
  act(() => { query.refetch(); platform.refreshEpochs.bump([endpoint.id]); });
  await waitFor(() => expect(auxiliary).toHaveBeenCalledTimes(2));
  expect(query).toMatchObject({ status: 'idle', response: null, completedAt: null });
  expect(menuQuery).not.toHaveBeenCalled();
});
it('clears timestamps and aborts when the gate closes at the same projection, ignoring late results', async () => {
  const requiredMenu = { ...menu, query: { mode: 'apply' as const, required: { page: [{ key: 'filter', label: { ko: '조건', en: 'Filter' } }] } } };
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [requiredMenu] });
  let resolve: (value: ApiResponse<number>) => void;
  let signal: AbortSignal | undefined;
  mount('/' + period + '&filter=ready', chosen, { menuQuery: (_request, inputSignal) => { signal = inputSignal; return new Promise(r => { resolve = r; }); } });
  act(() => platform.setPage({ filter: null }));
  expect(signal?.aborted).toBe(true);
  expect(query).toMatchObject({ status: 'idle', response: null, completedAt: null });
  await act(async () => resolve({ outcome: 'ok', data: 99, assessments: [], trust: null, correlationId: 'late' }));
  expect(query.response).toBeNull();
});
const settle = settleQueries;
it('keeps completedAt while refreshing and stamps every accepted terminal envelope', async () => {
  const responses: ((response: ApiResponse<number>) => void)[] = [];
  mount('/' + period, registry, { menuQuery: () => new Promise(resolve => responses.push(resolve)) });
  await act(async () => responses[0]({ outcome: 'ok', data: 1, assessments: [], trust: null, correlationId: 'first' }));
  await settle(); // ADR-0086: observers are notified after a macrotask
  const completedAt = query.completedAt;
  act(() => query.refetch());
  await settle();
  expect(query.status).toBe('refreshing');
  expect(query.response?.data).toBe(1);
  expect(query.completedAt).toBe(completedAt);
  await act(async () => responses[1]({ outcome: 'timeout', data: null, assessments: [], trust: null, correlationId: 'timeout' }));
  await settle();
  expect(query.status).toBe('done');
  expect(query.completedAt).toEqual(expect.any(Number));
  act(() => platform.setGlobal({ from: '2026-09-24T09:00:00' }));
  expect(query.response).toBeNull();
  expect(query.completedAt).toBeNull();
});

it('resolves id-only draft metrics before a single apply, and refuses unknown/unpublished selections', async () => {
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{ ...menu, initializesMetric: true }] });
  const pointers = [{ metricId: 'known', publishedVersion: '3' }, { metricId: 'unpublished', publishedVersion: null }];
  mount('/', chosen, { publishedMetrics: () => pointers });
  act(() => draft.setDraftGlobal({ metricId: 'known' }));
  expect(draft.draft.global).toMatchObject({ metricId: 'known', metricVersion: '3' });
  expect(() => draft.setDraftGlobal({ metricId: 'unpublished', metricVersion: null })).toThrow(/unpublished/);
  expect(() => draft.setDraftGlobal({ metricId: 'missing', metricVersion: null })).toThrow(/unknown_metric/);
  act(() => draft.apply());
  expect(platform.global).toMatchObject({ metricId: 'known', metricVersion: '3' });
});
it('confirms an id-only metric deep link without applying a default period', async () => {
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{ ...menu, initializesMetric: true }] });
  const { send } = mount('/?metricId=known', chosen, { publishedMetrics: () => [{ metricId: 'known', publishedVersion: '3' }] });
  await waitFor(() => expect(platform.metricInit.phase).toBe('skip'));
  expect(platform.global).toMatchObject({ metricId: 'known', metricVersion: '3', from: null, to: null });
  expect(draft.draft.global.from).toBe('2026-09-25T09:00:00');
  expect(query.status).toBe('idle');
  expect(send).not.toHaveBeenCalled();
});
it('requires every mapped Context field, treats explicit empty sets as present, and validates Scope before Apply', async () => {
  const allApply = Object.fromEntries(Object.keys(noContext).map(key => [key, 'apply'])) as typeof menu.context;
  const context = Object.keys(noContext) as (keyof typeof noContext)[];
  const requiredMenu = { ...menu, requiresScope: true, context: allApply, query: { mode: 'apply' as const, required: { context } } };
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [requiredMenu] });
  mount('/?scopeId=MEM', chosen);
  expect(draft.canApply).toBe(false);
  expect(draft.missing.map(item => item.key)).toEqual(['roomNames', 'line', 'prcGroup', 'condition', 'selection', 'lot', 'ppid', 'recipe', 'metric']);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(() => draft.setDraftGlobal({ condition: { unknown: ['value'] } })).toThrow(/invalid_condition/);
  act(() => draft.setDraftGlobal({ roomNames: [], lineNames: [], prcGroups: [], selection: [], lotIds: [], ppid: 'p', recipeIds: [], metricId: 'm', metricVersion: '1' }));
  expect(draft.missing.map(item => item.key)).toEqual(['condition']);
});
it('live mode mirrors applied values and setters write through, with no draft actions', async () => {
  const { query: _query, ...live } = menu;
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [live] });
  mount('/' + period, chosen);
  await waitFor(() => expect(query.status).toBe('done'));
  expect(draft.mode).toBe('live');
  act(() => draft.setDraftPage({ filter: 'immediate' }));
  expect(platform.pageParam('filter')).toBe('immediate');
  expect(draft.dirty).toEqual([]);
  const applied = platform.url;
  act(() => { draft.apply(); draft.revert(); draft.reset(); });
  expect(platform.url).toBe(applied);
});

it('does not resurrect an old result when a required-page gate reopens at the same projected identity', async () => {
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{ ...menu, query: { mode: 'apply', required: { page: [{ key: 'filter', label: { ko: '조건', en: 'Filter' } }] } } }] });
  let resolve: (response: ApiResponse<number>) => void;
  mount('/' + period + '&filter=one', chosen, { menuQuery: () => new Promise(r => { resolve = r; }) });
  await act(async () => resolve({ outcome: 'ok', data: 42, assessments: [], trust: null, correlationId: 'old' }));
  act(() => platform.setPage({ filter: null }));
  expect(query.status).toBe('idle');
  act(() => platform.setPage({ filter: 'two' }));
  expect(query.response).toBeNull();
  expect(query.completedAt).toBeNull();
  expect(query.status).toBe('loading');
});

it.each(['main', 'pane'] as const)('keeps a %s deep link with missing required values idle', async kind => {
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{ ...menu, query: { mode: 'apply', required: { page: [{ key: 'filter', label: menu.label }] } } }] });
  const send = vi.fn();
  if (kind === 'main') mount('/' + period, chosen, { menuQuery: send });
  else {
    const session = testSession(['platform:view']);
    const screen = { menuId: 'home', params: {}, query: period };
    window.history.replaceState(null, '', '/');
    render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session, menuQuery: send })}>
      <PaneQueryDraftProvider screens={{ a: screen }}><PaneScreenProvider paneId="a" screen={screen} onChange={() => {}} onLeave={() => {}}><Probe /></PaneScreenProvider></PaneQueryDraftProvider>
    </PlatformProvider></I18nProvider>);
  }
  expect(query.status).toBe('idle');
  expect(query.missing).toEqual([{ key: 'filter', label: menu.label }]);
  expect(send).not.toHaveBeenCalled();
});

it('uses applied values for links and return origins, while drill remains an immediate single push', async () => {
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{ ...menu, pageKeys: [...menu.pageKeys, 'returnTo'], contextResetKeys: ['filter', 'page'], drill: { levels: [{ key: 'filter', label: menu.label }, { key: 'page', label: menu.label }] } }] });
  let drill: ReturnType<typeof useDrill>;
  function Drilling() { drill = useDrill(); return <Probe />; }
  window.history.replaceState(null, '', '/' + period + '&filter=applied&page=2');
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session })}><Drilling /></PlatformProvider></I18nProvider>);
  act(() => draft.setDraftGlobal({ from: '2026-09-24T09:00:00' }));
  const applied = platform.url;
  const href = platform.linkTo('home', { returnTo: true });
  expect(href).toBe(platform.resolveLink('home', { returnTo: true }).href);
  expect(new URL(href, window.location.origin).searchParams.get('from')).toBe('2026-09-25T09:00:00');
  expect(new URL(href, window.location.origin).searchParams.get('returnTo')).toBe(applied);
  const push = vi.spyOn(window.history, 'pushState');
  act(() => drill.enter('filter', 'drilled'));
  expect(push).toHaveBeenCalledTimes(1);
  expect(platform.pageParam('page')).toBeNull();
  expect(draft.dirty).toEqual([]);
  push.mockRestore();
  act(() => platform.navigate(href));
  act(() => draft.setDraftGlobal({ from: '2026-09-23T09:00:00' }));
  expect(platform.returnOrigin().href).toBe(applied);
});

it('discards drafts and old completions on session-generation replacement, then ignores an unmounted Apply', async () => {
  let session = testSession(['platform:view']);
  const listeners = new Set<() => void>();
  let resolve: (response: ApiResponse<number>) => void;
  const { view } = mount('/' + period, registry, { session: () => session, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, menuQuery: () => new Promise(r => { resolve = r; }) });
  await act(async () => resolve({ outcome: 'ok', data: 1, assessments: [], trust: null, correlationId: 'old' }));
  act(() => draft.setDraftPage({ filter: 'private draft' }));
  act(() => { session = { ...session }; listeners.forEach(fn => fn()); });
  expect(draft.draft.page).toEqual([]);
  expect(query.response).toBeNull();
  expect(query.completedAt).toBeNull();
  act(() => draft.setDraftPage({ filter: 'after switch' }));
  const apply = draft.apply;
  const before = window.location.href;
  view.unmount();
  act(apply);
  expect(window.location.href).toBe(before);
});

it('timestamps synthesized rejection envelopes and keeps that timestamp through invalidation', async () => {
  let reject: (error: Error) => void;
  mount('/' + period, registry, { menuQuery: () => new Promise((_resolve, fail) => { reject = fail; }) });
  await act(async () => reject(new Error('adapter failure')));
  await settle(); // ADR-0086: observers are notified after a macrotask
  expect(query.response).toMatchObject({ outcome: 'error', message: 'Error: adapter failure' });
  expect(query.completedAt).toEqual(expect.any(Number));
  const completedAt = query.completedAt;
  act(() => platform.refreshEpochs.bump([endpoint.id]));
  await settle();
  expect(query.status).toBe('refreshing');
  expect(query.completedAt).toBe(completedAt);
});

it('confirms a delayed pane metric echo without applying its default period', async () => {
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{ ...menu, initializesMetric: true }] });
  const screen = { menuId: 'home', params: {}, query: '?metricId=known' };
  const changes = vi.fn();
  let echo: (value: PaneScreen) => void;
  function Pane() {
    const [value, setValue] = useState(screen); echo = setValue;
    return <PaneQueryDraftProvider screens={{ a: value }}><PaneScreenProvider paneId="a" screen={value} onChange={changes} onLeave={() => {}}><Probe /></PaneScreenProvider></PaneQueryDraftProvider>;
  }
  const session = testSession(['platform:view']);
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session, publishedMetrics: () => [{ metricId: 'known', publishedVersion: '3' }] })}><Pane /></PlatformProvider></I18nProvider>);
  expect(platform.metricInit.phase).toBe('confirm');
  expect(changes).toHaveBeenCalledTimes(1);
  act(() => echo(changes.mock.calls[0][0]));
  expect(platform.metricInit.phase).toBe('skip');
  expect(platform.global).toMatchObject({ metricId: 'known', metricVersion: '3', from: null, to: null });
  expect(query.status).toBe('idle');
  expect(draft.draft.global.from).toBe('2026-09-25T09:00:00');
});

it('normalizes injected Condition order and refuses asOf for an axis without membership history', () => {
  const session = testSession(['platform:view']);
  window.history.replaceState(null, '', '/' + period);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })}
    equipmentAxes={[{ id: 'a', label: menu.label, membershipHistory: true }, { id: 'b', label: menu.label, membershipHistory: false }]}><Probe /></PlatformProvider></I18nProvider>);
  act(() => { draft.setDraftGlobal({ condition: { a: ['two', 'one'], b: ['three'] } }); draft.apply(); });
  act(() => { draft.setDraftPage({ page: '3' }); draft.apply(); });
  act(() => draft.setDraftGlobal({ condition: { b: ['three'], a: ['one', 'two', 'one'] } }));
  expect(draft.dirty).toEqual([]);
  expect(draft.draft.page).toEqual([['page', '3']]);
  expect(() => draft.setDraftGlobal({ membershipBasis: 'asOf' })).toThrow(/membership_basis_unsupported/);
  expect(draft.draft.global.membershipBasis).toBeNull();
});

// Condition presets (06 §6.4, ADR-0083): a preset narrows the request, never the global Condition or the URL.
const presetAxes = ['stgroup', 'team', 'maker', 'model'].map(id => ({ id, label: { ko: id, en: id }, membershipHistory: false }));
const presetFields = {
  pageKeys: ['view'],
  conditionPresets: [
    { id: 'a', label: { ko: 'A', en: 'A' }, axes: ['stgroup', 'team'] },
    { id: 'b', label: { ko: 'B', en: 'B' }, axes: ['maker', 'model'] },
  ],
  conditionPreset: { key: 'view', default: 'a' },
};
const presetEndpoint = (context: Parameters<typeof defineEndpoint>[0]['context']) => defineEndpoint<{}, number>({ id: 'fixture.preset', menuId: 'home', permission: 'platform:view', requiresScope: false, context, paramKeys: {}, kinds: [], mergeTimeDomain: false });
const groupParam = (condition: Record<string, string[]>) => `&equipmentGroup=${encodeURIComponent(JSON.stringify(condition))}`;
const fullCondition = { maker: ['M1'], model: ['X1'], team: ['T1'] };
let presetQuery: ReturnType<typeof useMenuQuery<{}, number>>;
let presetView: ReturnType<typeof useConditionPreset>;
function mountPreset(chosenMenu: typeof menu & Partial<typeof presetFields>, spec: ReturnType<typeof presetEndpoint>, url: string) {
  function PresetProbe() { draft = useQueryDraft(); platform = useHostPlatform(); presetQuery = useMenuQuery(spec, {}); presetView = useConditionPreset(); return null; }
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [chosenMenu] });
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  const send = vi.fn(async (_request: { context: { condition?: unknown } }) => ({ outcome: 'ok' as const, data: 7, assessments: [], trust: null, correlationId: 'result' }));
  render(<I18nProvider><PlatformProvider registry={chosen} equipmentAxes={presetAxes} adapter={testAdapter({ session: () => session, menuQuery: send as never })}><PresetProbe /></PlatformProvider></I18nProvider>);
  return { send };
}
const sentConditions = (send: ReturnType<typeof mountPreset>['send']) => send.mock.calls.map(([request]) => request.context.condition);
const urlCondition = () => JSON.parse(new URLSearchParams(window.location.search).get('equipmentGroup') ?? 'null');

it('apply mode: switching a Condition preset queries nothing, Apply queries once with only that preset\'s axes, and the Condition stays whole', async () => {
  const presetMenu = { ...menu, ...presetFields, pageKeys: [...menu.pageKeys, ...presetFields.pageKeys], context: { ...menu.context, condition: 'apply' as const } };
  const { send } = mountPreset(presetMenu, presetEndpoint({ time: 'apply', condition: 'apply' }), '/' + period + groupParam(fullCondition));
  await waitFor(() => expect(presetQuery.status).toBe('done'));
  expect(sentConditions(send)).toEqual([{ team: ['T1'] }]);
  const mounted = send.mock.calls.length;
  expect(presetView).toMatchObject({ key: 'view', activeId: 'a', appliedId: 'a', outsideAxes: ['maker', 'model'] });
  act(() => draft.setDraftPage({ view: 'b' }));
  expect(presetView).toMatchObject({ activeId: 'b', appliedId: 'a', outsideAxes: ['stgroup', 'team'] });
  expect(send.mock.calls.length - mounted).toBe(0);
  act(() => draft.apply());
  await waitFor(() => expect(platform.pageParam('view')).toBe('b'));
  await waitFor(() => expect(presetQuery.status).toBe('done'));
  expect(send.mock.calls.length - mounted).toBe(1);
  expect(sentConditions(send).at(-1)).toEqual({ maker: ['M1'], model: ['X1'] });
  expect(platform.global.condition).toEqual(fullCondition);
  expect(urlCondition()).toEqual(fullCondition);
});

it('live mode: an axis outside the active preset neither reaches the request nor refetches; switching the preset refetches once', async () => {
  const { query: _applyOnly, ...liveMenu } = menu;
  const presetMenu = { ...liveMenu, ...presetFields, pageKeys: [...menu.pageKeys, ...presetFields.pageKeys], context: { ...menu.context, condition: 'apply' as const } };
  const { send } = mountPreset(presetMenu as never, presetEndpoint({ condition: 'apply' }), '/?v=1' + groupParam(fullCondition));
  await waitFor(() => expect(presetQuery.status).toBe('done'));
  expect(sentConditions(send)).toEqual([{ team: ['T1'] }]);
  const mounted = send.mock.calls.length;
  act(() => platform.setGlobal({ condition: { ...fullCondition, maker: ['M2'] } }));
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  expect(send.mock.calls.length - mounted).toBe(0);
  expect(urlCondition()).toEqual({ ...fullCondition, maker: ['M2'] });
  act(() => draft.setDraftPage({ view: 'b' }));
  await waitFor(() => expect(send.mock.calls.length - mounted).toBe(1));
  expect(sentConditions(send).at(-1)).toEqual({ maker: ['M2'], model: ['X1'] });
  expect(platform.global.condition).toEqual({ ...fullCondition, maker: ['M2'] });
  expect(urlCondition()).toEqual({ ...fullCondition, maker: ['M2'] });
});

it('a menu without presets sends the whole Condition', async () => {
  const plain = { ...menu, context: { ...menu.context, condition: 'apply' as const } };
  const { send } = mountPreset(plain, presetEndpoint({ time: 'apply', condition: 'apply' }), '/' + period + groupParam(fullCondition));
  await waitFor(() => expect(presetQuery.status).toBe('done'));
  expect(sentConditions(send)).toEqual([fullCondition]);
  expect(presetView).toBeNull();
});
