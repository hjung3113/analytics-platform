import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type JsonValue, type PlatformAdapter, type Session } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider } from '../platform';
import { useHostPlatform } from '../../host';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';

// #1104b finalfix2 H2: a favorite toggled before the account's list is known is an intent merged at readiness, never a replacement of the placeholder list.
const VALID = '2026-10-29T00:00:00Z';
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const wrap = (data: unknown) => ({ outcome: 'ok' as const, data: data as never, assessments: [], trust: null, correlationId: 'c' });
const gated = <T,>() => { let release: (v: T) => void = () => {}; const promise = new Promise<T>(resolve => { release = resolve; }); return { promise, release }; };
const sessionOf = (id: string): Session => testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } });

function Probe() {
  const p = useHostPlatform();
  return (
    <div>
      <p data-testid="favs">{p.favorites.join(',')}</p>
      {['new', 'a', 'b'].map(id => <button key={id} onClick={() => p.toggleFavorite(id)}>{id}</button>)}
    </div>
  );
}
const sessionB = sessionOf('user-b');
const sessionA = sessionOf('user-a');
const mount = (adapter: PlatformAdapter) => render(<I18nProvider><PlatformProvider serverPreferences equipmentAxes={[]} adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
const click = (name: string) => act(() => screen.getByText(name).click());
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });
const favPatches = (patches: unknown[]) => (patches as { set?: Record<string, JsonValue> }[]).map(p => p.set?.favorites).filter(v => v !== undefined);
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('H2 early favorite toggles', () => {
  it('deferred read: a new favorite is added to the 2 existing server favorites, not substituted', async () => {
    const read = gated<ReturnType<typeof wrap>>();
    const patches: unknown[] = [];
    // stateful fake: a later recents patch must not wipe the favorites the server holds
    let stored: Record<string, JsonValue> = { favorites: ['a', 'b'] };
    mount(testAdapter({
      session: () => sessionA,
      readPreferences: () => read.promise,
      patchPreferences: async patch => { patches.push(patch); stored = { ...stored, ...(patch.set ?? {}) }; return wrap({ values: stored, importedAt: VALID }); },
    }));
    await settle();
    click('new');
    await settle();
    expect(patches).toEqual([]);
    expect(screen.getByTestId('favs').textContent).toBe('new');
    await act(async () => { read.release(wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })); await new Promise(r => setTimeout(r, 30)); });
    await waitFor(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
    // the write now happens at readiness inside the controller, so the re-render may follow the patch by a tick
    await waitFor(() => expect(screen.getByTestId('favs').textContent).toBe('a,b,new'));
  });

  it('deferred import: the toggle merges with the legacy favorites carried by the import', async () => {
    localStorage.setItem('platform:favorites:user-a', JSON.stringify(['a', 'b']));
    const importing = gated<ReturnType<typeof wrap>>();
    const patches: unknown[] = [];
    mount(testAdapter({
      session: () => sessionA,
      readPreferences: async () => wrap({ values: {}, importedAt: null }),
      importPreferences: () => importing.promise,
      patchPreferences: async patch => { patches.push(patch); return wrap({ values: patch.set ?? {}, importedAt: VALID }); },
    }));
    await settle();
    click('new');
    await act(async () => { importing.release(wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })); await new Promise(r => setTimeout(r, 30)); });
    await waitFor(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
  });

  it('toggling an existing favorite off removes only it', async () => {
    const read = gated<ReturnType<typeof wrap>>();
    const patches: unknown[] = [];
    mount(testAdapter({
      session: () => sessionA,
      readPreferences: () => read.promise,
      patchPreferences: async patch => { patches.push(patch); return wrap({ values: patch.set ?? {}, importedAt: VALID }); },
    }));
    await settle();
    click('a');
    await act(async () => { read.release(wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })); await new Promise(r => setTimeout(r, 30)); });
    await waitFor(() => expect(favPatches(patches)).toEqual([['b']]));
  });

  it('two toggles of the same id cancel; order of different ids is kept', async () => {
    const read = gated<ReturnType<typeof wrap>>();
    const patches: unknown[] = [];
    mount(testAdapter({
      session: () => sessionA,
      readPreferences: () => read.promise,
      patchPreferences: async patch => { patches.push(patch); return wrap({ values: patch.set ?? {}, importedAt: VALID }); },
    }));
    await settle();
    click('new'); click('a'); click('new'); click('b'); click('new');
    await act(async () => { read.release(wrap({ values: { favorites: ['a'] }, importedAt: VALID })); await new Promise(r => setTimeout(r, 30)); });
    // a off, b on, new on/off/on
    await waitFor(() => expect(favPatches(patches)).toEqual([['b', 'new']]));
  });

  it('toggles queued for one account never reach another account', async () => {
    const reads: Record<string, ReturnType<typeof gated<ReturnType<typeof wrap>>>> = { 'user-a': gated(), 'user-b': gated() };
    let current = sessionA;
    const listeners = new Set<() => void>();
    const patches: { user: string; patch: unknown }[] = [];
    const stored: Record<string, Record<string, JsonValue>> = { 'user-a': { favorites: ['a'] }, 'user-b': { favorites: ['b'] } };
    mount(testAdapter({
      session: () => current,
      subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
      readPreferences: () => { return reads[current.user.id]!.promise; },
      patchPreferences: async patch => { const id = current.user.id; patches.push({ user: id, patch }); stored[id] = { ...stored[id], ...(patch.set ?? {}) }; return wrap({ values: stored[id], importedAt: VALID }); },
    }));
    await settle();
    click('new');
    current = sessionB;
    await act(async () => { listeners.forEach(l => l()); await new Promise(r => setTimeout(r, 30)); });
    expect(screen.getByTestId('favs').textContent).toBe('');
    await act(async () => { reads['user-a']!.release(wrap({ values: { favorites: ['a'] }, importedAt: VALID })); await new Promise(r => setTimeout(r, 30)); reads['user-b']!.release(wrap({ values: { favorites: ['b'] }, importedAt: VALID })); await new Promise(r => setTimeout(r, 30)); });
    await waitFor(() => expect(screen.getByTestId('favs').textContent).toBe('b'));
    expect(patches.filter(p => (p.patch as { set?: { favorites?: unknown } }).set?.favorites !== undefined)).toEqual([]);
  });
});
