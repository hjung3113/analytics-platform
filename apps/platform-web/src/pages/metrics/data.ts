/**
 * Synthetic metric catalog. Definitions are fabricated; they are not registered
 * production metrics. `publishedPointer` and `catalogVersion` are stored on the
 * record — the client does not pick a max version number (13 §3.2, Open policy).
 * Equipment examples are derived from `EQUIPMENT`; they are population illustrations,
 * not a runtime coverage rate.
 */
import type { AuditEvent } from '@ap/contracts';
import type { Tone } from '@ap/ui';
import { EQUIPMENT } from '@ap/mock-server';

export type Text = { ko: string; en: string };
export type Lang = 'ko' | 'en';
export type PublicationState = 'draft' | 'published' | 'deprecated';
export type MetricKind = 'ratio' | 'quantile' | 'count' | 'duration';
export type Domain = 'productivity' | 'time' | 'movement' | 'quality' | 'maintenance';
export type PopulationRule = 'not-retired' | 'active-only' | 'etch' | 'maintenance-or-active';
export type ConsumerMenuId = 'productivity-overview' | 'cycle-time';

export const DOMAINS: Domain[] = ['productivity', 'time', 'movement', 'quality', 'maintenance'];
export const STATUSES: PublicationState[] = ['draft', 'published', 'deprecated'];

export const DOMAIN_LABEL: Record<Domain, Text> = {
  productivity: { ko: '생산성', en: 'Productivity' },
  time: { ko: '시간', en: 'Time' },
  movement: { ko: '이송', en: 'Movement' },
  quality: { ko: '품질', en: 'Quality' },
  maintenance: { ko: '보전', en: 'Maintenance' },
};

export const STATUS_LABEL: Record<PublicationState, Text> = {
  draft: { ko: '초안', en: 'Draft' },
  published: { ko: '게시', en: 'Published' },
  deprecated: { ko: '폐기', en: 'Deprecated' },
};

export const STATUS_TONE: Record<PublicationState, Tone> = {
  draft: 'neutral',
  published: 'success',
  deprecated: 'warning',
};

export const KIND_LABEL: Record<MetricKind, Text> = {
  ratio: { ko: '비율', en: 'Ratio' },
  quantile: { ko: '분위수', en: 'Quantile' },
  count: { ko: '건수', en: 'Count' },
  duration: { ko: '시간', en: 'Duration' },
};

export type MetricVersion = {
  version: string;
  state: PublicationState;
  grain: Text;
  unit: string;
  formula: Text;
  numerator: string | null;
  denominator: string | null;
  numeratorAgg: 'sum' | null;
  denominatorAgg: 'sum' | null;
  reaggregationRule: 'ratioOfSums' | 'recomputeFromDistribution' | 'sum';
  averageOfRatiosAllowed: false;
  averageOfQuantilesAllowed: false | null;
  filters: Text[];
  sourceContractRef: string;
  coverage: { populationRef: Text; includedBasis: Text; excludedBasis: Text; denominatorBasis: Text; sourceRef: string | null };
  changeReason: Text;
  registeredAt: string;
  publishedAt: string | null;
  deprecatedAt: string | null;
  updatedAt: string;
  updatedBy: string;
};

export type UsageBinding = { menuId: ConsumerMenuId; place: Text; versions: string[] };

export type MetricDef = {
  metricId: string;
  name: Text;
  description: Text;
  domain: Domain;
  kind: MetricKind;
  ownerId: string;
  owner: Text;
  organizationRef: string | null;
  /** Stored published pointer. Not computed as max(version). */
  publishedPointer: string | null;
  /** Version whose grain/numerator the catalog row shows. */
  catalogVersion: string;
  /** Separate from the pointer. Drafts are never the analysis default. */
  draftVersion: string | null;
  catalogStatus: PublicationState;
  populationRule: PopulationRule;
  versions: MetricVersion[];
  usage: UsageBinding[];
  updatedAt: string;
};

const WALL: Text = { ko: '[from, to) wall-clock. 이 화면의 전역 Time 필터가 아닙니다.', en: '[from, to) wall-clock. Not this screen’s global time filter.' };

function coverage(populationRef: Text, included: Text, excluded: Text, denominator: Text, sourceRef: string | null): MetricVersion['coverage'] {
  return { populationRef, includedBasis: included, excludedBasis: excluded, denominatorBasis: denominator, sourceRef };
}

function ratio(p: Omit<MetricVersion, 'numeratorAgg' | 'denominatorAgg' | 'reaggregationRule' | 'averageOfRatiosAllowed' | 'averageOfQuantilesAllowed'> & { numerator: string; denominator: string }): MetricVersion {
  return { ...p, numeratorAgg: 'sum', denominatorAgg: 'sum', reaggregationRule: 'ratioOfSums', averageOfRatiosAllowed: false, averageOfQuantilesAllowed: null };
}

function additive(p: Omit<MetricVersion, 'numeratorAgg' | 'denominatorAgg' | 'reaggregationRule' | 'averageOfRatiosAllowed' | 'averageOfQuantilesAllowed' | 'denominator'> & { numerator: string; rule: 'sum' }): MetricVersion {
  return { ...p, denominator: null, numeratorAgg: 'sum', denominatorAgg: null, reaggregationRule: 'sum', averageOfRatiosAllowed: false, averageOfQuantilesAllowed: null };
}

function quantile(p: Omit<MetricVersion, 'numerator' | 'denominator' | 'numeratorAgg' | 'denominatorAgg' | 'reaggregationRule' | 'averageOfRatiosAllowed' | 'averageOfQuantilesAllowed'>): MetricVersion {
  return { ...p, numerator: null, denominator: null, numeratorAgg: null, denominatorAgg: null, reaggregationRule: 'recomputeFromDistribution', averageOfRatiosAllowed: false, averageOfQuantilesAllowed: false };
}

const OCC_COV = coverage(
  { ko: '유효한 관측 시간', en: 'Valid observed time' },
  { ko: '원천이 확인한 관측 구간', en: 'Intervals the source confirmed' },
  { ko: '원천 미확인 구간', en: 'Intervals the source did not confirm' },
  { ko: '대상 관측 시간 (지표 분모와 별개 필드)', en: 'In-population observed time (separate from the metric denominator)' },
  'occupancy-basis',
);
const JOB_COV = coverage(
  { ko: '완료된 Job 실행', en: 'Completed job executions' },
  { ko: 'anchor가 있는 완료 실행', en: 'Completed executions with an anchor' },
  { ko: '미완료·anchor 없음', en: 'Incomplete or missing anchor' },
  { ko: '해당 없음 — 분위수는 분모 합산이 아님', en: 'Not applicable — quantiles are not a denominator sum' },
  null,
);
const COUNT_COV = coverage(
  { ko: '정의 grain의 가산 관측', en: 'Additive observations at the stated grain' },
  { ko: '상태가 확인된 관측', en: 'Observations with a confirmed status' },
  { ko: '상태 미확인', en: 'Unconfirmed status' },
  { ko: '해당 없음', en: 'Not applicable' },
  null,
);

const OWN = {
  prod: { ownerId: 'productivity-analyst', owner: { ko: '생산성 분석 담당', en: 'Productivity analyst' }, organizationRef: 'ORG-PRODUCTIVITY' },
  time: { ownerId: 'time-analyst', owner: { ko: '시간 분석 담당', en: 'Time analyst' }, organizationRef: 'ORG-TIME' },
  move: { ownerId: 'move-analyst', owner: { ko: '이송 분석 담당', en: 'Move analyst' }, organizationRef: null },
  qual: { ownerId: 'quality-analyst', owner: { ko: '품질 분석 담당', en: 'Quality analyst' }, organizationRef: 'ORG-QUALITY' },
  maint: { ownerId: 'maint-analyst', owner: { ko: '보전 분석 담당', en: 'Maintenance analyst' }, organizationRef: null },
};

export const METRICS: MetricDef[] = [
  {
    metricId: 'cycle_time', name: { ko: '사이클타임', en: 'Cycle time' }, domain: 'time', kind: 'quantile',
    description: { ko: 'Job 실행 분포의 분위수. P50/P95는 같은 버전의 소비이며 평균하지 않습니다.', en: 'Quantiles of the job-execution distribution. P50/P95 consume the same version and are not averaged.' },
    ...OWN.time, publishedPointer: '4', catalogVersion: '4', draftVersion: '5', catalogStatus: 'published', populationRule: 'etch', updatedAt: '2026-09-24T09:00:00',
    usage: [
      { menuId: 'productivity-overview', place: { ko: '사이클 P50/P95 KPI', en: 'Cycle P50/P95 KPI' }, versions: ['4'] },
      { menuId: 'cycle-time', place: { ko: '사이클타임 분포', en: 'Cycle-time distribution' }, versions: ['3', '4'] },
    ],
    versions: [
      quantile({
        version: '1', state: 'deprecated', unit: 's', grain: { ko: 'Job 실행', en: 'Job execution' },
        formula: { ko: '완료 Job의 wall-clock 길이 분포를 재계산.', en: 'Recompute the wall-clock length distribution of completed jobs.' },
        filters: [{ ko: '완료 Job', en: 'Completed jobs' }], sourceContractRef: 'cycle-time-basis-v1', coverage: JOB_COV,
        changeReason: { ko: '최초 등록', en: 'Initial registration' }, registeredAt: '2026-06-02T09:00:00', publishedAt: '2026-06-03T09:00:00', deprecatedAt: '2026-08-01T09:00:00', updatedAt: '2026-08-01T09:00:00', updatedBy: 'kim.hana',
      }),
      quantile({
        version: '2', state: 'published', unit: 's', grain: { ko: 'Job 실행', en: 'Job execution' },
        formula: { ko: 'v1과 같은 분포. 폐기된 v1을 대체하지 않는 별도 게시본.', en: 'Same distribution as v1. A separate publication; it does not replace deprecated v1 references.' },
        filters: [{ ko: '완료 Job', en: 'Completed jobs' }], sourceContractRef: 'cycle-time-basis-v1', coverage: JOB_COV,
        changeReason: { ko: '계약 참조만 명시', en: 'Contract reference made explicit' }, registeredAt: '2026-07-01T09:00:00', publishedAt: '2026-07-02T09:00:00', deprecatedAt: null, updatedAt: '2026-07-02T09:00:00', updatedBy: 'kim.hana',
      }),
      quantile({
        version: '3', state: 'published', unit: 's', grain: { ko: 'Job 실행', en: 'Job execution' },
        formula: { ko: '분포 재계산. 큐 대기를 포함.', en: 'Recompute from the distribution, including queue wait.' },
        filters: [{ ko: '완료 Job', en: 'Completed jobs' }, { ko: 'anchor 보유', en: 'Has an anchor' }], sourceContractRef: 'cycle-time-basis-v2', coverage: JOB_COV,
        changeReason: { ko: '큐 대기 포함', en: 'Queue wait included' }, registeredAt: '2026-08-12T09:00:00', publishedAt: '2026-08-13T09:00:00', deprecatedAt: null, updatedAt: '2026-08-13T09:00:00', updatedBy: 'park.seo',
      }),
      quantile({
        version: '4', state: 'published', unit: 's', grain: { ko: 'Job 실행', en: 'Job execution' },
        formula: { ko: '분포 재계산. 공정 구간만. averageOfQuantilesAllowed=false.', en: 'Recompute from the distribution, process interval only. averageOfQuantilesAllowed=false.' },
        filters: [{ ko: '완료 Job', en: 'Completed jobs' }, { ko: '공정 구간', en: 'Process interval' }], sourceContractRef: 'cycle-time-basis-v3', coverage: JOB_COV,
        changeReason: { ko: '공정 구간으로 grain 설명 수정. 게시 포인터.', en: 'Process-interval wording. Published pointer.' }, registeredAt: '2026-09-18T09:00:00', publishedAt: '2026-09-20T11:00:00', deprecatedAt: null, updatedAt: '2026-09-20T11:00:00', updatedBy: 'park.seo',
      }),
      quantile({
        version: '5', state: 'draft', unit: 's', grain: { ko: 'Job 실행', en: 'Job execution' },
        formula: { ko: 'v4 복사. 필터 문구만 초안. 분석 기본 버전이 아닙니다.', en: 'Copy of v4. Filter wording only. Not an analysis default.' },
        filters: [{ ko: '완료 Job (초안 문구)', en: 'Completed jobs (draft wording)' }], sourceContractRef: 'cycle-time-basis-v3', coverage: JOB_COV,
        changeReason: { ko: '필터 문구 초안. 게시 아님.', en: 'Draft filter wording. Not published.' }, registeredAt: '2026-09-24T09:00:00', publishedAt: null, deprecatedAt: null, updatedAt: '2026-09-24T09:00:00', updatedBy: 'park.seo',
      }),
    ],
  },
  {
    metricId: 'occupancy_physical', name: { ko: '물리 점유율', en: 'Physical occupancy' }, domain: 'productivity', kind: 'ratio',
    description: { ko: '점유 시간 합 / 대상 시간 합. 비율의 평균이 아닙니다.', en: 'Sum of occupied time over sum of eligible time. Not an average of ratios.' },
    ...OWN.prod, publishedPointer: '3', catalogVersion: '3', draftVersion: '4', catalogStatus: 'published', populationRule: 'not-retired', updatedAt: '2026-09-24T09:00:00',
    usage: [{ menuId: 'productivity-overview', place: { ko: '물리 점유율 KPI', en: 'Physical occupancy KPI' }, versions: ['3'] }],
    versions: [
      ratio({
        version: '1', state: 'published', unit: '%', grain: { ko: 'EquipmentID × 기간', en: 'EquipmentID × period' },
        formula: { ko: 'occupied_duration 합 / eligible_duration 합.', en: 'Sum of occupied_duration / sum of eligible_duration.' },
        numerator: 'occupied_duration', denominator: 'eligible_duration', filters: [{ ko: '유효 관측', en: 'Valid observation' }],
        sourceContractRef: 'occupancy-basis-v1', coverage: OCC_COV, changeReason: { ko: '최초 게시', en: 'Initial publication' },
        registeredAt: '2026-05-04T09:00:00', publishedAt: '2026-05-06T09:00:00', deprecatedAt: null, updatedAt: '2026-05-06T09:00:00', updatedBy: 'kim.hana',
      }),
      ratio({
        version: '2', state: 'published', unit: '%', grain: { ko: 'EquipmentID × 기간', en: 'EquipmentID × period' },
        formula: { ko: '분자·분모 각각 합산. 중첩 절단은 원천 계약에 위임.', en: 'Sum numerator and denominator separately. Overlap cutting stays in the source contract.' },
        numerator: 'occupied_duration', denominator: 'eligible_duration', filters: [{ ko: '유효 관측', en: 'Valid observation' }],
        sourceContractRef: 'occupancy-basis-v2', coverage: OCC_COV, changeReason: { ko: '합산 규칙 명시', en: 'Summation rule made explicit' },
        registeredAt: '2026-07-11T09:00:00', publishedAt: '2026-07-12T09:00:00', deprecatedAt: null, updatedAt: '2026-07-12T09:00:00', updatedBy: 'kim.hana',
      }),
      ratio({
        version: '3', state: 'published', unit: '%', grain: { ko: 'EquipmentID × 기간', en: 'EquipmentID × period' },
        formula: { ko: 'ratioOfSums. averageOfRatiosAllowed=false. 게시 포인터.', en: 'ratioOfSums. averageOfRatiosAllowed=false. Published pointer.' },
        numerator: 'occupied_duration', denominator: 'eligible_duration',
        filters: [{ ko: '유효 관측', en: 'Valid observation' }, { ko: '미확인 구간 제외', en: 'Exclude unconfirmed intervals' }],
        sourceContractRef: 'occupancy-basis-v3', coverage: OCC_COV, changeReason: { ko: '제외 기준을 정의에 기록', en: 'Exclusion basis recorded on the definition' },
        registeredAt: '2026-09-01T09:00:00', publishedAt: '2026-09-10T16:00:00', deprecatedAt: null, updatedAt: '2026-09-10T16:00:00', updatedBy: 'kim.hana',
      }),
      ratio({
        version: '4', state: 'draft', unit: '%', grain: { ko: 'EquipmentID × 기간', en: 'EquipmentID × period' },
        formula: { ko: 'v3 복사. 단위 표기 초안. 분석에 반환하지 않습니다.', en: 'Copy of v3. Unit wording draft. Not returned for analysis.' },
        numerator: 'occupied_duration', denominator: 'eligible_duration', filters: [{ ko: '유효 관측', en: 'Valid observation' }],
        sourceContractRef: 'occupancy-basis-v3', coverage: OCC_COV, changeReason: { ko: '단위 표기 초안', en: 'Draft unit wording' },
        registeredAt: '2026-09-24T09:00:00', publishedAt: null, deprecatedAt: null, updatedAt: '2026-09-24T09:00:00', updatedBy: 'kim.hana',
      }),
    ],
  },
  {
    metricId: 'non_process_dwell', name: { ko: '비Process 체류', en: 'Non-process dwell' }, domain: 'time', kind: 'duration',
    description: { ko: '공정 밖 체류 시간의 합.', en: 'Sum of dwell outside the process interval.' },
    ...OWN.time, publishedPointer: '2', catalogVersion: '2', draftVersion: null, catalogStatus: 'published', populationRule: 'etch', updatedAt: '2026-09-12T10:00:00',
    usage: [{ menuId: 'productivity-overview', place: { ko: '비Process 체류 KPI', en: 'Non-process dwell KPI' }, versions: ['2'] }],
    versions: [
      additive({
        version: '1', state: 'published', unit: 's', rule: 'sum', grain: { ko: 'Job 실행', en: 'Job execution' },
        formula: { ko: 'non_process_dwell_duration 합.', en: 'Sum of non_process_dwell_duration.' }, numerator: 'non_process_dwell_duration',
        filters: [{ ko: '완료 Job', en: 'Completed jobs' }], sourceContractRef: 'dwell-basis-v1', coverage: JOB_COV,
        changeReason: { ko: '최초 게시', en: 'Initial publication' }, registeredAt: '2026-06-20T09:00:00', publishedAt: '2026-06-21T09:00:00', deprecatedAt: null, updatedAt: '2026-06-21T09:00:00', updatedBy: 'park.seo',
      }),
      additive({
        version: '2', state: 'published', unit: 's', rule: 'sum', grain: { ko: 'Job 실행', en: 'Job execution' },
        formula: { ko: '체류 합. 사이클 분위수와 섞지 않음. 게시 포인터.', en: 'Sum of dwell. Not mixed into cycle quantiles. Published pointer.' }, numerator: 'non_process_dwell_duration',
        filters: [{ ko: '완료 Job', en: 'Completed jobs' }, { ko: '공정 구간 제외', en: 'Exclude the process interval' }], sourceContractRef: 'dwell-basis-v2', coverage: JOB_COV,
        changeReason: { ko: '공정 구간 제외를 필터에 명시', en: 'Process-interval exclusion added to filters' }, registeredAt: '2026-09-11T09:00:00', publishedAt: '2026-09-12T10:00:00', deprecatedAt: null, updatedAt: '2026-09-12T10:00:00', updatedBy: 'park.seo',
      }),
    ],
  },
  {
    metricId: 'job_throughput', name: { ko: 'Job 처리량', en: 'Job throughput' }, domain: 'productivity', kind: 'count',
    description: { ko: '완료 Job 건수.', en: 'Count of completed jobs.' },
    ...OWN.prod, publishedPointer: '1', catalogVersion: '1', draftVersion: null, catalogStatus: 'published', populationRule: 'not-retired', updatedAt: '2026-08-02T09:00:00',
    usage: [{ menuId: 'productivity-overview', place: { ko: 'Job 처리량 KPI', en: 'Job throughput KPI' }, versions: ['1'] }],
    versions: [
      additive({
        version: '1', state: 'published', unit: 'job', rule: 'sum', grain: { ko: 'EquipmentID × 기간', en: 'EquipmentID × period' },
        formula: { ko: 'completed_job_count 합.', en: 'Sum of completed_job_count.' }, numerator: 'completed_job_count',
        filters: [{ ko: '완료 Job', en: 'Completed jobs' }], sourceContractRef: 'throughput-basis-v1', coverage: COUNT_COV,
        changeReason: { ko: '최초 게시. 게시 포인터.', en: 'Initial publication. Published pointer.' }, registeredAt: '2026-08-01T09:00:00', publishedAt: '2026-08-02T09:00:00', deprecatedAt: null, updatedAt: '2026-08-02T09:00:00', updatedBy: 'kim.hana',
      }),
    ],
  },
  {
    metricId: 'wafer_move_count', name: { ko: '웨이퍼 이송 건수', en: 'Wafer move count' }, domain: 'movement', kind: 'count',
    description: { ko: '이송 이벤트 건수. 소비자 선언 없음.', en: 'Count of move events. No consumer declaration.' },
    ...OWN.move, publishedPointer: '2', catalogVersion: '2', draftVersion: null, catalogStatus: 'published', populationRule: 'active-only', updatedAt: '2026-09-05T09:00:00',
    usage: [],
    versions: [
      additive({
        version: '1', state: 'deprecated', unit: 'wafer', rule: 'sum', grain: { ko: '이송 이벤트', en: 'Move event' },
        formula: { ko: 'move_event_count 합.', en: 'Sum of move_event_count.' }, numerator: 'move_event_count',
        filters: [{ ko: '이송 이벤트', en: 'Move events' }], sourceContractRef: 'move-basis-v1', coverage: COUNT_COV,
        changeReason: { ko: '최초 게시 후 폐기', en: 'Published, then deprecated' }, registeredAt: '2026-04-01T09:00:00', publishedAt: '2026-04-02T09:00:00', deprecatedAt: '2026-09-05T09:00:00', updatedAt: '2026-09-05T09:00:00', updatedBy: 'choi.min',
      }),
      additive({
        version: '2', state: 'published', unit: 'wafer', rule: 'sum', grain: { ko: '이송 이벤트', en: 'Move event' },
        formula: { ko: '설비 경계 안의 이송만 합산. 게시 포인터.', en: 'Sum moves inside the equipment boundary. Published pointer.' }, numerator: 'move_event_count',
        filters: [{ ko: '설비 경계 안 이송', en: 'Moves inside the equipment boundary' }], sourceContractRef: 'move-basis-v2', coverage: COUNT_COV,
        changeReason: { ko: '경계 조건 추가', en: 'Boundary condition added' }, registeredAt: '2026-09-04T09:00:00', publishedAt: '2026-09-05T09:00:00', deprecatedAt: null, updatedAt: '2026-09-05T09:00:00', updatedBy: 'choi.min',
      }),
    ],
  },
  {
    metricId: 'queue_time', name: { ko: '대기 시간', en: 'Queue time' }, domain: 'time', kind: 'duration',
    description: { ko: '초안만 있습니다. 게시 포인터가 없습니다.', en: 'Draft only. No published pointer.' },
    ...OWN.time, publishedPointer: null, catalogVersion: '1', draftVersion: '1', catalogStatus: 'draft', populationRule: 'etch', updatedAt: '2026-09-22T09:00:00',
    usage: [],
    versions: [
      additive({
        version: '1', state: 'draft', unit: 's', rule: 'sum', grain: { ko: 'Job 실행', en: 'Job execution' },
        formula: { ko: 'queue_duration 합. 초안이며 게시 초기화 후보가 아닙니다.', en: 'Sum of queue_duration. A draft, not a publication-initialization candidate.' }, numerator: 'queue_duration',
        filters: [{ ko: '대기 구간', en: 'Queue interval' }], sourceContractRef: 'queue-basis-draft', coverage: JOB_COV,
        changeReason: { ko: '초안 등록. 게시하지 않음.', en: 'Draft registered. Not published.' }, registeredAt: '2026-09-22T09:00:00', publishedAt: null, deprecatedAt: null, updatedAt: '2026-09-22T09:00:00', updatedBy: 'park.seo',
      }),
    ],
  },
  {
    metricId: 'availability_scheduled', name: { ko: '계획 가동률', en: 'Scheduled availability' }, domain: 'productivity', kind: 'ratio',
    description: { ko: '가동 가능 시간 합 / 계획 시간 합.', en: 'Sum of available time over sum of scheduled time.' },
    ...OWN.prod, publishedPointer: '2', catalogVersion: '2', draftVersion: null, catalogStatus: 'published', populationRule: 'not-retired', updatedAt: '2026-08-19T09:00:00',
    usage: [],
    versions: [
      ratio({
        version: '1', state: 'deprecated', unit: '%', grain: { ko: 'EquipmentID × 기간', en: 'EquipmentID × period' },
        formula: { ko: 'available_duration 합 / scheduled_duration 합.', en: 'Sum of available_duration / sum of scheduled_duration.' },
        numerator: 'available_duration', denominator: 'scheduled_duration', filters: [{ ko: '계획 구간', en: 'Scheduled interval' }],
        sourceContractRef: 'availability-basis-v1', coverage: OCC_COV, changeReason: { ko: '폐기된 초기 정의', en: 'Deprecated initial definition' },
        registeredAt: '2026-03-01T09:00:00', publishedAt: '2026-03-02T09:00:00', deprecatedAt: '2026-08-19T09:00:00', updatedAt: '2026-08-19T09:00:00', updatedBy: 'kim.hana',
      }),
      ratio({
        version: '2', state: 'published', unit: '%', grain: { ko: 'EquipmentID × 기간', en: 'EquipmentID × period' },
        formula: { ko: 'ratioOfSums. 보전 창은 분모에 포함. 게시 포인터.', en: 'ratioOfSums. Maintenance windows stay in the denominator. Published pointer.' },
        numerator: 'available_duration', denominator: 'scheduled_duration', filters: [{ ko: '계획 구간', en: 'Scheduled interval' }],
        sourceContractRef: 'availability-basis-v2', coverage: OCC_COV, changeReason: { ko: '보전 창을 분모에 유지', en: 'Maintenance windows kept in the denominator' },
        registeredAt: '2026-08-18T09:00:00', publishedAt: '2026-08-19T09:00:00', deprecatedAt: null, updatedAt: '2026-08-19T09:00:00', updatedBy: 'kim.hana',
      }),
    ],
  },
  {
    metricId: 'alarm_count', name: { ko: '알람 건수', en: 'Alarm count' }, domain: 'quality', kind: 'count',
    description: { ko: '확인된 알람 건수.', en: 'Count of confirmed alarms.' },
    ...OWN.qual, publishedPointer: '1', catalogVersion: '1', draftVersion: null, catalogStatus: 'published', populationRule: 'active-only', updatedAt: '2026-07-15T09:00:00',
    usage: [],
    versions: [
      additive({
        version: '1', state: 'published', unit: 'alarm', rule: 'sum', grain: { ko: 'EquipmentID × 기간', en: 'EquipmentID × period' },
        formula: { ko: 'confirmed_alarm_count 합. 게시 포인터.', en: 'Sum of confirmed_alarm_count. Published pointer.' }, numerator: 'confirmed_alarm_count',
        filters: [{ ko: '확인된 알람', en: 'Confirmed alarms' }], sourceContractRef: 'alarm-basis-v1', coverage: COUNT_COV,
        changeReason: { ko: '최초 게시', en: 'Initial publication' }, registeredAt: '2026-07-14T09:00:00', publishedAt: '2026-07-15T09:00:00', deprecatedAt: null, updatedAt: '2026-07-15T09:00:00', updatedBy: 'lee.jun',
      }),
    ],
  },
  {
    metricId: 'recipe_changeover', name: { ko: '레시피 전환 시간', en: 'Recipe changeover' }, domain: 'time', kind: 'duration',
    description: { ko: '레시피 전환에 걸린 시간의 합.', en: 'Sum of time spent changing recipe.' },
    ...OWN.time, publishedPointer: '1', catalogVersion: '1', draftVersion: '2', catalogStatus: 'published', populationRule: 'active-only', updatedAt: '2026-09-21T09:00:00',
    usage: [],
    versions: [
      additive({
        version: '1', state: 'published', unit: 's', rule: 'sum', grain: { ko: '전환 이벤트', en: 'Changeover event' },
        formula: { ko: 'changeover_duration 합. 게시 포인터.', en: 'Sum of changeover_duration. Published pointer.' }, numerator: 'changeover_duration',
        filters: [{ ko: '레시피 변경이 있는 이벤트', en: 'Events with a recipe change' }], sourceContractRef: 'changeover-basis-v1', coverage: COUNT_COV,
        changeReason: { ko: '최초 게시', en: 'Initial publication' }, registeredAt: '2026-08-08T09:00:00', publishedAt: '2026-08-09T09:00:00', deprecatedAt: null, updatedAt: '2026-08-09T09:00:00', updatedBy: 'park.seo',
      }),
      additive({
        version: '2', state: 'draft', unit: 's', rule: 'sum', grain: { ko: '전환 이벤트', en: 'Changeover event' },
        formula: { ko: '동일 합. 필터 초안.', en: 'Same sum. Draft filter.' }, numerator: 'changeover_duration',
        filters: [{ ko: 'PPID가 바뀐 이벤트 (초안)', en: 'Events whose PPID changed (draft)' }], sourceContractRef: 'changeover-basis-v1', coverage: COUNT_COV,
        changeReason: { ko: 'PPID 조건 초안', en: 'Draft PPID condition' }, registeredAt: '2026-09-21T09:00:00', publishedAt: null, deprecatedAt: null, updatedAt: '2026-09-21T09:00:00', updatedBy: 'park.seo',
      }),
    ],
  },
  {
    metricId: 'lot_hold_dwell', name: { ko: 'Lot 보류 체류', en: 'Lot hold dwell' }, domain: 'time', kind: 'duration',
    description: { ko: '보류 상태 Lot의 체류 시간 합.', en: 'Sum of dwell while a lot is on hold.' },
    ...OWN.time, publishedPointer: '3', catalogVersion: '3', draftVersion: null, catalogStatus: 'published', populationRule: 'not-retired', updatedAt: '2026-09-08T09:00:00',
    usage: [],
    versions: [
      additive({
        version: '1', state: 'deprecated', unit: 's', rule: 'sum', grain: { ko: 'Lot 보류 구간', en: 'Lot hold interval' },
        formula: { ko: 'hold_duration 합.', en: 'Sum of hold_duration.' }, numerator: 'hold_duration',
        filters: [{ ko: '보류 구간', en: 'Hold interval' }], sourceContractRef: 'hold-basis-v1', coverage: JOB_COV,
        changeReason: { ko: '폐기된 초기 정의', en: 'Deprecated initial definition' }, registeredAt: '2026-02-01T09:00:00', publishedAt: '2026-02-02T09:00:00', deprecatedAt: '2026-06-01T09:00:00', updatedAt: '2026-06-01T09:00:00', updatedBy: 'park.seo',
      }),
      additive({
        version: '2', state: 'published', unit: 's', rule: 'sum', grain: { ko: 'Lot 보류 구간', en: 'Lot hold interval' },
        formula: { ko: '보류 합. v1 참조를 바꾸지 않음.', en: 'Sum of hold. Does not rewrite v1 references.' }, numerator: 'hold_duration',
        filters: [{ ko: '보류 사유가 있는 구간', en: 'Intervals with a hold reason' }], sourceContractRef: 'hold-basis-v2', coverage: JOB_COV,
        changeReason: { ko: '사유 필터 추가', en: 'Reason filter added' }, registeredAt: '2026-06-02T09:00:00', publishedAt: '2026-06-03T09:00:00', deprecatedAt: null, updatedAt: '2026-06-03T09:00:00', updatedBy: 'park.seo',
      }),
      additive({
        version: '3', state: 'published', unit: 's', rule: 'sum', grain: { ko: 'Lot 보류 구간', en: 'Lot hold interval' },
        formula: { ko: '보류 합. 게시 포인터. 엔지니어 해제 전만.', en: 'Sum of hold. Published pointer. Only until an engineer releases it.' }, numerator: 'hold_duration',
        filters: [{ ko: '해제 전 보류', en: 'Hold before release' }], sourceContractRef: 'hold-basis-v3', coverage: JOB_COV,
        changeReason: { ko: '해제 시점 필터', en: 'Release-time filter' }, registeredAt: '2026-09-07T09:00:00', publishedAt: '2026-09-08T09:00:00', deprecatedAt: null, updatedAt: '2026-09-08T09:00:00', updatedBy: 'park.seo',
      }),
    ],
  },
  {
    metricId: 'chamber_utilization', name: { ko: '챔버 가동률', en: 'Chamber utilization' }, domain: 'productivity', kind: 'ratio',
    description: { ko: '챔버 점유 합 / 챔버 대상 시간 합.', en: 'Sum of chamber occupied time over sum of chamber eligible time.' },
    ...OWN.prod, publishedPointer: '1', catalogVersion: '1', draftVersion: null, catalogStatus: 'published', populationRule: 'etch', updatedAt: '2026-09-02T09:00:00',
    usage: [],
    versions: [
      ratio({
        version: '1', state: 'published', unit: '%', grain: { ko: 'Chamber × 기간', en: 'Chamber × period' },
        formula: { ko: 'chamber_occupied_duration 합 / chamber_eligible_duration 합. 게시 포인터.', en: 'Sum of chamber_occupied_duration / sum of chamber_eligible_duration. Published pointer.' },
        numerator: 'chamber_occupied_duration', denominator: 'chamber_eligible_duration', filters: [{ ko: '챔버 관측', en: 'Chamber observations' }],
        sourceContractRef: 'chamber-basis-v1', coverage: OCC_COV, changeReason: { ko: '최초 게시', en: 'Initial publication' },
        registeredAt: '2026-09-01T09:00:00', publishedAt: '2026-09-02T09:00:00', deprecatedAt: null, updatedAt: '2026-09-02T09:00:00', updatedBy: 'kim.hana',
      }),
    ],
  },
  {
    metricId: 'rework_rate', name: { ko: '재작업 비율', en: 'Rework rate' }, domain: 'quality', kind: 'ratio',
    description: { ko: '재작업 웨이퍼 합 / 완료 웨이퍼 합.', en: 'Sum of rework wafers over sum of completed wafers.' },
    ...OWN.qual, publishedPointer: '2', catalogVersion: '2', draftVersion: null, catalogStatus: 'published', populationRule: 'active-only', updatedAt: '2026-09-15T09:00:00',
    usage: [],
    versions: [
      ratio({
        version: '1', state: 'published', unit: '%', grain: { ko: 'Lot × 기간', en: 'Lot × period' },
        formula: { ko: 'rework_wafer_count 합 / completed_wafer_count 합.', en: 'Sum of rework_wafer_count / sum of completed_wafer_count.' },
        numerator: 'rework_wafer_count', denominator: 'completed_wafer_count', filters: [{ ko: '완료 Lot', en: 'Completed lots' }],
        sourceContractRef: 'rework-basis-v1', coverage: COUNT_COV, changeReason: { ko: '최초 게시', en: 'Initial publication' },
        registeredAt: '2026-07-20T09:00:00', publishedAt: '2026-07-21T09:00:00', deprecatedAt: null, updatedAt: '2026-07-21T09:00:00', updatedBy: 'lee.jun',
      }),
      ratio({
        version: '2', state: 'published', unit: '%', grain: { ko: 'Lot × 기간', en: 'Lot × period' },
        formula: { ko: 'ratioOfSums. 부분 재작업 포함. 게시 포인터.', en: 'ratioOfSums. Partial rework included. Published pointer.' },
        numerator: 'rework_wafer_count', denominator: 'completed_wafer_count', filters: [{ ko: '완료 Lot', en: 'Completed lots' }, { ko: '부분 재작업 포함', en: 'Include partial rework' }],
        sourceContractRef: 'rework-basis-v2', coverage: COUNT_COV, changeReason: { ko: '부분 재작업 포함', en: 'Partial rework included' },
        registeredAt: '2026-09-14T09:00:00', publishedAt: '2026-09-15T09:00:00', deprecatedAt: null, updatedAt: '2026-09-15T09:00:00', updatedBy: 'lee.jun',
      }),
    ],
  },
  {
    metricId: 'energy_per_wafer', name: { ko: '웨이퍼당 에너지', en: 'Energy per wafer' }, domain: 'maintenance', kind: 'ratio',
    description: { ko: '에너지 합 / 웨이퍼 합. 조직 미정.', en: 'Sum of energy over sum of wafers. Organization unset.' },
    ...OWN.maint, publishedPointer: '1', catalogVersion: '1', draftVersion: null, catalogStatus: 'published', populationRule: 'maintenance-or-active', updatedAt: '2026-09-03T09:00:00',
    usage: [],
    versions: [
      ratio({
        version: '1', state: 'published', unit: 'kWh/wafer', grain: { ko: 'EquipmentID × 기간', en: 'EquipmentID × period' },
        formula: { ko: 'energy_kwh 합 / wafer_count 합. 게시 포인터.', en: 'Sum of energy_kwh / sum of wafer_count. Published pointer.' },
        numerator: 'energy_kwh', denominator: 'wafer_count', filters: [{ ko: '계측이 확인된 구간', en: 'Intervals with a confirmed meter reading' }],
        sourceContractRef: 'energy-basis-v1', coverage: COUNT_COV, changeReason: { ko: '최초 게시', en: 'Initial publication' },
        registeredAt: '2026-09-02T09:00:00', publishedAt: '2026-09-03T09:00:00', deprecatedAt: null, updatedAt: '2026-09-03T09:00:00', updatedBy: 'han.yuri',
      }),
    ],
  },
  {
    metricId: 'setup_time', name: { ko: '셋업 시간', en: 'Setup time' }, domain: 'maintenance', kind: 'duration',
    description: { ko: '게시본이 없습니다. 폐기 버전만 남아 있습니다.', en: 'No publication. Only a deprecated version remains.' },
    ...OWN.maint, publishedPointer: null, catalogVersion: '1', draftVersion: null, catalogStatus: 'deprecated', populationRule: 'maintenance-or-active', updatedAt: '2026-09-01T09:00:00',
    usage: [],
    versions: [
      additive({
        version: '1', state: 'deprecated', unit: 's', rule: 'sum', grain: { ko: '셋업 이벤트', en: 'Setup event' },
        formula: { ko: 'setup_duration 합. 폐기. 최신 대체 없음.', en: 'Sum of setup_duration. Deprecated. No substitution with a latest version.' }, numerator: 'setup_duration',
        filters: [{ ko: '셋업 이벤트', en: 'Setup events' }], sourceContractRef: 'setup-basis-v1', coverage: COUNT_COV,
        changeReason: { ko: '정의 폐기. 후속 게시 없음.', en: 'Definition deprecated. No successor publication.' }, registeredAt: '2026-01-10T09:00:00', publishedAt: '2026-01-11T09:00:00', deprecatedAt: '2026-09-01T09:00:00', updatedAt: '2026-09-01T09:00:00', updatedBy: 'han.yuri',
      }),
    ],
  },
];

export type CatalogRow = {
  metricId: string;
  nameKo: string;
  nameEn: string;
  nameSort: string;
  domain: Domain;
  grain: string;
  numerator: string;
  denominator: string;
  publishedPointer: string | null;
  catalogVersion: string;
  draftVersion: string | null;
  status: PublicationState;
  ownerId: string;
  owner: string;
  updatedAt: string;
};

export function metricById(metricId: string): MetricDef | null {
  return METRICS.find(m => m.metricId === metricId) ?? null;
}

export function versionOf(metric: MetricDef, version: string): MetricVersion | null {
  return metric.versions.find(v => v.version === version) ?? null;
}

export function previousVersion(metric: MetricDef, version: string): MetricVersion | null {
  const idx = metric.versions.findIndex(v => v.version === version);
  return idx > 0 ? metric.versions[idx - 1] : null;
}

export function catalogRows(lang: Lang): CatalogRow[] {
  return METRICS.map(m => {
    const v = versionOf(m, m.catalogVersion);
    if (!v) throw new Error(`catalogVersion ${m.catalogVersion} missing on ${m.metricId}`);
    return {
      metricId: m.metricId,
      nameKo: m.name.ko,
      nameEn: m.name.en,
      nameSort: m.name[lang],
      domain: m.domain,
      grain: v.grain[lang],
      numerator: v.numerator ?? '—',
      denominator: v.denominator ?? '—',
      publishedPointer: m.publishedPointer,
      catalogVersion: m.catalogVersion,
      draftVersion: m.draftVersion,
      status: m.catalogStatus,
      ownerId: m.ownerId,
      owner: m.owner[lang],
      updatedAt: m.updatedAt,
    };
  });
}

export function filterCatalog(rows: CatalogRow[], q: string | null, status: string | null, domain: string | null): { rows: CatalogRow[]; filterProblem: 'status' | 'domain' | null } {
  if (status && !STATUSES.includes(status as PublicationState)) return { rows: [], filterProblem: 'status' };
  if (domain && !DOMAINS.includes(domain as Domain)) return { rows: [], filterProblem: 'domain' };
  const needle = q?.trim().toLowerCase() ?? '';
  const next = rows.filter(r => {
    if (status && r.status !== status) return false;
    if (domain && r.domain !== domain) return false;
    if (!needle) return true;
    return r.metricId.toLowerCase().includes(needle) || r.nameKo.toLowerCase().includes(needle) || r.nameEn.toLowerCase().includes(needle);
  });
  return { rows: next, filterProblem: null };
}

function matchesPopulation(status: string, chamberType: string, rule: PopulationRule): boolean {
  if (rule === 'not-retired') return status !== 'retired';
  if (rule === 'active-only') return status === 'active';
  if (rule === 'etch') return chamberType.startsWith('ET');
  return status === 'maintenance' || status === 'active';
}

/** Example equipment IDs for the definition's population rule. Not a coverage rate. */
export function populationExamples(rule: PopulationRule, equipment: { equipmentId: string; room: string; status: string; chamberType: string }[] = EQUIPMENT): { ids: string[]; rooms: string[] } {
  const rows = equipment.filter(e => matchesPopulation(e.status, e.chamberType, rule));
  const rooms = [...new Set(rows.map(e => e.room))].sort();
  return { ids: rows.slice(0, 3).map(e => e.equipmentId), rooms };
}

export type DiffRow = { field: string; before: string; after: string };

export function versionDiff(current: MetricVersion, previous: MetricVersion | null, lang: Lang): DiffRow[] {
  if (!previous) return [];
  const rows: DiffRow[] = [
    { field: 'grain', before: previous.grain[lang], after: current.grain[lang] },
    { field: 'unit', before: previous.unit, after: current.unit },
    { field: 'numerator', before: previous.numerator ?? '—', after: current.numerator ?? '—' },
    { field: 'denominator', before: previous.denominator ?? '—', after: current.denominator ?? '—' },
    { field: 'formula', before: previous.formula[lang], after: current.formula[lang] },
    { field: 'publicationState', before: previous.state, after: current.state },
    { field: 'filters', before: previous.filters.map(f => f[lang]).join('; ') || '—', after: current.filters.map(f => f[lang]).join('; ') || '—' },
    { field: 'sourceContractRef', before: previous.sourceContractRef, after: current.sourceContractRef },
  ];
  return rows.filter(r => r.before !== r.after);
}

export function auditEvents(metric: MetricDef, lang: Lang): AuditEvent[] {
  const events: AuditEvent[] = [];
  let prev: MetricVersion | null = null;
  for (const v of metric.versions) {
    const diff = versionDiff(v, prev, lang);
    const changes: Record<string, [string | null, string | null]> = { metricVersion: [prev?.version ?? null, v.version] };
    for (const row of diff) changes[row.field] = [row.before, row.after];
    events.push({
      id: `${metric.metricId}-v${v.version}-draft`,
      at: v.registeredAt,
      actor: v.updatedBy,
      action: 'create',
      source: 'user',
      reason: v.changeReason[lang],
      changes,
    });
    if (v.publishedAt) {
      events.push({
        id: `${metric.metricId}-v${v.version}-publish`,
        at: v.publishedAt,
        actor: v.updatedBy,
        action: 'update',
        source: 'user',
        reason: lang === 'ko' ? '게시 확정. mart 재계산 완료가 아닙니다.' : 'Published. This is not mart-recompute completion.',
        changes: { metricVersion: [v.version, v.version], publicationState: ['draft', 'published'] },
      });
    }
    if (v.deprecatedAt) {
      events.push({
        id: `${metric.metricId}-v${v.version}-deprecate`,
        at: v.deprecatedAt,
        actor: v.updatedBy,
        action: 'retire',
        source: 'user',
        reason: lang === 'ko' ? '폐기. 기존 참조는 유지하고 최신으로 대체하지 않습니다.' : 'Deprecated. Existing references stay; latest is not substituted.',
        changes: { metricVersion: [v.version, v.version], publicationState: ['published', 'deprecated'] },
      });
    }
    prev = v;
  }
  return events;
}

export type DefinitionPayload = {
  problem: 'unknown-metric' | 'need-version' | 'version-not-member' | null;
  requestedVersion: string | null;
  metric: MetricDef | null;
  version: MetricVersion | null;
  previous: MetricVersion | null;
  exampleEquipmentIds: string[];
  exampleRooms: string[];
};

export function buildDefinition(metricId: string, requestedVersion: string | null, equipment: { equipmentId: string; room: string; status: string; chamberType: string }[]): DefinitionPayload {
  const metric = metricById(metricId);
  if (!metric) return { problem: 'unknown-metric', requestedVersion, metric: null, version: null, previous: null, exampleEquipmentIds: [], exampleRooms: [] };
  const examples = populationExamples(metric.populationRule, equipment);
  if (!requestedVersion) return { problem: 'need-version', requestedVersion, metric, version: null, previous: null, exampleEquipmentIds: examples.ids, exampleRooms: examples.rooms };
  const version = versionOf(metric, requestedVersion);
  if (!version) return { problem: 'version-not-member', requestedVersion, metric, version: null, previous: null, exampleEquipmentIds: examples.ids, exampleRooms: examples.rooms };
  return { problem: null, requestedVersion, metric, version, previous: previousVersion(metric, requestedVersion), exampleEquipmentIds: examples.ids, exampleRooms: examples.rooms };
}

export type UsageRow = { menuId: ConsumerMenuId; place: Text; version: string; evidenceSource: 'declared-dependency'; observedAt: null };
export type UsagePayload = { problem: 'unknown-metric' | 'version-not-member' | null; rows: UsageRow[] };

export function buildUsage(metricId: string, requestedVersion: string | null): UsagePayload {
  const metric = metricById(metricId);
  if (!metric) return { problem: 'unknown-metric', rows: [] };
  if (!requestedVersion || !versionOf(metric, requestedVersion)) return { problem: 'version-not-member', rows: [] };
  const rows = metric.usage
    .filter(u => u.versions.includes(requestedVersion))
    .map(u => ({ menuId: u.menuId, place: u.place, version: requestedVersion, evidenceSource: 'declared-dependency' as const, observedAt: null }));
  return { problem: null, rows };
}

export type HistoryPayload = { problem: 'unknown-metric' | null; events: AuditEvent[] };

export function buildHistory(metricId: string, lang: Lang): HistoryPayload {
  const metric = metricById(metricId);
  if (!metric) return { problem: 'unknown-metric', events: [] };
  return { problem: null, events: auditEvents(metric, lang) };
}

export type PairVerdict =
  | { kind: 'absent' }
  | { kind: 'id-only'; metricId: string; known: boolean }
  | { kind: 'valid'; metricId: string; metricVersion: string }
  | { kind: 'unknown-metric'; metricId: string; metricVersion: string | null }
  | { kind: 'version-not-member'; metricId: string; metricVersion: string }
  | { kind: 'other-metric'; metricId: string; metricVersion: string | null; viewedId: string }
  | { kind: 'conflict'; metricId: string; globalVersion: string; pageVersion: string };

/**
 * Global pair vs destination. Membership failures win over "other metric".
 * A different metric is preserved, never rewritten here. Same-metric version
 * disagreement is a conflict with no implicit winner (06 §6.1).
 */
export function judgeGlobalPair(globalId: string | null, globalVersion: string | null, viewedId: string | null, pageVersion: string | null): PairVerdict {
  if (!globalId && globalVersion) return { kind: 'version-not-member', metricId: '', metricVersion: globalVersion };
  if (!globalId) return { kind: 'absent' };
  const metric = metricById(globalId);
  if (globalVersion) {
    if (!metric) return { kind: 'unknown-metric', metricId: globalId, metricVersion: globalVersion };
    if (!versionOf(metric, globalVersion)) return { kind: 'version-not-member', metricId: globalId, metricVersion: globalVersion };
  } else if (!metric) {
    return { kind: 'unknown-metric', metricId: globalId, metricVersion: null };
  }
  if (viewedId && globalId !== viewedId) return { kind: 'other-metric', metricId: globalId, metricVersion: globalVersion, viewedId };
  if (viewedId && globalId === viewedId && globalVersion && pageVersion && globalVersion !== pageVersion) {
    return { kind: 'conflict', metricId: globalId, globalVersion, pageVersion };
  }
  if (!globalVersion) return { kind: 'id-only', metricId: globalId, known: true };
  return { kind: 'valid', metricId: globalId, metricVersion: globalVersion };
}

export const PERIOD_BASIS = WALL;

export const CONSUMER_LABEL: Record<ConsumerMenuId, Text> = {
  'productivity-overview': { ko: '생산성 개요', en: 'Productivity overview' },
  'cycle-time': { ko: '사이클타임 상세', en: 'Cycle time detail' },
};
