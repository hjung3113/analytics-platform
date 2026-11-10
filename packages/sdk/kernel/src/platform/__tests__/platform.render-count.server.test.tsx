import type { ReactNode } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, type JsonValue, type PlatformAdapter } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform, usePlatform } from '../platform';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';

// #1671: with `serverPreferences` on, one URL change wakes a `usePlatform()` consumer once, and a run of URL changes inside one menu
// sends one recents PATCH. The mock assembly (no `serverPreferences`) is measured in platform.render-count.test.tsx.

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'analysis' as const, features: { ...features, board: true }, pageKeys: ['page', 'returnTo'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'main' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: testSpace().id }],
  menus: [{ ...entry('main', '/main'), primary: true }, entry('plain', '/plain')],
});
const ok = (values: Record<string, JsonValue>) => ({ outcome: 'ok' as const, data: { values, importedAt: '2026-10-29T00:00:00Z' }, assessments: [], trust: null, correlationId: 'c' });

function fixture() {
  const session = testSession(['platform:view']);
  let values: Record<string, JsonValue> = { favorites: ['fav-1'] };
  const patches: { set?: Record<string, JsonValue> }[] = [];
  const adapter: PlatformAdapter = testAdapter({
    session: () => session,
    readPreferences: async () => ok(values),
    patchPreferences: async patch => { patches.push(patch as never); values = { ...values, ...(patch.set ?? {}) }; return ok(values); },
  });
  return { adapter, patches };
}
const recentPatches = (patches: { set?: Record<string, JsonValue> }[]) => patches.filter(p => p.set?.recents !== undefined);

const counts = { menu: 0 };
let menu: ReturnType<typeof usePlatform>;
let host: ReturnType<typeof useHostPlatform>;
const favoritesSeen: (readonly string[])[] = [];
function MenuConsumer() { menu = usePlatform(); host = useHostPlatform(); counts.menu++; favoritesSeen.push(menu.favorites); return null; }

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

/** Mounts with real timers, waits until the preferences are loaded and the first visit has settled, then returns. */
async function mountReady(ui: ReactNode = <MenuConsumer />) {
  const f = fixture();
  counts.menu = 0;
  favoritesSeen.length = 0;
  window.history.replaceState(null, '', '/main');
  render(<I18nProvider><PlatformProvider serverPreferences adapter={f.adapter} registry={registry}>{ui}</PlatformProvider></I18nProvider>);
  await waitFor(() => expect(menu.favorites).toEqual(['fav-1']));
  await waitFor(() => expect(f.patches.length).toBeGreaterThan(0));
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return f;
}
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });
async function measure(fn: () => void) {
  const before = counts.menu;
  act(fn);
  await settle();
  return counts.menu - before;
}

describe('serverPreferences: a URL change wakes the menu consumer once (#1671)', () => {
  it('a main navigate renders the menu consumer once', async () => {
    await mountReady();
    expect(await measure(() => { expect(menu.navigate('/mars/plain')).toBe(true); })).toBe(1);
  });

  it('a main setPage renders the menu consumer once', async () => {
    await mountReady();
    expect(await measure(() => { menu.setPage({ page: '2' }); })).toBe(1);
  });

  it('favorites keep their array identity after a recents write that does not change favorites', async () => {
    await mountReady();
    const before = menu.favorites;
    favoritesSeen.length = 0;
    act(() => { menu.navigate('/mars/plain'); });
    await settle();
    expect(host.readRecent().map(r => r.menuId)).toEqual(['plain', 'main']);
    expect(menu.favorites).toBe(before);
    expect(favoritesSeen.length).toBeGreaterThan(0);
    expect(favoritesSeen.every(list => list === before)).toBe(true);
  });
});

describe('serverPreferences: URL changes inside one menu send one recents PATCH (#1671)', () => {
  it('several setPage calls in a row send one PATCH after the delay, with the latest URL', async () => {
    const f = await mountReady();
    const sent = recentPatches(f.patches).length;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (const page of ['2', '3', '4']) act(() => { menu.setPage({ page }); });
    // the list the screens read is current at once; only the PATCH waits
    expect(host.readRecent()[0]?.url).toBe('/mars/main?v=1&page=4');
    expect(recentPatches(f.patches).length).toBe(sent);
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    const later = recentPatches(f.patches).slice(sent);
    expect(later).toHaveLength(1);
    expect((later[0]!.set!.recents as { url: string }[])[0]?.url).toBe('/mars/main?v=1&page=4');
  });
});
