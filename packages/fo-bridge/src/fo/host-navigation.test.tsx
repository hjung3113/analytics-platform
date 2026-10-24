import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { House } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { useHostSeam } from '@/lib/host/host-seam';
import type { HostSeam } from '@fops/frontend/global-screens/core';
import { setFoApi } from '../fo-api';
import { FoBridge } from './FoBridge';
import { hostLinks } from './links';
import { operatorRoute, routeSearch } from './operator-route';

const space = testSpace({ homeMenuId: 'fo-inbox', carriedPageKeys: ['managedSystem'] });
const menu = (id: string, path: string, pageKeys: string[], primary = false) => ({
  id, group: groupId('overview'), primary, label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House,
  permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const,
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys,
});
const registry = createRegistry({
  spaces: [space],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [menu('fo-inbox', '/inbox', ['focus', 'q', 'severity', 'managedSystem', 'returnTo'], true), menu('fo-triage', '/triage', ['focus', 'managedSystem'])],
});

const inbox = operatorRoute({ foPath: '/vocs', foFixed: { view: 'inbox' }, menuId: 'fo-inbox', keys: { selected: 'focus', q: 'q', 'filter.severity': 'severity' } });
const triage = operatorRoute({ foPath: '/vocs', foFixed: { view: 'triage' }, menuId: 'fo-triage', keys: { selected: 'focus' } });
const { useNavigate } = hostLinks(inbox.target, triage.target);
const useSearch = routeSearch(inbox);

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

/** `@testing-library/react` is not a dependency of this package: mount with react-dom directly. */
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
    expect(window.location.pathname).toBe('/inbox');
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
    expect(window.location.pathname).toBe('/triage');
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
    render(<FoBridge useNavigate={useNavigate} useSearch={useSearch}><Probe /></FoBridge>, { wrapper });
    await waitFor(() => expect(seams.length).toBeGreaterThan(0));
    act(() => go('/inbox?v=1&q=b'));
    act(() => go('/triage?v=1'));
    const first = seams[0]!;
    expect(seams.length).toBeGreaterThan(1);
    expect(seams.every(seam => seam === first)).toBe(true);
    expect(first.useNavigate).toBe(useNavigate);
    expect(first.useSearch).toBe(useSearch);
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
  });

  it('never registers a default host: a screen outside FoBridge still throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useHostSeam(), { wrapper })).toThrow('HostSeamProvider is missing');
    error.mockRestore();
  });
});

describe('routeSearch', () => {
  it('reads the current page through the route table', () => {
    at('/inbox?v=1&focus=abc&q=pump&unmapped=1');
    const { result } = renderHook(() => routeSearch(inbox)(), { wrapper });
    expect(result.current).toEqual({ view: 'inbox', selected: 'abc', q: 'pump' });
  });
});
