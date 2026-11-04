// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CycleKpi } from '../endpoints';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import CycleTimeDrilldown from './CycleTimeDrilldown';
import { installWorkspaceGeometry } from './workspaceTestSupport';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery, type PlatformAdapter } from '@ap/contracts';
import { TEST_AXES } from '../test-axes';

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
  render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={adapter} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
}

function DraftActions() {
  const draft = useQueryDraft();
  return <>
    <button onClick={() => draft.setDraftPage({ percentile: 'all', sort: 'delta:desc' })}>Draft parameters</button>
    <button onClick={() => draft.setDraftGlobal({ from: '2026-09-20T00:00:00', to: '2026-09-26T09:00:00' })}>Draft longer period</button>
    <button onClick={() => draft.apply()}>Apply query</button>
  </>;
}

describe('CycleTimeDrilldown applied condition line (#1218 LINE)', () => {
  const base = '/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00';
  beforeEach(() => {
    const storage = memoryStorage();
    storage.setItem('platform:page-head-collapsed:cycle-time', 'false');
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  function mountWithApply() {
    window.history.replaceState(null, '', base);
    render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={adapter} registry={registry}>
      <DraftActions /><CycleTimeDrilldown params={{}} />
    </PlatformProvider></I18nProvider>);
  }

  it('puts applied parameters and both chart narrowings in the bar row, without page or extra clear actions', async () => {
    renderPage(`${base}&percentile=p50&sort=delta:desc&page=2&bucket=2026-09-26T05:00:00&bin=45-60..60-75`);
    const row = await screen.findByRole('group', { name: '적용된 조건' });
    expect(screen.getByTestId('page-filter-bar').contains(row)).toBe(true);
    expect(within(row).getByRole('group', { name: '집계 시간' })).toBeTruthy();
    expect(within(row).getByRole('group', { name: '느린 실행 기준 ≥ P50' })).toBeTruthy();
    expect(within(row).getByRole('group', { name: '정렬 P95 대비 내림차순' })).toBeTruthy();
    expect(within(row).getByRole('group', { name: '버킷 2026-09-26 05:00 → 06:00' })).toBeTruthy();
    expect(within(row).getByRole('group', { name: '분포 구간 45-60 – 60-75' })).toBeTruthy();
    expect(within(row).queryByText('페이지')).toBeNull();
    expect(within(row).getAllByRole('button')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '버킷 필터 해제' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '분포 필터 해제' })).toHaveLength(1);
  });

  it('keeps chips on applied values while controls have a pending draft, then updates on the single query apply', async () => {
    mountWithApply();
    const row = await screen.findByRole('group', { name: '적용된 조건' });
    fireEvent.click(screen.getByRole('button', { name: '일' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draft parameters' }));
    expect(within(row).getByRole('group', { name: '집계 시간' })).toBeTruthy();
    expect(within(row).getByRole('group', { name: '느린 실행 기준 ≥ P95' })).toBeTruthy();
    expect(within(row).getByRole('group', { name: '정렬 사이클타임 내림차순' })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has('granularity')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '페이지 필터 접기' }));
    const expand = screen.getByRole('button', { name: '페이지 필터 펼치기' });
    expect(expand.textContent).toContain('집계 일');
    expect(expand.textContent).toContain('미적용 변경 있음');
    expect(row.closest('[hidden]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apply query' }));
    await waitFor(() => expect(within(row).getByRole('group', { name: '집계 일' })).toBeTruthy());
    expect(within(row).getByRole('group', { name: '느린 실행 기준 전체 실행' })).toBeTruthy();
    expect(within(row).getByRole('group', { name: '정렬 P95 대비 내림차순' })).toBeTruthy();
    expect(expand.textContent).not.toContain('미적용 변경 있음');
    expect(new URLSearchParams(window.location.search).get('granularity')).toBe('day');
  });

  it('derives an implicit grain from the applied global period rather than the pending period', async () => {
    mountWithApply();
    const row = await screen.findByRole('group', { name: '적용된 조건' });
    fireEvent.click(screen.getByRole('button', { name: 'Draft longer period' }));
    expect(within(row).getByRole('group', { name: '집계 시간' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '일' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Apply query' }));
    await waitFor(() => expect(within(row).getByRole('group', { name: '집계 일' })).toBeTruthy());
  });

  it.each([
    { key: 'bucket', other: 'bin', clearLabel: '버킷 필터 해제' },
    { key: 'bin', other: 'bucket', clearLabel: '분포 필터 해제' },
  ])('clears only $key immediately, restoring that narrowing while keeping the other applied conditions', async ({ key, other, clearLabel }) => {
    renderPage(`${base}&percentile=p50&sort=delta:desc&bucket=2026-09-26T05:00:00&bin=45-60..60-75`);
    fireEvent.click(await screen.findByRole('button', { name: clearLabel }));
    await waitFor(() => expect(screen.queryByRole('button', { name: clearLabel })).toBeNull());
    const params = new URLSearchParams(window.location.search);
    expect(params.has(key)).toBe(false);
    expect(params.has(other)).toBe(true);
    expect(params.get('percentile')).toBe('p50');
    expect(params.get('sort')).toBe('delta:desc');
    const row = screen.getByRole('group', { name: '적용된 조건' });
    expect(within(row).getAllByRole('button')).toHaveLength(1);
    expect(within(row).getByRole('group', { name: '느린 실행 기준 ≥ P50' })).toBeTruthy();
  });
});

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

// #1218 FORMAT: the chip row, the query-bar summary and the export sheet print one bucket/bin text.
describe('CycleTimeDrilldown bucket and histogram text (#1218)', () => {
  beforeEach(() => {
    // The fill-page head starts collapsed (#680); the chip row and the filter bar live in its extension.
    const storage = memoryStorage();
    storage.setItem('platform:page-head-collapsed:cycle-time', 'false');
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows the same-day hour bucket end as time only, on the chip and in the collapsed summary', async () => {
    renderPage('/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00&bucket=2026-09-26T05:00:00&bin=45-60..60-75');
    expect((await screen.findAllByText('2026-09-26 05:00 → 06:00')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('45-60 – 60-75').length).toBeGreaterThanOrEqual(1);
    fireEvent.click(await screen.findByRole('button', { name: '페이지 필터 접기' }));
    const expand = screen.getByRole('button', { name: '페이지 필터 펼치기' });
    expect(expand.textContent).toContain('버킷 2026-09-26 05:00 → 06:00');
    expect(expand.textContent).toContain('분포 구간 45-60 – 60-75');
  });

  it('keeps the date once the hour bucket crosses a day', async () => {
    renderPage('/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00&bucket=2026-09-26T23:00:00');
    expect((await screen.findAllByText('2026-09-26 23:00 → 2026-09-27 00:00')).length).toBeGreaterThanOrEqual(1);
  });

  it('shows a day-grain bucket as dates only', async () => {
    renderPage('/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00&granularity=day&bucket=2026-09-26T00:00:00');
    expect((await screen.findAllByText('2026-09-26 → 2026-09-27')).length).toBeGreaterThanOrEqual(1);
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
    expect(alert.textContent).toContain('초기화');
  });

  it('states each refusal as the exact ADR-0034 sentence plus the page own action (one paragraph per field)', async () => {
    renderPage('/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00&granularity=zzz&percentile=q&bin=bogus&page=0');
    const alert = await screen.findByRole('alert');
    expect([...alert.querySelectorAll('p')].map(p => p.textContent)).toEqual([
      '집계 “zzz”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
      '느린 실행 기준 “q”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
      '분포 구간 “bogus”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
      '페이지 “0”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
    ]);
  });

  it('Reset clears exactly the rejected keys and keeps the valid ones (#924)', async () => {
    renderPage('/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00&percentile=zzz&granularity=day');
    const alert = await screen.findByRole('alert');
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    const params = new URLSearchParams(window.location.search);
    expect(params.has('percentile')).toBe(false);
    expect(params.get('granularity')).toBe('day');
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
    render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={querying} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('느린 실행 (P95 기준)')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('cycle-kpi').textContent).toContain('표시된 P95 이상'));
  });
});

describe('CycleTimeDrilldown population caption (#397)', () => {
  afterEach(cleanup);
  const url = '/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00';

  it('shows … only while the KPI query is loading', async () => {
    const pending: PlatformAdapter = { ...adapter, menuQuery: () => new Promise<never>(() => undefined) };
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={pending} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
    expect((await screen.findByText(/페이지 필터 적용 목록입니다/)).textContent).toContain('모집단 …건.');
  });

  it('says 확인할 수 없음 once the KPI query completed with an empty response', async () => {
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={adapter} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
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

  it('offers the 세로 preset (one row per question) and the height mode, starting in 화면 맞춤', async () => {
    renderPage(period);
    await screen.findByRole('region', { name: '사이클타임 분석 영역' });
    const modes = screen.getByRole('radiogroup', { name: '높이 방식' });
    expect(modes.querySelector('[aria-checked="true"]')!.textContent).toBe('화면 맞춤');
    fireEvent.click(await screen.findByRole('radio', { name: '세로' }));
    // column: trend / summary | distribution / slow — three top-level rows, so four groups in three rows.
    await waitFor(() => { expect(new Set(['사이클타임 추세', '사이클타임 요약', '사이클타임 분포', '느린 실행'].map(name => screen.getByRole('tab', { name }).closest('.dv-groupview'))).size).toBe(4); });
    expect(document.querySelector('[data-panel-workspace]')!.getAttribute('data-workspace-mode')).toBe('fit');
  });

  it('keeps showing the invalid-page message instead of the workspace', async () => {
    renderPage(`${period}&percentile=zzz`);
    await screen.findByRole('alert');
    expect(screen.queryByRole('region', { name: '사이클타임 분석 영역' })).toBeNull();
  });
});
