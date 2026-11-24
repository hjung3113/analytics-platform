import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedGuard, useLeaveRequest } from '../hooks';
import { I18nProvider } from '../../i18n';
import { PaneScreenProvider, PlatformProvider, useHostPlatform, type LinkOptions, type ReturnOrigin } from '../platform';
import { createRegistry } from '../../registry/registry';
import { stripReturnToFromUrl } from '../../links/return-to';
import { memoryStorage, noContext, testAdapter, testSession, testSpace, testScreen } from '../../testing';
import { carrySetId, groupId, spaceId } from '@ap/contracts';

const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, group: string, path: string, pageKeys: string[], extra: object = {}) => ({
  id, group: groupId(group), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, component: testScreen, permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'analysis' as const, query: { mode: 'live' as const }, features: noFeatures, pageKeys, ...extra,
});
// `carry` carries `returnTo` (like a feature space); `plain` carries nothing; `g-detail` is a global menu that accepts a way back.
const registry = createRegistry({
  carrySets: [{ id: carrySetId('carry'), pageKeys: ['m', 'returnTo'] }],
  spaces: [
    testSpace({ id: spaceId('carry'), label: { ko: '피드백', en: 'Feedback' }, homeMenuId: 'carry-a' }),
    testSpace({ id: spaceId('plain'), label: { ko: '분석', en: 'Analysis' }, homeMenuId: 'origin' }),
  ],
  groups: [
    { id: groupId('carry'), label: { ko: '피드백', en: 'Feedback' }, icon: House, space: spaceId('carry') },
    { id: groupId('plain'), label: { ko: '분석', en: 'Analysis' }, icon: House, space: spaceId('plain') },
    { id: groupId('global'), label: { ko: '전역', en: 'Global' }, icon: House, space: null },
  ],
  menus: [
    entry('carry-a', 'carry', '/carry/a', ['m', 'returnTo'], { primary: true, carrySet: carrySetId('carry') }),
    entry('carry-b', 'carry', '/carry/b', ['m', 'n', 'returnTo'], { carrySet: carrySetId('carry') }),
    entry('origin', 'plain', '/origin', [], { primary: true }),
    entry('p-detail', 'plain', '/plain/detail', ['returnTo']),
    entry('g-detail', 'global', '/g/detail', ['returnTo'], { primary: true }),
  ],
});

const ORIGIN = '/origin?v=1&from=2026-10-01T00:00:00&to=2026-10-02T00:00:00';
const withOrigin = (path: string) => `${path}${path.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(ORIGIN)}`;
const query = (href: string) => new URLSearchParams(href.slice(href.indexOf('?') + 1));

let host: ReturnType<typeof useHostPlatform> | null = null;
function Probe() {
  host = useHostPlatform();
  return <p data-testid="ready">ready</p>;
}
function mountAt(url: string) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
  screen.getByTestId('ready');
  return host!;
}
const linkFrom = (url: string, menuId: string, options?: LinkOptions) => mountAt(url).resolveLink(menuId, options).href!;
const originFrom = (url: string): ReturnOrigin => mountAt(url).returnOrigin();

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); host = null; vi.unstubAllGlobals(); });

describe('returnTo in a space that carries it (#760, ADR-0081 UX-10)', () => {
  it('(a) a same-space link keeps the carried returnTo exactly once, whatever options.returnTo says', () => {
    const href = linkFrom(withOrigin('/carry/a?v=1&m=x'), 'carry-b', { returnTo: true });
    expect(query(href).getAll('returnTo')).toEqual([ORIGIN]);
    expect(query(href).get('m')).toBe('x');
  });

  it("(a') a same-space link with no carried returnTo never mints one", () => {
    expect(query(linkFrom('/carry/a?v=1&m=x', 'carry-b', { returnTo: true })).has('returnTo')).toBe(false);
  });

  it.each([
    { name: 'carrying screen with a carried returnTo → a plain-space detail', url: withOrigin('/carry/a?v=1&m=x'), target: 'p-detail' },
    { name: 'carrying screen without a returnTo → a plain-space detail', url: '/carry/a?v=1&m=x', target: 'p-detail' },
    { name: 'carrying screen → a global detail', url: withOrigin('/carry/a?v=1'), target: 'g-detail' },
  ])('(b) $name: returnTo is the current URL', ({ url, target }) => {
    const href = linkFrom(url, target, { returnTo: true });
    expect(query(href).getAll('returnTo')).toEqual([window.location.pathname + window.location.search]);
  });

  it('(b) a caller outside the carrying space keeps appending its own URL', () => {
    const href = linkFrom('/plain/origin?v=1', 'p-detail', { returnTo: true });
    expect(query(href).getAll('returnTo')).toEqual(['/plain/origin?v=1']);
  });

  it('(c) leaving the carrying space drops returnTo', () => {
    expect(query(linkFrom(withOrigin('/carry/a?v=1'), 'origin')).has('returnTo')).toBe(false);
    cleanup();
    expect(query(linkFrom(withOrigin('/carry/a?v=1'), 'g-detail')).has('returnTo')).toBe(false);
  });

  it.each([
    { name: 'an accepted origin in another space', url: withOrigin('/carry/a?v=1'), accepted: true, spaceLabel: { ko: '분석', en: 'Analysis' } },
    { name: 'an accepted global-menu origin', url: `/carry/a?v=1&returnTo=${encodeURIComponent('/g/detail?v=1')}`, accepted: true, spaceLabel: null },
    { name: 'an unknown path', url: `/carry/a?v=1&returnTo=${encodeURIComponent('/nowhere?v=1')}`, accepted: false, spaceLabel: null },
    { name: 'an absolute URL', url: `/carry/a?v=1&returnTo=${encodeURIComponent('https://evil.test/origin')}`, accepted: false, spaceLabel: null },
    { name: 'no returnTo', url: '/carry/a?v=1', accepted: false, spaceLabel: null },
  ])('(d) ReturnOrigin for $name', ({ url, accepted, spaceLabel }) => {
    const origin = originFrom(url);
    expect(origin.accepted).toBe(accepted);
    expect(origin.spaceLabel).toEqual(spaceLabel);
  });

  it('(e) the last-screen and recents stores never keep returnTo, and keep the canonical address of an alias entry', async () => {
    mountAt(withOrigin('/carry/b?v=1&m=x'));
    await waitFor(() => expect(sessionStorage.getItem('platform:space-last:u1')).not.toBeNull());
    expect(JSON.parse(sessionStorage.getItem('platform:space-last:u1')!)).toEqual({ carry: '/carry/carry-b?v=1&m=x' });
    await waitFor(() => expect(localStorage.getItem('platform:recent:u1')).not.toBeNull());
    expect(JSON.parse(localStorage.getItem('platform:recent:u1')!).map((r: { url: string }) => r.url)).toEqual(['/carry/carry-b?v=1&m=x']);
  });
});

describe('space entry and the carry set', () => {
  it('resumes the last screen with its own page keys but not the carry-set keys', () => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ carry: '/carry/carry-b?v=1&m=x&n=y' }));
    const resumed = mountAt('/origin?v=1').spaceEntry(spaceId('carry'));
    expect(resumed?.menuId).toBe('carry-b');
    expect(resumed?.resumed).toBe(true);
    expect(query(resumed!.href).get('n')).toBe('y');
    expect(query(resumed!.href).has('m')).toBe(false);
  });
});

describe('stripReturnToFromUrl', () => {
  it.each([
    ['/carry/b?v=1&returnTo=%2Forigin%3Fv%3D1&m=x', '/carry/b?v=1&m=x'],
    ['/carry/b?returnTo=%2Forigin', '/carry/b'],
    ['/carry/b?v=1&m=a%20b', '/carry/b?v=1&m=a%20b'],
    ['/carry/b', '/carry/b'],
  ])('%s → %s', (input, expected) => expect(stripReturnToFromUrl(input)).toBe(expected));
});

// Reload / Back / Forward across a carry set that spans two spaces and a global menu (#1099b): the first accepted origin must ride the real history entries.
describe('a carry set across spaces and a global menu survives Back, Forward and reload (#1099b)', () => {
  const SPAN = carrySetId('span');
  const member = (id: string, group: string, path: string, extra: object = {}) => entry(id, group, path, ['k', 'returnTo'], { carrySet: SPAN, ...extra });
  const spanRegistry = createRegistry({
    carrySets: [{ id: SPAN, pageKeys: ['k', 'returnTo'] }],
    spaces: [
      testSpace({ id: spaceId('left'), label: { ko: '왼쪽', en: 'Left' }, homeMenuId: 'l1' }),
      testSpace({ id: spaceId('right'), label: { ko: '오른쪽', en: 'Right' }, homeMenuId: 'origin' }),
    ],
    groups: [
      { id: groupId('left'), label: { ko: '왼쪽', en: 'Left' }, icon: House, space: spaceId('left') },
      { id: groupId('right'), label: { ko: '오른쪽', en: 'Right' }, icon: House, space: spaceId('right') },
      { id: groupId('global'), label: { ko: '전역', en: 'Global' }, icon: House, space: null },
    ],
    menus: [
      member('l1', 'left', '/l/one', { primary: true }),
      member('r1', 'right', '/r/one'),
      member('g1', 'global', '/g/one', { primary: true }),
      entry('origin', 'right', '/origin', [], { primary: true }),
      entry('locked', 'right', '/locked', [], { permission: 'console:access' as const }),
    ],
  });
  let spanHost: ReturnType<typeof useHostPlatform> | null = null;
  function SpanProbe() {
    spanHost = useHostPlatform();
    return <p data-testid="ready">{spanHost.url}</p>;
  }
  function mountSpan(url: string) {
    window.history.replaceState(null, '', url);
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={spanRegistry}><SpanProbe /></PlatformProvider></I18nProvider>);
  }
  const at = (url: string) => waitFor(() => expect(screen.getByTestId('ready').textContent).toBe(url));
  const carried = () => ({ k: spanHost!.pageParam('k'), returnTo: spanHost!.pageParam('returnTo') });

  it('keeps k and the first accepted origin through every step, and the return row still points at the origin', async () => {
    const start = `/left/l1?v=1&k=x&returnTo=${encodeURIComponent(ORIGIN)}`;
    mountSpan(start);
    await at(start);
    const toRight = spanHost!.resolveLink('r1').href!;
    act(() => { spanHost!.navigate(toRight); });
    await at(toRight);
    expect(spanHost!.route?.menu.id).toBe('r1');
    const toGlobal = spanHost!.resolveLink('g1', { returnTo: true }).href!;
    act(() => { spanHost!.navigate(toGlobal); });
    await at(toGlobal);
    expect(spanHost!.route?.menu.id).toBe('g1');
    expect(carried()).toEqual({ k: 'x', returnTo: ORIGIN });

    act(() => { window.history.back(); });
    await at(toRight);
    expect(spanHost!.route?.menu.id).toBe('r1');
    expect(carried()).toEqual({ k: 'x', returnTo: ORIGIN });
    act(() => { window.history.back(); });
    await at(start);
    act(() => { window.history.forward(); });
    await at(toRight);
    expect(carried()).toEqual({ k: 'x', returnTo: ORIGIN });

    // Reload: a fresh mount at the address the browser kept.
    cleanup();
    const reloaded = window.location.pathname + window.location.search;
    mountSpan(reloaded);
    await at(reloaded);
    expect(carried()).toEqual({ k: 'x', returnTo: ORIGIN });
    const origin = spanHost!.returnOrigin();
    expect(origin.accepted).toBe(true);
    expect(origin.href).toBe(ORIGIN);
  });

  it.each([
    { name: 'a retired path', origin: '/nowhere?v=1' },
    { name: 'a menu the user may not open', origin: '/locked?v=1' },
  ])('$name: the origin crosses spaces as data but is never accepted, before or after reload', async ({ origin }) => {
    const start = `/left/l1?v=1&k=x&returnTo=${encodeURIComponent(origin)}`;
    mountSpan(start);
    await at(start);
    expect(spanHost!.returnOrigin().accepted).toBe(false);
    const toRight = spanHost!.resolveLink('r1').href!;
    act(() => { spanHost!.navigate(toRight); });
    await at(toRight);
    expect(spanHost!.route?.menu.id).toBe('r1');
    expect(spanHost!.returnOrigin().accepted).toBe(false);
    expect(spanHost!.returnOrigin().href).not.toBe(origin);
    act(() => { window.history.back(); });
    await at(start);
    cleanup();
    mountSpan(window.location.pathname + window.location.search);
    await at(start);
    expect(carried().k).toBe('x');
    expect(spanHost!.returnOrigin().accepted).toBe(false);
  });

  it('an absolute-URL origin is never accepted on the source screen, whatever the link carries', async () => {
    mountSpan(`/left/l1?v=1&k=x&returnTo=${encodeURIComponent('https://evil.test/origin')}`);
    await waitFor(() => expect(spanHost!.route?.menu.id).toBe('l1'));
    expect(spanHost!.returnOrigin().accepted).toBe(false);
  });
});

describe('recorded return origin (#2866)', () => {
  const sourceUrl = registry.canonicalHref(ORIGIN);
  let notify: () => void;
  let session: ReturnType<typeof testSession>;
  let leave: ReturnType<typeof useLeaveRequest>;
  let pane: ReturnOrigin;
  const recordingRegistry = createRegistry({
    spaces: registry.spaces, groups: registry.groups, carrySets: registry.carrySets,
    menus: [...registry.menus.map(menu => menu.id === 'origin' ? { ...menu, aliases: ['/old-origin'] } : menu),
      entry('origin-detail', 'plain', '/origin/:id', ['level'], { contextResetKeys: ['level'], drill: { levels: [{ key: 'level', label: { ko: '단계', en: 'Level' } }] } })],
    retiredMenus: [{ id: 'old-detail', successor: 'origin-detail', paths: ['/old-detail/:legacyId'], page: { level: 'preset' } }],
  });
  function mount(url: string | null = sourceUrl, onDiscard?: () => void, showPane = false) {
    if (url !== null) window.history.replaceState(null, '', url);
    session = testSession(['platform:view']);
    const adapter = testAdapter({
      session: () => session,
      subscribe: listener => { notify = listener; return () => {}; },
    });
    function Guard() {
      useUnsavedGuard(onDiscard !== undefined, { onDiscard });
      leave = useLeaveRequest();
      return null;
    }
    function PaneProbe() {
      pane = useHostPlatform().returnOrigin();
      return null;
    }
    const tree = (activeAdapter = adapter, activeRegistry = recordingRegistry) => <I18nProvider><PlatformProvider adapter={activeAdapter} registry={activeRegistry}>
      <Probe /><Guard />
      {showPane && <PaneScreenProvider paneId="return-test" screen={{ menuId: 'carry-a', params: {}, query: detail.slice(detail.indexOf('?')) }}
        onLeave={() => {}} onChange={() => {}}><PaneProbe /></PaneScreenProvider>}
    </PlatformProvider></I18nProvider>;
    const { rerender } = render(tree());
    return {
      swapRegistry: () => rerender(tree(adapter, { ...recordingRegistry })),
      swapAdapter: () => rerender(tree(testAdapter({ session: () => session }))),
    };
  }
  const recorded = () => host!.returnOrigin().recorded ?? false;
  const go = (href: string, options?: { replace?: boolean }) => act(() => { host!.navigate(href, options); });
  const atOrigin = (path: string, source = sourceUrl) => path + '&returnTo=' + encodeURIComponent(source);
  const detail = atOrigin('/carry/carry-a?v=1');
  async function traverse(delta: number, href: string) {
    act(() => window.history.go(delta));
    await waitFor(() => expect(host!.url).toBe(href));
  }

  it.each([
    ['the canonical departure', sourceUrl, detail, true],
    ['a different departure', '/plain/origin?v=1', detail, false],
    ['an alias departure', '/old-origin?v=1', atOrigin('/carry/carry-a?v=1', '/old-origin?v=1'), true],
  ])('checks the actual source address for %s', (_label, source, target, expected) => {
    mount(source.startsWith('/old-origin') ? sourceUrl : source);
    act(() => {
      // Leave the alias before its canonicalizing effect, while it is the last accepted entry.
      if (source.startsWith('/old-origin')) host!.navigate(source);
      host!.navigate(target);
    });
    expect(recorded()).toBe(expected);
  });

  it('records a real departure from a scoped address to a destination without a Scope (a feature menu)', () => {
    const scoped = sourceUrl + (sourceUrl.includes('?') ? '&' : '?') + 'scopeId=S1';
    mount(scoped);
    go(atOrigin('/carry/carry-a?v=1', host!.url));
    expect(host!.returnOrigin()).toMatchObject({ accepted: true, recorded: true });
  });

  it('round-trips a parameterized alias and reads the original query before its preset', () => {
    mount();
    const alias = '/old-detail/E%202?v=1';
    expect(recordingRegistry.canonicalHref(alias)).toContain('level=preset');
    act(() => {
      host!.navigate(alias);
      host!.navigate(atOrigin('/carry/carry-a?v=1', alias));
    });
    expect(host!.returnOrigin()).toMatchObject({ accepted: true, recorded: true, href: alias, trail: [] });
  });

  it('stays neutral on initial entry and provider remount', () => {
    mount(detail);
    expect(recorded()).toBe(false);
    cleanup();
    mount();
    go(detail);
    expect(recorded()).toBe(true);
    cleanup();
    mount(null);
    expect(recorded()).toBe(false);
  });

  it('keeps local edits and carry-set hops, then drops an unrelated destination', () => {
    mount();
    go(detail);
    act(() => host!.setPage({ m: 'edit' }));
    expect(recorded()).toBe(true);
    go(host!.linkTo('carry-b'));
    expect(recorded()).toBe(true);
    go(atOrigin('/plain/p-detail?v=1'));
    expect(recorded()).toBe(false);
  });

  it('updates the replaced position, restores Back and Forward, and prunes a discarded branch', async () => {
    mount();
    go(detail);
    const edited = atOrigin('/carry/carry-a?v=1&m=edit');
    go(edited, { replace: true });
    await traverse(-1, sourceUrl);
    await traverse(1, edited);
    expect(recorded()).toBe(true);
    go('/carry/carry-a?v=1', { replace: true });
    go(edited, { replace: true });
    expect(recorded()).toBe(false);
    await traverse(-1, sourceUrl);
    go(detail);
    await traverse(-1, sourceUrl);
    go('/plain/p-detail?v=1');
    go(detail, { replace: true });
    expect(recorded()).toBe(false);
  });

  it.each(['unchanged', 'url', 'stamp'])('checks the live departure after discard (%s)', changed => {
    const transient = '/plain/origin?v=1';
    const target = changed === 'url' ? atOrigin('/carry/carry-a?v=1', transient) : detail;
    mount(sourceUrl, () => {
      if (changed === 'url') window.history.replaceState(window.history.state, '', transient);
      if (changed === 'stamp') window.history.replaceState({ apIdx: 4, apSeg: 'external' }, '', sourceUrl);
    });
    go(target);
    act(() => leave!.cancel());
    expect(host!.url).toBe(sourceUrl);
    expect(recorded()).toBe(false);
    go(target);
    act(() => leave!.confirm());
    expect(recorded()).toBe(changed === 'unchanged');
  });

  it.each(['scope', 'revision', 'session'])('clears records when %s changes', kind => {
    mount();
    go(detail);
    expect(recorded()).toBe(true);
    if (kind === 'scope') {
      act(() => host!.setGlobal({ scopeId: 'MEM' }, { replace: true }));
      go(detail, { replace: true });
    } else {
      if (kind === 'session') session = testSession(['platform:view'], { user: { id: 'u2' } });
      act(() => notify());
    }
    expect(recorded()).toBe(false);
  });

  it.each(['registry', 'adapter'])('retires existing history records after swapping the %s', async changed => {
    const { swapRegistry, swapAdapter } = mount();
    go(detail);
    expect(recorded()).toBe(true);
    await traverse(-1, sourceUrl);
    if (changed === 'registry') swapRegistry();
    else swapAdapter();
    await traverse(1, detail);
    expect(host!.returnOrigin().accepted).toBe(true);
    expect(recorded()).toBe(false);
  });

  it.each([null, { apIdx: 0, apSeg: 'foreign-segment' }])('retires older records after traversing a foreign entry (%j)', state => {
    mount();
    go(detail);
    expect(recorded()).toBe(true);
    const ownStamp: unknown = window.history.state;
    const pop = (entryState: unknown, href: string) => act(() => {
      window.history.replaceState(entryState, '', href);
      window.dispatchEvent(new PopStateEvent('popstate', { state: entryState }));
    });
    pop(state, sourceUrl);
    expect(host!.url).toBe(sourceUrl);
    pop(ownStamp, detail);
    expect(host!.returnOrigin().accepted).toBe(true);
    expect(recorded()).toBe(false);
  });

  it('publishes a scoped record only after Scope validation', async () => {
    const scoped = sourceUrl + '&scopeId=MEM';
    mount(scoped);
    go(atOrigin('/carry/carry-a?v=1&scopeId=MEM', scoped));
    expect(host!.returnOrigin().accepted).toBe(true);
    expect(recorded()).toBe(false);
    await waitFor(() => expect(recorded()).toBe(true));
  });

  it('keeps a pane neutral even when the main entry proves the same return address', () => {
    mount(sourceUrl, undefined, true);
    go(detail);
    expect(recorded()).toBe(true);
    expect(pane.accepted).toBe(true);
    expect(pane.recorded ?? false).toBe(false);
  });
});
