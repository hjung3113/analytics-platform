import { act, cleanup, render } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { carrySetId, groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '../../index';
import { useHostPlatform } from '../../host';
import { readReturnHidden, rememberReturnHidden } from '../../context/returnHidden';
import { createBasePathLocation, type PlatformLocation } from '../../context/location';
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
    mount('/mars/detail?v=1&returnTo=%2Fmars%2Fother%3Fv%3D1');
    const owner = JSON.stringify([platform.user.id, platform.location.absoluteUrl('/'), 'other']);
    window.sessionStorage.setItem('ap.kernel.returnHidden', JSON.stringify({ v: 2, entries: [['/mars/other?v=1', owner, [['mode', 'a'], ['mode', 'b'], ['filter', 'c']]]] }));
    act(() => { platform.navigate(platform.returnTarget()); });
    expect(platform.pageParams('mode')).toEqual(['a']);
    expect(platform.pageParams('filter')).toEqual([]);
    expect(address()).toBe('/mars/other?v=1');
  });
});

describe('G1/G2: a snapshot belongs to its user, deployment and menu; a failed write fails closed', () => {
  function tripThenReturn() {
    act(() => platform.setPage({ filter: ['private'] }));
    act(() => { platform.navigate(platform.linkTo('detail', { returnTo: true })); });
  }
  function mountAs(url: string, userId: string, location?: PlatformLocation) {
    window.history.replaceState(null, '', url);
    const other = testSession(['platform:view'], { user: { id: userId } });
    const as = testAdapter({ session: () => other });
    render(<I18nProvider><PlatformProvider adapter={as} registry={registry} location={location}><Probe /></PlatformProvider></I18nProvider>);
  }
  it('another user following the same return link restores nothing', () => {
    mount('/mars/items?v=1&q=x');
    tripThenReturn();
    cleanup();
    mountAs(window.location.pathname + window.location.search, 'u2');
    act(() => { platform.navigate(platform.returnTarget()); });
    expect(address()).toBe('/mars/items?v=1&q=x');
    expect(platform.pageParams('filter')).toEqual([]);
  });

  it('the same user under another base path restores nothing', () => {
    window.history.replaceState(null, '', '/a/mars/items?v=1&q=x');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} location={createBasePathLocation('/a/')}><Probe /></PlatformProvider></I18nProvider>);
    tripThenReturn();
    const detail = window.location.pathname.replace('/a/', '/b/') + window.location.search;
    cleanup();
    mountAs(detail, 'u1', createBasePathLocation('/b/'));
    act(() => { platform.navigate(platform.returnTarget()); });
    expect(platform.pageParams('filter')).toEqual([]);
  });

  it('a snapshot stored for one menu is not read for another', () => {
    const owner = { user: 'u1', deployment: 'http://localhost/', menu: 'items' };
    rememberReturnHidden('/mars/items?v=1', [['filter', 'a']], owner);
    expect(readReturnHidden('/mars/items?v=1', owner)).toEqual([['filter', 'a']]);
    expect(readReturnHidden('/mars/items?v=1', { ...owner, menu: 'other' })).toEqual([]);
    expect(readReturnHidden('/mars/items?v=1', { ...owner, user: 'u2' })).toEqual([]);
    expect(readReturnHidden('/mars/items?v=1', { ...owner, deployment: 'http://localhost/b/' })).toEqual([]);
  });

  /** A storage that reads what is already stored but refuses writes (and, optionally, removals). */
  function readOnlyStorage(blockRemove: boolean) {
    const real = window.sessionStorage;
    const view = { getItem: (k: string) => real.getItem(k), setItem: () => { throw new Error('quota'); }, removeItem: (k: string) => { if (blockRemove) throw new Error('denied'); real.removeItem(k); } };
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => view as unknown as Storage);
  }
  it('readable but unwritable storage: the older snapshot is not restored', () => {
    mount('/mars/items?v=1&q=x');
    tripThenReturn();
    act(() => { platform.navigate(platform.returnTarget()); });
    expect(platform.pageParams('filter')).toEqual(['private']);
    act(() => platform.setPage({ filter: ['newer'] }));
    readOnlyStorage(false);
    act(() => { platform.navigate(platform.linkTo('detail', { returnTo: true })); });
    act(() => { platform.navigate(platform.returnTarget()); });
    expect(address()).toBe('/mars/items?v=1&q=x');
    expect(platform.pageParams('filter')).toEqual([]);
  });

  it('even when the stale slot cannot be removed, the failed trip restores nothing', () => {
    const owner = { user: 'u1', deployment: 'http://localhost/', menu: 'items' };
    rememberReturnHidden('/mars/items?v=1', [['filter', 'old']], owner);
    readOnlyStorage(true);
    rememberReturnHidden('/mars/items?v=1', [['filter', 'new']], owner);
    expect(readReturnHidden('/mars/items?v=1', owner)).toEqual([]);
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
