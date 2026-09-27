import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, Session, SpaceDef, UsageEvent } from '@ap/contracts';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { createRegistry } from './registry';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

const spaces: SpaceDef[] = [
  { id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'equipment' },
  { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'admin-roles' },
];
const registry = createRegistry({
  spaces,
  groups: [
    { id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: 'analytics' },
    { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' },
  ],
  menus: [
    { id: 'equipment', group: 'equipment', primary: true, label: { ko: '설비', en: 'Equipment' }, description: { ko: '', en: '' }, path: '/equipment', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'analysis', features: noFeatures, pageKeys: ['page'] },
    { id: 'equipment-detail', group: 'equipment', label: { ko: '설비 상세', en: 'Equipment detail' }, description: { ko: '', en: '' }, path: '/equipment/:equipmentId', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'analysis', features: noFeatures, pageKeys: [], navHidden: true, parent: 'equipment' },
    { id: 'admin-roles', group: 'admin', primary: true, label: { ko: '권한/역할 관리', en: 'Roles & access' }, description: { ko: '', en: '' }, path: '/admin/roles', icon: House, permission: 'console:access', requiresScope: false, context: none, pageType: 'management', features: noFeatures, pageKeys: [] },
    { id: 'admin-child', group: 'admin', label: { ko: '콘솔 하위', en: 'Console child' }, description: { ko: '', en: '' }, path: '/admin/child', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'management', features: noFeatures, pageKeys: [] },
  ],
});

const ADMIN: Session['user']['permissions'] = ['platform:view', 'console:access'];
const ANALYST: Session['user']['permissions'] = ['platform:view'];

/** Fixture adapter that records every usage event the kernel sends, in order. */
function recordingFixture(permissions: Session['user']['permissions'], userId = 'u1', recordUsage?: PlatformAdapter['recordUsage']) {
  const events: (UsageEvent & { userId: string })[] = [];
  let session: Session = { user: { id: userId, name: 'u', title: { ko: 'u', en: 'u' }, permissions }, scopes: [] };
  const listeners = new Set<() => void>();
  const adapter: PlatformAdapter = {
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    // The mock server stamps the session user at call time; mirror that so a dwell crossing a role
    // switch is attributed the way the real adapter would.
    recordUsage: recordUsage ?? (async batch => {
      events.push(...batch.map(e => ({ ...e, userId: session.user.id })));
      return { accepted: batch.length };
    }),
    usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
  // Session identity change the way the app's session store announces one (new snapshot + notify).
  const setSessionUser = (id: string) => {
    session = { ...session, user: { ...session.user, id } };
    for (const l of listeners) l();
  };
  return { adapter, events, setSessionUser };
}

function UsageProbe() {
  const { navigate, setPage } = usePlatform();
  return <div>
    <button type="button" data-testid="leave" onClick={() => navigate('/admin/roles')}>leave</button>
    <button type="button" data-testid="return" onClick={() => navigate('/equipment')}>return</button>
    <button type="button" data-testid="page" onClick={() => setPage({ page: '2' })}>page</button>
  </div>;
}

function mountUi(url: string, adapter: PlatformAdapter, strict = false) {
  window.history.replaceState(null, '', url);
  const ui = <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><UsageProbe /></PlatformProvider></I18nProvider>;
  render(strict ? <StrictMode>{ui}</StrictMode> : ui);
}

function mountFixture(url: string, permissions: Session['user']['permissions'], userId?: string) {
  const fixture = recordingFixture(permissions, userId);
  mountUi(url, fixture.adapter);
  return fixture;
}

function mountAt(url: string, permissions: Session['user']['permissions'], strict = false) {
  window.history.replaceState(null, '', url);
  const { adapter, events } = recordingFixture(permissions);
  mountUi(url, adapter, strict);
  return events;
}

// The effect schedules its entry on setTimeout(0) (design §2); this flushes exactly that timer — a 0ms hop,
// not a guessed duration — inside act so the recorded events are deterministic.
const settle = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };

// Node's own file-less localStorage/sessionStorage shadow jsdom's here, so give each test in-memory stores.
beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const data = new Map<string, string>();
    vi.stubGlobal(name, {
      getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; },
    });
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('usage events (docs/05 메뉴 활용률 계측)', () => {
  it('a permitted navigation emits exactly one entry whose path is the manifest pattern', async () => {
    const events = mountAt('/equipment/E-123?scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00', ADMIN);
    await settle();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('entry');
    expect(events[0].menuId).toBe('equipment-detail');
    expect(events[0].spaceId).toBe('analytics');
    expect(events[0].path).toBe('/equipment/:equipmentId');
    expect(events[0].sessionId).toEqual(expect.any(String));
    // No concrete id, no Context value, no search in the wire format.
    expect(JSON.stringify(events)).not.toContain('E-123');
    expect(JSON.stringify(events)).not.toContain('ICH');
    expect(JSON.stringify(events)).not.toContain('?');
  });

  it('a second render of the same pathname and a query-only setPage emit nothing', async () => {
    const events = mountAt('/equipment?v=1&scopeId=ICH&page=1', ADMIN);
    await settle();
    expect(events).toHaveLength(1);
    act(() => screen.getByTestId('page').click());
    await settle();
    expect(events).toHaveLength(1);
  });

  it('leaving emits one dwell with the entry\'s enteredAt; returning admits a fresh stay', async () => {
    const events = mountAt('/equipment?v=1&scopeId=ICH', ADMIN);
    await settle();
    act(() => screen.getByTestId('leave').click());
    await settle();
    act(() => screen.getByTestId('return').click());
    await settle();
    expect(events.map(e => `${e.name}:${e.menuId}`)).toEqual([
      'entry:equipment', 'dwell:equipment', 'entry:admin-roles', 'dwell:admin-roles', 'entry:equipment',
    ]);
    expect(events[1].enteredAt).toBe(events[0].at);
    expect(events[1].dwellMs).toBeGreaterThanOrEqual(0);
    expect(events[3].enteredAt).toBe(events[2].at);
    expect(events[4].at).toBeGreaterThanOrEqual(events[0].at);
  });

  it('hidden emits exactly one dwell with the exact enteredAt and dwellMs; after unmount the listener is gone', async () => {
    vi.useFakeTimers();
    try {
      const base = Date.parse('2026-09-25T09:00:00Z');
      vi.setSystemTime(base);
      const events = mountAt('/equipment?v=1&scopeId=ICH', ADMIN);
      act(() => { vi.advanceTimersByTime(0); }); // fires exactly the deferred entry timer
      expect(events).toEqual([expect.objectContaining({ name: 'entry', at: base })]);
      const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      try {
        act(() => { vi.setSystemTime(base + 5_000); document.dispatchEvent(new Event('visibilitychange')); });
      } finally {
        hidden.mockRestore();
      }
      expect(events).toEqual([
        expect.objectContaining({ name: 'entry', at: base }),
        expect.objectContaining({ name: 'dwell', enteredAt: base, dwellMs: 5_000, at: base + 5_000 }),
      ]);
      // Leaving (unmount) sends the final dwell by design (the server replaces by enteredAt) and
      // removes the visibilitychange listener: a later hidden emits nothing more.
      cleanup();
      const afterLeave = events.length;
      const hiddenAgain = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      try {
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      } finally {
        hiddenAgain.mockRestore();
      }
      expect(events).toHaveLength(afterLeave);
    } finally {
      vi.useRealTimers();
    }
  });

  it('StrictMode double-mounting still emits exactly one entry and no dwell', async () => {
    const events = mountAt('/equipment?v=1&scopeId=ICH', ADMIN, true);
    await settle();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('entry');
  });

  it('a space-denied direct URL emits zero calls', async () => {
    // admin-child only needs 'platform:view', which the analyst has: the operations space gate
    // ('console:access') is the only guard that can deny this stay (canEnter admission).
    const events = mountAt('/admin/child?v=1&scopeId=ICH', ANALYST);
    await settle();
    expect(events).toHaveLength(0);
  });

  it('a menu-denied direct URL emits zero calls', async () => {
    // The analytics space is open, but the equipment menu requires 'platform:view'.
    const events = mountAt('/equipment?v=1&scopeId=ICH', []);
    await settle();
    expect(events).toHaveLength(0);
  });

  it('a contract-error URL emits zero calls', async () => {
    const events = mountAt('/equipment?v=9', ADMIN);
    await settle();
    expect(events).toHaveLength(0);
  });

  it('a role switch does not bill the old stay\'s dwell to the new user', async () => {
    // The mock stamps the session user at call time, so a dwell sent after the switch would carry the
    // new user's id — the kernel must not send that stale dwell at all.
    const fixture = mountFixture('/equipment?v=1&scopeId=ICH', ANALYST, 'engineer');
    await settle();
    expect(fixture.events).toEqual([expect.objectContaining({ name: 'entry', userId: 'engineer' })]);
    act(() => fixture.setSessionUser('admin'));
    await settle();
    expect(fixture.events.filter(e => e.name === 'dwell')).toHaveLength(0);
    expect(fixture.events.map(e => `${e.userId}:${e.name}`)).toEqual(['engineer:entry', 'admin:entry']);
  });

  it('a pending entry timer from the old user does not fire after a role switch', async () => {
    const fixture = mountFixture('/equipment?v=1&scopeId=ICH', ANALYST, 'engineer');
    act(() => fixture.setSessionUser('admin')); // before the deferred entry timer fires
    await settle();
    expect(fixture.events.map(e => `${e.userId}:${e.name}`)).toEqual(['admin:entry']);
  });

  it('a rejecting recordUsage stays silent and navigation still works', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => { rejections.push(reason); };
    process.on('unhandledRejection', onRejection);
    try {
      const { adapter } = recordingFixture(ADMIN, 'u1', async () => { throw new Error('network down'); });
      mountUi('/equipment?v=1&scopeId=ICH', adapter);
      await settle();
      act(() => screen.getByTestId('leave').click());
      await settle();
      expect(window.location.pathname).toBe('/admin/roles');
      await settle(); // one macrotask hop: the unhandled-rejection hook fires before this resolves
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });

  it('a synchronously throwing recordUsage does not break navigation', async () => {
    const { adapter } = recordingFixture(ADMIN, 'u1', () => { throw new Error('sync boom'); });
    mountUi('/equipment?v=1&scopeId=ICH', adapter);
    await settle();
    act(() => screen.getByTestId('leave').click());
    await settle();
    expect(window.location.pathname).toBe('/admin/roles');
  });
});
