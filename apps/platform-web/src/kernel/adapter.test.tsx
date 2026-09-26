import { act, cleanup, render, screen } from '@testing-library/react';
import type { ApiResponse, PlatformAdapter, Session } from '@ap/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { usePlatformQuery } from './query';

/** Fixture adapter: no mock server, so these tests pin the kernel side of the port (platform-packages.md §4). */
function fixture() {
  const make = (id: string): Session => ({ user: { id, name: id, title: { ko: id, en: id }, permissions: ['platform:view'] }, scopes: [] });
  const sessions = { a: make('user-a'), b: make('user-b') };
  let current: Session = sessions.a;
  const listeners = new Set<() => void>();
  const adapter: PlatformAdapter = {
    session: () => current,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return {
    adapter,
    switchTo: (key: keyof typeof sessions) => { current = sessions[key]; listeners.forEach(l => l()); },
    serverChanged: () => listeners.forEach(l => l()),
  };
}

let calls = 0;
function Probe() {
  const { user } = usePlatform();
  const query = usePlatformQuery<string>(async () => {
    calls++;
    const response: ApiResponse<string> = { outcome: 'ok', data: `${user.id}#${calls}`, assessments: [], trust: null, correlationId: 'c' };
    return response;
  });
  return <p data-testid="probe">{query.status}:{query.response?.data ?? '-'}</p>;
}

function mount(adapter: PlatformAdapter) {
  return render(<I18nProvider><PlatformProvider adapter={adapter}><Probe /></PlatformProvider></I18nProvider>);
}

// Node's own (file-less) localStorage shadows jsdom's here, so give each test an in-memory store.
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; },
  });
});
afterEach(() => { cleanup(); calls = 0; vi.unstubAllGlobals(); });

describe('PlatformAdapter subscribe → query invalidation', () => {
  it('hides the previous result in the same render a server-side change is announced', async () => {
    const f = fixture();
    mount(f.adapter);
    expect(await screen.findByText('done:user-a#1')).toBeTruthy();
    act(() => f.serverChanged());
    expect(screen.getByTestId('probe').textContent).toBe('loading:-');
    expect(await screen.findByText('done:user-a#2')).toBeTruthy();
  });

  it('hides the previous user\'s result immediately on a session switch', async () => {
    const f = fixture();
    mount(f.adapter);
    expect(await screen.findByText('done:user-a#1')).toBeTruthy();
    act(() => f.switchTo('b'));
    expect(screen.getByTestId('probe').textContent).toBe('loading:-');
    expect(await screen.findByText('done:user-b#2')).toBeTruthy();
  });
});

describe('per-user kernel state', () => {
  it('swaps favorites with the session', async () => {
    localStorage.setItem('platform:favorites:user-a', JSON.stringify(['m-a']));
    localStorage.setItem('platform:favorites:user-b', JSON.stringify(['m-b']));
    const f = fixture();
    function Favs() { return <p data-testid="favs">{usePlatform().favorites.join(',')}</p>; }
    render(<I18nProvider><PlatformProvider adapter={f.adapter}><Favs /></PlatformProvider></I18nProvider>);
    expect(screen.getByTestId('favs').textContent).toBe('m-a');
    act(() => f.switchTo('b'));
    expect(screen.getByTestId('favs').textContent).toBe('m-b');
  });
});
