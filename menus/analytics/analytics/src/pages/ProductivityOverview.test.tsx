// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import type { ApiResponse, Assessment } from '@ap/contracts';
import { manifests } from '../index';
import type { KpiSet, KpisData } from '../endpoints';
import ProductivityOverview from './ProductivityOverview';

afterEach(cleanup);

const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: 'analytics:view', homeMenuId: 'productivity-overview' }],
  groups: [{ id: 'analytics', label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: 'analytics' }],
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
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ProductivityOverview params={{}} /></PlatformProvider></I18nProvider>);
}

// #304 FIX1: the invalid-page-key alert names each field's user name and the raw value as entered,
// one sentence per field — never `key=value`.
describe('ProductivityOverview invalid page key warnings (#304 FIX1)', () => {
  it('kpi=bogus names the 지표 field and the raw value, without key=value', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=ICH&kpi=bogus');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('지표');
    expect(alert.textContent).toContain('bogus');
    expect(alert.textContent).not.toContain('kpi=');
    expect(alert.textContent).toContain('초기화');
  });

  it('states each refusal as the exact ADR-0034 sentence plus the page own action (one paragraph per field)', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=ICH&kpi=bogus&axis=zzz&sort=nope');
    const alert = await screen.findByRole('alert');
    expect([...alert.querySelectorAll('p')].map(p => p.textContent)).toEqual([
      '지표 “bogus”는 이 화면에서 쓸 수 없습니다. 주소를 고치거나 조건을 초기화하세요.',
      '축 “zzz”은 이 화면에서 쓸 수 없습니다. 주소를 고치거나 조건을 초기화하세요.',
      '정렬 “nope”은 이 화면에서 쓸 수 없습니다. 주소를 고치거나 조건을 초기화하세요.',
    ]);
  });
});

// UX-304-01: the overview guidance speaks in user operations and meanings — no URL keys, no page ownership.
describe('ProductivityOverview guidance wording (UX-304-01)', () => {
  it('explains card selection and delta comparison without URL keys or page ownership', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=ICH&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00');
    // PlatformPage gates children behind the async scope validation — wait for the page itself to render.
    await screen.findByRole('radiogroup', { name: '집계 단위' });
    const body = document.body.textContent ?? '';
    expect(body).toContain('카드를 선택하면');
    expect(body).toContain('같은 길이 기간과 비교');
    expect(body).not.toContain('URL 키');
    expect(body).not.toContain('페이지 소유');
    expect(body).not.toContain('kpi');
    expect(body).not.toContain('axis');
    expect(body).not.toContain('sort');
  });

  it('an unknown grain keeps the raw value and states that the default grain is in effect', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=ICH&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&granularity=zzz');
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
    window.history.replaceState(null, '', '/analytics/productivity?v=1&scopeId=ICH&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00');
    render(<I18nProvider><PlatformProvider adapter={kpiAdapter} registry={registry}><ProductivityOverview params={{}} /></PlatformProvider></I18nProvider>);
  }

  it.each([
    { lang: 'ko', current: 40, previous: 40.6, expected: 'P50 -0.6분 (-1.5%)' },
    { lang: 'ko', current: 41.2, previous: 40.6, expected: 'P50 +0.6분 (+1.5%)' },
    { lang: 'en', current: 40, previous: 40.6, expected: 'P50 -0.6min (-1.5%)' },
    { lang: 'en', current: 41.2, previous: 40.6, expected: 'P50 +0.6min (+1.5%)' },
  ])('labels the cycle-time delta as P50 ($lang, $expected)', async ({ lang, current, previous, expected }) => {
    // Node's file-less localStorage shadows jsdom's; give this test its own in-memory store.
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear(), key: () => null, get length() { return store.size; },
    };
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
});
