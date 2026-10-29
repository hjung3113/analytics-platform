import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type JsonValue, type PlatformAdapter, type Session } from '@ap/contracts';
import { I18nProvider, useI18n } from '../../i18n';
import { PlatformProvider } from '../platform';
import { useHostPlatform } from '../../host';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

const ok = (values: Record<string, JsonValue>, importedAt: string | null) => ({ outcome: 'ok' as const, data: { values, importedAt }, assessments: [], trust: null, correlationId: 'c' });

function fixture() {
  const accounts: Record<string, { values: Record<string, JsonValue>; importedAt: string | null }> = {
    'user-a': { values: { favorites: ['a-fav'], lang: 'en' }, importedAt: '2026-10-29T00:00:00Z' },
    'user-b': { values: {}, importedAt: '2026-10-29T00:00:00Z' },
  };
  let current: Session = testSession(['platform:view'], { user: { id: 'user-a', name: 'a', title: { ko: 'a', en: 'a' } } });
  const listeners = new Set<() => void>();
  const patches: unknown[] = [];
  const adapter: PlatformAdapter = testAdapter({
    session: () => current,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    readPreferences: async () => { const a = accounts[current.user.id]!; return ok(a.values, a.importedAt); },
    patchPreferences: async patch => { patches.push(patch); const a = accounts[current.user.id]!; a.values = { ...a.values, ...(patch.set ?? {}) }; return ok(a.values, a.importedAt); },
  });
  return { adapter, patches, accounts, switchTo: (id: string) => { current = testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } }); listeners.forEach(l => l()); } };
}

function Probe() {
  const p = useHostPlatform();
  const { lang, setLang } = useI18n();
  return (
    <div>
      <p data-testid="favs">{p.favorites.join(',') || '-'}</p>
      <p data-testid="scope">{p.lastScope ?? '-'}</p>
      <p data-testid="lang">{lang}</p>
      <button onClick={() => p.toggleFavorite('m1')}>fav</button>
      <button onClick={() => setLang('ko')}>ko</button>
      <button onClick={() => setLang('en')}>en</button>
    </div>
  );
}
const mount = (adapter: PlatformAdapter, serverPreferences = true) => render(
  <StrictMode><I18nProvider><PlatformProvider serverPreferences={serverPreferences} equipmentAxes={[]} adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider></StrictMode>,
);

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PlatformProvider with the server preference seam', () => {
  it('shows nothing of the local browser until the server answers, then the account values', async () => {
    localStorage.setItem('platform:favorites:user-a', JSON.stringify(['local-only']));
    const f = fixture();
    mount(f.adapter);
    expect(screen.getByTestId('favs').textContent).toBe('-');
    await waitFor(() => expect(screen.getByTestId('favs').textContent).toBe('a-fav'));
    expect(screen.getByTestId('lang').textContent).toBe('en');
  });

  it('never shows the previous user\'s lists or language for a frame after a session switch', async () => {
    const f = fixture();
    mount(f.adapter);
    await waitFor(() => expect(screen.getByTestId('favs').textContent).toBe('a-fav'));
    act(() => f.switchTo('user-b'));
    expect(screen.getByTestId('favs').textContent).toBe('-');
    await waitFor(() => expect(f.accounts['user-b']).toBeTruthy());
  });

  it('writes named keys through the adapter and not to browser storage', async () => {
    const f = fixture();
    mount(f.adapter);
    await waitFor(() => expect(screen.getByTestId('favs').textContent).toBe('a-fav'));
    act(() => screen.getByText('fav').click());
    expect(screen.getByTestId('favs').textContent).toBe('a-fav,m1');
    // Visiting the home menu records a recent entry (existing behavior); every patch names its keys only.
    await waitFor(() => expect(f.patches).toContainEqual({ set: { favorites: ['a-fav', 'm1'] } }));
    for (const patch of f.patches as { set?: object; remove?: unknown }[]) expect(Object.keys(patch.set ?? {}).every(k => ['favorites', 'recents', 'lang', 'lastScope'].includes(k))).toBe(true);
    act(() => screen.getByText('ko').click());
    await waitFor(() => expect(f.patches.at(-1)).toEqual({ set: { lang: 'ko' } }));
    expect(localStorage.getItem('platform:favorites:user-a')).toBeNull();
    expect(localStorage.getItem('platform:lang')).toBeNull();
  });

  it('without the opt-in the browser storage stays in charge and the adapter ports are untouched', async () => {
    localStorage.setItem('platform:favorites:user-a', JSON.stringify(['local-only']));
    const f = fixture();
    const read = vi.spyOn(f.adapter, 'readPreferences');
    mount(f.adapter, false);
    expect(screen.getByTestId('favs').textContent).toBe('local-only');
    expect(read).not.toHaveBeenCalled();
  });
  it('keeps the document language on the account language across a remount while its write is in flight (#1139)', async () => {
    const f = fixture();
    f.accounts['user-a']!.values = { lang: 'ko' };
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const patch = f.adapter.patchPreferences.bind(f.adapter);
    f.adapter.patchPreferences = async p => { await held; return patch(p); };
    document.documentElement.lang = 'ko';
    const first = mount(f.adapter);
    await waitFor(() => expect(screen.getByTestId('lang').textContent).toBe('ko'));
    act(() => screen.getByText('en').click());
    expect(screen.getByTestId('lang').textContent).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    first.unmount();
    mount(f.adapter);
    expect(screen.getByTestId('lang').textContent).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    release();
    await waitFor(() => expect(f.accounts['user-a']!.values.lang).toBe('en'));
    await waitFor(() => expect(screen.getByTestId('lang').textContent).toBe('en'));
    expect(document.documentElement.lang).toBe('en');
  });
});
