import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { defineEndpoint, buildQuery, emptyGlobal, type QueryHistoryEntry, type QueryHistoryStore } from '@ap/contracts';
import { useState } from 'react';
import { useMenuQuery } from './query';
import { PaneQueryDraftProvider, PaneScreenProvider, type PaneScreen, PlatformProvider, usePlatform } from './platform';
import { useQueryHistory } from './query-history';
import { createRegistry } from './registry';
import { noContext, testAdapter, testSession, testSpace } from './testing';
import { I18nProvider } from './i18n';
const menu = { id: 'home', group: 'overview' as const, primary: true, path: '/', icon: House, label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, features: { export: false, savedView: false, annotate: false, compare: false, board: true }, pageKeys: ['filter', 'page'], contextResetKeys: ['page'], query: { mode: 'apply' as const } };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: 'overview', label: menu.label, icon: House, space: 'analytics' }], menus: [menu] });
const global = { ...emptyGlobal, from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' };
const entry = (query = buildQuery(global, [['filter', 'old']])): QueryHistoryEntry => ({ id: 'one', query, schemaVersion: 1, count: 1, lastAppliedAt: 1 });
const endpoint = defineEndpoint<{}, null>({ id: 'fixture.history', menuId: 'home', permission: 'platform:view', requiresScope: false, context: { time: 'apply' }, paramKeys: {}, kinds: [], mergeTimeDomain: false });
let history: ReturnType<typeof useQueryHistory>;
let screen: ReturnType<typeof usePlatform>;
function Probe() { history = useQueryHistory(); screen = usePlatform(); useMenuQuery(endpoint, {}); return <p>{history.entries.map(e => e.status === 'ready' ? e.candidate.page.map(p => p[1]).join() : e.status).join()}</p>; }
function mount(entries: QueryHistoryEntry[], url = '/') {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  const store: QueryHistoryStore = { list: vi.fn(async () => entries), record: vi.fn(async () => {}), remove: vi.fn(async () => {}), clear: vi.fn(async () => {}) };
  const send = vi.fn(async () => ({ outcome: 'empty' as const, data: null, assessments: [], trust: null, correlationId: 'test' }));
  const adapter = testAdapter({ session: () => session, menuQuery: send });
  const view = render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} queryHistory={store}><Probe /></PlatformProvider></I18nProvider>);
  return { store, adapter, view, send };
}
afterEach(cleanup);
it('restores newest bare-route history only to draft and records once after explicit Apply acknowledgement', async () => {
  const { store, send } = mount([entry()]);
  await waitFor(() => expect(screen.queryDraft.draft.page).toEqual([['filter', 'old']]));
  expect(screen.global.from).toBeNull();
  expect(screen.page).toEqual([]);
  expect(window.location.search).toBe('');
  expect(store.record).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  act(() => screen.queryDraft.apply());
  await waitFor(() => expect(store.record).toHaveBeenCalledTimes(1));
  expect(send).toHaveBeenCalledTimes(1);
  expect(store.record).toHaveBeenCalledWith({ userId: screen.user.id, menuId: 'home', scopeId: null }, expect.objectContaining({ count: 1, query: buildQuery(global, [['filter', 'old']]) }));
});
it.each([
  ['bad period', '?v=1&from=bad&to=worse'],
  ['unknown axis', buildQuery({ ...global, condition: { missing: ['PRIVATE'] } })],
  ['cross Scope', buildQuery({ ...global, scopeId: 'other' })],
  ['stale page key', buildQuery(global, [['removed', 'PRIVATE']])],
  ['returnTo', buildQuery(global, [], [['returnTo', '/secret']])],
  ['incomplete metric', buildQuery({ ...global, metricId: 'metric' })],
  ['revoked room', buildQuery({ ...global, roomNames: ['PRIVATE'] })],
])('keeps %s unavailable without partial draft writes', async (_name, query) => {
  const { view } = mount([entry(query)]);
  await waitFor(() => expect(history.entries[0]?.status).toBe('unavailable'));
  const before = screen.queryDraft.draft;
  expect(await history.restore(history.entries[0])).toBe(false);
  expect(screen.queryDraft.draft).toEqual(before);
  expect(view.container.innerHTML).not.toContain('PRIVATE');
  expect(screen.global.from).toBeNull();
});
it.each(['?filter=explicit', '?ppid=carried', '?from=bad', buildQuery(global)])('does not replace explicit applied address %s with history', async url => {
  mount([entry()], '/' + url);
  await waitFor(() => expect(history.status).toBe('ready'));
  expect(screen.queryDraft.draft.page).not.toContainEqual(['filter', 'old']);
});
it('restores page reset keys atomically across a changed global and clears absent old keys', async () => {
  mount([entry(buildQuery(global, [['page', '7']]))], '/' + buildQuery({ ...global, from: '2026-08-01T00:00:00' }, [['filter', 'discard']]));
  await waitFor(() => expect(history.status).toBe('ready'));
  act(() => history.open());
  await waitFor(() => expect(history.entries[0]?.status).toBe('ready'));
  await act(async () => { expect(await history.restore(history.entries[0])).toBe(true); });
  expect(screen.queryDraft.draft.page).toEqual([['page', '7']]);
  expect(screen.page).toEqual([['filter', 'discard']]);
  act(() => screen.queryDraft.apply());
  expect(screen.page).toEqual([['page', '7']]);
});
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
it.each(['edit-undone', 'reset', 'revert'] as const)('delayed lookup never overwrites a %s interaction', async action => {
  const pending = deferred<readonly QueryHistoryEntry[]>();
  const store = { list: vi.fn(() => pending.promise), record: vi.fn(async () => {}), remove: vi.fn(async () => {}), clear: vi.fn(async () => {}) };
  const session = testSession(['platform:view']); window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} queryHistory={store}><Probe /></PlatformProvider></I18nProvider>);
  act(() => {
    if (action === 'edit-undone') { screen.queryDraft.setDraftPage({ filter: 'edit' }); screen.queryDraft.setDraftPage({ filter: null }); }
    else screen.queryDraft[action]();
  });
  await act(async () => pending.resolve([entry()]));
  await waitFor(() => expect(history.status).toBe('ready'));
  expect(screen.queryDraft.draft.page).toEqual([]);
});
it('masks old rows during a user replacement and rejects captured old actions and list completions', async () => {
  const a = testSession(['platform:view']); const b = { ...a, user: { ...a.user, id: 'B' } }; let session = a;
  const listeners = new Set<() => void>(); const late = deferred<readonly QueryHistoryEntry[]>();
  const store: QueryHistoryStore = { list: vi.fn(key => key.userId === b.user.id ? Promise.resolve([]) : late.promise), record: vi.fn(async () => {}), remove: vi.fn(async () => {}), clear: vi.fn(async () => {}) };
  const adapter = testAdapter({ session: () => session, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } });
  window.history.replaceState(null, '', '/');
  const view = render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} queryHistory={store}><Probe /></PlatformProvider></I18nProvider>);
  const stale = history;
  act(() => { session = b; listeners.forEach(listener => listener()); });
  expect(view.container.innerHTML).not.toContain('old');
  await act(async () => { late.resolve([entry()]); await stale.clear(); await stale.remove('one'); });
  await waitFor(() => expect(history.status).toBe('ready'));
  expect(history.entries).toEqual([]);
  expect(store.remove).not.toHaveBeenCalled(); expect(store.clear).not.toHaveBeenCalled();
  expect(screen.queryDraft.draft.page).toEqual([]);
});
it.each(['list', 'record', 'remove', 'clear'] as const)('exposes a rejected %s as unavailable while ordinary Apply still works', async method => {
  const store: QueryHistoryStore = { list: vi.fn(async () => [entry()]), record: vi.fn(async () => {}), remove: vi.fn(async () => {}), clear: vi.fn(async () => {}) };
  store[method] = vi.fn(async () => { throw new Error('PRIVATE'); });
  const session = testSession(['platform:view']); window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} queryHistory={store}><Probe /></PlatformProvider></I18nProvider>);
  if (method !== 'list') {
    await waitFor(() => expect(history.status).toBe('ready'));
    await act(async () => {
      if (method === 'record') screen.queryDraft.apply();
      else if (method === 'clear') await history.clear();
      else await history.remove('one');
    });
  }
  await waitFor(() => expect(history.status).toBe('unavailable'));
  act(() => { screen.queryDraft.setDraftPage({ filter: 'still works' }); screen.queryDraft.apply(); });
  expect(screen.page).toEqual([['filter', 'still works']]);
});
it('refreshes the open history list after an acknowledged record', async () => {
  const items: QueryHistoryEntry[] = [];
  const store: QueryHistoryStore = { list: async () => [...items], record: async (_key, item) => { items.push(item); }, remove: async () => {}, clear: async () => {} };
  const session = testSession(['platform:view']); window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} queryHistory={store}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(history.status).toBe('ready'));
  act(() => { history.open(); screen.queryDraft.setDraftPage({ filter: 'new-record' }); screen.queryDraft.apply(); });
  await waitFor(() => expect(history.entries[0]?.status).toBe('ready'));
  expect(history.entries[0].status === 'ready' && history.entries[0].candidate.page).toEqual([['filter', 'new-record']]);
});
it.each(['forbidden', 'not_found', 'throw', 'ok'] as const)('authorizes a listed EquipmentID as %s before exposing values or restoring', async outcome => {
  const scoped = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{ ...menu, requiresScope: true }] });
  const session = testSession(['platform:view']);
  const pending = deferred<Awaited<ReturnType<ReturnType<typeof testAdapter>['resolveSelection']>>>();
  const resolve = vi.fn(() => pending.promise);
  const list = [entry(buildQuery({ ...global, scopeId: 'MEM', roomNames: ['PHOTO'], selection: ['PRIVATE-ID'] }, [['filter', 'PRIVATE-VALUE']]))];
  const store: QueryHistoryStore = { list: async () => list, record: async () => {}, remove: async () => {}, clear: async () => {} };
  window.history.replaceState(null, '', '/' + buildQuery({ ...global, scopeId: 'MEM' }));
  const view = render(<I18nProvider><PlatformProvider registry={scoped} adapter={testAdapter({ session: () => session, validateScope: async () => ({ status: 'valid', grantedRooms: ['PHOTO'] }), resolveSelection: resolve })} queryHistory={store}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(screen.scope.status).toBe('valid'));
  await waitFor(() => expect(history.status).toBe('ready'));
  act(() => history.open());
  await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
  expect(history.entries[0].status).toBe('loading');
  expect(view.container.innerHTML).not.toContain('PRIVATE');
  await act(async () => {
    if (outcome === 'throw') pending.resolve(Promise.reject(new Error('PRIVATE')) as never);
    else pending.resolve({ items: outcome === 'ok' ? [{ id: 'PRIVATE-ID', status: 'ok', summary: { equipmentId: 'PRIVATE-ID', room: 'PHOTO', axes: {} } }] : [{ id: 'PRIVATE-ID', status: outcome }] });
  });
  await waitFor(() => expect(history.entries[0].status).toBe(outcome === 'ok' ? 'ready' : 'unavailable'));
  if (outcome !== 'ok') { expect(view.container.innerHTML).not.toContain('PRIVATE'); expect(await history.restore(history.entries[0])).toBe(false); }
});
it('masks an open history on same-user revision change and rejects a pending authorization and captured restore', async () => {
  const scoped = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{ ...menu, requiresScope: true }] });
  const session = testSession(['platform:view']); const listeners = new Set<() => void>();
  let rooms = ['PHOTO'];
  const store: QueryHistoryStore = { list: async () => [entry(buildQuery({ ...global, scopeId: 'MEM', roomNames: ['PHOTO'] }, [['filter', 'PRIVATE']]))], record: async () => {}, remove: vi.fn(async () => {}), clear: async () => {} };
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const view = render(<I18nProvider><PlatformProvider registry={scoped} adapter={testAdapter({ session: () => session, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, validateScope: async () => ({ status: 'valid', grantedRooms: rooms }) })} queryHistory={store}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(history.entries[0]?.status).toBe('ready'));
  const oldHistory = history; const oldRow = history.entries[0];
  act(() => { rooms = []; listeners.forEach(listener => listener()); });
  expect(view.container.innerHTML).not.toContain('PRIVATE');
  await act(async () => { expect(await oldHistory.restore(oldRow)).toBe(false); await oldHistory.remove('one'); });
  expect(store.remove).not.toHaveBeenCalled();
  await waitFor(() => expect(history.entries[0]?.status).toBe('unavailable'));
});
it.each(['acknowledge', 'supersede', 'throw'] as const)('records the captured click candidate exactly once with delayed pane commit: %s', async scenario => {
  const session = testSession(['platform:view']);
  const record = vi.fn(async () => {}); const changed = vi.fn();
  const store: QueryHistoryStore = { list: async () => [], record, remove: async () => {}, clear: async () => {} };
  let echo!: (value: PaneScreen) => void;
  function Pane() {
    const [value, setValue] = useState<PaneScreen>({ menuId: 'home', params: {}, query: '' }); echo = setValue;
    return <PaneQueryDraftProvider screens={{ one: value }}><PaneScreenProvider paneId="one" screen={value} onChange={next => { if (scenario === 'throw') throw new Error('commit failed'); changed(next); }} onLeave={() => {}}><Probe /></PaneScreenProvider></PaneQueryDraftProvider>;
  }
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} queryHistory={store}><Pane /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(history.status).toBe('ready'));
  act(() => screen.queryDraft.setDraftPage({ filter: 'clicked' }));
  if (scenario === 'throw') { act(() => expect(() => screen.queryDraft.apply()).toThrow('commit failed')); expect(record).not.toHaveBeenCalled(); return; }
  act(() => screen.queryDraft.apply());
  act(() => screen.queryDraft.setDraftPage({ filter: 'after-click' }));
  expect(record).not.toHaveBeenCalled();
  act(() => echo(scenario === 'acknowledge' ? changed.mock.calls[0][0] : { menuId: 'home', params: {}, query: buildQuery(global, [['filter', 'external']]) }));
  await act(async () => {});
  if (scenario === 'acknowledge') {
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]).toEqual([expect.anything(), expect.objectContaining({ query: expect.stringContaining('filter=clicked') })]);
    expect(screen.queryDraft.draft.page).toEqual([['filter', 'after-click']]);
  } else expect(record).not.toHaveBeenCalled();
});

it('rechecks history room grants on revision without revalidating or masking the screen Scope', async () => {
  const scoped = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{ ...menu, requiresScope: true }] });
  const session = testSession(['platform:view']); const listeners = new Set<() => void>();
  let rooms = ['PHOTO'];
  const validateScope = vi.fn(async () => ({ status: 'valid' as const, grantedRooms: rooms }));
  const statuses: string[] = [];
  function ScopeProbe() { const value = usePlatform(); statuses.push(value.scope.status); return <Probe />; }
  const store: QueryHistoryStore = { list: async () => [entry(buildQuery({ ...global, scopeId: 'MEM', roomNames: ['PHOTO'] }))], record: async () => {}, remove: async () => {}, clear: async () => {} };
  const adapter = testAdapter({ session: () => session, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, validateScope });
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const view = render(<I18nProvider><PlatformProvider registry={scoped} adapter={adapter} queryHistory={store}><ScopeProbe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(history.entries[0]?.status).toBe('ready'));
  // The screen and the history check each own one Scope request.
  expect(validateScope).toHaveBeenCalledTimes(2);
  const screenScope = screen.scope;
  statuses.length = 0;
  act(() => { rooms = []; listeners.forEach(listener => listener()); });
  await waitFor(() => expect(history.entries[0]?.status).toBe('unavailable'));
  expect(history.entries[0]).toMatchObject({ reason: 'permission' });
  expect(validateScope).toHaveBeenCalledTimes(3);
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses.every(status => status === 'valid')).toBe(true);
  expect(screen.scope).toBe(screenScope);
  view.unmount();
});
it.each(['scope', 'selection'] as const)('aborts pending history %s checks on revision replacement and unmount', async phase => {
  const scoped = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{ ...menu, requiresScope: true }] });
  const session = testSession(['platform:view']); const listeners = new Set<() => void>();
  const signals: AbortSignal[] = [];
  let scopeCalls = 0;
  const adapter = testAdapter({
    session: () => session,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    validateScope: (_scopeId, signal) => {
      if (!signal) throw new Error('missing Scope abort signal');
      scopeCalls++;
      if (phase === 'scope' && scopeCalls > 1) { signals.push(signal); return new Promise(() => {}); }
      return Promise.resolve({ status: 'valid', grantedRooms: ['PHOTO'] });
    },
    resolveSelection: (_input, signal) => { if (!signal) throw new Error('missing selection abort signal'); signals.push(signal); return new Promise(() => {}); },
  });
  const store: QueryHistoryStore = { list: async () => [entry(buildQuery({ ...global, scopeId: 'MEM', selection: ['PRIVATE-ID'] }))], record: async () => {}, remove: async () => {}, clear: async () => {} };
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const view = render(<I18nProvider><PlatformProvider registry={scoped} adapter={adapter} queryHistory={store}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(signals).toHaveLength(1));
  expect(history.entries[0]?.status).toBe('loading');
  expect(signals[0].aborted).toBe(false);
  act(() => listeners.forEach(listener => listener()));
  expect(signals[0].aborted).toBe(true);
  await waitFor(() => expect(signals).toHaveLength(2));
  expect(signals[1].aborted).toBe(false);
  view.unmount();
  expect(signals[1].aborted).toBe(true);
});

it.each([false, true])('rejects a pending restore after a same-route address rebase (return to original: %s)', async returnToOriginal => {
  const session = testSession(['platform:view']);
  const pending = deferred<{ status: 'valid'; grantedRooms: string[] }>();
  let delay = false;
  const adapter = testAdapter({ session: () => session, validateScope: () => delay ? pending.promise : Promise.resolve({ status: 'valid', grantedRooms: [] }) });
  const applied = { ...global, scopeId: 'MEM' };
  const store: QueryHistoryStore = { list: async () => [entry(buildQuery(applied, [['filter', 'restored']]))], record: async () => {}, remove: async () => {}, clear: async () => {} };
  const original = '/' + buildQuery(applied, [['filter', 'original']]);
  window.history.replaceState(null, '', original);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} queryHistory={store}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(screen.scope.status).toBe('valid'));
  act(() => history.open());
  await waitFor(() => expect(history.entries[0]?.status).toBe('ready'));
  delay = true;
  let restoring!: Promise<boolean>;
  act(() => { restoring = history.restore(history.entries[0]); });
  act(() => { window.history.pushState(null, '', '/' + buildQuery(applied, [['filter', 'external']])); window.dispatchEvent(new PopStateEvent('popstate')); });
  if (returnToOriginal) act(() => { window.history.replaceState(null, '', original); window.dispatchEvent(new PopStateEvent('popstate')); });
  const rebased = screen.queryDraft.draft;
  await act(async () => { pending.resolve({ status: 'valid', grantedRooms: [] }); expect(await restoring).toBe(false); });
  expect(screen.queryDraft.draft).toEqual(rebased);
  expect(screen.queryDraft.draft.page).toEqual([['filter', returnToOriginal ? 'original' : 'external']]);
});

it('preserves restored reset-key provenance after an older pane Apply acknowledgement', async () => {
  const session = testSession(['platform:view']);
  const changed = vi.fn();
  const restored = { ...global, from: '2026-08-01T00:00:00' };
  const store: QueryHistoryStore = { list: async () => [entry(buildQuery(restored, [['page', '7']]))], record: async () => {}, remove: async () => {}, clear: async () => {} };
  let echo!: (value: PaneScreen) => void;
  function Pane() {
    const [value, setValue] = useState<PaneScreen>({ menuId: 'home', params: {}, query: buildQuery(global) }); echo = setValue;
    return <PaneQueryDraftProvider screens={{ one: value }}><PaneScreenProvider paneId="one" screen={value} onChange={changed} onLeave={() => {}}><Probe /></PaneScreenProvider></PaneQueryDraftProvider>;
  }
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} queryHistory={store}><Pane /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(history.status).toBe('ready'));
  act(() => history.open());
  await waitFor(() => expect(history.entries[0]?.status).toBe('ready'));
  act(() => { screen.queryDraft.setDraftPage({ filter: 'clicked' }); screen.queryDraft.apply(); });
  expect(changed).toHaveBeenCalledTimes(1);
  await act(async () => { expect(await history.restore(history.entries[0])).toBe(true); });
  act(() => echo(changed.mock.calls[0][0]));
  expect(screen.queryDraft.draft).toEqual({ global: restored, page: [['page', '7']] });
  act(() => screen.queryDraft.apply());
  expect(changed).toHaveBeenCalledTimes(2);
  expect(changed.mock.calls[1][0].query).toBe(buildQuery(restored, [['page', '7']]));
});
