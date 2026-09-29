import { lazy } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientErrorReport, PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { RouteOutlet } from './RouteOutlet';
import { reloadApp } from './reload';

vi.mock('./reload', () => ({ reloadApp: vi.fn() }));

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const menu = (id: string, path: string, over: object = {}) => ({
  id, group: 'equipment' as const, label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: none, pageType: 'analysis' as const, features: noFeatures, pageKeys: [], ...over,
});

let broken = true;
function Crash(): never { throw new Error('boom: unexpected shape'); }
function Leaky(): never { throw new Error('lotIds=PRIVATE-LOT user@example.test'); }
function Odd(): never { throw Object.create(null); }
function Renamed(): never { const e = new Error('x'); e.name = 'PRIVATE LOT A1'; throw e; }
const lazyMissing = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: https://x/y.js')));
function Flaky() { if (broken) throw new TypeError('flaky'); return <p>flaky ok</p>; }

const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' }],
  groups: [{ id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: 'analytics' }],
  menus: [
    menu('home', '/home', { primary: true, component: () => <p>home page</p> }),
    menu('crash', '/crash', { component: Crash }),
    menu('flaky', '/flaky', { component: Flaky }),
    menu('missing', '/missing', { component: lazyMissing }),
    menu('leaky', '/leaky', { component: Leaky }),
    menu('odd', '/odd', { component: Odd }),
    menu('renamed', '/renamed', { component: Renamed }),
  ],
});

const forbidden = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' };
function fixture(reportClientError: PlatformAdapter['reportClientError']) {
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions: ['platform:view'] }, scopes: [] };
  const listeners = new Set<() => void>();
  const adapter: PlatformAdapter = {
    menuQuery: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ ...forbidden, outcome: 'empty' }),
    auditTrail: async () => forbidden, entityAudit: async () => forbidden, accessDirectory: async () => forbidden,
    recordUsage: async () => ({ accepted: 0 }),
    listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    reportClientError,
    usageSummary: async () => forbidden, myVocHistory: async () => forbidden, mySurveyHistory: async () => forbidden,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
  return { adapter, announce: () => listeners.forEach(l => l()) };
}

function Nav() {
  const { navigate } = usePlatform();
  return <nav><button type="button" onClick={() => navigate('/home')}>go home</button><button type="button" onClick={() => navigate('/flaky')}>go flaky</button></nav>;
}

function mountAt(url: string, adapter: PlatformAdapter) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Nav /><RouteOutlet /></PlatformProvider></I18nProvider>);
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { broken = true; errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); errorSpy.mockRestore(); });

describe('RouteOutlet error boundary (06 §4)', () => {
  it('contains a menu render failure: error view with the reported correlation id, shell stays usable', async () => {
    const reports: ClientErrorReport[] = [];
    const { adapter } = fixture(async r => { reports.push(r); return { accepted: true }; });
    mountAt('/crash?v=1&scopeId=ICH&secret=abc', adapter);
    expect(await screen.findByText('이 화면에서 오류가 발생했습니다')).toBeTruthy();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual({
      correlationId: expect.stringMatching(/^client-/), menuId: 'crash', spaceId: 'analytics', path: '/crash', name: 'Error',
    });
    expect(screen.getByText(new RegExp(reports[0].correlationId))).toBeTruthy();
    // The shell sibling still works and leaves the failed screen.
    fireEvent.click(screen.getByText('go home'));
    expect(await screen.findByText('home page')).toBeTruthy();
    expect(screen.queryByText('이 화면에서 오류가 발생했습니다')).toBeNull();
  });

  it('never sends the free-text message or a non-identifier name (values can ride in them)', async () => {
    const reports: ClientErrorReport[] = [];
    const { adapter } = fixture(async r => { reports.push(r); return { accepted: true }; });
    const view = mountAt('/leaky', adapter);
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    view.unmount();
    mountAt('/renamed', adapter);
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    expect(reports).toHaveLength(2);
    expect(JSON.stringify(reports)).not.toMatch(/PRIVATE|user@example/);
    expect(reports.map(r => r.name)).toEqual(['Error', 'Error']);
  });

  it('a thrown value that cannot be stringified still ends in the contained error view', async () => {
    const { adapter } = fixture(async () => ({ accepted: true }));
    mountAt('/odd', adapter);
    expect(await screen.findByText('이 화면에서 오류가 발생했습니다')).toBeTruthy();
    expect(screen.getByText(/Correlation ID: client-/)).toBeTruthy();
    fireEvent.click(screen.getByText('go home'));
    expect(await screen.findByText('home page')).toBeTruthy();
  });

  it('navigating from a healthy screen to one that fails reports once, not once per automatic retry', async () => {
    const reports: ClientErrorReport[] = [];
    const { adapter } = fixture(async r => { reports.push(r); return { accepted: true }; });
    mountAt('/home', adapter);
    await screen.findByText('home page');
    fireEvent.click(screen.getByText('go flaky'));
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    expect(reports).toHaveLength(1);
  });

  it('retry after a failed lazy chunk reloads the page, since React caches the rejected import', async () => {
    const { adapter } = fixture(async () => ({ accepted: true }));
    mountAt('/missing', adapter);
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reloadApp).toHaveBeenCalledTimes(1);
  });

  it('retry remounts the screen once the cause is gone', async () => {
    const { adapter } = fixture(async () => ({ accepted: true }));
    mountAt('/flaky', adapter);
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('flaky ok')).toBeTruthy();
  });

  it('a server-side change (revision) clears a contained failure', async () => {
    const { adapter, announce } = fixture(async () => ({ accepted: true }));
    mountAt('/flaky', adapter);
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    broken = false;
    await act(async () => { announce(); });
    expect(await screen.findByText('flaky ok')).toBeTruthy();
  });

  it('a rejecting or throwing report port never breaks the error screen', async () => {
    for (const port of [(async () => { throw new Error('down'); }), (() => { throw new Error('sync'); })] as PlatformAdapter['reportClientError'][]) {
      const { adapter } = fixture(port);
      const view = mountAt('/crash', adapter);
      expect(await screen.findByText('이 화면에서 오류가 발생했습니다')).toBeTruthy();
      view.unmount();
    }
  });
});
