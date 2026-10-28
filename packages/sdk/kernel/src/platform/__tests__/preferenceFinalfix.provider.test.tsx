import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type JsonValue, type PlatformAdapter, type Session } from '@ap/contracts';
import { I18nProvider, useI18n } from '../../i18n';
import { PlatformProvider } from '../platform';
import { useHostPlatform } from '../../host';
import { usePreferenceController } from '../preferenceContext';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';

// #1104b final-review fixes C1 (visit merge), C6 (production recovery trigger) and C7 (document language) through the real Provider.
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const wrap = (data: unknown) => ({ outcome: 'ok' as const, data: data as never, assessments: [], trust: null, correlationId: 'c' });
const gated = <T,>() => { let release: (v: T) => void = () => {}; const promise = new Promise<T>(resolve => { release = resolve; }); return { promise, release }; };
const sessionOf = (id: string): Session => testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } });
const sessionA = sessionOf('user-a');
const recents = (...ids: string[]) => ids.map((menuId, i) => ({ menuId, url: `/${menuId}`, at: 100 - i }));

function Probe() {
  const p = useHostPlatform();
  const { lang } = useI18n();
  const controller = usePreferenceController();
  return (
    <div>
      <p data-testid="lang">{lang}</p>
      <p data-testid="html">{document.documentElement.lang}</p>
      <button onClick={() => p.toggleFavorite('m1')}>fav</button>
      <button onClick={() => controller?.remove('lang')}>drop-lang</button>
    </div>
  );
}
const mount = (adapter: PlatformAdapter) => render(<I18nProvider><PlatformProvider serverPreferences equipmentAxes={[]} adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); document.documentElement.lang = ''; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const setOf = (patches: unknown[], key: string) => (patches as { set?: Record<string, JsonValue> }[]).map(p => p.set?.[key]).filter(v => v !== undefined);

describe('C1 a visit before the account list is known is merged, not substituted', () => {
  it('deferred read: the visit goes first, existing recents keep order and de-duplicate', async () => {
    const read = gated<ReturnType<typeof wrap>>();
    const patches: unknown[] = [];
    const adapter = testAdapter({
      session: () => sessionA,
      readPreferences: () => read.promise,
      patchPreferences: async patch => { patches.push(patch); return wrap({ values: patch.set ?? {}, importedAt: '2026-10-29T00:00:00Z' }); },
    });
    mount(adapter);
    await act(async () => { await Promise.resolve(); });
    expect(patches).toEqual([]);
    await act(async () => { read.release(wrap({ values: { recents: recents('m1', 'home', 'm2') }, importedAt: '2026-10-29T00:00:00Z' })); await new Promise(r => setTimeout(r, 20)); });
    await waitFor(() => expect(setOf(patches, 'recents')).toHaveLength(1));
    const list = setOf(patches, 'recents')[0] as { menuId: string }[];
    expect(list.map(r => r.menuId)).toEqual(['home', 'm1', 'm2']);
  });

  it('deferred import: the visit is merged into the legacy recents carried by the import', async () => {
    localStorage.setItem('platform:recent:user-a', JSON.stringify(recents('m1', 'm2')));
    const importing = gated<ReturnType<typeof wrap>>();
    const patches: unknown[] = [];
    const adapter = testAdapter({
      session: () => sessionA,
      readPreferences: async () => wrap({ values: {}, importedAt: null }),
      importPreferences: input => { void input; return importing.promise; },
      patchPreferences: async patch => { patches.push(patch); return wrap({ values: patch.set ?? {}, importedAt: '2026-10-29T00:00:00Z' }); },
    });
    mount(adapter);
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    await act(async () => { importing.release(wrap({ values: { recents: recents('m1', 'm2') }, importedAt: '2026-10-29T00:00:00Z' })); await new Promise(r => setTimeout(r, 20)); });
    await waitFor(() => expect(setOf(patches, 'recents')).toHaveLength(1));
    expect((setOf(patches, 'recents')[0] as { menuId: string }[]).map(r => r.menuId)).toEqual(['home', 'm1', 'm2']);
  });

  it('the list is capped at 12', async () => {
    const adapter = testAdapter({
      session: () => sessionA,
      readPreferences: async () => wrap({ values: { recents: recents(...Array.from({ length: 12 }, (_, i) => `m${i}`)) }, importedAt: '2026-10-29T00:00:00Z' }),
      patchPreferences: async patch => wrap({ values: patch.set ?? {}, importedAt: '2026-10-29T00:00:00Z' }),
    });
    const patches: unknown[] = [];
    const inner = adapter.patchPreferences;
    adapter.patchPreferences = async (p, s) => { patches.push(p); return inner(p, s); };
    mount(adapter);
    await waitFor(() => expect(setOf(patches, 'recents')).toHaveLength(1));
    const list = setOf(patches, 'recents')[0] as { menuId: string }[];
    expect(list).toHaveLength(12);
    expect(list[0]!.menuId).toBe('home');
  });
});

describe('C6 production recovery after a failed first load', () => {
  it('the online event retries; the retained edit persists without a reload; the listener is removed on unmount', async () => {
    let healthy = false;
    let reads = 0;
    const patches: unknown[] = [];
    const adapter = testAdapter({
      session: () => sessionA,
      readPreferences: async () => { reads++; return healthy ? wrap({ values: {}, importedAt: '2026-10-29T00:00:00Z' }) : wrap(null); },
      patchPreferences: async patch => { patches.push(patch); return wrap({ values: patch.set ?? {}, importedAt: '2026-10-29T00:00:00Z' }); },
    });
    const view = mount(adapter);
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(reads).toBe(1);
    act(() => screen.getByText('fav').click());
    // The edit retries the failed read once (still down) and stays retained.
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    const readsDown = reads;
    expect(patches).toEqual([]);
    healthy = true;
    await act(async () => { window.dispatchEvent(new Event('online')); await new Promise(r => setTimeout(r, 30)); });
    expect(reads).toBe(readsDown + 1);
    await waitFor(() => expect(setOf(patches, 'favorites')).toContainEqual(['m1']));
    view.unmount();
    const after = reads;
    window.dispatchEvent(new Event('online'));
    await new Promise(r => setTimeout(r, 10));
    expect(reads).toBe(after);
  });
});

describe('C7 the document language follows the visible language', () => {
  it('a new account without lang and a removed lang return to the browser language, in context and on <html>', async () => {
    const accounts: Record<string, Record<string, JsonValue>> = { 'user-a': { lang: 'en' }, 'user-b': {} };
    let current = sessionOf('user-a');
    const listeners = new Set<() => void>();
    const adapter = testAdapter({
      session: () => current,
      subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
      readPreferences: async () => wrap({ values: { ...accounts[current.user.id]! }, importedAt: '2026-10-29T00:00:00Z' }),
      patchPreferences: async patch => { const id = current.user.id; const acc = { ...accounts[id]! }; for (const k of patch.remove ?? []) delete acc[k]; accounts[id] = { ...acc, ...(patch.set ?? {}) }; return wrap({ values: accounts[id], importedAt: '2026-10-29T00:00:00Z' }); },
    });
    mount(adapter);
    await waitFor(() => expect(screen.getByTestId('lang').textContent).toBe('en'));
    expect(screen.getByTestId('html').textContent).toBe('en');
    act(() => { current = sessionOf('user-b'); listeners.forEach(l => l()); });
    await waitFor(() => expect(screen.getByTestId('lang').textContent).toBe('ko'));
    expect(document.documentElement.lang).toBe('ko');
    // Back to an account with a lang, then remove it.
    act(() => { current = sessionOf('user-a'); listeners.forEach(l => l()); });
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
    act(() => screen.getByText('drop-lang').click());
    await waitFor(() => expect(screen.getByTestId('lang').textContent).toBe('ko'));
    expect(document.documentElement.lang).toBe('ko');
  });
});
