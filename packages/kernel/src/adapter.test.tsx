import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { ApiResponse, PlatformAdapter, Session } from '@ap/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { useAdapterRequest, useEntityQuery, usePlatformQuery } from './query';
import { createRegistry } from './registry';
import { House } from 'lucide-react';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

/** Fixture adapter: no mock server, so these tests pin the kernel side of the port (platform-packages.md §4). */
function fixture(getEntity?: PlatformAdapter['getEntity']) {
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
    getEntity: getEntity ?? (async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' })),
    auditTrail: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    accessDirectory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    recordUsage: async () => ({ accepted: 0 }),
    usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    myVocHistory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    mySurveyHistory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    reportClientError: async () => ({ accepted: true }),
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
      async getEntity() { return { outcome: 'empty' as const, data: null, assessments: [], trust: null, correlationId: 'cls' }; }
      async auditTrail() { return { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'cls' }; }
      async entityAudit() { return { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'cls' }; }
      async accessDirectory() { return { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'cls' }; }
      async recordUsage() { return { accepted: 0 }; }
      async reportClientError() { return { accepted: true }; }
      async usageSummary() { return { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'cls' }; }
      async myVocHistory() { return { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'cls' }; }
      async mySurveyHistory() { return { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'cls' }; }
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

describe('useEntityQuery (session identity)', () => {
  /** Row probe: a global period change (button) must not refetch; ref/revision changes must. */
  function RowProbe(props: { id: string }) {
    const { setGlobal } = usePlatform();
    const query = useEntityQuery<string>({ type: 'device', id: props.id, scopeId: null }, 'header');
    return (
      <button type="button" data-testid="ent" onClick={() => setGlobal({ from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' })}>
        {query.status}:{query.response?.data ?? '-'}
      </button>
    );
  }

  function RowSwitch(props: { onId: (set: (id: string) => void) => void }) {
    const [id, setId] = useState('d-1');
    props.onId(setId);
    return <RowProbe id={id} />;
  }

  it('returns ok and a global period change neither refetches nor hides the row', async () => {
    let calls = 0;
    const f = fixture(async ref => {
      calls++;
      return { outcome: 'ok', data: `row-${ref.id}`, assessments: [], trust: null, correlationId: 'e' };
    });
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><RowProbe id="d-1" /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('done:row-d-1')).toBeTruthy();
    expect(calls).toBe(1);
    act(() => screen.getByTestId('ent').click());
    expect(screen.getByTestId('ent').textContent).toBe('done:row-d-1');
    await act(async () => {}); // a stray refetch would surface here
    expect(calls).toBe(1);
  });

  it('hides the row immediately when ref.id changes, then shows the new id', async () => {
    let calls = 0;
    const f = fixture(async ref => {
      calls++;
      return { outcome: 'ok', data: `row-${ref.id}`, assessments: [], trust: null, correlationId: 'e' };
    });
    let setId: (id: string) => void = () => {};
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><RowSwitch onId={set => { setId = set; }} /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('done:row-d-1')).toBeTruthy();
    act(() => setId('d-2'));
    expect(screen.getByTestId('ent').textContent).toBe('loading:-');
    expect(await screen.findByText('done:row-d-2')).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('hides the row immediately when the server announces a change', async () => {
    let calls = 0;
    const f = fixture(async ref => {
      calls++;
      return { outcome: 'ok', data: `row-${ref.id}`, assessments: [], trust: null, correlationId: 'e' };
    });
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><RowProbe id="d-1" /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('done:row-d-1')).toBeTruthy();
    act(() => f.serverChanged());
    expect(screen.getByTestId('ent').textContent).toBe('loading:-');
    expect(await screen.findByText('done:row-d-1')).toBeTruthy();
    expect(calls).toBe(2);
  });
});

describe('setGlobal drops contextResetKeys in the same navigation (06 §6.4)', () => {
  const stateful = createRegistry({
    spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' }],
    groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
    menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['sort', 'page', 'bucket'], contextResetKeys: ['page', 'bucket'] }],
  });

  function UrlProbe() {
    const { global, pageParam, setGlobal, navigate } = usePlatform();
    return <div>
      <button type="button" data-testid="switch" onClick={() => setGlobal({ scopeId: 'CJU' })}>switch</button>
      <button type="button" data-testid="noop" onClick={() => setGlobal({ scopeId: 'ICH' })}>noop</button>
      <button type="button" data-testid="deep" onClick={() => navigate('/?v=1&scopeId=ICH&page=3&bucket=b9')}>deep</button>
      <p data-testid="url">{window.location.search}</p>
      <p data-testid="page">{pageParam('page') ?? '-'}</p>
      <p data-testid="bucket">{pageParam('bucket') ?? '-'}</p>
      <p data-testid="sort">{pageParam('sort') ?? '-'}</p>
    </div>;
  }

  const mountStateful = () => render(
    <I18nProvider><PlatformProvider adapter={fixture().adapter} registry={stateful}><UrlProbe /></PlatformProvider></I18nProvider>,
  );

  it('drops declared keys, keeps others, and history.back() restores the earlier URL exactly', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&page=2&bucket=b1&sort=cycleMin');
    mountStateful();
    expect(screen.getByTestId('page').textContent).toBe('2');
    expect(screen.getByTestId('bucket').textContent).toBe('b1');
    expect(screen.getByTestId('sort').textContent).toBe('cycleMin');

    act(() => screen.getByTestId('switch').click());
    // page/bucket are dropped by setGlobal itself (one entry, no follow-up replace); sort is kept.
    expect(window.location.search).toBe('?v=1&scopeId=CJU&sort=cycleMin');
    expect(screen.getByTestId('page').textContent).toBe('-');
    expect(screen.getByTestId('bucket').textContent).toBe('-');
    expect(screen.getByTestId('sort').textContent).toBe('cycleMin');

    await act(async () => {
      window.history.back();
      await waitFor(() => expect(window.location.search).toBe('?v=1&scopeId=ICH&page=2&bucket=b1&sort=cycleMin'));
    });
    expect(window.location.search).toBe('?v=1&scopeId=ICH&page=2&bucket=b1&sort=cycleMin');
    expect(screen.getByTestId('page').textContent).toBe('2');
    expect(screen.getByTestId('bucket').textContent).toBe('b1');
  });

  it('keeps declared keys on a no-op setGlobal and on navigate() to a URL carrying them', () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH&page=2&bucket=b1');
    mountStateful();
    act(() => screen.getByTestId('noop').click());
    // The global Context did not actually change — nothing is dropped.
    expect(window.location.search).toBe('?v=1&scopeId=ICH&page=2&bucket=b1');
    act(() => screen.getByTestId('deep').click());
    // popstate and navigate() never drop: restored/entered URLs keep their keys verbatim.
    expect(window.location.search).toBe('?v=1&scopeId=ICH&page=3&bucket=b9');
    expect(screen.getByTestId('page').textContent).toBe('3');
    expect(screen.getByTestId('bucket').textContent).toBe('b9');
  });
});
