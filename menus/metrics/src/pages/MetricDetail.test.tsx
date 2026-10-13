// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ApiResponse, Capability, ContextKey, MenuQuery, PlatformAdapter, Session } from '@ap/contracts';
import { Activity, Gauge, Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, type MenuEntry } from '@ap/kernel';
import { manifests } from '../index';
import MetricDetailPage from './MetricDetail';
import {
  type DefinitionPayload, type MetricDef, type MetricVersion, type UsagePayload,
} from '../endpoints';

// #299 B-10: the Data Trust indicator next to the definition must not claim "확정" for a draft
// version. The envelope below reproduces the real mock definition response (06 §19 envelope:
// mart read trust + declared processing_delay assessment); the catalog values are copied from the
// synthetic catalog. Page tests may not import src/mock (ap/no-menu-mock-import), so the payload
// lives here with the real field values.
const none: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
// usage rows resolveLink into analytics menus; cross-package manifests are not importable, so the
// registry carries id-honest stubs for the two destinations the usage table links to.
const consumerMenus: MenuEntry[] = [
  { id: 'productivity-overview', primary: true, group: 'analytics', label: { ko: '생산성 개요', en: 'Productivity overview' },
    description: { ko: '물리 점유율, 비Process 체류, 사이클타임 P50·P95, Job 처리량을 요약합니다.', en: 'Occupancy, non-process dwell, cycle time P50/P95 and job throughput.' },
    path: '/analytics/productivity', icon: Activity, permission: 'analytics:view', requiresScope: true, pageType: 'overview',
    context: { ...none, time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', ppid: 'apply', recipe: 'apply', metric: 'reference' }, features: { ...noFeatures, export: true }, pageKeys: [] },
  { id: 'cycle-time', group: 'analytics', label: { ko: '사이클타임 상세', en: 'Cycle time detail' },
    description: { ko: '사이클타임 분포에서 느린 실행을 찾아 실행 상세로 드릴다운합니다.', en: 'Find slow executions in the cycle-time distribution and drill into them.' },
    path: '/analytics/cycle-time', icon: Timer, permission: 'analytics:view', requiresScope: true, pageType: 'analysis',
    context: { ...none, time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', lot: 'apply', ppid: 'apply', recipe: 'apply', metric: 'apply' },
    features: { export: true, savedView: false, annotate: true, compare: true }, pageKeys: ['granularity', 'percentile', 'sort', 'page', 'bucket', 'bin'], contextResetKeys: ['page', 'bucket', 'bin'], initializesMetric: true },
];

const registry = createRegistry({
  spaces: [
    { id: 'metrics', label: { ko: '지표', en: 'Metrics' }, description: { ko: '지표 카탈로그', en: 'Metric catalog' }, permission: 'metrics:view', homeMenuId: 'metric-catalog' },
    { id: 'analytics', label: { ko: '생산성 분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: 'analytics:view', homeMenuId: 'productivity-overview' },
  ],
  groups: [
    { id: 'metrics', label: { ko: '지표', en: 'Metrics' }, icon: Gauge, space: 'metrics' },
    { id: 'analytics', label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: 'analytics' },
  ],
  menus: [...manifests, ...consumerMenus],
});

const session: Session = {
  user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' }, permissions: ['metrics:view', 'analytics:view', 'platform:view'] },
  scopes: [],
};

const JOB_COV: MetricVersion['coverage'] = {
  populationRef: { ko: '유효한 관측 시간', en: 'Valid observed time' },
  includedBasis: { ko: 'anchor가 있는 완료 실행', en: 'Completed executions with an anchor' },
  excludedBasis: { ko: '미완료·anchor 없음', en: 'Incomplete or missing anchor' },
  denominatorBasis: { ko: '대상 관측 시간 (지표 분모와 별개 필드)', en: 'In-population observed time (separate from the metric denominator)' },
  sourceRef: null,
};

function version(pick: {
  version: string; state: MetricVersion['state']; unit: string; numerator: string | null;
  formula: { ko: string; en: string }; filters: { ko: string; en: string }[]; sourceContractRef: string;
  changeReason: { ko: string; en: string }; registeredAt: string; publishedAt: string | null;
  updatedAt: string; updatedBy: string;
}): MetricVersion {
  return {
    ...pick, grain: { ko: 'Job 실행', en: 'Job execution' }, denominator: null,
    numeratorAgg: pick.numerator === null ? null : 'sum', denominatorAgg: null,
    reaggregationRule: pick.numerator === null ? 'recomputeFromDistribution' : 'sum',
    averageOfRatiosAllowed: false, averageOfQuantilesAllowed: pick.numerator === null ? false : null,
    coverage: JOB_COV, deprecatedAt: null,
  };
}

const QUEUE_TIME_V1 = version({
  version: '1', state: 'draft', unit: 's', numerator: 'queue_duration',
  formula: { ko: 'queue_duration 합. 초안이며 게시 초기화 후보가 아닙니다.', en: 'Sum of queue_duration. A draft, not a publication-initialization candidate.' },
  filters: [{ ko: '대기 구간', en: 'Queue interval' }], sourceContractRef: 'queue-basis-draft',
  changeReason: { ko: '초안 등록. 게시하지 않음.', en: 'Draft registered. Not published.' },
  registeredAt: '2026-09-22T09:00:00', publishedAt: null, updatedAt: '2026-09-22T09:00:00', updatedBy: 'park.seo',
});

const CYCLE_TIME: MetricDef = {
  metricId: 'cycle_time', name: { ko: '사이클타임', en: 'Cycle time' }, domain: 'time', kind: 'quantile',
  description: { ko: 'Job 실행 분포의 분위수. P50/P95는 같은 버전의 소비이며 평균하지 않습니다.', en: 'Quantiles of the job-execution distribution. P50/P95 consume the same version and are not averaged.' },
  ownerId: 'time-analyst', owner: { ko: '시간 분석 담당', en: 'Time analyst' }, organizationRef: 'ORG-TIME',
  publishedPointer: '4', catalogVersion: '4', draftVersion: '5', catalogStatus: 'published', populationRule: 'etch', updatedAt: '2026-09-24T09:00:00',
  usage: [
    { menuId: 'productivity-overview', place: { ko: '사이클 P50/P95 KPI', en: 'Cycle P50/P95 KPI' }, versions: ['4'] },
    { menuId: 'cycle-time', place: { ko: '사이클타임 분포', en: 'Cycle-time distribution' }, versions: ['3', '4'] },
  ],
  versions: [
    version({
      version: '1', state: 'deprecated', unit: 's', numerator: null,
      formula: { ko: '초기 분포 정의. 폐기됨.', en: 'Initial distribution definition. Deprecated.' },
      filters: [{ ko: '완료 Job', en: 'Completed jobs' }], sourceContractRef: 'cycle-time-basis-v1',
      changeReason: { ko: '최초 등록', en: 'Initial registration' },
      registeredAt: '2026-06-02T09:00:00', publishedAt: '2026-06-03T09:00:00', updatedAt: '2026-08-01T09:00:00', updatedBy: 'kim.hana',
    }),
    version({
      version: '4', state: 'published', unit: 's', numerator: null,
      formula: { ko: '분포 재계산. 공정 구간만. averageOfQuantilesAllowed=false.', en: 'Recompute from the distribution, process interval only. averageOfQuantilesAllowed=false.' },
      filters: [{ ko: '완료 Job', en: 'Completed jobs' }, { ko: '공정 구간', en: 'Process interval' }], sourceContractRef: 'cycle-time-basis-v3',
      changeReason: { ko: '공정 구간으로 grain 설명 수정. 게시 포인터.', en: 'Process-interval wording. Published pointer.' },
      registeredAt: '2026-09-18T09:00:00', publishedAt: '2026-09-20T11:00:00', updatedAt: '2026-09-20T11:00:00', updatedBy: 'park.seo',
    }),
    version({
      version: '5', state: 'draft', unit: 's', numerator: null,
      formula: { ko: 'v4 복사. 필터 문구만 초안. 분석 기본 버전이 아닙니다.', en: 'Copy of v4. Filter wording only. Not an analysis default.' },
      filters: [{ ko: '완료 Job (초안 문구)', en: 'Completed jobs (draft wording)' }], sourceContractRef: 'cycle-time-basis-v3',
      changeReason: { ko: '필터 문구 초안. 게시 아님.', en: 'Draft filter wording. Not published.' },
      registeredAt: '2026-09-24T09:00:00', publishedAt: null, updatedAt: '2026-09-24T09:00:00', updatedBy: 'park.seo',
    }),
  ],
};

const QUEUE_TIME: MetricDef = {
  ...CYCLE_TIME, metricId: 'queue_time', name: { ko: '대기 시간', en: 'Queue time' }, kind: 'duration',
  description: { ko: '초안만 있습니다. 게시 포인터가 없습니다.', en: 'Draft only. No published pointer.' },
  publishedPointer: null, catalogVersion: '1', draftVersion: '1', catalogStatus: 'draft', updatedAt: '2026-09-22T09:00:00',
  usage: [], versions: [QUEUE_TIME_V1],
};

/** The definition endpoint's real envelope: mart read trust with the requested version stamped, provisional false. */
const trustEnvelope = (metricVersion: string) => ({
  updatedAt: '2026-09-26T09:02:00', dataThrough: '2026-09-26T08:00:00', coverage: 0.987,
  metricVersion, provisional: false, source: 'mart.productivity_hourly',
});
const MART_ASSESSMENTS = [{ kind: 'processing_delay', state: 'clear', statusSource: 'mart-watermark', observedAt: '2026-09-26T08:58:00' }] as const;

function definitionResponse(metric: MetricDef, requested: string): ApiResponse<DefinitionPayload> {
  const index = metric.versions.findIndex(v => v.version === requested);
  return {
    outcome: 'ok',
    data: {
      problem: null, requestedVersion: requested,
      metric, version: metric.versions[index] ?? null,
      previous: index > 0 ? metric.versions[index - 1] : null,
      exampleEquipmentIds: ['ICH-ETCH-0101', 'ICH-ETCH-0102'], exampleRooms: ['ETCH'],
    },
    assessments: [...MART_ASSESSMENTS], trust: trustEnvelope(requested), correlationId: 'corr-fixture',
  };
}

const usageResponse = (payload: UsagePayload): ApiResponse<UsagePayload> =>
  ({ outcome: 'ok', data: payload, assessments: [...MART_ASSESSMENTS], trust: null, correlationId: 'corr-fixture' });

/** One cast at the adapter seam: the fixture answers heterogeneous endpoints with one declared return type. */
const asFixtureResponse = <T,>(response: ApiResponse<T>): ApiResponse<never> => response as unknown as ApiResponse<never>;

function fixtureAdapter(): PlatformAdapter {
  const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'corr-fixture' };
  const menuQuery = async (req: MenuQuery): Promise<ApiResponse<never>> => {
    if (req.endpoint === 'metrics.definition') {
      const { metricId, version } = req.params as { metricId: string; version: string | null };
      const metric = metricId === 'queue_time' ? QUEUE_TIME : metricId === 'cycle_time' ? CYCLE_TIME : null;
      if (!metric || version === null || !metric.versions.some(v => v.version === version)) {
        return asFixtureResponse({ outcome: 'ok', data: { problem: metric ? 'version-not-member' : 'unknown-metric', requestedVersion: version, metric: null, version: null, previous: null, exampleEquipmentIds: [], exampleRooms: [] }, assessments: [], trust: null, correlationId: 'corr-fixture' });
      }
      return asFixtureResponse(definitionResponse(metric, version));
    }
    if (req.endpoint === 'metrics.usage') {
      const { metricId, version } = req.params as { metricId: string; version: string };
      const rows = (metricId === 'cycle_time' ? CYCLE_TIME.usage : [])
        .filter(u => u.versions.includes(version))
        .map(u => ({ menuId: u.menuId, place: u.place, version, evidenceSource: 'declared-dependency' as const, observedAt: null }));
      return asFixtureResponse(usageResponse({ problem: null, rows }));
    }
    if (req.endpoint === 'metrics.history') return asFixtureResponse({ outcome: 'ok', data: { problem: null, events: [] }, assessments: [], trust: null, correlationId: 'corr-fixture' });
    if (req.endpoint === 'metrics.pair') return asFixtureResponse({ outcome: 'ok', data: { kind: 'absent' }, assessments: [], trust: null, correlationId: 'corr-fixture' });
    return empty;
  };
  return {
    menuQuery,
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
}

function renderDetail(path: string, metricId: string) {
  window.history.replaceState(null, '', path);
  render(<I18nProvider><PlatformProvider adapter={fixtureAdapter()} registry={registry}><MetricDetailPage params={{ metricId }} /></PlatformProvider></I18nProvider>);
}

/** Waits for the version badge (the definition response arrived), then: no Data Trust beside the definition. */
async function expectNoDefinitionTrust(path: string, metricId: string, badge: string) {
  renderDetail(path, metricId);
  expect((await screen.findAllByText(badge)).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: '데이터 신뢰' })).toBeNull();
}

beforeEach(() => {
  vi.stubGlobal('localStorage', (() => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => store.clear(),
      key: () => null,
      get length() { return store.size; },
    };
  })());
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

// 06 §18: Data Trust states a displayed number's status. The definition section shows no numbers, and the envelope
// trust describes the catalog mart read — so no version state (draft, published, deprecated) gets a trust claim there
// (user decision 2026-10-13, #299 UX review).
describe('MetricDetail definition draws no Data Trust (#299 B-10, 06 §18)', () => {
  it.each([
    ['queue_time@1 (draft, no published pointer)', '/metrics/queue_time?v=1&version=1', 'queue_time', '초안'],
    ['cycle_time@5 (draft beside a published v4)', '/metrics/cycle_time?v=1&version=5', 'cycle_time', '초안'],
    ['cycle_time@4 (published)', '/metrics/cycle_time?v=1&version=4', 'cycle_time', '게시'],
    ['cycle_time@1 (deprecated)', '/metrics/cycle_time?v=1&version=1', 'cycle_time', '폐기'],
  ])('%s', async (_name, path, metricId, badge) => {
    await expectNoDefinitionTrust(path, metricId, badge);
  });
});

// B-13 / #301: a native disabled primary cannot take focus, so keyboard users never hear the reason.
describe('MetricDetail draft primary (B-13, #301)', () => {
  it('is aria-disabled and focusable with the reason as visible, described text', async () => {
    renderDetail('/metrics/queue_time?v=1&version=1', 'queue_time');
    expect((await screen.findAllByText('초안')).length).toBeGreaterThan(0);
    const button = screen.getByRole('button', { name: '이 버전을 분석 Context로 사용' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('disabled')).toBeNull(); // stays in the tab order
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain('초안은 분석 Context로 쓰지 않습니다');
    // Click is ignored: the draft must never enter the analysis context.
    fireEvent.click(button);
    expect(new URLSearchParams(window.location.search).has('metricId')).toBe(false);
  });
});
