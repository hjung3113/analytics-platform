import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId, type JsonValue, type PlatformAdapter, type Session } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, usePreferenceController } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { useColumnPreferences } from '../useColumnPreferences';

// #1104b final-review fixes C2 (late controller values reach the table) and C3 (a raw key change is an ownership boundary), with the REAL Provider, controller and hook.
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', primary: true, group: groupId('overview'), path: '/', label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, features: { export: false, annotate: false, compare: false, savedView: false }, pageType: 'analysis', pageKeys: [] }] });
const ok = (values: Record<string, JsonValue>) => ({ outcome: 'ok' as const, data: { values, importedAt: '2026-10-29T00:00:00Z' }, assessments: [], trust: null, correlationId: 'c' });
const session = (): Session => testSession(['platform:view'], { user: { id: 'user-a', name: 'a', title: { ko: 'a', en: 'a' } } });
const hashKey = async (raw: string) => `columns:h1_${[...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map(b => b.toString(16).padStart(2, '0')).join('')}`;
const table = (over: Partial<{ sizing: Record<string, number>; visibility: Record<string, boolean> }> = {}) => ({ sizing: {}, visibility: {}, pinning: { left: [], right: [] }, ...over });

function fixture(seed: Record<string, JsonValue> = {}) {
  let current = session();
  const listeners = new Set<() => void>();
  const state = { values: { ...seed } };
  const adapter: PlatformAdapter = testAdapter({
    session: () => current,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    readPreferences: async () => ok(state.values),
    patchPreferences: async patch => { state.values = { ...state.values, ...(patch.set ?? {}) }; return ok(state.values); },
  });
  return { adapter, state, replaceSession: () => { current = session(); listeners.forEach(l => l()); } };
}

let api: ReturnType<typeof useColumnPreferences> & { controller: ReturnType<typeof usePreferenceController> };
function Table({ k }: { k: string }) {
  const hook = useColumnPreferences(k);
  api = { ...hook, controller: usePreferenceController() };
  return null;
}
const tree = (f: ReturnType<typeof fixture>, k: string) => <I18nProvider><PlatformProvider serverPreferences registry={registry} adapter={f.adapter}><Table k={k} /></PlatformProvider></I18nProvider>;
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('C2 late controller values are shown by a mounted table', () => {
  it('an old generation\'s deferred hash completing after the replacement hydrated is shown and stored', async () => {
    const f = fixture();
    let release!: () => void;
    const hold = new Promise<void>(r => { release = r; });
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args: Parameters<typeof digest>) => { await hold; return digest(...args); });
    const view = render(tree(f, 't1'));
    await settle();
    // Generation 1 cannot derive the key yet; the person's change waits on that hash.
    act(() => { api.onColumnVisibilityChange({ a: false }); });
    await settle();
    // Same account, new generation: it hydrates with nothing.
    act(() => f.replaceSession());
    await settle();
    expect(api.preferences.visibility).toEqual({});
    await act(async () => { release(); await new Promise(r => setTimeout(r, 25)); });
    await waitFor(() => expect(api.preferences.visibility).toEqual({ a: false }));
    expect(f.state.values[await hashKey('t1')]).toEqual(table({ visibility: { a: false } }));
    view.unmount();
  });

  it('a newer local edit and a pending width debounce are not overwritten by a controller update', async () => {
    const f = fixture();
    render(tree(f, 't1'));
    await settle();
    act(() => { api.onColumnSizingChange({ a: 222 }); });
    // An older/foreign update arrives before the 300 ms debounce fires.
    act(() => { api.controller!.setTable('t1', table({ sizing: { a: 111 } })); });
    await settle();
    expect(api.preferences.sizing).toEqual({ a: 222 });
    const key = await hashKey('t1');
    await waitFor(() => expect((f.state.values[key] as { sizing: unknown } | undefined)?.sizing).toEqual({ a: 222 }), { timeout: 2000 });
    expect(api.preferences.sizing).toEqual({ a: 222 });
  });
});

describe('C3 a raw key change is an ownership boundary', () => {
  const seed = async () => ({ [await hashKey('A')]: table({ sizing: { a: 100 }, visibility: { x: false } }), [await hashKey('B')]: table({ sizing: { b: 300 }, visibility: { y: false } }) });

  it('A edit → B without edit → A shows A, and the next edit does not copy B into A', async () => {
    const f = fixture(await seed());
    const view = render(tree(f, 'A'));
    await settle();
    expect(api.preferences.visibility).toEqual({ x: false });
    act(() => { api.onColumnVisibilityChange({ x: false, z: false }); });
    await settle();
    view.rerender(tree(f, 'B'));
    await settle();
    expect(api.preferences.sizing).toEqual({ b: 300 });
    view.rerender(tree(f, 'A'));
    await settle();
    expect(api.preferences.visibility).toEqual({ x: false, z: false });
    expect(api.preferences.sizing).toEqual({ a: 100 });
    act(() => { api.onColumnVisibilityChange({ x: false, z: false, w: false }); });
    await settle();
    const stored = f.state.values[await hashKey('A')] as { sizing: unknown; visibility: unknown };
    expect(stored.sizing).toEqual({ a: 100 });
    expect(stored.visibility).toEqual({ x: false, z: false, w: false });
    expect(f.state.values[await hashKey('B')]).toEqual(table({ sizing: { b: 300 }, visibility: { y: false } }));
  });

  it('a width pending on A is flushed to A when the key changes to B, and B is untouched', async () => {
    const f = fixture(await seed());
    const view = render(tree(f, 'A'));
    await settle();
    act(() => { api.onColumnSizingChange({ a: 222 }); });
    view.rerender(tree(f, 'B'));
    await settle();
    expect(api.preferences.sizing).toEqual({ b: 300 });
    const keyA = await hashKey('A');
    await waitFor(() => expect((f.state.values[keyA] as { sizing: unknown }).sizing).toEqual({ a: 222 }), { timeout: 2000 });
    const a = f.state.values[await hashKey('A')] as { sizing: unknown; visibility: unknown };
    expect(a.sizing).toEqual({ a: 222 });
    expect(f.state.values[await hashKey('B')]).toEqual(table({ sizing: { b: 300 }, visibility: { y: false } }));
    view.rerender(tree(f, 'A'));
    await settle();
    expect(api.preferences.sizing).toEqual({ a: 222 });
    expect(api.preferences.visibility).toEqual({ x: false });
  });
});
