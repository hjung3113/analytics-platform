import { useEquipmentSearch } from '../../scope/selection-ports';
import { StrictMode, useLayoutEffect, useState, type ReactNode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineEndpoint, type ApiResponse, type EndpointSpec, type MenuQuery, type PlatformAdapter, type Session, type UsageEvent, groupId, spaceId } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PaneQueryDraftProvider, PaneScreenProvider, PlatformProvider, useHostPlatform, type PaneScreen } from '../platform';
import { useQueryContext } from '../../query/condition-preset';
import { useMenuFetch, useMenuQuery } from '../../query/query';
import { createRegistry } from '../../registry/registry';
import { noContext, testAdapter, testSession, testSpace } from '../../testing';

const features = { export: false, savedView: false, annotate: false, compare: false };
const apply = { ...noContext, time: 'apply' as const };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'analysis' as const, features: { ...features, board: true }, pageKeys: ['page', 'tab', 'returnTo'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'main' }), testSpace({ id: spaceId('operations'), label: { ko: '운영', en: 'Ops' }, permission: 'console:access', homeMenuId: 'ops' })],
  groups: [
    { id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') },
    { id: groupId('admin'), label: { ko: '운영', en: 'Ops' }, icon: House, space: spaceId('operations') },
  ],
  menus: [
    { ...entry('main', '/main', { features, context: apply, contextResetKeys: ['page'], requiresScope: true }), primary: true },
    entry('board-a', '/a', { context: apply, contextResetKeys: ['page'], requiresScope: true }),
    entry('board-b', '/b', { context: apply, requiresScope: true }),
    entry('item', '/item/:id', { navHidden: true, parent: 'board-a' }),
    entry('board-drill', '/drill', { navHidden: true, contextResetKeys: ['tab'], drill: { levels: [{ key: 'tab', label: { ko: '탭', en: 'Tab' } }], resetKeys: ['page'] } }),
    entry('plain', '/plain', { features }),
    entry('locked', '/locked', { permission: 'console:access' }),
    entry('metric', '/metric', { context: { ...apply, metric: 'apply' }, initializesMetric: true }),
    { ...entry('ops', '/ops', { features, permission: 'console:access' }), group: groupId('admin'), primary: true },
    { ...entry('ops-board', '/ops-board'), group: groupId('admin') },
  ],
});

const ANALYST: Session['user']['permissions'] = ['platform:view'];
const window1 = 'from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
const screenA = (query = `?${window1}`): PaneScreen => ({ menuId: 'board-a', params: {}, query });

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const data = new Map<string, string>();
    vi.stubGlobal(name, {
      getItem: (k: string) => data.get(k) ?? null, setItem: vi.fn((k: string, v: string) => { data.set(k, v); }),
      removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; },
    });
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

type Platform = ReturnType<typeof useHostPlatform>;
const seen = new Map<string, Platform>();
function Probe({ id }: { id: string }) {
  seen.set(id, useHostPlatform());
  return null;
}
const at = (id: string) => seen.get(id)!;

type Spies = { onChange: ReturnType<typeof vi.fn>; onLeave: ReturnType<typeof vi.fn> };
/** A controlled pane: parent state follows `onChange` when `echo` is on, and stays put when it is off. */
function Pane({ id, initial, spies, echo = true, children }: { id: string; initial: PaneScreen; spies: Spies; echo?: boolean; children?: ReactNode }) {
  const [screen, setScreen] = useState(initial);
  return <PaneScreenProvider paneId={id} screen={screen} onLeave={href => spies.onLeave(href)}
    onChange={(next, how) => { spies.onChange(next, how); if (echo) setScreen(next); }}>
    <Probe id={id} />{children}
  </PaneScreenProvider>;
}
const spies = (): Spies => ({ onChange: vi.fn(), onLeave: vi.fn() });

function fixture(over: Partial<PlatformAdapter> = {}, permissions: Session['user']['permissions'] = ANALYST) {
  const session = testSession(permissions);
  const events: UsageEvent[] = [];
  const adapter = testAdapter({ session: () => session, recordUsage: async batch => { events.push(...batch); return { accepted: batch.length }; }, ...over });
  return { adapter, events, session };
}
function mount(ui: ReactNode, adapter: PlatformAdapter, url = `/main?scopeId=MEM&${window1}`, strict = false) {
  window.history.replaceState(null, '', url);
  const tree = <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{ui}</PlatformProvider></I18nProvider>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };

describe('PaneScreenProvider — independent screen state (ADR-0049)', () => {
  it('two panes read their own global/page; a write calls only that pane onChange and leaves the URL and main alone', async () => {
    const a = spies(); const b = spies();
    mount(<><Probe id="main" />
      <Pane id="a" initial={screenA(`?scopeId=S1&page=3&${window1}`)} spies={a} />
      <Pane id="b" initial={{ menuId: 'board-b', params: {}, query: `?scopeId=S2&${window1}` }} spies={b} /></>, fixture().adapter);
    await flush();
    expect([at('a').global.scopeId, at('a').pageParam('page'), at('b').global.scopeId, at('b').pageParam('page'), at('main').global.scopeId]).toEqual(['S1', '3', 'S2', null, 'MEM']);
    expect([at('a').screenMode, at('a').paneId, at('main').screenMode, at('main').paneId]).toEqual(['pane', 'a', 'main', null]);
    const before = window.location.pathname + window.location.search;
    a.onChange.mockClear();
    act(() => { at('a').setGlobal({ roomNames: ['R1'] }); });
    expect(a.onChange).toHaveBeenCalledTimes(1);
    expect(a.onChange.mock.calls[0]![1]).toBe('push');
    expect(b.onChange).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe(before);
    expect(at('main').global.roomNames).toBeNull();
    expect(at('b').global.roomNames).toBeNull();
    expect(at('a').global.roomNames).toEqual(['R1']);
  });

  it('clears contextResetKeys in the same onChange as a pane Context change, not on mount, not on setPage', async () => {
    const a = spies();
    mount(<Pane id="a" initial={screenA(`?scopeId=S1&page=3&${window1}`)} spies={a} />, fixture().adapter);
    await flush();
    expect(a.onChange).not.toHaveBeenCalled();
    act(() => { at('a').setGlobal({ roomNames: ['R1'] }); });
    expect(new URLSearchParams(a.onChange.mock.calls.at(-1)![0].query).get('page')).toBeNull();
    act(() => { at('a').setPage({ page: '4' }); });
    expect(new URLSearchParams(a.onChange.mock.calls.at(-1)![0].query).get('page')).toBe('4');
    act(() => { at('a').resetContext(); });
    expect(new URLSearchParams(a.onChange.mock.calls.at(-1)![0].query).get('page')).toBeNull();
    expect(new URLSearchParams(a.onChange.mock.calls.at(-1)![0].query).get('scopeId')).toBe('S1');
  });

  it('a drill step in one pane drops only that pane drill.resetKeys, not its sibling or main; a pane Context write leaves them', async () => {
    const a = spies(); const b = spies();
    const drillScreen: PaneScreen = { menuId: 'board-drill', params: {}, query: '?tab=x&page=3' };
    mount(<><Probe id="main" />
      <Pane id="a" initial={drillScreen} spies={a} /><Pane id="b" initial={drillScreen} spies={b} /></>, fixture().adapter, '/main?scopeId=MEM&page=7&' + window1);
    await flush();
    const queryOf = (s: Spies) => new URLSearchParams(s.onChange.mock.calls.at(-1)![0].query);
    act(() => { at('a').setGlobal({ roomNames: ['R1'] }); });
    expect(queryOf(a).get('page')).toBe('3');
    act(() => { at('a').setPage({ tab: 'y' }); });
    expect(queryOf(a).get('tab')).toBe('y');
    expect(queryOf(a).get('page')).toBeNull();
    expect(b.onChange).not.toHaveBeenCalled();
    expect(at('main').pageParam('page')).toBe('7');
  });

  it('writes commit to the pane even when its menu has no board support, and keep push/replace; a no-op write is dropped', async () => {
    const p = spies();
    mount(<Pane id="p" initial={{ menuId: 'plain', params: {}, query: '?' }} spies={p} />, fixture().adapter);
    await flush();
    act(() => { at('p').setPage({ tab: 'x' }, { replace: true }); });
    expect(p.onChange).toHaveBeenCalledTimes(1);
    expect(p.onChange.mock.calls[0]![0]).toMatchObject({ menuId: 'plain' });
    expect(p.onChange.mock.calls[0]![1]).toBe('replace');
    act(() => { at('p').setPage({ tab: 'x' }); });
    expect(p.onChange).toHaveBeenCalledTimes(1);
    expect(p.onLeave).not.toHaveBeenCalled();
  });

  it('a malformed query is a contract error inside that pane only', async () => {
    const bad = spies(); const ok = spies();
    mount(<><Probe id="main" /><Pane id="bad" initial={screenA('?from=nonsense&to=x')} spies={bad} /><Pane id="ok" initial={screenA()} spies={ok} /></>, fixture().adapter);
    await flush();
    expect(at('bad').contractError).not.toBeNull();
    expect(at('ok').contractError).toBeNull();
    expect(at('main').contractError).toBeNull();
    expect(bad.onChange).not.toHaveBeenCalled();
  });

  it('keeps unsupported Context in the query untouched (06 §6.4 unsupported Context preserved)', async () => {
    const p = spies();
    mount(<Pane id="p" initial={{ menuId: 'plain', params: {}, query: '?roomNames=R1' }} spies={p} />, fixture().adapter);
    await flush();
    expect(at('p').global.roomNames).toEqual(['R1']);
    act(() => { at('p').setPage({ tab: 'x' }); });
    expect(new URLSearchParams(p.onChange.mock.calls[0]![0].query).get('roomNames')).toBe('R1');
  });
});

describe('PaneScreenProvider — paneLabel', () => {
  it('exposes the pane caption read-only in a pane and null on the main screen and in a pane without one', async () => {
    mount(<>
      <Probe id="main" />
      <PaneScreenProvider paneId="p1" paneLabel="칸 2 · board-a" screen={screenA()} onChange={() => {}} onLeave={() => {}}><Probe id="p1" /></PaneScreenProvider>
      <PaneScreenProvider paneId="p2" screen={screenA()} onChange={() => {}} onLeave={() => {}}><Probe id="p2" /></PaneScreenProvider>
    </>, fixture().adapter);
    await flush();
    expect(at('p1').paneLabel).toBe('칸 2 · board-a');
    expect(at('main').paneLabel).toBeNull();
    expect(at('p2').paneLabel).toBeNull();
  });
});

describe('PaneScreenProvider — navigation and links', () => {
  it('a link to an openable board menu is onChange push; to a non-board, unopenable or external target it is onLeave (or rejected)', async () => {
    const p = spies();
    mount(<Pane id="p" initial={screenA()} spies={p} echo={false} />, fixture().adapter);
    await flush();
    let result = false;
    act(() => { result = at('p').navigate('/b?scopeId=S1'); });
    expect(result).toBe(true);
    expect(p.onChange).toHaveBeenLastCalledWith({ menuId: 'board-b', params: {}, query: '?scopeId=S1' }, 'push');
    act(() => { at('p').navigate('/item/7', { replace: true }); });
    expect(p.onChange).toHaveBeenLastCalledWith({ menuId: 'item', params: { id: '7' }, query: '' }, 'replace');
    p.onChange.mockClear();
    act(() => { at('p').navigate('/plain?x=1'); });
    act(() => { at('p').navigate('/locked'); });
    act(() => { at('p').navigate('/main'); });
    expect(p.onLeave.mock.calls.map(c => c[0])).toEqual(['/plain?x=1', '/locked', '/main']);
    expect(p.onChange).not.toHaveBeenCalled();
    p.onLeave.mockClear();
    for (const bad of ['https://evil.example/b', '//evil.example/b', 'javascript:1', '']) {
      let accepted = true;
      act(() => { accepted = at('p').navigate(bad); });
      expect(accepted).toBe(false);
    }
    expect(p.onLeave).not.toHaveBeenCalled();
    expect(p.onChange).not.toHaveBeenCalled();
  });

  it('an accepted same-pane destination honors replace and a no-op navigation returns false', async () => {
    const p = spies();
    mount(<Pane id="p" initial={screenA()} spies={p} echo={false} />, fixture().adapter);
    await flush();
    act(() => { at('p').navigate(`/a?${window1}&page=2`, { replace: true }); });
    expect(p.onChange).toHaveBeenLastCalledWith({ menuId: 'board-a', params: {}, query: `?${window1}&page=2` }, 'replace');
    let same = true;
    act(() => { same = at('p').navigate(at('p').url); });
    expect(same).toBe(false);
  });

  it('linkTo/resolveLink only build hrefs: no commit, no leave, the pane Context is carried and returnTo is the pane address', async () => {
    const p = spies();
    mount(<Pane id="p" initial={screenA(`?scopeId=S1&${window1}`)} spies={p} />, fixture().adapter);
    await flush();
    const link = at('p').resolveLink('board-b', { returnTo: true, page: { tab: 'z' } });
    expect(link.href.startsWith('/mars/board-b?')).toBe(true);
    expect(new URLSearchParams(link.href.split('?')[1]).get('scopeId')).toBe('S1');
    expect(link.allowed).toBe(true);
    expect(link.droppedPageKeys).toEqual([]);
    const target = at('p').resolveLink('board-a', { returnTo: true });
    expect(new URLSearchParams(target.href.split('?')[1]).get('returnTo')).toBe(`/mars/board-a?scopeId=S1&${window1}`);
    expect(p.onChange).not.toHaveBeenCalled();
    expect(p.onLeave).not.toHaveBeenCalled();
  });

  it('returnOrigin restores the pane address exactly; a non-board origin leaves; a denied origin falls back; a sibling does not affect it', async () => {
    const p = spies(); const sib = spies();
    const origin = `/a?scopeId=S1&page=2&${window1}&keep=1`;
    const arrive = (origin: string): PaneScreen => ({ menuId: 'item', params: { id: '7' }, query: `?scopeId=S9&returnTo=${encodeURIComponent(origin)}` });
    mount(<><Pane id="p" initial={arrive(origin)} spies={p} echo={false} /><Pane id="sib" initial={screenA(`?scopeId=S3&${window1}`)} spies={sib} /></>, fixture().adapter);
    await flush();
    expect(at('p').returnOrigin().href).toBe(origin);
    expect(at('p').returnOrigin().revertedContext).toContain('scope');
    expect(at('sib').returnOrigin().href).not.toBe(origin);
    act(() => { at('p').navigate(at('p').returnTarget()); });
    expect(p.onChange).toHaveBeenLastCalledWith({ menuId: 'board-a', params: {}, query: `?scopeId=S1&page=2&${window1}&keep=1` }, 'push');
    expect(sib.onChange).not.toHaveBeenCalled();
    // origin that is not a board menu → onLeave with the captured href
    cleanup(); seen.clear();
    const q = spies();
    mount(<Pane id="q" initial={arrive('/plain?scopeId=S1')} spies={q} echo={false} />, fixture().adapter);
    await flush();
    act(() => { at('q').navigate(at('q').returnTarget()); });
    expect(q.onLeave).toHaveBeenCalledWith('/plain?scopeId=S1');
    // origin the user cannot open → fallback chain (parent of the pane menu)
    cleanup(); seen.clear();
    const r = spies();
    mount(<Pane id="r" initial={arrive('/locked')} spies={r} echo={false} />, fixture().adapter);
    await flush();
    expect(at('r').returnOrigin().href.startsWith('/mars/board-a')).toBe(true);
    expect(at('r').returnOrigin().revertedContext).toEqual([]);
  });
});

describe('PaneScreenProvider — app-only effects stay on the main screen', () => {
  it('adds no popstate listener and writes no recent, space-last or lastScope', async () => {
    const { adapter } = fixture();
    const add = vi.spyOn(window, 'addEventListener');
    // Main on a menu that is not admitted (no permission) writes nothing itself, so any write is the pane's.
    mount(<Pane id="p" initial={screenA(`?scopeId=S1&${window1}`)} spies={spies()} />, adapter, '/mars/locked');
    await flush();
    const popstates = add.mock.calls.filter(c => c[0] === 'popstate').length;
    expect(popstates).toBe(1); // the main screen's only
    const writes = (localStorage.setItem as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string).concat((sessionStorage.setItem as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string));
    expect(writes.filter(k => k.includes('recent') || k.includes('space-last') || k.includes('lastScope'))).toEqual([]);
    expect(at('p').scope.status).toBe('valid');
  });
});

describe('PaneScreenProvider — usage', () => {
  it('a pane records entry and dwell for its menu with source board, two same-menu panes each count, main entry adds only via/fromMenuId (#605), pane entries stay pane-shaped', async () => {
    const { adapter, events } = fixture();
    const ui = (show: boolean) => <>{show && <><Pane id="a1" initial={screenA()} spies={spies()} /><Pane id="a2" initial={screenA()} spies={spies()} /></>}</>;
    const view = mount(ui(true), adapter, '/mars/plain');
    await flush();
    const entries = events.filter(e => e.name === 'entry');
    expect(entries).toHaveLength(3);
    const board = entries.filter(e => e.source === 'board');
    expect(board).toHaveLength(2);
    expect(board.every(e => e.menuId === 'board-a')).toBe(true);
    expect(new Set(board.map(e => e.stayId)).size).toBe(2);
    const main = entries.find(e => e.menuId === 'plain')!;
    expect(Object.keys(main).sort()).toEqual(['at', 'fromMenuId', 'menuId', 'name', 'path', 'sessionId', 'spaceId', 'via']);
    expect(board.every(e => !('via' in e) && !('fromMenuId' in e))).toBe(true);
    view.rerender(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{ui(false)}</PlatformProvider></I18nProvider>);
    const dwells = events.filter(e => e.name === 'dwell' && e.source === 'board');
    expect(dwells).toHaveLength(2);
    expect(dwells.map(d => d.stayId).sort()).toEqual(board.map(e => e.stayId).sort());
    expect(events.filter(e => e.name === 'dwell' && e.source === undefined)).toHaveLength(0);
  });

  it('a query-only change does not re-enter; leaving the menu sends the final dwell and a fresh stay on return; StrictMode emits one entry', async () => {
    const { adapter, events } = fixture();
    mount(<Pane id="a" initial={screenA()} spies={spies()} />, adapter, '/mars/plain', true);
    await flush();
    expect(events.filter(e => e.source === 'board')).toHaveLength(1);
    act(() => { at('a').setPage({ page: '2' }); });
    await flush();
    expect(events.filter(e => e.source === 'board')).toHaveLength(1);
    const first = events.find(e => e.source === 'board')!.stayId;
    act(() => { at('a').navigate('/b'); });
    await flush();
    const board = events.filter(e => e.source === 'board');
    expect(board.map(e => e.name)).toEqual(['entry', 'dwell', 'entry']);
    expect(board[1]!.stayId).toBe(first);
    expect(board[2]!.stayId).not.toBe(first);
    expect(board[2]!.menuId).toBe('board-b');
  });

  it('records nothing for a denied menu, a denied space or a contract error', async () => {
    const { adapter, events } = fixture();
    mount(<><Pane id="m" initial={{ menuId: 'locked', params: {}, query: '?' }} spies={spies()} />
      <Pane id="s" initial={{ menuId: 'ops-board', params: {}, query: '?' }} spies={spies()} />
      <Pane id="c" initial={screenA('?from=nonsense&to=x')} spies={spies()} /></>, adapter, '/mars/plain');
    await flush();
    expect(events.filter(e => e.source === 'board')).toEqual([]);
  });

  it('drops the dwell of a stay that crossed a session switch', async () => {
    let user = 'u1';
    const sessions: Record<string, Session> = { u1: testSession(ANALYST, { user: { id: 'u1' } }), u2: testSession(ANALYST, { user: { id: 'u2' } }) };
    const listeners = new Set<() => void>();
    const { adapter, events } = fixture({ session: () => sessions[user]!, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } });
    mount(<Pane id="a" initial={screenA()} spies={spies()} />, adapter, '/mars/plain');
    await flush();
    user = 'u2';
    await act(async () => { listeners.forEach(l => l()); });
    expect(events.filter(e => e.name === 'dwell')).toEqual([]);
  });
});

describe('PaneScreenProvider — Scope and spaces', () => {
  it('validates each pane Scope on its own: a forbidden pane does not touch its sibling or main', async () => {
    const adapter = fixture({ validateScope: async id => ({ status: id === 'BAD' ? 'forbidden' : 'valid', grantedRooms: [] }) }).adapter;
    mount(<><Probe id="main" /><Pane id="bad" initial={screenA(`?scopeId=BAD&${window1}`)} spies={spies()} /><Pane id="good" initial={screenA(`?scopeId=OK&${window1}`)} spies={spies()} /></>, adapter);
    await flush();
    expect([at('bad').scope.status, at('good').scope.status, at('main').scope.status]).toEqual(['forbidden', 'valid', 'valid']);
    expect([at('bad').scope.scopeId, at('good').scope.scopeId, at('main').scope.scopeId]).toEqual(['BAD', 'OK', 'MEM']);
  });

  it('currentSpace follows the pane route; sidebarSpace and shell navigation stay with main', async () => {
    mount(<><Probe id="main" /><Pane id="ops" initial={{ menuId: 'ops-board', params: {}, query: '?' }} spies={spies()} /></>, fixture({}, ['platform:view']).adapter);
    await flush();
    expect(at('ops').currentSpace?.id).toBe('operations');
    expect(at('main').currentSpace?.id).toBe('mars');
    expect(at('ops').sidebarSpace?.id).toBe('mars');
    expect(at('ops').spaceEntry).toBe(at('main').spaceEntry);
    expect(at('ops').visibleMenus).toEqual(at('main').visibleMenus);
  });

  it('a shell control outside any pane keeps reading the main screen while a pane is mounted', async () => {
    const p = spies();
    mount(<><Probe id="shell" /><Pane id="p" initial={screenA(`?scopeId=S1&${window1}`)} spies={p} /></>, fixture().adapter);
    await flush();
    act(() => { at('p').setGlobal({ roomNames: ['R9'] }); });
    expect(at('shell').global.scopeId).toBe('MEM');
    expect(at('shell').global.roomNames).toBeNull();
    expect(at('shell').url.startsWith('/mars/main')).toBe(true);
    expect(at('shell').linkTo('board-b')).toContain('scopeId=MEM');
    expect(at('shell').spaceEntry(spaceId('mars'))?.href).toContain('scopeId=MEM');
    act(() => { at('shell').setGlobal({ roomNames: ['M1'] }); });
    expect(at('shell').global.roomNames).toEqual(['M1']);
    expect(at('p').global.roomNames).toEqual(['R9']);
  });
});

describe('PaneScreenProvider — render isolation and commit routing', () => {
  it('a main-only Scope retry does not re-render a pane consumer', async () => {
    let renders = 0;
    function Counter() { useHostPlatform(); renders += 1; return null; }
    const children = <Counter />;
    mount(<><Probe id="main" /><Pane id="a" initial={screenA()} spies={spies()}>{children}</Pane></>, fixture().adapter);
    await flush();
    const before = renders;
    act(() => { at('main').retryScope(); });
    await flush();
    expect(renders).toBe(before);
  });

  it('a write from a layout effect of the newly exposed screen targets that screen, not the previous menu or params', async () => {
    const p = spies();
    let set!: (next: PaneScreen) => void;
    function Writer() {
      const { route, setPage, pageParam } = useHostPlatform();
      const menu = route?.menu.id;
      useLayoutEffect(() => { if (menu === 'item' && pageParam('tab') === null) setPage({ tab: 'info' }, { replace: true }); }, [menu, pageParam, setPage]);
      return null;
    }
    function Controlled() {
      const [screen, setScreen] = useState<PaneScreen>(screenA());
      set = setScreen;
      return <PaneScreenProvider paneId="p" screen={screen} onLeave={() => {}} onChange={(next, how) => { p.onChange(next, how); setScreen(next); }}>
        <Probe id="p" /><Writer />
      </PaneScreenProvider>;
    }
    mount(<Controlled />, fixture().adapter);
    await flush();
    act(() => { set({ menuId: 'item', params: { id: 'new' }, query: `?${window1}` }); });
    expect(p.onChange).toHaveBeenCalledTimes(1);
    expect(p.onChange.mock.calls[0]![0]).toMatchObject({ menuId: 'item', params: { id: 'new' } });
    expect(p.onChange.mock.calls[0]![0].query).toContain('tab=info');
    expect(at('p').route?.menu.id).toBe('item');
  });
});

describe('PaneScreenProvider — controlled materialization', () => {
  const metricAdapter = () => fixture({ publishedMetrics: () => [{ metricId: 'cycle', publishedVersion: '3' }] });
  const metricScreen: PaneScreen = { menuId: 'metric', params: {}, query: '?metricId=cycle' };

  it('composes the default period and the confirmed metric version into one replace and waits for the parent to accept it', async () => {
    const { adapter } = metricAdapter();
    const requests: MenuQuery[] = [];
    const spec: EndpointSpec<null, unknown> = defineEndpoint<null, unknown>({ id: 'fx.metric', menuId: 'metric', paramKeys: {}, permission: 'platform:view', requiresScope: false, context: { time: 'apply', metric: 'apply' }, kinds: ['collection'], mergeTimeDomain: false });
    const menuQuery = vi.fn(async (request: MenuQuery): Promise<ApiResponse<never>> => { requests.push(request); return { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'c' }; });
    const s = spies();
    function MetricReader() { useMenuQuery(spec, null); return null; }
    function Hold() {
      const [screen, setScreen] = useState(metricScreen);
      const [accept, setAccept] = useState<PaneScreen | null>(null);
      const [, setTick] = useState(0);
      // The parent only keeps the proposal; it applies it when told to.
      return <PaneScreenProvider paneId="m" screen={screen} onLeave={() => {}}
        onChange={(next, how) => { s.onChange(next, how); setAccept(next); }}>
        <Probe id="m" /><MetricReader />
        <button type="button" data-testid="rerender" onClick={() => setTick(n => n + 1)} />
        <button type="button" data-testid="accept" onClick={() => { if (accept) setScreen(accept); }} />
      </PaneScreenProvider>;
    }
    const { adapter: wrapped } = { adapter: Object.assign(Object.create(adapter) as PlatformAdapter, { menuQuery }) };
    const view = mount(<Hold />, wrapped, '/mars/plain', true);
    await flush();
    expect(s.onChange).toHaveBeenCalledTimes(1);
    const [proposal, how] = s.onChange.mock.calls[0]!;
    expect(how).toBe('replace');
    const q = new URLSearchParams(proposal.query);
    expect([q.get('metricVersion'), q.get('from') !== null, q.get('to') !== null]).toEqual(['3', true, true]);
    // Unrelated re-renders do not propose again; no query went out before the replacement was accepted.
    await act(async () => { view.container.ownerDocument.querySelector<HTMLButtonElement>('[data-testid="rerender"]')!.click(); });
    await flush();
    expect(s.onChange).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([]);
    expect(window.location.pathname).toBe('/mars/plain');
    expect(window.location.search).toBe('');
    await act(async () => { view.container.ownerDocument.querySelector<HTMLButtonElement>('[data-testid="accept"]')!.click(); });
    await flush();
    expect(s.onChange).toHaveBeenCalledTimes(1);
    expect(at('m').global.metricVersion).toBe('3');
    expect(at('m').global.from).not.toBeNull();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.context).toMatchObject({ metricId: 'cycle', metricVersion: '3' });
  });

  it('proposes again for a genuinely new input', async () => {
    const { adapter } = metricAdapter();
    const s = spies();
    mount(<Pane id="m" initial={metricScreen} spies={s} />, adapter, '/mars/plain');
    await flush();
    expect(s.onChange).toHaveBeenCalledTimes(1);
    act(() => { at('m').navigate('/metric?metricId=cycle&tab=2'); });
    await flush();
    // The new address lacks the period and the version again: it materializes again, once more.
    expect(s.onChange.mock.calls.map(c => c[1])).toEqual(['replace', 'push', 'replace']);
  });
});

describe('PaneScreenProvider — query lifecycle per pane', () => {
  type Call = { request: MenuQuery; signal: AbortSignal | undefined; resolve: (data: string) => void };
  const spec: EndpointSpec<null, string> = defineEndpoint<null, string>({
    id: 'fx.pane', menuId: 'board-a', paramKeys: {}, permission: 'platform:view', requiresScope: true, context: { time: 'apply', roomNames: 'apply' }, kinds: ['collection'], mergeTimeDomain: false,
  });
  function harness() {
    const calls: Call[] = [];
    let current = testSession(ANALYST, { user: { id: 'u1' } });
    const listeners = new Set<() => void>();
    const adapter = testAdapter({
      session: () => current,
      subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
      menuQuery: ((request: MenuQuery, signal?: AbortSignal) => new Promise<ApiResponse<string>>(resolve => {
        calls.push({ request, signal, resolve: data => resolve({ outcome: 'ok', data, assessments: [{ kind: 'collection', state: 'clear' }], trust: null, correlationId: 'c' }) });
      })) as PlatformAdapter['menuQuery'],
    });
    return { adapter, calls, switchUser: (id: string) => { current = { ...current, user: { ...current.user, id } }; listeners.forEach(l => l()); }, sessionOnly: () => { current = { ...current }; listeners.forEach(l => l()); } };
  }
  const results = new Map<string, string | null>();
  function Reader({ id }: { id: string }) {
    const q = useMenuQuery(spec, null);
    const f = useMenuFetch(spec);
    results.set(id, q.response?.data ?? null);
    results.set(`${id}:ready`, String(f.ready));
    return null;
  }

  it('gates each pane on its own Scope and period and drops an old late success after a Scope change', async () => {
    const h = harness();
    results.clear();
    mount(<><Pane id="a" initial={screenA(`?scopeId=S1&${window1}`)} spies={spies()}><Reader id="a" /></Pane>
      <Pane id="b" initial={{ menuId: 'board-a', params: {}, query: '?scopeId=S2' }} spies={spies()} echo={false}><Reader id="b" /></Pane></>, h.adapter);
    await flush();
    expect(results.get('a:ready')).toBe('true');
    expect(results.get('b:ready')).toBe('false'); // b has no absolute period in its accepted address yet
    expect(h.calls.length).toBeGreaterThanOrEqual(1);
    const first = h.calls[0]!;
    act(() => { at('a').setGlobal({ scopeId: 'S3' }); });
    await flush();
    expect(first.signal?.aborted).toBe(true);
    await act(async () => { first.resolve('stale'); });
    await flush();
    expect(results.get('a')).toBeNull();
    const second = h.calls.at(-1)!;
    expect(second.request.context.scopeId).toBe('S3');
    await act(async () => { second.resolve('fresh'); });
    await flush();
    expect(results.get('a')).toBe('fresh');
    expect(results.get('b')).toBeNull();
  });

  it('a session-only invalidation with an unchanged scopeId hides the old data, and an unmount aborts an adapter that ignores cancellation', async () => {
    const h = harness();
    results.clear();
    const ui = (show: boolean) => <>{show && <Pane id="a" initial={screenA(`?scopeId=S1&${window1}`)} spies={spies()}><Reader id="a" /></Pane>}</>;
    const view = mount(ui(true), h.adapter);
    await flush();
    await act(async () => { h.calls[0]!.resolve('first'); });
    await flush();
    expect(results.get('a')).toBe('first');
    await act(async () => { h.switchUser('u2'); });
    expect(results.get('a')).toBeNull();
    await flush();
    const callsBefore = h.calls.length;
    const pending = h.calls.at(-1)!;
    view.rerender(<I18nProvider><PlatformProvider adapter={h.adapter} registry={registry}>{ui(false)}</PlatformProvider></I18nProvider>);
    expect(pending.signal?.aborted).toBe(true);
    await act(async () => { pending.resolve('late'); });
    expect(results.get('a')).toBeNull();
    expect(h.calls.length).toBe(callsBefore);
  });
});

describe('selection metadata screen ownership', () => {
  it('isolates main and two panes, shares a selected pane owner, resets Scope and drops removed pane caches', async () => {
    const calls: string[] = [];
    const values = new Map<string, ReturnType<typeof useEquipmentSearch>>();
    const f = fixture({ searchEquipment: async input => { calls.push(input.scopeId); return { items: [{ equipmentId: input.scopeId, room: 'R', axes: {} }], nextCursor: null }; } });
    function Reader({ id }: { id: string }) { values.set(id, useEquipmentSearch()); return null; }
    const ui = (show: boolean) => <>
      <Reader id="main" />
      {show && <Pane id="a" initial={screenA('?scopeId=A')} spies={spies()}><Reader id="a" /></Pane>}
      {show && <PaneScreenProvider paneId="a" screen={screenA('?scopeId=A')} countUsage={false} onChange={() => {}} onLeave={() => {}}><Reader id="a-bar" /></PaneScreenProvider>}
      <Pane id="b" initial={screenA('?scopeId=B')} spies={spies()}><Reader id="b" /></Pane>
    </>;
    const tree = mount(ui(true), f.adapter);
    await flush(); await flush();
    expect(calls.sort()).toEqual(['A', 'B', 'MEM']);
    expect(values.get('main')!.items[0].equipmentId).toBe('MEM');
    expect(values.get('a')!.items[0].equipmentId).toBe('A');
    expect(values.get('a-bar')!.items).toBe(values.get('a')!.items);
    expect(values.get('b')!.items[0].equipmentId).toBe('B');
    await act(async () => at('b').setGlobal({ scopeId: 'B2' }));
    await flush();
    expect(values.get('b')!.items[0].equipmentId).toBe('B2');
    expect(values.get('a')!.items[0].equipmentId).toBe('A');
    tree.rerender(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}>{ui(false)}</PlatformProvider></I18nProvider>);
    await flush();
    tree.rerender(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}>{ui(true)}</PlatformProvider></I18nProvider>);
    await flush(); await flush();
    expect(calls.filter(id => id === 'A')).toHaveLength(2);
    expect(calls.filter(id => id === 'MEM')).toHaveLength(1);
  });
});
it('shares history initialization between the two pane providers but keeps another same-menu pane independent', async () => {
  const applyMenu = { ...entry('history', '/history'), primary: true, query: { mode: 'apply' as const }, context: apply };
  const chosen = createRegistry({ spaces: [testSpace({ homeMenuId: 'history' })], groups: [registry.groups[0]], menus: [applyMenu] });
  const session = testSession(['platform:view']);
  const list = vi.fn(async () => [{ id: 'last', query: `?v=1&${window1}&tab=last`, schemaVersion: 1 as const, lastAppliedAt: 1, count: 1 }]);
  const record = vi.fn(async () => {});
  const store = { list, record, remove: async () => {}, clear: async () => {} };
  const initial = { menuId: 'history', params: {}, query: '' };
  function Board({ editor }: { editor: boolean }) {
    const [a, setA] = useState(initial); const [b, setB] = useState(initial);
    return <PaneQueryDraftProvider screens={{ a, b }}>
      <PaneScreenProvider paneId="a" screen={a} onChange={setA} onLeave={() => {}}><Probe id="history-body" /></PaneScreenProvider>
      {editor && <PaneScreenProvider paneId="a" screen={a} onChange={setA} onLeave={() => {}} countUsage={false}><Probe id="history-editor" /></PaneScreenProvider>}
      <PaneScreenProvider paneId="b" screen={b} onChange={setB} onLeave={() => {}}><Probe id="history-other" /></PaneScreenProvider>
    </PaneQueryDraftProvider>;
  }
  const adapter = testAdapter({ session: () => session });
  const tree = (editor: boolean) => <I18nProvider><PlatformProvider registry={chosen} adapter={adapter} queryHistory={store}><Board editor={editor} /></PlatformProvider></I18nProvider>;
  const view = render(tree(true));
  await act(async () => {});
  expect(at('history-body').queryDraft.draft.page).toEqual([['tab', 'last']]);
  expect(at('history-editor').queryDraft.draft.page).toEqual([['tab', 'last']]);
  act(() => at('history-body').queryDraft.setDraftPage({ tab: 'edited' }));
  expect(at('history-other').queryDraft.draft.page).toEqual([['tab', 'last']]);
  view.rerender(tree(false)); view.rerender(tree(true));
  expect(at('history-editor').queryDraft.draft.page).toEqual([['tab', 'edited']]);
  expect(record).not.toHaveBeenCalled();
  act(() => at('history-editor').queryDraft.apply());
  await act(async () => {});
  expect(record).toHaveBeenCalledTimes(1);
});

describe('PaneScreenProvider — Condition presets (ADR-0083)', () => {
  const axes = ['stgroup', 'team', 'maker', 'model'].map(id => ({ id, label: { ko: id, en: id }, membershipHistory: false }));
  const presetMenu = entry('presets', '/presets', {
    primary: true, context: { ...noContext, condition: 'apply' as const }, pageKeys: ['view'],
    conditionPresets: [{ id: 'a', label: { ko: 'A', en: 'A' }, axes: ['stgroup', 'team'] }, { id: 'b', label: { ko: 'B', en: 'B' }, axes: ['maker', 'model'] }],
    conditionPreset: { key: 'view', default: 'a' },
  });
  const presetRegistry = createRegistry({ spaces: [testSpace({ homeMenuId: 'presets' })], groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }], menus: [presetMenu] });
  const spec = defineEndpoint<{ pane: string }, unknown>({ id: 'fx.presets', menuId: 'presets', paramKeys: { pane: true }, permission: 'platform:view', requiresScope: false, context: { condition: 'apply' }, kinds: [], mergeTimeDomain: false });
  const condition = { stgroup: ['S1'], team: ['T1'], maker: ['M1'], model: ['X1'] };
  const query = (view: string) => `?v=1&equipmentGroup=${encodeURIComponent(JSON.stringify(condition))}&view=${view}`;
  function Reader({ pane }: { pane: string }) { useMenuQuery(spec, { pane }); return null; }

  it('each pane narrows its own request by its own preset, and every pane keeps the whole Condition', async () => {
    const requests: MenuQuery<{ pane: string }>[] = [];
    const menuQuery = vi.fn(async (request: MenuQuery): Promise<ApiResponse<never>> => { requests.push(request as MenuQuery<{ pane: string }>); return { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'c' }; });
    const session = testSession(ANALYST);
    window.history.replaceState(null, '', '/presets');
    const s = spies();
    render(<I18nProvider><PlatformProvider registry={presetRegistry} equipmentAxes={axes} adapter={testAdapter({ session: () => session, menuQuery })}>
      <Pane id="pa" initial={{ menuId: 'presets', params: {}, query: query('a') }} spies={s}><Reader pane="pa" /></Pane>
      <Pane id="pb" initial={{ menuId: 'presets', params: {}, query: query('b') }} spies={s}><Reader pane="pb" /></Pane>
    </PlatformProvider></I18nProvider>);
    await flush();
    const contextOf = (pane: string) => requests.find(request => request.params.pane === pane)?.context.condition;
    expect(contextOf('pa')).toEqual({ stgroup: ['S1'], team: ['T1'] });
    expect(contextOf('pb')).toEqual({ maker: ['M1'], model: ['X1'] });
    expect(at('pa').global.condition).toEqual(condition);
    expect(at('pb').global.condition).toEqual(condition);
  });

  it('useQueryContext narrows by the pane\'s applied preset; a menu without presets gets the identical global object', async () => {
    const seenContext = new Map<string, ReturnType<typeof useQueryContext>>();
    function Context({ id }: { id: string }) { seenContext.set(id, useQueryContext()); return null; }
    const plain = entry('plain', '/plain', { primary: true, context: { ...noContext, condition: 'apply' as const } });
    const mixed = createRegistry({ spaces: [testSpace({ homeMenuId: 'plain' })], groups: presetRegistry.groups, menus: [plain, { ...presetMenu, primary: false }] });
    const session = testSession(ANALYST);
    window.history.replaceState(null, '', '/mars/plain');
    const s = spies();
    render(<I18nProvider><PlatformProvider registry={mixed} equipmentAxes={axes} adapter={testAdapter({ session: () => session })}>
      <Pane id="pa" initial={{ menuId: 'presets', params: {}, query: query('a') }} spies={s}><Context id="pa" /></Pane>
      <Pane id="pb" initial={{ menuId: 'presets', params: {}, query: query('b') }} spies={s}><Context id="pb" /></Pane>
      <Pane id="pp" initial={{ menuId: 'plain', params: {}, query: query('a') }} spies={s}><Context id="pp" /></Pane>
    </PlatformProvider></I18nProvider>);
    await flush();
    expect(seenContext.get('pa')!.condition).toEqual({ stgroup: ['S1'], team: ['T1'] });
    expect(seenContext.get('pb')!.condition).toEqual({ maker: ['M1'], model: ['X1'] });
    expect(seenContext.get('pp')).toBe(at('pp').global);
    expect(at('pa').global.condition).toEqual(condition);
  });
});
