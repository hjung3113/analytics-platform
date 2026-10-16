// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ApiResponse, MenuQuery, PlatformAdapter, Session } from '@ap/contracts';
import type { CycleKpi } from '../endpoints';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { manifests } from '../index';
import CycleTimeDrilldown from './CycleTimeDrilldown';

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => {
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: 'analytics:view', homeMenuId: 'productivity-overview' }],
  groups: [{ id: 'analytics', label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: 'analytics' }],
  menus: manifests,
});

const session: Session = {
  user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' }, permissions: ['analytics:view', 'platform:view'] },
  scopes: [],
};
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const adapter: PlatformAdapter = {
  menuQuery: async () => empty,
  session: () => session,
  validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
  publishedMetrics: () => [],
  defaultRangeTo: () => '2026-09-26T09:00:00',
  contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
  evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
  getEntity: async () => empty,
  recordUsage: async () => ({ accepted: 0 }),
  listAnnotations: async () => empty,
  saveAnnotation: async () => empty,
  reportClientError: async () => ({ accepted: true }),
  usageSummary: async () => empty,
  auditTrail: async () => empty,
  entityAudit: async () => empty,
  accessDirectory: async () => empty,
  subscribe: () => () => undefined,
};

function renderPage(path: string) {
  window.history.replaceState(null, '', path);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
}

describe('CycleTimeDrilldown page filter summary', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => storage.delete(key),
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows the unknown percentile raw value in the collapsed summary instead of the default label', async () => {
    renderPage('/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00&percentile=zzz');

    fireEvent.click(await screen.findByRole('button', { name: '페이지 필터 접기' }));
    const expand = screen.getByRole('button', { name: '페이지 필터 펼치기' });
    // 9h period → hour grain; the summary repeats the edit fields, and the invalid tail shows the raw value.
    expect(expand.textContent).toContain('집계 시간');
    expect(expand.textContent).toContain('느린 실행 기준 이 화면에서 쓸 수 없는 값: zzz');
    expect(expand.textContent).not.toContain('≥ P95');
    expect(expand.textContent).toContain('정렬 사이클타임 내림차순');
  });

  it('summarizes applied values and keeps the reset working without leaving the collapsed state', async () => {
    renderPage('/analytics/cycle-time?v=1&scopeId=ICH&percentile=p50&sort=delta:desc');

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
    renderPage('/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00&percentile=zzz');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('느린 실행 기준');
    expect(alert.textContent).toContain('zzz');
    expect(alert.textContent).not.toContain('percentile=');
    expect(alert.textContent).toContain('되돌리세요');
  });

  it('each invalid field keeps its own name and raw value', async () => {
    renderPage('/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00&granularity=zzz&bin=bogus&page=0');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('집계');
    expect(alert.textContent).toContain('zzz');
    expect(alert.textContent).toContain('분포 구간');
    expect(alert.textContent).toContain('bogus');
    expect(alert.textContent).toContain('페이지');
    expect(alert.textContent).toContain('“0”');
    expect(alert.textContent).not.toContain('granularity=');
    expect(alert.textContent).not.toContain('bin=');
    expect(alert.textContent).not.toContain('page=');
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
    window.history.replaceState(null, '', '/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00');
    render(<I18nProvider><PlatformProvider adapter={querying} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('느린 실행 (P95 기준)')).toBeTruthy();
    expect(screen.getByTestId('cycle-kpi').textContent).toContain('표시된 P95 이상');
  });
});
