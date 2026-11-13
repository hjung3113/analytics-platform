import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, type JsonValue, type PlatformAdapter } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform, usePlatform, useRecentVisits, type HostPlatform, type MenuPlatform, type Recent } from '../platform';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace, testScreen } from '../../testing';

// #1702 (host-entry-contract §7): a stored recent visit of a menu the registry no longer lists is kept — in the stored
// preference and in `useRecentVisits()` — and never thrown away by a later write. The shell's own filter hides it
// (AppSidebar's `recent.filter(r => visibleMenus.some(m => m.id === r.menuId))`, pinned on the shell side); the kernel
// side here pins that the entry survives load and a navigation, and that the same filter hides it without a throw.

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, path: string) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, component: testScreen, pageType: 'analysis' as const, features: { ...features, board: true }, pageKeys: ['page'],
});
// No menu `gone` exists anywhere in this registry.
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'main' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: testSpace().id }],
  menus: [{ ...entry('main', '/main'), primary: true }, entry('plain', '/plain')],
});
const ok = (values: Record<string, JsonValue>) => ({ outcome: 'ok' as const, data: { values, importedAt: '2026-11-12T00:00:00Z' }, assessments: [], trust: null, correlationId: 'c' });

/** The stored visit of the removed menu, exactly as an earlier build saved it. */
const gone = { menuId: 'gone', url: '/gone?v=1', at: 1 };
type Sent = { recents: { menuId: string; url: string; at: number }[] };
const session = testSession(['platform:view']);
function fixture(seed: Record<string, JsonValue>) {
  const account: Record<string, JsonValue> = { ...seed };
  const sent: Sent[] = [];
  const adapter: PlatformAdapter = testAdapter({
    session: () => session,
    readPreferences: async () => ok({ ...account }),
    patchPreferences: async patch => {
      if (patch.set?.recents !== undefined) sent.push({ recents: patch.set.recents as Sent['recents'] });
      Object.assign(account, patch.set ?? {});
      return ok({ ...account });
    },
  });
  return { adapter, sent, account };
}

let menu: MenuPlatform;
let host: HostPlatform;
let visits: readonly Recent[];
function Consumer() { menu = usePlatform(); host = useHostPlatform(); visits = useRecentVisits(); return null; }

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('a stored recent visit of a menu missing from the registry (#1702)', () => {
  it('is kept in the stored preference after load and after a navigation, and the sidebar-style filter hides it', async () => {
    const f = fixture({ recents: [gone] });
    window.history.replaceState(null, '', '/main');
    render(<I18nProvider><PlatformProvider serverPreferences adapter={f.adapter} registry={registry}><Consumer /></PlatformProvider></I18nProvider>);
    // The first visit (`main`) is written at once with the stored list folded in.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    // After load: the removed menu's entry is still in the stored preference, unchanged, and in `useRecentVisits()`.
    expect(f.sent[0]!.recents.map(r => r.menuId)).toEqual(['main', 'gone']);
    expect(f.account.recents).toEqual([expect.objectContaining({ menuId: 'main' }), gone]);
    expect(visits.filter(r => r.menuId === 'gone')).toEqual([gone]);
    // The AppSidebar filter shape hides the entry (the entry is not shown) and nothing throws.
    const shown = visits.filter(r => host.visibleMenus.some(m => m.id === r.menuId));
    expect(shown.map(r => r.menuId)).toEqual(['main']);

    // After navigating to another menu: the at-once write keeps the removed menu's entry, still last, still unchanged.
    act(() => { menu.navigate('/mars/plain'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(f.sent.map(s => s.recents.map(r => r.menuId))).toEqual([['main', 'gone'], ['plain', 'main', 'gone']]);
    expect(f.account.recents).toEqual([expect.objectContaining({ menuId: 'plain' }), expect.objectContaining({ menuId: 'main' }), gone]);
  });
});
