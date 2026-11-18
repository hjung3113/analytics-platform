// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import { trendEndpoint, type KpiSet, type KpisData, type TrendBucket, type TrendData } from '../endpoints';
import ProductivityOverview from './ProductivityOverview';
import { groupId, menuPermission, spaceId, type ApiResponse, type Assessment } from '@ap/contracts';
import { TEST_AXES } from '../test-axes';

const chartCanvas = await vi.hoisted(async () => (await import('@ap/components/testing/engines')).mockEchartsCanvas());
beforeEach(() => { chartCanvas.init.mockClear(); chartCanvas.dispose.mockClear(); chartCanvas.options.length = 0; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'productivity-overview' }],
  groups: [{ id: groupId('analytics'), label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: spaceId('mars') }],
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
  render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={adapter} registry={registry}><ProductivityOverview params={{}} /></PlatformProvider></I18nProvider>);
}

// #304 FIX1: the invalid-page-key alert names each field's user name and the raw value as entered,
// one sentence per field — never `key=value`.
describe('ProductivityOverview invalid page key warnings (#304 FIX1)', () => {
  it('kpi=bogus names the 지표 field and the raw value, without key=value', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=MEM&kpi=bogus');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('지표');
    expect(alert.textContent).toContain('bogus');
    expect(alert.textContent).not.toContain('kpi=');
    expect(alert.textContent).toContain('초기화');
  });

  it('states each refusal as the exact ADR-0034 sentence plus the page own action (one paragraph per field)', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=MEM&kpi=bogus&axis=zzz&sort=nope');
    const alert = await screen.findByRole('alert');
    expect([...alert.querySelectorAll('p')].map(p => p.textContent)).toEqual([
      '지표 “bogus”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
      '축 “zzz”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
      '정렬 “nope”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
    ]);
  });

  it('Reset clears exactly the rejected keys and keeps the valid ones (#924)', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=MEM&kpi=bogus&axis=stgroup');
    const alert = await screen.findByRole('alert');
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    const params = new URLSearchParams(window.location.search);
    expect(params.has('kpi')).toBe(false);
    expect(params.get('axis')).toBe('stgroup');
  });
});

// UX-304-01: the overview guidance speaks in user operations and meanings — no URL keys, no page ownership.
describe('ProductivityOverview guidance wording (UX-304-01)', () => {
  it('explains card selection and delta comparison without URL keys or page ownership', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00');
    // PlatformPage gates children behind the async scope validation — wait for the page itself to render.
    await screen.findByRole('radiogroup', { name: '집계 단위' });
    const body = document.body.textContent ?? '';
    expect(body).toContain('카드를 고르면');
    expect(body).toContain('바로 앞 같은 길이 기간 대비');
    expect(body).not.toContain('URL 키');
    expect(body).not.toContain('페이지 소유');
    expect(body).not.toContain('kpi');
    expect(body).not.toContain('axis');
    expect(body).not.toContain('sort');
  });

  it('an unknown grain keeps the raw value and states that the default grain is in effect', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&granularity=zzz');
    await screen.findByText(/“zzz”/);
    const body = document.body.textContent ?? '';
    expect(body).toContain('“zzz”');
    expect(body).toContain('기본');
    expect(body).not.toContain('granularity=');
  });
});

// #398 AB-3: the cycle-time card shows P50 / P95 but its delta compares P50 only, so the delta
// text must carry the P50 prefix in both languages and both signs.
describe('ProductivityOverview cycle-time delta label (#398)', () => {
  const kpiSet = (p50: number): KpiSet => ({
    equipmentCount: 8,
    knownBuckets: 48,
    occupancy: { num: 100, den: 200, pct: 50 },
    dwell: { hours: 10, jobs: 5, perJobH: 2 },
    cycle: { jobs: 100, p50, p95: 60 },
    throughput: { jobs: 120, started: 130 },
  });
  // The kernel checks ok/empty replies against the endpoint's declared assessment kinds (query.ts
  // checkMenuResponse), so the fixture answers with exactly those kinds.
  const assessmentsOf = (kinds: readonly string[]): Assessment[] =>
    kinds.map(kind => ({ kind: kind as Assessment['kind'], state: 'confirmed' }));
  const kpis = (current: number, previous: number): ApiResponse<KpisData> => ({
    outcome: 'ok',
    data: { current: kpiSet(current), previous: kpiSet(previous) },
    assessments: assessmentsOf(['collection', 'processing_delay', 'coverage', 'time_domain']),
    trust: null,
    correlationId: 'fixture',
  });
  const other: ApiResponse<never> = {
    outcome: 'empty', data: null,
    assessments: assessmentsOf(['collection', 'processing_delay', 'coverage']),
    trust: null, correlationId: 'fixture',
  };

  function renderWithKpis(data: ApiResponse<KpisData>) {
    const kpiAdapter = testAdapter({
      session: () => session,
      menuQuery: async req => (req.endpoint === 'analytics.productivity.kpis' ? data : other) as ApiResponse<unknown>,
    });
    window.history.replaceState(null, '', '/analytics/productivity?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00');
    render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={kpiAdapter} registry={registry}><ProductivityOverview params={{}} /></PlatformProvider></I18nProvider>);
  }

  it.each([
    { lang: 'ko', current: 40, previous: 40.6, expected: 'P50 -0.6분 (-1.5%)' },
    { lang: 'ko', current: 41.2, previous: 40.6, expected: 'P50 +0.6분 (+1.5%)' },
    { lang: 'en', current: 40, previous: 40.6, expected: 'P50 -0.6min (-1.5%)' },
    { lang: 'en', current: 41.2, previous: 40.6, expected: 'P50 +0.6min (+1.5%)' },
  ])('labels the cycle-time delta as P50 ($lang, $expected)', async ({ lang, current, previous, expected }) => {
    // Node's file-less localStorage shadows jsdom's; give this test its own in-memory store.
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    try {
      storage.setItem('platform:lang', lang);
      renderWithKpis(kpis(current, previous));
      await screen.findByRole('radiogroup', { name: lang === 'ko' ? '집계 단위' : 'Granularity' });
      expect(await screen.findByText(expected)).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders the cycle-time caption with the definition for its selected version', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    try {
      storage.setItem('platform:lang', 'ko');
      renderWithKpis(kpis(40, 39));
      await screen.findByRole('radiogroup', { name: '집계 단위' });
      expect(screen.getByText(/v4 \(PRC 구간과 큐 대기 포함\)/)).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('ProductivityOverview compact guidance (#2302)', () => {
  it('puts static grain and KPI guidance behind named info buttons', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00');
    await screen.findByRole('radiogroup', { name: '집계 단위' });
    const tips = screen.getAllByRole('button', { name: '설명' });
    const descriptions = tips.map(tip => document.getElementById(tip.getAttribute('aria-describedby')!)!);
    const grain = descriptions.find(node => node.textContent?.includes('이 화면의 집계 단위입니다'));
    const kpi = descriptions.find(node => node.textContent?.includes('카드를 고르면'));
    expect(grain?.className).toContain('sr-only');
    expect(kpi?.className).toContain('sr-only');
    expect(kpi?.textContent).toContain('완료 Job 건수는 버전과 무관');
    expect(screen.getByRole('heading', { name: '지표 요약' }).parentElement).toBe(kpi?.parentElement);
  });

  it('keeps the unknown-grain warning visibly outside the info descriptions', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=MEM&granularity=zzz');
    const warning = await screen.findByText(/집계 단위 “zzz”는 이 화면에서 쓸 수 없습니다/);
    expect(warning.textContent).toContain('기본 집계 단위');
    expect(warning.closest('.sr-only, [role="tooltip"]')).toBeNull();
    expect(warning.className).toContain('text-text-warning-label');
  });
});

describe('ProductivityOverview throughput trend observation totals (#2532)', () => {
  const bucket = (start: string, known: boolean, jobs: number | null): TrendBucket => ({
    start, known, jobs, p50: null, p95: null, occupancyPct: null, dwellPerJobH: null,
  });
  const trendReply = (outcome: 'ok' | 'empty', data: TrendData, coverage: number | null = 0.8): ApiResponse<TrendData> => ({
    outcome, data,
    assessments: [{ kind: 'collection', state: 'confirmed' }, { kind: 'processing_delay', state: 'confirmed' }, { kind: 'coverage', state: 'confirmed' }],
    trust: { updatedAt: '2026-09-26T09:02:00+09:00', dataThrough: '2026-09-26T08:00:00+09:00', coverage, provisional: false, source: 'throughput source' },
    correlationId: 'trend-fixture',
  });
  function renderWithTrend(response: ApiResponse<TrendData>) {
    const trendAdapter = testAdapter({
      session: () => session,
      menuQuery: async request => request.endpoint === trendEndpoint.id ? response as ApiResponse<unknown> : empty,
    });
    window.history.replaceState(null, '', '/analytics/productivity?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&kpi=throughput');
    render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={trendAdapter} registry={registry}><ProductivityOverview params={{}} /></PlatformProvider></I18nProvider>);
  }

  it.each([
    { name: 'nonempty all-unknown buckets with equipment', equipmentCount: 2, current: [bucket('2026-09-26T09:00:00', false, null)], visible: true },
    { name: 'zero equipment', equipmentCount: 0, current: [bucket('2026-09-26T09:00:00', false, null)], visible: false },
    { name: 'zero-length result', equipmentCount: 2, current: [], visible: false },
  ])('shows the unconfirmed total only for $name', async ({ equipmentCount, current, visible }) => {
    renderWithTrend(trendReply('empty', { equipmentCount, current, previous: [] }));
    await screen.findByRole('radiogroup', { name: '집계 단위' });
    if (visible) expect(await screen.findByText('합계 미확인')).toBeTruthy();
    else expect(screen.queryByText('합계 미확인')).toBeNull();
  });

  it('sums and counts known current buckets, including observed zero, and includes the count in footer coverage', async () => {
    renderWithTrend(trendReply('ok', {
      equipmentCount: 2,
      current: [bucket('2026-09-25T09:00:00', true, 4), bucket('2026-09-25T10:00:00', false, null), bucket('2026-09-25T11:00:00', true, 0)],
      previous: [bucket('2026-09-18T09:00:00', true, 100)],
    }));
    expect(await screen.findByText(/관측 2\/3 구간 합계 4 Job/)).toBeTruthy();
    const footer = [...document.querySelectorAll('footer')].find(node => node.textContent?.includes('throughput source'));
    expect(footer?.textContent).toContain('관측 2/3 구간');
    expect(footer?.textContent).toContain('80.0%');
  });

  it('keeps unknown source coverage unknown and preserves a fully observed zero total', async () => {
    renderWithTrend(trendReply('ok', {
      equipmentCount: 1,
      current: [bucket('2026-09-25T09:00:00', true, 0)],
      previous: [bucket('2026-09-18T09:00:00', true, 100)],
    }, null));
    expect(await screen.findByText(/합계 0 Job/)).toBeTruthy();
    const footer = [...document.querySelectorAll('footer')].find(node => node.textContent?.includes('throughput source'));
    expect(footer?.textContent).toContain('미확인');
    expect(footer?.textContent).not.toContain('100.0%');
  });
});
