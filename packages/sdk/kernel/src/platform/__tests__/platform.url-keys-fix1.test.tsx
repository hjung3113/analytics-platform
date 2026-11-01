import { act, cleanup, render } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { carrySetId, groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '../../index';
import { useHostPlatform } from '../../host';
import { noContext, testAdapter, testSession, testSpace } from '../../testing';

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (partial: Record<string, unknown> & { id: string; path: string; pageKeys: string[] }) => ({
  group: groupId('equipment'), label: { ko: partial.id, en: partial.id }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const, features,
  ...partial,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'items' })],
  groups: [{ id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: House, space: spaceId('mars') }],
  carrySets: [{ id: carrySetId('c'), pageKeys: ['tag', 'filter'] }],
  menus: [
    entry({ id: 'items', path: '/mars/items', pageKeys: ['q', 'tag', 'filter'], repeatedPageKeys: ['tag', 'filter'], hiddenPageKeys: ['filter'], primary: true }),
    entry({ id: 'detail', path: '/mars/detail', pageKeys: ['returnTo'], navHidden: true }),
    entry({ id: 'other', path: '/mars/other', pageKeys: ['filter', 'mode'], hiddenPageKeys: ['mode'] }),
    entry({ id: 'ca', path: '/mars/ca', pageKeys: ['tag', 'filter'], repeatedPageKeys: ['tag', 'filter'], hiddenPageKeys: ['filter'], carrySet: carrySetId('c') }),
    entry({ id: 'cb', path: '/mars/cb', pageKeys: ['tag', 'filter'], repeatedPageKeys: ['tag', 'filter'], hiddenPageKeys: ['filter'], carrySet: carrySetId('c') }),
  ],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

let platform: ReturnType<typeof useHostPlatform>;
function Probe() { platform = useHostPlatform(); return null; }
function mount(url: string, state: unknown = null, children: ReactNode = null) {
  window.history.replaceState(state, '', url);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe />{children}</PlatformProvider></I18nProvider>);
}
const address = () => window.location.pathname + window.location.search;
const stateHidden = () => (window.history.state as { apHidden?: { v: number; pairs: [string, string][] } } | null)?.apHidden;

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.sessionStorage.clear(); window.history.replaceState(null, '', '/'); });

describe('F1: returnTo never carries hidden pairs; they come back on the return trip', () => {
  it('the outbound address and the return link hold no hidden value, and following the return link restores the hidden pairs', () => {
    mount('/mars/items?v=1&q=x');
    act(() => platform.setPage({ filter: ['secret', 'two'] }));
    const out = platform.linkTo('detail', { returnTo: true });
    expect(out).not.toContain('secret');
    act(() => { platform.navigate(out); });
    expect(address()).not.toContain('secret');
    expect(decodeURIComponent(address())).toContain('returnTo=/mars/items?v=1&q=x');
    expect(platform.returnTarget()).toBe('/mars/items?v=1&q=x');
    act(() => { platform.navigate(platform.returnTarget()); });
    expect(address()).toBe('/mars/items?v=1&q=x');
    expect(platform.pageParams('filter')).toEqual(['secret', 'two']);
    expect(stateHidden()).toEqual({ v: 1, pairs: [['filter', 'secret'], ['filter', 'two']] });
  });

  it('a plain visit to the same address does not bring hidden pairs back', () => {
    mount('/mars/items?v=1&q=x');
    act(() => platform.setPage({ filter: ['secret'] }));
    act(() => { platform.navigate(platform.linkTo('detail', { returnTo: true })); });
    act(() => { platform.navigate('/mars/other?v=1'); });
    act(() => { platform.navigate('/mars/items?v=1&q=x'); });
    expect(platform.pageParams('filter')).toEqual([]);
  });

  it('without usable sessionStorage the hidden pairs are dropped, not exposed', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
    mount('/mars/items?v=1&q=x');
    act(() => platform.setPage({ filter: ['secret'] }));
    const out = platform.linkTo('detail', { returnTo: true });
    act(() => { platform.navigate(out); });
    expect(address()).not.toContain('secret');
    act(() => { platform.navigate(platform.returnTarget()); });
    expect(address()).toBe('/mars/items?v=1&q=x');
    expect(platform.pageParams('filter')).toEqual([]);
  });

  it('restored pairs are validated against the destination: undeclared keys and extra values of a single-value key are dropped', () => {
    window.sessionStorage.setItem('ap.kernel.returnHidden', JSON.stringify({ v: 1, entries: [['/mars/other?v=1', [['mode', 'a'], ['mode', 'b'], ['filter', 'c']]]] }));
    mount('/mars/detail?v=1&returnTo=%2Fmars%2Fother%3Fv%3D1');
    act(() => { platform.navigate(platform.returnTarget()); });
    expect(platform.pageParams('mode')).toEqual(['a']);
    expect(platform.pageParams('filter')).toEqual([]);
    expect(address()).toBe('/mars/other?v=1');
  });
});

describe('F5: a carry set carries the whole ordered collection', () => {
  it('visible and hidden repeated carry keys keep every value in order', () => {
    mount('/mars/ca?v=1&tag=b&tag=a', { apHidden: { v: 1, pairs: [['filter', 'y'], ['filter', 'x']] } });
    const href = platform.linkTo('cb');
    expect(href).toContain('tag=b&tag=a');
    expect(href).toContain('filter=y&filter=x');
    act(() => { platform.navigate(href); });
    expect(platform.pageParams('tag')).toEqual(['b', 'a']);
    expect(platform.pageParams('filter')).toEqual(['y', 'x']);
  });
});

describe('F10: a pending arrival rewrite yields to a newer commit', () => {
  it('a child write that lands before the arrival rewrite keeps its value in the entry state, the address and the live page', () => {
    function Writer() {
      const host = useHostPlatform();
      useEffect(() => { host.setPage({ filter: ['new'] }, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on mount
      return null;
    }
    mount('/mars/items?v=1&q=x&filter=old', null, <Writer />);
    expect(platform.pageParams('filter')).toEqual(['new']);
    expect(stateHidden()).toEqual({ v: 1, pairs: [['filter', 'new']] });
    expect(address()).toBe('/mars/items?v=1&q=x');
  });
});
