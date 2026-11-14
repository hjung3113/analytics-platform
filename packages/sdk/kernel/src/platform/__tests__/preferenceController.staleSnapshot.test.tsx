import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type JsonValue, type PlatformAdapter } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider } from '../platform';
import { useHostPlatform } from '../../host';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';

/** #2033 (KER-13): a change is applied on top of the freshest stored value, never on a stale tab snapshot. */
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const ok = (values: Record<string, JsonValue>) => ({ outcome: 'ok' as const, data: { values, importedAt: '2026-10-29T00:00:00Z' }, assessments: [], trust: null, correlationId: 'c' });
const gated = <T,>() => { let release: (v: T) => void = () => {}; const promise = new Promise<T>(resolve => { release = resolve; }); return { promise, release }; };

function server() {
  let values: Record<string, JsonValue> = { favorites: ['x'] };
  let reads = 0;
  let hold: ReturnType<typeof gated<void>> | null = null;
  let readHold: ReturnType<typeof gated<void>> | null = null;
  let failReads = false;
  const session = testSession(['platform:view'], { user: { id: 'user-a', name: 'a', title: { ko: 'a', en: 'a' } } });
  const adapter: PlatformAdapter = testAdapter({
    session: () => session,
    readPreferences: async () => {
      reads++;
      if (readHold) await readHold.promise;
      if (failReads) throw new Error('offline');
      return ok(values);
    },
    patchPreferences: async patch => {
      if (hold) await hold.promise;
      values = { ...values, ...(patch.set ?? {}) };
      return ok(values);
    },
  });
  return {
    adapter,
    reads: () => reads,
    favorites: () => values.favorites,
    /** Another tab of the same account writes the server directly. */
    otherTab: (favorites: string[]) => { values = { ...values, favorites }; },
    holdPatches: () => { hold = gated<void>(); return hold; },
    /** Reads after this call wait until released (a slow GET). */
    holdReads: () => { readHold = gated<void>(); return readHold; },
    failReads: () => { failReads = true; },
  };
}

function Probe() {
  const p = useHostPlatform();
  return (
    <div>
      <p data-testid="favs">{p.favorites.join(',') || '-'}</p>
      <button onClick={() => p.toggleFavorite('z')}>fav-z</button>
      <button onClick={() => p.toggleFavorite('w')}>fav-w</button>
    </div>
  );
}
const mount = (adapter: PlatformAdapter, serverPreferences = true) => render(
  <StrictMode><I18nProvider><PlatformProvider serverPreferences={serverPreferences} equipmentAxes={[]} adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider></StrictMode>,
);
const becomeVisible = () => act(async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setTimeout(resolve, 0));
});

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('preference lists after another tab changed them (#2033)', () => {
  it('a tab that becomes visible re-reads the server once, so its next favorite keeps the other tab\'s one', async () => {
    const s = server();
    mount(s.adapter);
    await waitFor(() => expect(screen.getByTestId('favs').textContent).toBe('x'));
    const before = s.reads();
    s.otherTab(['x', 'y']);
    await becomeVisible();
    expect(s.reads()).toBe(before + 1);
    await waitFor(() => expect(screen.getByTestId('favs').textContent).toBe('x,y'));
    act(() => { screen.getByText('fav-z').click(); });
    await waitFor(() => expect(s.favorites()).toEqual(['x', 'y', 'z']));
  });

  it('does not re-read while a write is still in flight, and the local change stays', async () => {
    const s = server();
    mount(s.adapter);
    await waitFor(() => expect(screen.getByTestId('favs').textContent).toBe('x'));
    const gate = s.holdPatches();
    act(() => { screen.getByText('fav-z').click(); });
    const before = s.reads();
    await becomeVisible();
    expect(s.reads()).toBe(before);
    expect(screen.getByTestId('favs').textContent).toBe('x,z');
    await act(async () => { gate.release(); await Promise.resolve(); });
    await waitFor(() => expect(s.favorites()).toEqual(['x', 'z']));
  });

  it('browser-storage mode applies a favorite on top of the stored list, keeping another tab\'s favorite', async () => {
    const key = 'platform:favorites:user-a';
    localStorage.setItem(key, JSON.stringify(['x']));
    const s = server();
    mount(s.adapter, false);
    expect(screen.getByTestId('favs').textContent).toBe('x');
    localStorage.setItem(key, JSON.stringify(['x', 'y']));
    act(() => { screen.getByText('fav-z').click(); });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['x', 'y', 'z']);
    expect(screen.getByTestId('favs').textContent).toBe('x,y,z');
  });

  it('a favorite pressed while the visibility GET is in flight applies on what the GET brings (C3)', async () => {
    const s = server();
    mount(s.adapter);
    await waitFor(() => expect(screen.getByTestId('favs').textContent).toBe('x'));
    s.otherTab(['x', 'y']);
    const gate = s.holdReads();
    const before = s.reads();
    await becomeVisible();
    expect(s.reads()).toBe(before + 1);
    act(() => { screen.getByText('fav-z').click(); });
    expect(screen.getByTestId('favs').textContent).toBe('x,z');
    await act(async () => { gate.release(); await new Promise(resolve => setTimeout(resolve, 0)); });
    await waitFor(() => expect(s.favorites()).toEqual(['x', 'y', 'z']));
    await waitFor(() => expect(screen.getByTestId('favs').textContent).toBe('x,y,z'));
  });

  it('a failed visibility GET still drains the queued favorite against the last known list, without a failure state (C3)', async () => {
    const s = server();
    mount(s.adapter);
    await waitFor(() => expect(screen.getByTestId('favs').textContent).toBe('x'));
    const gate = s.holdReads();
    s.failReads();
    await becomeVisible();
    act(() => { screen.getByText('fav-z').click(); });
    await act(async () => { gate.release(); await new Promise(resolve => setTimeout(resolve, 0)); });
    await waitFor(() => expect(s.favorites()).toEqual(['x', 'z']));
  });
});

describe('browser-storage lists when the write fails (C2)', () => {
  const key = 'platform:favorites:user-a';
  const quota = () => vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });

  it('keeps the earlier favorite in memory when the next toggle follows a failed write', () => {
    localStorage.setItem(key, JSON.stringify(['x']));
    mount(server().adapter, false);
    quota();
    act(() => { screen.getByText('fav-z').click(); });
    expect(screen.getByTestId('favs').textContent).toBe('x,z');
    act(() => { screen.getByText('fav-w').click(); });
    expect(screen.getByTestId('favs').textContent).toBe('x,z,w');
  });

  it('two favorite actions before a render both apply', () => {
    localStorage.setItem(key, JSON.stringify(['x']));
    mount(server().adapter, false);
    quota();
    act(() => { screen.getByText('fav-z').click(); screen.getByText('fav-w').click(); });
    expect(screen.getByTestId('favs').textContent).toBe('x,z,w');
  });

  it('replays the retained edits on the stored list once a write can succeed again', () => {
    localStorage.setItem(key, JSON.stringify(['x']));
    mount(server().adapter, false);
    const failing = quota();
    act(() => { screen.getByText('fav-z').click(); });
    failing.mockRestore();
    localStorage.setItem(key, JSON.stringify(['x', 'y']));
    act(() => { screen.getByText('fav-w').click(); });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['x', 'y', 'z', 'w']);
    expect(screen.getByTestId('favs').textContent).toBe('x,y,z,w');
  });
});
