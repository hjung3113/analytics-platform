// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import { PERMISSION } from '../permission';
import ExecutionDetail from './ExecutionDetail';
import { contextCapabilities, groupId, menuPermission, NO_FEATURES, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { TEST_AXES } from '../test-axes';

// Link destinations the page opens; only their paths matter here.
const destinations = ['equipment-detail', 'voc'].map(id => ({
  id, group: groupId('analytics'), label: { ko: id, en: id }, description: { ko: id, en: id },
  path: id === 'voc' ? '/voc' : '/equipment/:equipmentId', icon: Timer, permission: PERMISSION, requiresScope: false,
  pageType: 'analysis' as const, context: contextCapabilities({}), features: NO_FEATURES, pageKeys: [],
}));
const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'productivity-overview' }],
  groups: [{ id: groupId('analytics'), label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: spaceId('mars') }],
  menus: [...manifests, ...destinations],
});
const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } }, scopes: [{ id: 'MEM', label: 'MEM', grantedRooms: 1, totalRooms: 1 }] });
const assessments = (['collection', 'processing_delay', 'coverage'] as const).map(kind => ({ kind, state: 'clear' as const }));
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const execution = { equipmentId: 'EQ-1', room: 'PHOTO', recipe: 'R', lotId: 'L', ppid: 'P', anchor: '2456001', startedAt: '2026-09-26T01:02:03', cycleMin: 90, quality: 'review' };
const segments = [{ kind: 'PRC', module: 'MD-1', slot: 'SL-1', start: '2026-09-26T01:02:03', end: '2026-09-26T01:12:03', durationMin: 10 }];
const queries: MenuQuery[] = [];
const adapter = testAdapter({
  session: () => session,
  menuQuery: async (req: MenuQuery) => {
    queries.push(req);
    return req.endpoint === 'analytics.execution.occurrence'
      ? { outcome: 'ok', data: { access: 'ok', execution, segments }, assessments, trust: null, correlationId: 'fixture' } as unknown as ApiResponse<never>
      : empty;
  },
});

beforeEach(() => { queries.length = 0; vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderAt(search: string) {
  window.history.replaceState(null, '', `/analytics/executions/EQ-1?v=1&scopeId=MEM${search}`);
  render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={adapter} registry={registry}><ExecutionDetail params={{ equipmentId: 'EQ-1' }} /></PlatformProvider></I18nProvider>);
}

describe('ExecutionDetail identity', () => {
  it('shows the anchor as the key, the start time as a separate field, and draws the timeline from the start time', async () => {
    renderAt('&entityType=job&anchor=2456001');
    const key = await screen.findByTestId('occurrence-key');
    expect(within(key).getByText('anchor').nextElementSibling?.textContent).toBe('2456001');
    await screen.findByText('공정 타임라인');
    expect(within(key).getByText('시작 시각').nextElementSibling?.textContent).toBe('2026-09-26 01:02:03');
    expect(queries.find(q => q.endpoint === 'analytics.execution.occurrence')?.params).toMatchObject({ anchor: '2456001' });
    // Timeline axis origin is the start time, not the key.
    const axis = screen.getByRole('img', { name: '공정 구간 막대' }).nextElementSibling as HTMLElement;
    expect(axis.firstElementChild?.textContent).toBe('2026-09-26 01:02:03');
    expect(axis.firstElementChild?.textContent).not.toBe('2456001');
  });

  it('shows — for the start time before data and does not query a time-shaped anchor', async () => {
    renderAt('&entityType=job&anchor=2026-09-26T01:02:03');
    const key = await screen.findByTestId('occurrence-key');
    expect(within(key).getByText('시작 시각').nextElementSibling?.textContent).toBe('—');
    expect(await screen.findByText(/실행 키\(anchor\)의 형식이 올바르지 않습니다/)).toBeTruthy();
    expect(queries.some(q => q.endpoint === 'analytics.execution.occurrence')).toBe(false);
  });
});

describe('ExecutionDetail panel rhythm and 구간 표 (#1166)', () => {
  const panelOf = (title: string) => screen.getByText(title).closest('section') as HTMLElement;

  it('puts one 12px gap between the sibling panels and no extra top padding around the query view', async () => {
    renderAt('&entityType=job&anchor=2456001');
    await screen.findByText('공정 타임라인');
    const identity = panelOf('Occurrence 식별');
    const stack = identity.parentElement as HTMLElement;
    expect(stack.className).toContain('space-y-3');
    expect(stack.className).not.toContain('space-y-4');
    const body = panelOf('표시 속성').parentElement as HTMLElement;
    const holder = body.parentElement?.parentElement as HTMLElement; // QueryView block → the page's wrapper
    expect(holder.parentElement).toBe(stack);
    expect(holder.className).not.toMatch(/\bpt-\d/);
    // The panels inside the query view are spaced by their own 12px stack.
    expect(body.className).toContain('space-y-3');
    for (const title of ['공정 타임라인', '구간 표', '품질 표시']) expect(panelOf(title).parentElement).toBe(body);
  });

  it('구간 표: 16px cell padding, one-line headers with the full label in title', async () => {
    renderAt('&entityType=job&anchor=2456001');
    await screen.findByText('구간 표');
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBe(6);
    for (const header of headers) {
      expect(header.className).toContain('px-4');
      expect(header.className).not.toContain('px-3');
      expect(header.className).toContain('truncate');
      expect(header.getAttribute('title')).toBe(header.textContent);
    }
    for (const cell of screen.getAllByRole('cell')) expect(cell.className).toContain('px-4');
  });
});
