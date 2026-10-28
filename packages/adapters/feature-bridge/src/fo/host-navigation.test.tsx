import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { House } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace, useToastsForTest } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { useHostSeam } from '@/lib/host/host-seam';
import type { HostSeam } from '@ap/feature-screens/global-screens/core';
import { setFoApi } from '../fo-api';
import { FoBridge } from './FoBridge';
import { hostLinks } from './links';
import { operatorRoute, routeHere, routeSearch } from './operator-route';

const space = testSpace({ homeMenuId: 'fo-inbox', carriedPageKeys: ['managedSystem'] });
const menu = (id: string, path: string, pageKeys: string[], primary = false) => ({
  id, group: groupId('overview'), primary, label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House,
  permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const,
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys,
});
const registry = createRegistry({
  spaces: [space],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [menu('fo-inbox', '/inbox', ['focus', 'q', 'severity', 'managedSystem', 'returnTo'], true), menu('fo-triage', '/triage', ['focus', 'managedSystem']), menu('fo-clusters', '/clusters', ['focus', 'managedSystem'])],
});

const inbox = operatorRoute({ foPath: '/vocs', foFixed: { view: 'inbox' }, menuId: 'fo-inbox', keys: { selected: 'focus', q: 'q', 'filter.severity': 'severity' } });
const triage = operatorRoute({ foPath: '/vocs', foFixed: { view: 'triage' }, menuId: 'fo-triage', keys: { selected: 'focus' } });
const clusters = operatorRoute({
  foPath: '/voc-clusters', foFixed: {}, menuId: 'fo-clusters', keys: { selected: 'focus', managedSystem: 'managedSystem' }, foAbsent: { managedSystem: 'all' },
  detailPath: { key: 'selected', pattern: /^c\d$/ },
});
const { useNavigate } = hostLinks(inbox.target, triage.target);
const clusterLinks = hostLinks(clusters.target);
const useSearch = routeSearch(inbox);
const useHere = routeHere(inbox);

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>;
}

const at = (url: string) => window.history.replaceState(null, '', url);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
});

/** Mounts with react-dom directly (this test predates the `./testing` harness, which brings `@testing-library/react` as a devDependency). */
function render(ui: ReactElement, options: { wrapper?: (props: { children: ReactNode }) => ReactElement } = {}) {
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  roots.push(root);
  act(() => root.render(options.wrapper ? options.wrapper({ children: ui }) : ui));
}

function renderHook<T>(hook: () => T, options: { wrapper?: (props: { children: ReactNode }) => ReactElement } = {}) {
  const result = { current: undefined as T };
  function Host() { result.current = hook(); return null; }
  render(<Host />, options);
  return { result };
}

async function waitFor(check: () => void) {
  for (let attempt = 0; ; attempt++) {
    try { check(); return; } catch (error) {
      if (attempt > 50) throw error;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    }
  }
}

describe('hostLinks().useNavigate on a mounted platform', () => {
  it('moves to the linkTo href, replacing history, and clears an absent page key but keeps the carried one', () => {
    at('/inbox?v=1&managedSystem=ms1&q=old&focus=a');
    const { result } = renderHook(() => ({ go: useNavigate(), platform: usePlatform() }), { wrapper });
    const before = window.history.length;
    act(() => result.current.go('/vocs?view=inbox&filter.severity=high', { replace: true }));
    const params = new URLSearchParams(window.location.search);
    expect(window.location.pathname).toBe('/mars/fo-inbox');
    expect(params.get('severity')).toBe('high');
    expect(params.get('q')).toBeNull();
    expect(params.get('focus')).toBeNull();
    expect(params.get('managedSystem')).toBe('ms1');
    expect(window.history.length).toBe(before);
  });

  it('moves across menus', () => {
    at('/inbox?v=1&managedSystem=ms1');
    const { result } = renderHook(() => useNavigate(), { wrapper });
    act(() => result.current('/vocs?view=triage&selected=x'));
    expect(window.location.pathname).toBe('/mars/fo-triage');
    expect(new URLSearchParams(window.location.search).get('focus')).toBe('x');
  });

  it('is a no-op for an unmapped path', () => {
    at('/inbox?v=1&q=old');
    const { result } = renderHook(() => useNavigate(), { wrapper });
    const url = window.location.href;
    const before = window.history.length;
    act(() => result.current('/tasks?view=inbox'));
    act(() => result.current('/vocs?view=inbox&sort=x', { replace: true }));
    expect(window.location.href).toBe(url);
    expect(window.history.length).toBe(before);
  });
});

describe('a space that carries returnTo (#760)', () => {
  const carrying = createRegistry({
    spaces: [testSpace({ homeMenuId: 'fo-inbox', carriedPageKeys: ['managedSystem', 'returnTo'] })],
    groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
    menus: [menu('fo-inbox', '/inbox', ['focus', 'q', 'severity', 'managedSystem', 'returnTo'], true), menu('fo-triage', '/triage', ['focus', 'managedSystem', 'returnTo'])],
  });
  const carryingWrapper = ({ children }: { children: ReactNode }) => <I18nProvider><PlatformProvider adapter={adapter} registry={carrying}>{children}</PlatformProvider></I18nProvider>;

  it('an operator filter navigation from a URL without returnTo creates none', () => {
    at('/inbox?v=1&managedSystem=ms1');
    const { result } = renderHook(() => useNavigate(), { wrapper: carryingWrapper });
    act(() => result.current('/vocs?view=triage&selected=x'));
    expect(window.location.pathname).toBe('/mars/fo-triage');
    expect(new URLSearchParams(window.location.search).has('returnTo')).toBe(false);
  });

  it('keeps exactly one returnTo when the URL already carries it', () => {
    at('/inbox?v=1&managedSystem=ms1&returnTo=%2Fanalytics%3Fv%3D1');
    const { result } = renderHook(() => useNavigate(), { wrapper: carryingWrapper });
    act(() => result.current('/vocs?view=triage&selected=x'));
    expect(window.location.pathname).toBe('/mars/fo-triage');
    expect(new URLSearchParams(window.location.search).getAll('returnTo')).toEqual(['/analytics?v=1']);
  });
});

describe('an explicit managedSystem=all', () => {
  it('clears the carried scope, writes no literal "all", and the screen reads no scope', () => {
    at('/clusters?v=1&managedSystem=ms1&focus=c1');
    const { result } = renderHook(() => ({ go: clusterLinks.useNavigate(), search: routeSearch(clusters)() }), { wrapper });
    act(() => result.current.go('/voc-clusters?managedSystem=all&selected=c2'));
    const params = new URLSearchParams(window.location.search);
    expect(params.get('managedSystem')).toBeNull();
    expect(params.get('focus')).toBe('c2');
    expect(window.location.search).not.toContain('all');
    expect(result.current.search).toEqual({ selected: 'c2' });
  });

  it('keeps inheriting the carried scope when the key is omitted', () => {
    at('/clusters?v=1&managedSystem=ms1');
    const { result } = renderHook(() => clusterLinks.useNavigate(), { wrapper });
    act(() => result.current('/voc-clusters?selected=c2'));
    expect(new URLSearchParams(window.location.search).get('managedSystem')).toBe('ms1');
  });

  it('keeps no scope when navigating from an inbound all (a selection write does not bring it back)', () => {
    at('/clusters?v=1&managedSystem=all');
    const { result } = renderHook(() => ({ go: clusterLinks.useNavigate(), search: routeSearch(clusters)() }), { wrapper });
    expect(result.current.search).toEqual({ managedSystem: 'all' });
    act(() => result.current.go(`/voc-clusters?managedSystem=${result.current.search.managedSystem}&selected=c1`, { replace: true }));
    expect(window.location.search).not.toContain('managedSystem');
    expect(new URLSearchParams(window.location.search).get('focus')).toBe('c1');
  });

  it('Link draws an href without the carried scope', () => {
    at('/clusters?v=1&managedSystem=ms1');
    const { Link } = clusterLinks;
    render(<Link to="/voc-clusters?managedSystem=all&selected=c2">x</Link>, { wrapper });
    const href = document.querySelector('a')!.getAttribute('href')!;
    expect(href).toContain('focus=c2');
    expect(href).not.toContain('managedSystem');
  });
});

describe('a VOC detail cluster href', () => {
  it('the producer href /voc-clusters/<id> navigates to the clusters menu with focus', () => {
    at('/inbox?v=1&managedSystem=ms1');
    const { result } = renderHook(() => clusterLinks.useNavigate(), { wrapper });
    expect(clusterLinks.canLink('/voc-clusters/c7')).toBe(true);
    act(() => result.current('/voc-clusters/c7'));
    expect(window.location.pathname).toBe('/mars/fo-clusters');
    expect(new URLSearchParams(window.location.search).get('focus')).toBe('c7');
  });
});

describe('FoBridge seam', () => {
  afterEach(() => setFoApi(null));

  it('keeps one seam object across a URL change and carries the module-level hooks', async () => {
    setFoApi({ basePath: '/fo', onSessionLost: () => undefined });
    at('/inbox?v=1&q=a');
    const seams: HostSeam[] = [];
    let go!: (url: string) => void;
    function Probe() {
      seams.push(useHostSeam());
      go = usePlatform().navigate as unknown as (url: string) => void;
      return null;
    }
    render(<FoBridge useNavigate={useNavigate} useSearch={useSearch} useHere={useHere}><Probe /></FoBridge>, { wrapper });
    await waitFor(() => expect(seams.length).toBeGreaterThan(0));
    act(() => go('/inbox?v=1&q=b'));
    act(() => go('/triage?v=1'));
    const first = seams[0]!;
    expect(seams.length).toBeGreaterThan(1);
    expect(seams.every(seam => seam === first)).toBe(true);
    expect(first.useNavigate).toBe(useNavigate);
    expect(first.useSearch).toBe(useSearch);
    expect(first.useHere).toBe(useHere);
  });

  it('defaults to a no-op navigate and an empty search', async () => {
    setFoApi({ basePath: '/fo', onSessionLost: () => undefined });
    at('/inbox?v=1');
    let seam!: HostSeam;
    function Probe() { seam = useHostSeam(); return null; }
    render(<FoBridge><Probe /></FoBridge>, { wrapper });
    await waitFor(() => expect(seam).toBeDefined());
    expect(seam.useSearch!()).toEqual({});
    expect(() => seam.useTitle!('x')).not.toThrow();
    expect(seam.useHere!()).toBe('');
  });

  it('never registers a default host: a screen outside FoBridge still throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useHostSeam(), { wrapper })).toThrow('HostSeamProvider is missing');
    error.mockRestore();
  });
});

describe('FoBridge seam notices', () => {
  afterEach(() => setFoApi(null));

  function mountSeam() {
    setFoApi({ basePath: '/fo', onSessionLost: () => undefined });
    at('/inbox?v=1');
    const live = { seam: undefined as HostSeam | undefined, toasts: [] as ReturnType<typeof useToastsForTest> };
    function Probe() {
      live.seam = useHostSeam();
      live.toasts = useToastsForTest();
      return null;
    }
    render(<FoBridge><Probe /></FoBridge>, { wrapper });
    return live;
  }

  // The kernel toast list is what the shell draws: its `action` is the one button, so calling it is the click.
  it('notify with an action adds a kernel toast whose action runs onAction, and returns its id', async () => {
    const live = mountSeam();
    await waitFor(() => expect(live.seam).toBeDefined());
    const onAction = vi.fn();
    let id = '';
    act(() => { id = live.seam!.notify!({ tone: 'warning', message: '충돌', description: '다시 불러오세요', action: { label: '다시 불러오기', onAction }, durationMs: 9000, variant: 'undo' }); });
    expect(live.toasts).toHaveLength(1);
    expect(live.toasts[0]).toMatchObject({ id: Number(id), text: '충돌', tone: 'warning', detail: '다시 불러오세요', action: { label: '다시 불러오기' } });
    act(() => live.toasts[0]!.action!.onAction());
    expect(onAction).toHaveBeenCalledOnce();
  });

  // Infinity would fire the kernel's setTimeout at once; the bridge drops it so the kernel default (8000 ms with an action) applies (#763 D5).
  it('notify without a duration keeps FO undo notices to the 8 s undo window (#886 UX-2)', async () => {
    const live = mountSeam();
    await waitFor(() => expect(live.seam).toBeDefined());
    vi.useFakeTimers();
    try {
      act(() => { live.seam!.notify!({ tone: 'success', message: 'VOC-1 Triage 확정됨', action: { label: '실행 취소', onAction: () => undefined } }); });
      expect(live.toasts).toHaveLength(1);
      act(() => { vi.advanceTimersByTime(7999); });
      expect(live.toasts).toHaveLength(1);
      act(() => { vi.advanceTimersByTime(1); });
      expect(live.toasts).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });

  it('notify with a non-finite duration keeps the action toast until it is dismissed (kernel action default, #886)', async () => {
    const live = mountSeam();
    await waitFor(() => expect(live.seam).toBeDefined());
    vi.useFakeTimers();
    try {
      act(() => { live.seam!.notify!({ tone: 'info', message: '변환됨', action: { label: '열기', onAction: () => undefined }, durationMs: Number.POSITIVE_INFINITY }); });
      expect(live.toasts).toHaveLength(1);
      act(() => { vi.advanceTimersByTime(60_000); });
      expect(live.toasts).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it.each([['success', 'info'], ['info', 'info'], ['warning', 'warning'], ['error', 'danger']] as const)('maps the %s tone to the kernel %s tone', async (tone, kernelTone) => {
    const live = mountSeam();
    await waitFor(() => expect(live.seam).toBeDefined());
    act(() => { live.seam!.notify!({ tone, message: 'm' }); });
    expect(live.toasts[0]).toMatchObject({ text: 'm', tone: kernelTone });
    expect(live.toasts[0]!.action).toBeUndefined();
  });

  it('dismiss(id) removes that toast only', async () => {
    const live = mountSeam();
    await waitFor(() => expect(live.seam).toBeDefined());
    let first = '';
    act(() => { first = live.seam!.notify!({ tone: 'info', message: 'one' }); live.seam!.notify!({ tone: 'info', message: 'two' }); });
    expect(live.toasts.map(toast => toast.text)).toEqual(['one', 'two']);
    act(() => live.seam!.dismiss!(first));
    expect(live.toasts.map(toast => toast.text)).toEqual(['two']);
  });
});

describe('routeHere', () => {
  it('is the FO path with the non-empty search of the current page, fixed keys first', () => {
    at('/inbox?v=1&focus=abc&q=pump&unmapped=1');
    const { result } = renderHook(() => routeHere(inbox)(), { wrapper });
    expect(result.current).toBe('/vocs?view=inbox&selected=abc&q=pump');
  });

  it('follows the page when the URL changes', () => {
    at('/inbox?v=1');
    const { result } = renderHook(() => ({ here: useHere(), platform: usePlatform() }), { wrapper });
    expect(result.current.here).toBe('/vocs?view=inbox');
    // Same cast as the seam-identity test: a literal URL in a test is not menu code building a link.
    const go = result.current.platform.navigate as unknown as (url: string) => void;
    act(() => go('/inbox?v=1&q=b'));
    expect(result.current.here).toBe('/vocs?view=inbox&q=b');
  });
});

describe('routeSearch', () => {
  it('reads the current page through the route table', () => {
    at('/inbox?v=1&focus=abc&q=pump&unmapped=1');
    const { result } = renderHook(() => routeSearch(inbox)(), { wrapper });
    expect(result.current).toEqual({ view: 'inbox', selected: 'abc', q: 'pump' });
  });

  it('is stable while the page stays and new on each navigation, also back to an earlier URL', () => {
    at('/inbox?v=1&q=a');
    const { result } = renderHook(() => ({ search: routeSearch(inbox)(), platform: usePlatform() }), { wrapper });
    const first = result.current.search;
    const go = result.current.platform.navigate as unknown as (url: string) => void;
    act(() => go('/inbox?v=1&q=b'));
    expect(result.current.search).not.toBe(first);
    act(() => go('/inbox?v=1&q=a'));
    expect(result.current.search).toEqual(first);
    expect(result.current.search).not.toBe(first);
  });
});

describe('a target whose menu is not in the registry', () => {
  const lone = createRegistry({
    spaces: [space],
    groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
    menus: [menu('fo-inbox', '/inbox', ['focus', 'q', 'severity', 'managedSystem', 'returnTo'], true)],
  });
  const loneWrapper = ({ children }: { children: ReactNode }) => <I18nProvider><PlatformProvider adapter={adapter} registry={lone}>{children}</PlatformProvider></I18nProvider>;
  const { Link, targetOf } = hostLinks(inbox.target, triage.target);

  it('renders an unlinked Link and a no-op navigate instead of throwing', () => {
    at('/inbox?v=1');
    render(<><Link to="/vocs?view=inbox&selected=a">수신함</Link><Link to="/vocs?view=triage">분류</Link></>, { wrapper: loneWrapper });
    expect(document.querySelector('a[href*="focus=a"]')).not.toBeNull();
    expect(Array.from(document.querySelectorAll('a')).some(anchor => anchor.textContent === '분류')).toBe(false);
    const { result } = renderHook(() => hostLinks(triage.target).useNavigate(), { wrapper: loneWrapper });
    const url = window.location.href;
    act(() => result.current('/vocs?view=triage'));
    expect(window.location.href).toBe(url);
  });

  it('is unlinked in the seam (canLink) and gives no copy-link address', async () => {
    setFoApi({ basePath: '/fo', onSessionLost: () => undefined });
    at('/inbox?v=1');
    let seam!: HostSeam;
    function Probe() { seam = useHostSeam(); return null; }
    render(<FoBridge targetOf={targetOf}><Probe /></FoBridge>, { wrapper: loneWrapper });
    await waitFor(() => expect(seam).toBeDefined());
    expect(seam.canLink('/vocs?view=inbox&q=a')).toBe(true);
    expect(seam.canLink('/vocs?view=triage')).toBe(false);
    expect(seam.absoluteHref!('/vocs?view=triage')).toBeNull();
    setFoApi(null);
  });
});

describe('FoBridge absoluteHref', () => {
  afterEach(() => setFoApi(null));
  const { targetOf } = hostLinks(inbox.target, triage.target);

  it('is the absolute linkTo URL of the mapped target (no returnTo), null for an unmapped path', async () => {
    setFoApi({ basePath: '/fo', onSessionLost: () => undefined });
    at('/inbox?v=1&managedSystem=ms1');
    const seams: HostSeam[] = [];
    let go!: (url: string) => void;
    function Probe() { seams.push(useHostSeam()); go = usePlatform().navigate as unknown as (url: string) => void; return null; }
    render(<FoBridge targetOf={targetOf}><Probe /></FoBridge>, { wrapper });
    await waitFor(() => expect(seams.length).toBeGreaterThan(0));
    const first = seams[0]!;
    const href = first.absoluteHref!('/vocs?view=triage&selected=x')!;
    const url = new URL(href);
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe('/mars/fo-triage');
    expect(url.searchParams.get('focus')).toBe('x');
    expect(url.searchParams.get('managedSystem')).toBe('ms1');
    expect(url.searchParams.has('returnTo')).toBe(false);
    expect(first.absoluteHref!('/tasks?view=board')).toBeNull();
    act(() => go('/inbox?v=1&managedSystem=ms2'));
    expect(new URL(seams.at(-1)!.absoluteHref!('/vocs?view=triage')!).searchParams.get('managedSystem')).toBe('ms2');
  });

  it('tells the screens the platform owns the page title', async () => {
    setFoApi({ basePath: '/fo', onSessionLost: () => undefined });
    at('/inbox?v=1');
    let seam!: HostSeam;
    function Probe() { seam = useHostSeam(); return null; }
    render(<FoBridge><Probe /></FoBridge>, { wrapper });
    await waitFor(() => expect(seam).toBeDefined());
    expect(seam.hostOwnsTitle).toBe(true);
    expect(seam.hostCarriesReturn).toBe(true);
  });

  it('renders the address of the same navigation (a copy URL never keeps the cleared scope), and rebuilds the seam only on navigation', async () => {
    setFoApi({ basePath: '/fo', onSessionLost: () => undefined });
    at('/inbox?v=1&focus=a&managedSystem=ms1');
    const seams: HostSeam[] = [];
    let go!: (url: string) => void;
    let rerender!: () => void;
    function Copy() {
      const seam = useHostSeam();
      seams.push(seam);
      return <a data-testid="copy" href={seam.absoluteHref!('/vocs?view=inbox&selected=a') ?? ''}>copy</a>;
    }
    function Probe() { go = usePlatform().navigate as unknown as (url: string) => void; return null; }
    function Host() {
      const [, setN] = useState(0);
      rerender = () => setN(n => n + 1);
      return <FoBridge targetOf={targetOf}><Probe /><Copy /></FoBridge>;
    }
    render(<Host />, { wrapper });
    await waitFor(() => expect(document.querySelector('[data-testid=copy]')).not.toBeNull());
    const copied = () => new URL((document.querySelector('[data-testid=copy]') as HTMLAnchorElement).href);
    expect(copied().searchParams.get('managedSystem')).toBe('ms1');
    const first = seams.at(-1)!;
    act(() => rerender());
    expect(seams.at(-1)).toBe(first);
    act(() => go('/inbox?v=1&focus=a'));
    expect(copied().searchParams.has('managedSystem')).toBe(false);
    expect(copied().searchParams.get('focus')).toBe('a');
    expect(seams.at(-1)).not.toBe(first);
  });
});
