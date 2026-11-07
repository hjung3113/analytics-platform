import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { buildQuery, carrySetId, emptyGlobal, defineEndpoint, groupId, spaceId, type QueryHistoryStore } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useMenuQuery, useSavedViewSupport, useUnsavedGuard, type MenuPlatform } from '../../index';
import { useHostPlatform, useLeaveRequest, useSavedViews, type HostPlatform } from '../../host';
import { canonicalHistoryQuery } from '../../query/query-history';
import { decodeRecent, readSpaceLast, spaceLastKey } from '../preferences';
import { createFakeSavedViewStore, memoryStorage, noContext, testAdapter, testSavedView, testSession, testSpace } from '../../testing';

const group = { id: groupId('g'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') };
const base = { group: group.id, icon: House, label: group.label, description: { ko: '', en: '' }, permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const, pageKeys: ['q', 'focus', 'returnTo'], features: { export: false, savedView: true, annotate: false, compare: false } };
const menus = [
  { ...base, id: 'home', path: '/mars/home', aliases: ['/legacy-home'], primary: true, carrySet: carrySetId('set') },
  { ...base, id: 'other', path: '/mars/other', carrySet: carrySetId('set') },
  { ...base, id: 'live', path: '/mars/live', context: { ...noContext, time: 'apply' as const } },
  { ...base, id: 'apply', path: '/mars/apply', context: { ...noContext, time: 'apply' as const }, query: { mode: 'apply' as const } },
];
const registry = createRegistry({ spaces: [testSpace()], groups: [group], menus, carrySets: [{ id: carrySetId('set'), pageKeys: ['q'] }] });
const session = testSession(['platform:view']);
const supports = Object.fromEntries(menus.map(menu => [menu.id, { menuId: menu.id, menuSchemaVersion: 1, contextKeys: ['time'] as const, pageKeys: ['q'] }]));
let host: ReturnType<typeof useHostPlatform>;
let views: ReturnType<typeof useSavedViews>;
let leave: ReturnType<typeof useLeaveRequest>;
const endpoint = defineEndpoint<{}, null>({ id: 'fixture.expansion', menuId: 'apply', permission: 'platform:view', requiresScope: false, context: { time: 'apply' }, paramKeys: {}, kinds: [], mergeTimeDomain: false });
function HistoryQuery() { useMenuQuery(endpoint, {}); return null; }
function Probe() {
  host = useHostPlatform();
  useSavedViewSupport(supports[host.route?.menu.id ?? 'home']);
  views = useSavedViews(); leave = useLeaveRequest();
  useUnsavedGuard(host.pageParam('focus') !== null, { leaves: 'address' });
  return host.route?.menu.id === 'apply' ? <HistoryQuery /> : null;
}
const store = () => createFakeSavedViewStore([testSavedView({ id: 'saved', kind: 'menu-view', menuId: 'apply', menuSchemaVersion: 1, page: [], context: { from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' } })]);
function mount(url: string, savedViews = store(), queryHistory?: QueryHistoryStore) {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session, defaultRangeTo: () => '2026-09-02T00:00:00', menuQuery: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'test' }) })} savedViews={savedViews} queryHistory={queryHistory}><Probe /></PlatformProvider></I18nProvider>);
}
const address = () => window.location.pathname + window.location.search;
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); });
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('host-only detail expansion', () => {
  it('restores independently of menu page keys and uses replace without asking the dirty guard', () => {
    mount('/mars/home?v=1&focus=x&expand=1');
    expect(host.detailExpanded).toBe(true);
    expect(host.pageParam('expand')).toBeNull(); expect(host.pageParams('expand')).toEqual([]);
    expect([...host.page, ...host.extras].some(([key]) => key === 'expand')).toBe(false);
    const count = history.length;
    act(() => host.setDetailExpanded(false));
    expect(host.detailExpanded).toBe(false); expect(address()).not.toContain('expand');
    act(() => host.setDetailExpanded(true));
    expect(history.length).toBe(count); expect(leave).toBeNull();
    expect(() => host.setPage({ expand: '1' })).toThrow(/reserved/);
  });
  it('preserves expansion through same-screen page, global and reset writes', () => {
    mount('/mars/home?v=1&expand=1');
    act(() => host.setPage({ q: 'typed' })); expect(host.detailExpanded).toBe(true);
    act(() => host.setGlobal({ ppid: 'P' })); expect(host.detailExpanded).toBe(true);
    act(() => host.resetContext()); expect(host.detailExpanded).toBe(true);
    expect(new URLSearchParams(location.search).get('expand')).toBe('1');
  });
  it('never puts expansion in carry links, return origins, recents or space resume', () => {
    mount('/mars/home?v=1&q=carried&expand=1');
    expect(host.resolveLink('other', { returnTo: true }).href).not.toContain('expand');
    expect(host.resolveLink('other').href).toContain('q=carried');
    expect(host.readRecent().every(row => !row.url.includes('expand'))).toBe(true);
    expect(host.spaceResume(spaceId('mars'))?.href).not.toContain('expand');
    act(() => host.navigate('/mars/other?v=1&expand=1', { replace: true }));
    expect(address()).not.toContain('expand');
  });
  it('ignores expansion on the board and never writes its query there', () => {
    mount('/board?sheet=s&expand=1');
    expect(host.detailExpanded).toBe(false);
    const replace = vi.spyOn(history, 'replaceState');
    act(() => host.setDetailExpanded(true));
    expect(replace).not.toHaveBeenCalled(); expect(address()).toBe('/board?sheet=s&expand=1');
  });
  it('keeps an unapplied draft and selected saved view unchanged while toggling, then applies without losing expand', async () => {
    const period = buildQuery({ ...emptyGlobal, from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' });
    mount(`/mars/apply${period}`);
    await waitFor(() => expect(views.status).toBe('ready'));
    await act(async () => { await views.select('saved'); });
    act(() => host.queryDraft.setDraftPage({ q: 'unapplied' }));
    act(() => host.setDetailExpanded(true));
    expect(host.queryDraft.draft.page).toContainEqual(['q', 'unapplied']);
    expect(host.pageParam('q')).toBeNull(); expect(views.state.modified).toBe(false);
    act(() => host.setDetailExpanded(false));
    expect(host.queryDraft.draft.page).toContainEqual(['q', 'unapplied']);
    act(() => host.setDetailExpanded(true));
    act(() => host.queryDraft.apply());
    expect(host.pageParam('q')).toBe('unapplied'); expect(host.detailExpanded).toBe(true);
  });
  it('materializes the default period while preserving expansion', async () => {
    mount('/mars/live?v=1&expand=1');
    await waitFor(() => expect(host.global.to).toBe('2026-09-02T00:00:00'));
    expect(host.global.from).toBe('2026-09-01T00:00:00'); expect(host.detailExpanded).toBe(true);
  });
  it('preserves restored expansion through alias redirect', () => {
    mount('/legacy-home?v=1&expand=1&q=restored');
    expect(location.pathname).toBe('/mars/home');
    expect(host.pageParam('q')).toBe('restored'); expect(host.detailExpanded).toBe(true);
  });
  it('records acknowledged query history without the platform key', async () => {
    const history: QueryHistoryStore = { list: async () => [], record: vi.fn(async () => {}), remove: async () => {}, clear: async () => {} };
    mount('/mars/apply?v=1&from=2026-09-01T00:00:00&to=2026-09-02T00:00:00&expand=1', store(), history);
    act(() => { host.queryDraft.setDraftPage({ q: 'query' }); host.queryDraft.apply(); });
    await waitFor(() => expect(history.record).toHaveBeenCalled());
    expect(JSON.stringify(vi.mocked(history.record).mock.calls)).not.toContain('expand');
    expect(canonicalHistoryQuery({ global: host.global, page: host.page }, host.route!.menu.pageKeys)).not.toContain('expand');
    expect(host.detailExpanded).toBe(true);
  });
  it('strips old preference addresses and explicit return origins, and favorites start clean', () => {
    sessionStorage.setItem(spaceLastKey(session.user.id), JSON.stringify({ mars: '/mars/home?v=1&expand=1' }));
    expect(readSpaceLast(session.user.id).mars).not.toContain('expand');
    expect(decodeRecent([{ menuId: 'home', url: '/mars/home?v=1&expand=1', at: 1 }])?.[0].url).not.toContain('expand');
    mount('/mars/home?v=1&expand=1&returnTo=' + encodeURIComponent('/mars/other?v=1&expand=1'));
    expect(host.returnOrigin().href).not.toContain('expand');
    expect(host.resolveLink('other', { page: { returnTo: '/mars/home?v=1&expand=1' } }).href).not.toContain('expand');
    act(() => host.toggleFavorite('other'));
    expect(host.favorites).toContain('other'); expect(host.resolveLink('other').href).not.toContain('expand');
  });
  it('keeps the expansion API off the menu type', () => {
    expectTypeOf<HostPlatform>().toHaveProperty('detailExpanded');
    expectTypeOf<HostPlatform>().toHaveProperty('setDetailExpanded');
    expectTypeOf<MenuPlatform>().not.toHaveProperty('detailExpanded');
    expectTypeOf<MenuPlatform>().not.toHaveProperty('setDetailExpanded');
  });
  it.each([
    { pageKeys: ['expand'] },
    { hiddenPageKeys: ['expand'] },
    { navViews: [{ id: 'v', label: group.label, page: { expand: '1' } }] },
  ])('rejects platform key declarations: %j', patch => {
    expect(() => createRegistry({ spaces: [testSpace()], groups: [group], menus: [{ ...menus[0], carrySet: undefined, ...patch }] })).toThrow(/expand.*reserved/);
  });
  it('rejects expand in carry sets', () => {
    expect(() => createRegistry({ spaces: [testSpace()], groups: [group], menus, carrySets: [{ id: carrySetId('set'), pageKeys: ['expand'] }] })).toThrow(/expand.*reserved/);
  });
});
