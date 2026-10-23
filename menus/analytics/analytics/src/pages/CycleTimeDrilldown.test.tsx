// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CycleKpi } from '../endpoints';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import CycleTimeDrilldown from './CycleTimeDrilldown';
import { installWorkspaceGeometry } from './workspaceTestSupport';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery, type PlatformAdapter } from '@ap/contracts';

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
let restoreGeometry = () => {};
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); restoreGeometry = installWorkspaceGeometry(); });
afterAll(() => {
  restoreGeometry();
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'productivity-overview' }],
  groups: [{ id: groupId('analytics'), label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: spaceId('analytics') }],
  menus: manifests,
});

const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } } });
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const adapter = testAdapter({
  session: () => session,
  menuQuery: async () => empty,
  saveAnnotation: async () => empty,
  usageSummary: async () => empty,
  auditTrail: async () => empty,
  entityAudit: async () => empty,
  accessDirectory: async () => empty,
});

function renderPage(path: string) {
  window.history.replaceState(null, '', path);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
}

describe('CycleTimeDrilldown page filter summary', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows the unknown percentile raw value in the collapsed summary instead of the default label', async () => {
    renderPage('/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00&percentile=zzz');

    fireEvent.click(await screen.findByRole('button', { name: '페이지 필터 접기' }));
    const expand = screen.getByRole('button', { name: '페이지 필터 펼치기' });
    // 9h period → hour grain; the summary repeats the edit fields, and the invalid tail shows the raw value.
    expect(expand.textContent).toContain('집계 시간');
    expect(expand.textContent).toContain('느린 실행 기준 이 화면에서 쓸 수 없는 값: zzz');
    expect(expand.textContent).not.toContain('≥ P95');
    expect(expand.textContent).toContain('정렬 사이클타임 내림차순');
  });

  it('summarizes applied values and keeps the reset working without leaving the collapsed state', async () => {
    // The page head starts collapsed on a fill page (#680); this test works inside it.
    const storage = memoryStorage();
    storage.setItem('platform:page-head-collapsed:cycle-time', 'false');
    vi.stubGlobal('localStorage', storage);
    renderPage('/analytics/cycle-time?v=1&scopeId=MEM&percentile=p50&sort=delta:desc');

    fireEvent.click(await screen.findByRole('button', { name: '페이지 필터 접기' }));
    const expand = screen.getByRole('button', { name: '페이지 필터 펼치기' });
    expect(expand.textContent).toContain('느린 실행 기준 ≥ P50');
    expect(expand.textContent).toContain('정렬 P95 대비 내림차순');

    fireEvent.click(screen.getByRole('button', { name: '페이지 조건 기본값' }));
    expect(screen.getByRole('button', { name: '페이지 필터 펼치기' })).toBeTruthy();
    const live = screen.getByTestId('page-filter-bar').querySelector('[aria-live="polite"]');
    expect(live!.textContent).toContain('느린 실행 기준 ≥ P95');
  });
});

// #304 FIX1: the invalid-page-key alert names each field's user name and the raw value as entered,
// one sentence per field — never `key=value`.
describe('CycleTimeDrilldown invalid page key warnings (#304 FIX1)', () => {
  afterEach(cleanup);

  it('percentile=zzz names the 느린 실행 기준 field and the raw value, without key=value', async () => {
    renderPage('/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00&percentile=zzz');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('느린 실행 기준');
    expect(alert.textContent).toContain('zzz');
    expect(alert.textContent).not.toContain('percentile=');
    expect(alert.textContent).toContain('되돌리세요');
  });

  it('states each refusal as the exact ADR-0034 sentence plus the page own action (one paragraph per field)', async () => {
    renderPage('/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00&granularity=zzz&percentile=q&bin=bogus&page=0');
    const alert = await screen.findByRole('alert');
    expect([...alert.querySelectorAll('p')].map(p => p.textContent)).toEqual([
      '집계 “zzz”는 이 화면에서 쓸 수 없습니다. 페이지 조건을 기본값으로 되돌리세요.',
      '느린 실행 기준 “q”은 이 화면에서 쓸 수 없습니다. 페이지 조건을 기본값으로 되돌리세요.',
      '분포 구간 “bogus”은 이 화면에서 쓸 수 없습니다. 페이지 조건을 기본값으로 되돌리세요.',
      '페이지 “0”는 이 화면에서 쓸 수 없습니다. 페이지 조건을 기본값으로 되돌리세요.',
    ]);
  });
});

describe('CycleTimeDrilldown slow-execution KPI name (#307)', () => {
  afterEach(cleanup);

  it('puts the P95 basis in the KPI name and leaves the population caption', async () => {
    const kpi: CycleKpi = { p50: 41.2, p95: 68.5, count: 10, slowCount: 2, prevP50: null, prevP95: null };
    const ok = {
      outcome: 'ok' as const, data: kpi, trust: null, correlationId: 'fixture',
      assessments: [
        { kind: 'collection' as const, state: 'unknown' as const, reason: 'source_unavailable' as const },
        { kind: 'processing_delay' as const, state: 'unknown' as const, reason: 'source_unavailable' as const },
        { kind: 'coverage' as const, state: 'unknown' as const, reason: 'source_unavailable' as const },
      ],
    };
    const querying: PlatformAdapter = { ...adapter, menuQuery: async (req: MenuQuery) => req.endpoint === 'analytics.cycle.kpi' ? ok : empty };
    window.history.replaceState(null, '', '/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00');
    render(<I18nProvider><PlatformProvider adapter={querying} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('느린 실행 (P95 기준)')).toBeTruthy();
    expect(screen.getByTestId('cycle-kpi').textContent).toContain('표시된 P95 이상');
  });
});

describe('CycleTimeDrilldown population caption (#397)', () => {
  afterEach(cleanup);
  const url = '/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00';

  it('shows … only while the KPI query is loading', async () => {
    const pending: PlatformAdapter = { ...adapter, menuQuery: () => new Promise<never>(() => undefined) };
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider adapter={pending} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
    expect((await screen.findByText(/페이지 필터 적용 목록입니다/)).textContent).toContain('모집단 …건.');
  });

  it('says 확인할 수 없음 once the KPI query completed with an empty response', async () => {
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
    const caption = await screen.findByText(/페이지 필터 적용 목록입니다.*모집단 확인할 수 없음/);
    expect(caption.textContent).not.toMatch(/모집단 …|건\./);
    expect(caption.textContent).not.toContain('URL sort');
  });
});

describe('CycleTimeDrilldown workspace (ADR-0067 3b)', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  const period = '/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00';

  it('draws the four panels in the balanced preset, in a fill page, with the preset toolbar', async () => {
    renderPage(period);
    expect(await screen.findByRole('region', { name: '사이클타임 분석 영역' })).toBeTruthy();
    expect(document.querySelector('[data-platform-page]')!.getAttribute('data-page-layout')).toBe('fill');
    for (const name of ['사이클타임 요약', '사이클타임 추세', '사이클타임 분포', '느린 실행']) expect(await screen.findByRole('tab', { name })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '기본' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '집중' }).getAttribute('aria-checked')).not.toBe('true');
    // balanced: trend and summary each have a group; distribution (active) and slow share the third one.
    const groups = ['사이클타임 추세', '사이클타임 요약', '사이클타임 분포', '느린 실행'].map(name => screen.getByRole('tab', { name }).closest('.dv-groupview'));
    expect(new Set(groups).size).toBe(3);
    expect(groups[2]).toBe(groups[3]);
    expect(screen.getByRole('tab', { name: '사이클타임 분포' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '느린 실행' }).getAttribute('aria-selected')).toBe('false');
  });

  it('keeps showing the invalid-page message instead of the workspace', async () => {
    renderPage(`${period}&percentile=zzz`);
    await screen.findByRole('alert');
    expect(screen.queryByRole('region', { name: '사이클타임 분석 영역' })).toBeNull();
  });
});
