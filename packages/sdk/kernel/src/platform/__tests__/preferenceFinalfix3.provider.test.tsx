import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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

// #1104b finalfix3 C1-C3: favorite intents live on the account lane: they trigger recovery, survive controller replacement/remount and are applied in click order.
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
const sessionA = sessionOf('user-a');
const mount = (adapter: PlatformAdapter, lateB = false) => render(<I18nProvider><PlatformProvider serverPreferences equipmentAxes={[]} adapter={adapter} registry={registry}><Probe lateB={lateB} /></PlatformProvider></I18nProvider>);
const click = (name: string) => act(() => screen.getByText(name).click());
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });
const favPatches = (patches: unknown[]) => (patches as { set?: Record<string, JsonValue> }[]).map(p => p.set?.favorites).filter(v => v !== undefined);
const fail = { outcome: 'error' as const, error: { code: 'x', message: 'x' }, assessments: [], trust: null, correlationId: 'c' } as never;
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('C1 favorite click recovers a failed load', () => {
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
    await waitFor(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
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
    await waitFor(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
  });
});

describe('C2 favorite intent survives same-account generation changes', () => {
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
    await act(async () => { listeners.forEach(l => l()); await new Promise(r => setTimeout(r, 30)); });
    expect(screen.getByTestId('favs').textContent).toBe('new');
    await act(async () => { read.release(wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })); await new Promise(r => setTimeout(r, 30)); });
    await waitFor(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
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
    await act(async () => { read.release(wrap({ values: { favorites: ['a', 'b'] }, importedAt: VALID })); await new Promise(r => setTimeout(r, 30)); });
    await waitFor(() => expect(favPatches(patches)).toEqual([['a', 'b', 'new']]));
  });
});

describe('C3 readiness keeps click order', () => {
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
    await act(async () => { read.release(wrap({ values: {}, importedAt: VALID })); await new Promise(r => setTimeout(r, 30)); });
    await waitFor(() => expect(favPatches(patches).at(-1)).toEqual(['a', 'b']));
  });
});
