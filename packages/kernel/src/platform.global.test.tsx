import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientErrorReport, PlatformAdapter, Session, SpaceDef, UsageEvent } from '@ap/contracts';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { createRegistry, type MenuEntry } from './registry';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

const spaces: SpaceDef[] = [
  { id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'equipment' },
  { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' },
];

function menu(over: Partial<MenuEntry> & Pick<MenuEntry, 'id' | 'group' | 'path' | 'permission'>): MenuEntry {
  return {
    label: { ko: over.id, en: over.id }, description: { ko: '', en: '' }, icon: House, requiresScope: false,
    context: none, pageType: 'catalog', features: noFeatures, pageKeys: [], ...over,
  };
}

const registry = createRegistry({
  spaces,
  groups: [
    { id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: 'analytics' },
    { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' },
    { id: 'noticeVoc', label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: House, space: null },
  ],
  menus: [
    menu({ id: 'equipment', group: 'equipment', path: '/equipment', permission: 'platform:view', primary: true, label: { ko: '설비', en: 'Equipment' } }),
    menu({ id: 'admin-roles', group: 'admin', path: '/admin/roles', permission: 'console:access', primary: true }),
    menu({ id: 'admin-child', group: 'admin', path: '/admin/child', permission: 'platform:view' }),
    menu({ id: 'notices', group: 'noticeVoc', path: '/notices', permission: 'notice:view', primary: true, label: { ko: '공지', en: 'Notices' } }),
    menu({ id: 'notices-detail', group: 'noticeVoc', path: '/notices/:id', permission: 'notice:view', navHidden: true, parent: 'notices' }),
    menu({ id: 'voc', group: 'noticeVoc', path: '/voc', permission: 'voc:view', label: { ko: 'VOC', en: 'VOC' } }),
  ],
});

const WITH_SPACE: Session['user']['permissions'] = ['platform:view', 'notice:view'];
const GLOBAL_ONLY: Session['user']['permissions'] = ['notice:view'];

function fixture(permissions: Session['user']['permissions']) {
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions }, scopes: [] };
  const events: UsageEvent[] = [];
  const reports: ClientErrorReport[] = [];
  const adapter: PlatformAdapter = {
    menuQuery: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    auditTrail: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    accessDirectory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    recordUsage: async batch => { events.push(...batch); return { accepted: batch.length }; },
    usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    reportClientError: async report => { reports.push(report); return { accepted: true }; },
    subscribe: () => () => {},
  };
  return { adapter, events, reports };
}

function Probe() {
  const { currentSpace, sidebarSpace, accessibleSpaces, visibleMenus, globalMenus, recent, resolveLink, reportError } = usePlatform();
  return <div>
    <p data-testid="current">{currentSpace?.id ?? 'null'}</p>
    <p data-testid="sidebar">{sidebarSpace?.id ?? 'null'}</p>
    <p data-testid="accessible">{accessibleSpaces.map(s => s.id).join(',')}</p>
    <p data-testid="visible">{visibleMenus.map(m => m.id).join(',')}</p>
    <p data-testid="global">{globalMenus.map(m => m.id).join(',')}</p>
    <p data-testid="recent">{recent.map(r => r.menuId).join(',')}</p>
    <p data-testid="notices-allowed">{String(resolveLink('notices').allowed)}</p>
    <p data-testid="child-allowed">{String(resolveLink('admin-child').allowed)}</p>
    <button type="button" data-testid="report" onClick={() => reportError(new Error('x'))}>report</button>
  </div>;
}

function mountAt(url: string, permissions: Session['user']['permissions']) {
  window.history.replaceState(null, '', url);
  const bag = fixture(permissions);
  const view = render(<I18nProvider><PlatformProvider adapter={bag.adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
  return { ...bag, ...view };
}

const settle = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };

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

describe('global utility menus (06 §9.1)', () => {
  it('admits a global menu on menu permission alone, keeps currentSpace null, and leaves it out of the space lists', () => {
    mountAt('/notices?v=1', WITH_SPACE);
    expect(screen.getByTestId('current').textContent).toBe('null');
    expect(screen.getByTestId('notices-allowed').textContent).toBe('true');
    expect(screen.getByTestId('child-allowed').textContent).toBe('false');
    expect(screen.getByTestId('accessible').textContent).toBe('analytics');
    expect(screen.getByTestId('visible').textContent).toBe('equipment');
    expect(screen.getByTestId('global').textContent).toBe('notices,notices-detail');
    expect(screen.getByTestId('sidebar').textContent).toBe('analytics');
    expect(screen.getByTestId('recent').textContent).toBe('notices');
    expect(JSON.parse(localStorage.getItem('platform:recent:u1') ?? 'null')).toEqual([
      { menuId: 'notices', url: '/notices?v=1', at: expect.any(Number) },
    ]);
  });

  it('with no accessible space, sidebarSpace is null and nothing throws', async () => {
    const { events, reports, unmount } = mountAt('/notices?v=1', GLOBAL_ONLY);
    expect(screen.getByTestId('accessible').textContent).toBe('');
    expect(screen.getByTestId('sidebar').textContent).toBe('null');
    expect(screen.getByTestId('visible').textContent).toBe('');
    expect(screen.getByTestId('current').textContent).toBe('null');
    expect(screen.getByTestId('global').textContent).toBe('notices,notices-detail');
    expect(screen.getByTestId('recent').textContent).toBe('notices');

    await settle();
    expect(events).toEqual([expect.objectContaining({ name: 'entry', menuId: 'notices', spaceId: null, path: '/notices' })]);
    unmount();
    expect(events.map(e => e.name)).toEqual(['entry', 'dwell']);
    expect(events[1]).toEqual(expect.objectContaining({ name: 'dwell', menuId: 'notices', spaceId: null, path: '/notices' }));

    const again = mountAt('/notices?v=1', GLOBAL_ONLY);
    act(() => screen.getByTestId('report').click());
    expect(again.reports).toEqual([expect.objectContaining({ menuId: 'notices', spaceId: null, path: '/notices' })]);
    expect(reports).toEqual([]);
  });

  it('throws only when the registry itself declares no spaces', () => {
    const empty = createRegistry({
      spaces: [],
      groups: [{ id: 'noticeVoc', label: { ko: '공지', en: 'Notice' }, icon: House, space: null }],
      menus: [menu({ id: 'notices', group: 'noticeVoc', path: '/notices', permission: 'notice:view', primary: true })],
    });
    window.history.replaceState(null, '', '/notices');
    expect(() => render(<I18nProvider><PlatformProvider adapter={fixture(GLOBAL_ONLY).adapter} registry={empty}><p>ok</p></PlatformProvider></I18nProvider>))
      .toThrow(/registry declares no spaces/);
  });
});
