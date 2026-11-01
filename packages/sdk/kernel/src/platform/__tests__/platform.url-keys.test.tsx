import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContractError, groupId, parseQuery, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '../../index';
import { PaneScreenProvider, useHostPlatform } from '../../host';
import type { PaneScreen } from '../platform';
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
  menus: [
    entry({ id: 'items', path: '/mars/items', pageKeys: ['q', 'tag', 'filter'], repeatedPageKeys: ['tag', 'filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['filter'], primary: true }),
    entry({ id: 'other', path: '/mars/other', pageKeys: ['filter', 'mode'], hiddenPageKeys: ['mode'] }),
    entry({ id: 'plain', path: '/mars/plain', pageKeys: ['q'] }),
  ],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

let platform: ReturnType<typeof useHostPlatform>;
function Probe() { platform = useHostPlatform(); return null; }
function mount(url: string, state: unknown = null) {
  window.history.replaceState(state, '', url);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
}
const address = () => window.location.pathname + window.location.search;
const stateHidden = () => (window.history.state as { apHidden?: { v: number; pairs: [string, string][] } } | null)?.apHidden;

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('repeated page keys (parse)', () => {
  it('allows duplicates only for a declared repeated key, in URL order', () => {
    expect(parseQuery('?tag=a&tag=b&q=x', ['tag', 'q'], { repeated: ['tag'] }).page).toEqual([['tag', 'a'], ['tag', 'b'], ['q', 'x']]);
    expect(() => parseQuery('?q=x&q=y', ['tag', 'q'], { repeated: ['tag'] })).toThrow(ContractError);
    expect(() => parseQuery('?tag=a&tag=b', ['tag'])).toThrow(/appears more than once/);
  });
});

describe('repeated page keys (platform)', () => {
  it('pageParams reads every value, [] when absent; pageParam the first', () => {
    mount('/mars/items?v=1&tag=a&tag=b&q=x');
    expect(platform.pageParams('tag')).toEqual(['a', 'b']);
    expect(platform.pageParam('tag')).toBe('a');
    expect(platform.pageParams('q')).toEqual(['x']);
    expect(platform.pageParams('missing')).toEqual([]);
  });

  it('setPage writes one pair per item, [] and null remove, and a list on a single-value key throws', () => {
    mount('/mars/items?v=1&q=x');
    act(() => platform.setPage({ tag: ['a', 'b'] }));
    expect(address()).toBe('/mars/items?v=1&q=x&tag=a&tag=b');
    act(() => platform.setPage({ tag: ['c'] }));
    expect(platform.pageParams('tag')).toEqual(['c']);
    act(() => platform.setPage({ tag: [] }));
    expect(address()).toBe('/mars/items?v=1&q=x');
    expect(() => platform.setPage({ q: ['a', 'b'] })).toThrow(RangeError);
  });

  it('a duplicate of an undeclared key is still a contract error', () => {
    mount('/mars/items?v=1&q=x&q=y');
    expect(platform.contractError?.code).toBe('duplicate_page_key');
  });
});

describe('hidden page keys (main screen)', () => {
  it('a URL arriving with hidden keys is read, kept in the entry state and rewritten without them in the same entry', () => {
    window.history.pushState(null, '', '/before');
    const length = window.history.length;
    mount('/mars/items?v=1&q=x&filter=a&filter=b');
    expect(address()).toBe('/mars/items?v=1&q=x');
    expect(stateHidden()).toEqual({ v: 1, pairs: [['filter', 'a'], ['filter', 'b']] });
    expect(window.history.length).toBe(length);
    expect(platform.pageParams('filter')).toEqual(['a', 'b']);
    expect(platform.page).toEqual([['q', 'x'], ['filter', 'a'], ['filter', 'b']]);
    expect(platform.url).toBe('/mars/items?v=1&q=x');
  });

  it('a reload (remount with the entry state) keeps the hidden pairs and rewrites nothing', () => {
    mount('/mars/items?v=1&q=x', { apHidden: { v: 1, pairs: [['filter', 'a']] } });
    expect(platform.pageParams('filter')).toEqual(['a']);
    expect(address()).toBe('/mars/items?v=1&q=x');
  });

  it('keeps foreign state fields when it rewrites the arrival', () => {
    mount('/mars/items?v=1&filter=a', { foreign: 7 });
    expect(window.history.state).toEqual({ foreign: 7, apHidden: { v: 1, pairs: [['filter', 'a']] } });
  });

  it('ignores a malformed or foreign-key state value', () => {
    mount('/mars/items?v=1', { apHidden: { v: 2, pairs: [['filter', 'a']] } });
    expect(platform.pageParams('filter')).toEqual([]);
    cleanup();
    mount('/mars/items?v=1', { apHidden: { v: 1, pairs: [['q', 'a']] } });
    expect(platform.pageParams('q')).toEqual([]);
  });

  it('setPage on a hidden key pushes a new entry with the same address and the new pairs in its state', () => {
    mount('/mars/items?v=1&q=x');
    const length = window.history.length;
    act(() => platform.setPage({ filter: ['a', 'b'] }));
    expect(window.history.length).toBe(length + 1);
    expect(address()).toBe('/mars/items?v=1&q=x');
    expect(stateHidden()?.pairs).toEqual([['filter', 'a'], ['filter', 'b']]);
    expect(platform.pageParams('filter')).toEqual(['a', 'b']);
  });

  it('setPage with replace keeps the entry count; a visible key change keeps the hidden pairs', () => {
    mount('/mars/items?v=1&q=x');
    act(() => platform.setPage({ filter: ['a'] }));
    const length = window.history.length;
    act(() => platform.setPage({ filter: ['z'] }, { replace: true }));
    expect(window.history.length).toBe(length);
    expect(stateHidden()?.pairs).toEqual([['filter', 'z']]);
    act(() => platform.setPage({ q: 'y' }));
    expect(address()).toBe('/mars/items?v=1&q=y');
    expect(stateHidden()?.pairs).toEqual([['filter', 'z']]);
    expect(platform.pageParams('filter')).toEqual(['z']);
  });

  it('writing the same hidden pairs is not a new entry', () => {
    mount('/mars/items?v=1');
    act(() => platform.setPage({ filter: ['a'] }));
    const length = window.history.length;
    act(() => platform.setPage({ filter: ['a'] }));
    expect(window.history.length).toBe(length);
  });

  it('Back/Forward restores the hidden pairs of the entry from popstate', () => {
    mount('/mars/items?v=1');
    act(() => platform.setPage({ filter: ['a'] }));
    act(() => {
      window.history.replaceState({ apHidden: { v: 1, pairs: [['filter', 'old']] } }, '', '/mars/items?v=1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(platform.pageParams('filter')).toEqual(['old']);
    act(() => {
      window.history.replaceState(null, '', '/mars/items?v=1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(platform.pageParams('filter')).toEqual([]);
  });

  it('a popstate onto an entry whose address still carries hidden keys moves them into the state (same entry)', () => {
    mount('/mars/items?v=1');
    const length = window.history.length;
    act(() => {
      window.history.replaceState(null, '', '/mars/items?v=1&filter=a');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(address()).toBe('/mars/items?v=1');
    expect(window.history.length).toBe(length);
    expect(platform.pageParams('filter')).toEqual(['a']);
  });

  it('navigating to another menu does not carry the hidden pairs; a link with hidden keys opens with them', () => {
    mount('/mars/items?v=1&filter=a');
    act(() => { platform.navigate('/mars/plain?v=1'); });
    expect(window.history.state).toBeNull();
    expect(platform.pageParams('filter')).toEqual([]);
    act(() => { platform.navigate('/mars/items?v=1&filter=b&filter=c'); });
    expect(address()).toBe('/mars/items?v=1');
    expect(stateHidden()?.pairs).toEqual([['filter', 'b'], ['filter', 'c']]);
  });

  it('a global Context change drops a hidden contextResetKeys key in the same entry; other keys stay', () => {
    mount('/mars/items?v=1&tag=t&filter=a');
    act(() => platform.setGlobal({ ppid: 'P1' }));
    expect(address()).toBe('/mars/items?v=1&ppid=P1&tag=t');
    expect(platform.pageParams('filter')).toEqual([]);
    expect(stateHidden()).toBeUndefined();
    expect(platform.pageParams('tag')).toEqual(['t']);
  });

  it('a hidden pair that breaks the page-key rules is a contract error, as in the address', () => {
    mount('/mars/other?v=1&mode=a&mode=b');
    expect(platform.contractError?.code).toBe('duplicate_page_key');
  });

  it('a menu that declares no hidden key writes no history state', () => {
    mount('/mars/plain?v=1');
    act(() => platform.setPage({ q: 'x' }));
    expect(window.history.state).toBeNull();
    act(() => platform.setPage({ q: 'y' }, { replace: true }));
    expect(window.history.state).toBeNull();
  });

  it('declared hidden keys never appear in the address even when written beside visible ones', () => {
    mount('/mars/items?v=1');
    act(() => platform.setPage({ q: 'x', tag: ['a'], filter: ['f'] }));
    expect(address()).toBe('/mars/items?v=1&q=x&tag=a');
    expect(platform.page).toEqual([['q', 'x'], ['tag', 'a'], ['filter', 'f']]);
  });
});

describe('repeated and hidden keys in a pane', () => {
  it('a pane holds every key in its own query: repeated pairs are read and written, hidden keys are ordinary page state', () => {
    let pane: ReturnType<typeof useHostPlatform>;
    function PaneProbe() { pane = useHostPlatform(); return null; }
    const onChange = vi.fn();
    function Pane() {
      const [screen, setScreen] = useState<PaneScreen>({ menuId: 'items', params: {}, query: '?v=1&tag=a&tag=b&filter=x' });
      return <PaneScreenProvider paneId="p1" screen={screen} onLeave={() => {}} onChange={(next, how) => { onChange(next, how); setScreen(next); }}><PaneProbe /></PaneScreenProvider>;
    }
    window.history.replaceState(null, '', '/mars/plain?v=1');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /><Pane /></PlatformProvider></I18nProvider>);
    expect(pane!.pageParams('tag')).toEqual(['a', 'b']);
    expect(pane!.pageParams('filter')).toEqual(['x']);
    act(() => pane!.setPage({ filter: ['y', 'z'] }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ menuId: 'items', query: '?v=1&tag=a&tag=b&filter=y&filter=z' }), 'push');
    expect(pane!.pageParams('filter')).toEqual(['y', 'z']);
    expect(address()).toBe('/mars/plain?v=1');
    expect(window.history.state).toBeNull();
  });
});
