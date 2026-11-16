import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type UsageEvent } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, withPagePreset, type RetiredMenu } from '../../index';
import { useHostPlatform } from '../../host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace, testScreen } from '../../testing';

// #2330: a retired menu id opens its successor from every stored reference, and is never recorded itself.
const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (partial: { id: string; path: string; pageKeys: string[]; primary?: boolean; hiddenPageKeys?: string[] }) => ({
  label: { ko: partial.id, en: partial.id }, description: { ko: '', en: '' }, icon: House, group: groupId('mars'),
  permission: 'platform:view' as const, requiresScope: false, context: noContext, component: testScreen, pageType: 'overview' as const, features,
  ...partial,
});
const base = {
  spaces: [testSpace({ homeMenuId: 'hub' })],
  groups: [{ id: groupId('mars'), label: { ko: '설비', en: 'Equipment' }, icon: House, space: spaceId('mars') }],
  menus: [entry({ id: 'hub', path: '/hub', pageKeys: ['view', 'tab'], primary: true }), entry({ id: 'other', path: '/other', pageKeys: ['h'], hiddenPageKeys: ['h'] })],
};
const RETIRED: RetiredMenu[] = [
  { id: 'hub-compare', successor: 'hub', page: { view: 'compare' }, paths: ['/old/compare'] },
  { id: 'hub-table', successor: 'hub' },
];
const registry = createRegistry({ ...base, retiredMenus: RETIRED });

let platform: ReturnType<typeof useHostPlatform>;
function Probe() {
  platform = useHostPlatform();
  return <p data-testid="ready">{platform.pathname}</p>;
}
function mount(events: UsageEvent[] = []) {
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session, recordUsage: async batch => { events.push(...batch); return { accepted: batch.length }; } });
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
}
const here = () => window.location.pathname + window.location.search;
const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('createRegistry retiredMenus (#2330)', () => {
  it('maps a retired id to its successor and its old addresses to aliases of the successor', () => {
    expect(registry.has('hub-compare')).toBe(false);
    expect(registry.successorOf('hub-compare')).toEqual({ menu: registry.menuById('hub'), page: { view: 'compare' }, paths: ['/old/compare', '/mars/hub-compare'] });
    expect(registry.successorOf('hub-table')).toEqual({ menu: registry.menuById('hub'), page: {}, paths: ['/mars/hub-table'] });
    expect(registry.successorOf('hub')).toBeNull();
    expect(registry.successorOf('nowhere')).toBeNull();
    // The derived canonical path (ADR-0093) and the declared old path.
    expect(registry.matchRoute('/mars/hub-compare')).toEqual({ menu: registry.menuById('hub'), params: {}, viaAlias: true, aliasPage: { view: 'compare' } });
    expect(registry.matchRoute('/old/compare')?.aliasPage).toEqual({ view: 'compare' });
    expect(registry.matchRoute('/mars/hub-table')).toEqual({ menu: registry.menuById('hub'), params: {}, viaAlias: true });
    expect(registry.canonicalHref('/old/compare?v=1&tab=a')).toBe('/mars/hub?v=1&tab=a&view=compare');
    expect(registry.canonicalHref('/old/compare?v=1&view=table')).toBe('/mars/hub?v=1&view=table');
    expect(registry.canonicalHref('/mars/hub-table?v=1')).toBe('/mars/hub?v=1');
  });

  it('changes nothing when omitted', () => {
    const plain = createRegistry(base);
    expect(plain.successorOf('hub-compare')).toBeNull();
    expect(plain.matchRoute('/mars/hub-compare')).toBeNull();
    expect(plain.menuById('hub').aliases).toEqual(['/hub']);
  });

  it.each<[string, RetiredMenu[], RegExp]>([
    ['a registered id', [{ id: 'other', successor: 'hub' }], /"other" is still registered/],
    ['a duplicate id', [{ id: 'x', successor: 'hub' }, { id: 'x', successor: 'hub' }], /Duplicate retired menu id "x"/],
    ['an unknown successor', [{ id: 'x', successor: 'gone' }], /successor "gone" is not a registered menu/],
    ['a retired successor', [{ id: 'x', successor: 'hub' }, { id: 'y', successor: 'x' }], /successor "x" is not a registered menu/],
    ['an undeclared page key', [{ id: 'x', successor: 'hub', page: { mode: 'a' } }], /page key "mode" is not a page key of "hub"/],
    ['a hidden page key', [{ id: 'x', successor: 'other', page: { h: '1' } }], /"h" is a hidden page key of "other"/],
    ['an empty page value', [{ id: 'x', successor: 'hub', page: { view: '' } }], /needs a non-empty string value/],
    ['a relative path', [{ id: 'x', successor: 'hub', paths: ['old'] }], /must start with \//],
    ['a path another menu holds', [{ id: 'x', successor: 'hub', paths: ['/other'] }], /same route shape/],
    ['a malformed id', [{ id: 'a b', successor: 'hub' }], /must be non-empty without whitespace/],
  ])('rejects %s', (_name, retiredMenus, message) => {
    expect(() => createRegistry({ ...base, retiredMenus })).toThrow(message);
  });

  it('withPagePreset appends only the keys the search does not hold', () => {
    expect(withPagePreset('', { view: 'a b' })).toBe('?view=a%20b');
    expect(withPagePreset('?v=1', { view: 'x' })).toBe('?v=1&view=x');
    expect(withPagePreset('?v=1&view=y', { view: 'x' })).toBe('?v=1&view=y');
    expect(withPagePreset('?v=1', {})).toBe('?v=1');
    expect(withPagePreset('?v=1', undefined)).toBe('?v=1');
  });
});

describe('a retired menu on the main screen (#2330)', () => {
  it('redirects an old address to the successor with the preset, and records neither usage nor a recent visit under the old id', async () => {
    window.history.replaceState(null, '', '/mars/hub-compare?v=1&tab=a');
    const events: UsageEvent[] = [];
    mount(events);
    expect(here()).toBe('/mars/hub?v=1&tab=a&view=compare');
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByTestId('ready').textContent).toBe('/mars/hub');
    expect(events.map(e => e.menuId)).not.toContain('hub-compare');
    expect(events.filter(e => e.name === 'entry').map(e => e.menuId)).toEqual(['hub']);
    expect((stored('platform:recent:u1') as { menuId: string; url: string }[]).map(r => [r.menuId, r.url])).toEqual([['hub', '/mars/hub?v=1&tab=a&view=compare']]);
  });

  it('keeps a page key the old address already holds', () => {
    window.history.replaceState(null, '', '/old/compare?v=1&view=table');
    mount();
    expect(here()).toBe('/mars/hub?v=1&view=table');
  });
});

describe('stored references to a retired id (#2330)', () => {
  it('reads favorites and recent visits of a retired id as its successor, and rewrites them at the next edit', async () => {
    localStorage.setItem('platform:favorites:u1', JSON.stringify(['hub-compare', 'other', 'hub-table']));
    localStorage.setItem('platform:recent:u1', JSON.stringify([
      { menuId: 'hub-compare', url: '/mars/hub-compare?v=1&tab=a', at: 3 },
      { menuId: 'other', url: '/mars/other?v=1', at: 2 },
      { menuId: 'hub-table', url: '/hub/table-gone?v=1', at: 1 },
    ]));
    window.history.replaceState(null, '', '/mars/other?v=1');
    mount();
    expect(platform.favorites).toEqual(['hub', 'other']);
    // Opening `other` records it first; the first stored visit of the successor wins over a later one of another retired id.
    expect(platform.readRecent().map(r => [r.menuId, r.url])).toEqual([['other', '/mars/other?v=1'], ['hub', '/mars/hub?v=1&tab=a&view=compare']]);
    act(() => { platform.toggleFavorite('hub'); });
    expect(platform.favorites).toEqual(['other']);
    expect(stored('platform:favorites:u1')).toEqual(['other']);
    await act(async () => { await vi.runAllTimersAsync(); });
    expect((stored('platform:recent:u1') as { menuId: string }[]).map(r => r.menuId)).toEqual(['other', 'hub']);
  });
});
