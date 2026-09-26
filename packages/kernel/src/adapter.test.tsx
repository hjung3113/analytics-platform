import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { ApiResponse, PlatformAdapter, Session } from '@ap/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { useAdapterRequest, usePlatformQuery } from './query';
import { createRegistry } from './registry';
import { House } from 'lucide-react';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registry = createRegistry({
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

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
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
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
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
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
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><Favs /></PlatformProvider></I18nProvider>);
    expect(screen.getByTestId('favs').textContent).toBe('m-a');
    act(() => f.switchTo('b'));
    expect(screen.getByTestId('favs').textContent).toBe('m-b');
  });
});

describe('adapter shape', () => {
  it('works with a class-based adapter whose methods use `this`', async () => {
    class ServerAdapter implements PlatformAdapter {
      private listeners = new Set<() => void>();
      private current: Session = { user: { id: 'cls', name: 'cls', title: { ko: 'c', en: 'c' }, permissions: ['platform:view'] }, scopes: [] };
      session() { return this.current; }
      async validateScope() { return { status: 'valid' as const, grantedRooms: [] }; }
      publishedMetrics() { return []; }
      defaultRangeTo() { return '2026-09-26T09:00:00'; }
      async contextOptions() { return { stgroup: [], team: [], makerModel: [] }; }
      async evaluateSelection() { return { inCondition: [], outOfCondition: [] }; }
      subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
    }
    mount(new ServerAdapter());
    expect(await screen.findByText('done:cls#1')).toBeTruthy();
  });
});

describe('useAdapterRequest', () => {
  it('hides the previous data as soon as its key changes', async () => {
    const f = fixture();
    let setKey: (k: string) => void = () => {};
    function Req() {
      const [key, set] = useState('a');
      setKey = set;
      const r = useAdapterRequest(async () => `data-${key}`, key);
      return <p data-testid="req">{r.status}:{r.data ?? '-'}</p>;
    }
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><Req /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('done:data-a')).toBeTruthy();
    act(() => setKey('b'));
    expect(screen.getByTestId('req').textContent).toBe('loading:-');
    expect(await screen.findByText('done:data-b')).toBeTruthy();
    act(() => f.serverChanged());
    expect(screen.getByTestId('req').textContent).toBe('loading:-');
  });
});

describe('useAdapterRequest error', () => {
  it('reports errors and retries on demand', async () => {
    const f = fixture();
    let fail = true;
    function Req() {
      const r = useAdapterRequest(async () => { if (fail) throw new Error('down'); return 'ok'; }, 'k');
      return <button type="button" data-testid="r" onClick={r.retry}>{r.status}:{r.data ?? '-'}</button>;
    }
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><Req /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('error:-')).toBeTruthy();
    fail = false;
    act(() => screen.getByTestId('r').click());
    expect(await screen.findByText('done:ok')).toBeTruthy();
  });
});
