import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type JsonValue, type PlatformAdapter, type Session } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider } from '../platform';
import { useHostPlatform } from '../../host';
import { usePreferenceController, usePreferenceState } from '../preferenceContext';
import { useLayoutEffect, useRef } from 'react';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';

// Favorite intents live on the account lane: a toggle before the account's list is known is merged at readiness (never a replacement of the placeholder list), triggers recovery of a failed load, survives controller replacement and remount, and is applied in click order.
const VALID = '2026-10-29T00:00:00Z';
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const wrap = (data: unknown) => ({ outcome: 'ok' as const, data: data as never, assessments: [], trust: null, correlationId: 'c' });
const gated = <T,>() => { let release: (v: T) => void = () => {}; const promise = new Promise<T>(resolve => { release = resolve; }); return { promise, release }; };
const sessionOf = (id: string): Session => testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } });

function Probe({ lateB = false }: { lateB?: boolean }) {
  const p = useHostPlatform();
  const state = usePreferenceState(usePreferenceController());
  const done = useRef(false);
  useLayoutEffect(() => { if (lateB && state.status === 'ready' && !done.current) { done.current = true; p.toggleFavorite('b'); } });
  return (
    <div>
      <p data-testid="favs">{p.favorites.join(',')}</p>
      {['new', 'a', 'b'].map(id => <button key={id} onClick={() => p.toggleFavorite(id)}>{id}</button>)}
    </div>
  );
}
const sessionB = sessionOf('user-b');
const sessionA = sessionOf('user-a');
const mount = (adapter: PlatformAdapter, lateB = false) => render(<I18nProvider><PlatformProvider serverPreferences equipmentAxes={[]} adapter={adapter} registry={registry}><Probe lateB={lateB} /></PlatformProvider></I18nProvider>);
const click = (name: string) => act(() => screen.getByText(name).click());
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(30); });
const fail = { outcome: 'error' as const, error: { code: 'x', message: 'x' }, assessments: [], trust: null, correlationId: 'c' } as never;
const favPatches = (patches: unknown[]) => (patches as { set?: Record<string, JsonValue> }[]).map(p => p.set?.favorites).filter(v => v !== undefined);
// Fake timers stand in for real waits: retry the assertion while advancing virtual time, so a state that never arrives fails instead of hanging.
const eventually = async (assertion: () => void) => {
  for (let i = 0; i < 100; i++) {
    try { assertion(); return; } catch { await act(async () => { await vi.advanceTimersByTimeAsync(10); }); }
  }
  assertion();
};
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('a favorite toggled before the account list is known', () => {
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
    await act(async () => { read.release(wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })); await vi.advanceTimersByTimeAsync(30); });
    await eventually(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
    // the write now happens at readiness inside the controller, so the re-render may follow the patch by a tick
    await eventually(() => expect(screen.getByTestId('favs').textContent).toBe('a,b,new'));
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
    await act(async () => { importing.release(wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })); await vi.advanceTimersByTimeAsync(30); });
    await eventually(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
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
    await act(async () => { read.release(wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })); await vi.advanceTimersByTimeAsync(30); });
    await eventually(() => expect(favPatches(patches)).toEqual([['b']]));
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
    await act(async () => { read.release(wrap({ values: { favorites: ['a'] }, importedAt: VALID })); await vi.advanceTimersByTimeAsync(30); });
    // a off, b on, new on/off/on
    await eventually(() => expect(favPatches(patches)).toEqual([['b', 'new']]));
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
    await act(async () => { listeners.forEach(l => l()); await vi.advanceTimersByTimeAsync(30); });
    expect(screen.getByTestId('favs').textContent).toBe('');
    await act(async () => { reads['user-a']!.release(wrap({ values: { favorites: ['a'] }, importedAt: VALID })); await vi.advanceTimersByTimeAsync(30); reads['user-b']!.release(wrap({ values: { favorites: ['b'] }, importedAt: VALID })); await vi.advanceTimersByTimeAsync(30); });
    await eventually(() => expect(screen.getByTestId('favs').textContent).toBe('b'));
    expect(patches.filter(p => (p.patch as { set?: { favorites?: unknown } }).set?.favorites !== undefined)).toEqual([]);
  });
});

describe('a favorite click recovers a failed load', () => {
  it('failed read, server restored, click -> merged with existing and persisted without an online event', async () => {
    let reads = 0;
    const patches: unknown[] = [];
    mount(testAdapter({
      session: () => sessionA,
      readPreferences: async () => (++reads === 1 ? fail : wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })),
      patchPreferences: async patch => { patches.push(patch); return wrap({ values: patch.set ?? {}, importedAt: VALID }); },
    }));
    await settle();
    click('new');
    await settle();
    await eventually(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
  });

  it('failed import, server restored, click -> merged with existing and persisted', async () => {
    let imports = 0;
    const patches: unknown[] = [];
    mount(testAdapter({
      session: () => sessionA,
      readPreferences: async () => wrap({ values: { favorites: ['a', 'b'] }, importedAt: null }),
      importPreferences: async () => (++imports === 1 ? fail : wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })),
      patchPreferences: async patch => { patches.push(patch); return wrap({ values: patch.set ?? {}, importedAt: VALID }); },
    }));
    await settle();
    click('new');
    await settle();
    await eventually(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
  });
});

describe('a favorite intent survives same-account generation changes', () => {
  const adapterWith = (read: ReturnType<typeof gated<ReturnType<typeof wrap>>>, patches: unknown[], listeners: Set<() => void>) => testAdapter({
    session: () => sessionA,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    readPreferences: () => read.promise,
    patchPreferences: async patch => { patches.push(patch); return wrap({ values: patch.set ?? {}, importedAt: VALID }); },
  });
  it('a revision replacement during the deferred read keeps the click', async () => {
    const read = gated<ReturnType<typeof wrap>>();
    const patches: unknown[] = [];
    const listeners = new Set<() => void>();
    mount(adapterWith(read, patches, listeners));
    await settle();
    click('new');
    await act(async () => { listeners.forEach(l => l()); await vi.advanceTimersByTimeAsync(30); });
    expect(screen.getByTestId('favs').textContent).toBe('new');
    await act(async () => { read.release(wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })); await vi.advanceTimersByTimeAsync(30); });
    await eventually(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
  });

  it('an unmount/remount of the Provider during the deferred read keeps the click', async () => {
    const read = gated<ReturnType<typeof wrap>>();
    const patches: unknown[] = [];
    const adapter = adapterWith(read, patches, new Set());
    const first = mount(adapter);
    await settle();
    click('new');
    first.unmount();
    mount(adapter);
    await settle();
    await act(async () => { read.release(wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })); await vi.advanceTimersByTimeAsync(30); });
    await eventually(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
  });
});

describe('readiness keeps click order', () => {
  it('early a then a descendant layout-effect b at readiness -> [a, b]', async () => {
    const read = gated<ReturnType<typeof wrap>>();
    const patches: unknown[] = [];
    mount(testAdapter({
      session: () => sessionA,
      readPreferences: () => read.promise,
      patchPreferences: async patch => { patches.push(patch); return wrap({ values: patch.set ?? {}, importedAt: VALID }); },
    }), true);
    await settle();
    click('a');
    await act(async () => { read.release(wrap({ values: {}, importedAt: VALID })); await vi.advanceTimersByTimeAsync(30); });
    await eventually(() => expect(favPatches(patches).at(-1)).toEqual(['a', 'b']));
  });
});
