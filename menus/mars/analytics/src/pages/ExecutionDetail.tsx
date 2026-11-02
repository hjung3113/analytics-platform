import { AlertTriangle, Ban } from 'lucide-react';
import { parseDateTime } from '@ap/contracts';
import { type PageProps, PlatformLink, useI18n, usePlatform, useMenuQuery } from '@ap/kernel';
import { DataTrustIndicator, Panel, PlatformPage, QueryView, ReturnLink, StateMessage } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import { isAnchor, OCCURRENCE_ENTITY_TYPES, occurrenceEndpoint, resolveMetric, type Segment, type SegmentKind } from '../endpoints';

const SEGMENT_CLASS: Record<SegmentKind, string> = {
  XFR: 'bg-chart-blue',
  FNC: 'bg-chart-teal',
  PRC: 'bg-chart-purple',
};

export default function ExecutionDetail({ params }: PageProps) {
  const { lang } = useI18n();
  const { global, pageParam, linkTo, registry } = usePlatform();
  const ko = lang === 'ko';
  const equipmentId = params.equipmentId;
  const entityType = pageParam('entityType');
  const anchor = pageParam('anchor');
  const errors = identityErrors(entityType, anchor, ko);
  const valid = errors.length === 0;
  const metric = resolveMetric(global);
  const metricVersion = metric.kind === 'unconfirmed' ? null : metric.metricVersion;
  const restored = registry.safeReturnTo(pageParam('returnTo')) !== null;

  const query = useMenuQuery(
    occurrenceEndpoint,
    { equipmentId, entityType: entityType!, anchor: anchor!, metricVersion: metricVersion! },
    valid && metricVersion !== null,
  );

  const found = query.response?.data;
  const startedAt = found && found.access === 'ok' ? found.execution.startedAt : null;

  const back = <ReturnLink />;
  const equipmentLink = <Button asChild variant="secondary" size="sm"><PlatformLink href={linkTo('equipment-detail', { params: { equipmentId }, returnTo: true })}>{ko ? '설비 상세' : 'Equipment detail'}</PlatformLink></Button>;
  const voc = <Button asChild size="sm"><PlatformLink href={linkTo('voc')}>{ko ? 'VOC 생성(예정)' : 'Create VOC (planned)'}</PlatformLink></Button>;

  return <PlatformPage
    title={<span className="inline-flex items-baseline gap-2">{ko ? '실행' : 'Execution'} <span className="t-mono">{equipmentId}</span></span>}
    description={ko
      ? 'occurrence는 (equipmentId, entityType, anchor)로만 식별합니다. 위 Context는 출발 분석의 참조이며 객체 구간을 자르지 않습니다.'
      : 'An occurrence is identified only by (equipmentId, entityType, anchor). The context above is the source analysis reference and does not clip the object.'}
    primaryAction={voc}
    secondaryActions={<span className="flex flex-wrap gap-2">{back}{equipmentLink}</span>}
    dataTrustSummary={query.response?.trust ? <DataTrustIndicator trust={query.response.trust} assessments={query.response.assessments} /> : undefined}
  >
    <div className="space-y-3">
      <p className="rounded-md border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-secondary">
        {ko
          ? 'Time·room·condition·selection·lot·ppid·recipe·metric은 참조입니다. 상세에서 본 설비로 전역 Selection을 바꾸지 않습니다. VOC 메뉴에는 occurrence page key가 없어 전역 Context만 전달됩니다.'
          : 'Time, room, condition, selection, lot, ppid, recipe and metric are reference only. This page does not rewrite the global selection to the equipment it shows. VOC has no occurrence page key, so only the global context is carried.'}
        {restored ? '' : (ko ? ' returnTo가 없어 사이클타임 분석의 현재 Context로 돌아갑니다.' : ' returnTo is absent, so Back opens cycle time with the current context.')}
      </p>

      <Panel title={ko ? 'Occurrence 식별' : 'Occurrence identity'} subtitle={ko ? '분석 Context와 별도입니다. Lot은 검색 보조이지 대체 키가 아닙니다.' : 'Separate from the analysis context. Lot is a search aid, not a substitute key.'}>
        <div className="grid gap-3 sm:grid-cols-4" data-testid="occurrence-key">
          <Identity label="EquipmentID" value={equipmentId} />
          <Identity label="entityType" value={entityType ?? '—'} />
          <Identity label="anchor" value={anchor ?? '—'} />
          <Identity label={ko ? '시작 시각' : 'Start time'} value={startedAt ? startedAt.replace('T', ' ') : '—'} />
        </div>
      </Panel>

      {!valid ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />} title={ko ? '식별 키가 올바르지 않아 조회하지 않습니다' : 'The identity key is invalid, so nothing was queried'}
        body={<ul className="list-disc pl-4">{errors.map(error => <li key={error}>{error}</li>)}</ul>} />
        : <div className="relative">
          <QueryView widgetName={ko ? '실행 상세' : 'Execution details'} query={query} skeletonHeight={240}>
            {data => data.access === 'forbidden'
              ? <StateMessage tone="warning" icon={<Ban className="size-4" aria-hidden />} title={ko ? '이 설비는 현재 Scope 권한 밖에 있습니다' : 'This equipment is outside the current scope grant'}
                body={ko
                  ? '이 설비는 현재 범위에서 볼 수 없습니다. 권한 담당자에게 요청하세요.'
                  : 'You cannot view this equipment in the current range. Ask the person who grants access.'}
                correlationId={query.response?.correlationId} />
              : data.access === 'ok' ? <OccurrenceBody execution={data.execution} segments={data.segments} ko={ko} lang={lang} /> : null}
          </QueryView>
        </div>}
    </div>
  </PlatformPage>;
}

const PANEL_GAP = 'space-y-3';

function OccurrenceBody({ execution, segments, ko, lang }: { execution: { room: string; recipe: string; lotId: string; ppid: string; anchor: string; startedAt: string; cycleMin: number; quality: 'unknown' | 'review' }; segments: Segment[]; ko: boolean; lang: string }) {
  const spanEnd = segments.reduce((max, segment) => segment.end > max ? segment.end : max, execution.startedAt);
  const axisEnd = spanEnd;
  const totalSec = Math.max(1, secondsBetween(execution.startedAt, axisEnd));
  return <div className={PANEL_GAP}>
    <Panel title={ko ? '표시 속성' : 'Display attributes'} subtitle={ko ? '식별 키가 아닙니다.' : 'Not part of the identity key.'}>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Identity label="room_name" value={execution.room} />
        <Identity label="Recipe" value={execution.recipe} />
        <Identity label="Lot" value={execution.lotId} />
        <Identity label="PPID" value={execution.ppid} />
        <Identity label={ko ? '사이클타임' : 'Cycle time'} value={`${execution.cycleMin.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${ko ? '분' : 'min'}`} />
      </div>
    </Panel>

    <Panel title={ko ? '공정 타임라인' : 'Process timeline'} subtitle={ko
      ? 'XFR/FNC/PRC만 막대로 표시합니다. 빈 구간은 미분류이며 대기·불량으로 해석하지 않습니다.'
      : 'Only XFR/FNC/PRC are bars. Gaps are unclassified — not wait and not scrap.'}>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-text-secondary">
        {(['XFR', 'FNC', 'PRC'] as const).map(kind => <span key={kind} className="inline-flex items-center gap-1.5"><span aria-hidden className={`inline-block h-2 w-4 ${SEGMENT_CLASS[kind]}`} />{kind}</span>)}
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-4 bg-surface-sunken" />{ko ? '미분류' : 'Unclassified'}</span>
      </div>
      <div className="relative h-10 rounded-sm bg-surface-sunken" role="img" aria-label={ko ? '공정 구간 막대' : 'Process segment bars'}>
        {segments.map(segment => {
          const left = (secondsBetween(execution.startedAt, segment.start) / totalSec) * 100;
          const width = Math.max(0.8, (secondsBetween(segment.start, segment.end) / totalSec) * 100);
          // eslint-disable-next-line shadcn/no-inline-styles -- segment left/width are per-segment percentages computed at runtime
          return <div key={`${segment.kind}-${segment.start}`} title={`${segment.kind} ${segment.module}/${segment.slot} ${segment.durationMin}`} className={`absolute top-1 bottom-1 ${SEGMENT_CLASS[segment.kind]}`} style={{ left: `${left}%`, width: `${width}%` }} />;
        })}
      </div>
      <div className="mt-1 flex justify-between text-tiny text-text-muted tabular">
        <span>{execution.startedAt.replace('T', ' ')}</span>
        <span>{axisEnd.replace('T', ' ')}</span>
      </div>
      <p className="mt-2 text-xs text-text-muted">{ko
        ? '막대 위치는 초 단위 길이입니다. 시작 시각은 식별 키와 별도 필드에서 가져와 그대로 표시합니다. 정확한 값은 아래 표입니다.'
        : 'Bar positions use second lengths. The start time comes from a field separate from the identity key and is shown as is. Exact values are in the table below.'}</p>
    </Panel>

    <Panel title={ko ? '구간 표' : 'Segment table'} subtitle={ko ? '부모 occurrence는 위 식별 키입니다. 별도 조인 키를 만들지 않습니다.' : 'The parent occurrence is the identity above. No extra join key is invented.'}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-text-muted">
              {['', 'Module', 'Slot', ko ? '시작' : 'Start', ko ? '끝' : 'End', ko ? '길이 (분)' : 'Duration (min)'].map(label => <th key={label || 'kind'} title={label || (ko ? '구간' : 'Segment')} className={`t-table-header truncate whitespace-nowrap px-4 py-1.5 ${label.startsWith('길이') || label.startsWith('Duration') ? 'text-right' : ''}`}>{label || (ko ? '구간' : 'Segment')}</th>)}
            </tr>
          </thead>
          <tbody>
            {segments.map(segment => <tr key={`${segment.kind}-${segment.start}`} className="border-b border-border-subtle">
              <td className="px-4 py-1"><span className="t-mono">{segment.kind}</span></td>
              <td className="t-mono px-4 py-1">{segment.module}</td>
              <td className="t-mono px-4 py-1">{segment.slot}</td>
              <td className="t-mono px-4 py-1 tabular">{segment.start.replace('T', ' ')}</td>
              <td className="t-mono px-4 py-1 tabular">{segment.end.replace('T', ' ')}</td>
              <td className="px-4 py-1 text-right tabular">{segment.durationMin.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Panel>

    <Panel title={ko ? '품질 표시' : 'Quality'} subtitle={ko ? '데이터 신뢰와 다릅니다. 정상이나 불량으로 읽지 않습니다.' : 'Distinct from data trust. Do not read this as pass or fail.'}>
      {execution.quality === 'review'
        ? <StatusBadge tone="warning">{ko ? '검토 표시' : 'Review flag'}</StatusBadge>
        : <StatusBadge tone="neutral">{ko ? '미확정' : 'Unconfirmed'}</StatusBadge>}
      <p className="mt-2 text-xs text-text-muted">{ko
        ? '미확정은 값이 없다는 뜻이 아니라 판정 근거가 없다는 뜻입니다. 검토 표시는 수율·결함 수가 아닙니다.'
        : 'Unconfirmed means there is no judgment source, not a zero. A review flag is not a yield or defect count.'}</p>
    </Panel>

    <Panel title={ko ? '리니지' : 'Lineage'} subtitle={ko ? '논리 경로 예시입니다. 원천 경로와 지표 버전을 섞지 않습니다.' : 'An example logical path. The source path is not mixed with the metric version.'}>
      <p className="t-mono text-xs text-text-secondary">occurrence_directory → mart.productivity_hourly → execution-detail</p>
      <p className="mt-2 text-xs text-text-muted">{ko
        ? `식별 키 anchor ${execution.anchor}는 불투명한 값이며 시각으로 읽지 않습니다. 서버 envelope의 source는 프로토타입이 모든 조회에 찍는 값입니다.`
        : `The key anchor ${execution.anchor} is opaque and is not read as a time. The envelope source is the value this prototype stamps on every query.`}</p>
    </Panel>
  </div>;
}

function Identity({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-sm bg-surface-sunken px-3 py-2">
    <div className="text-xs text-text-muted">{label}</div>
    <div className="t-mono break-all text-sm">{value}</div>
  </div>;
}

function identityErrors(entityType: string | null, anchor: string | null, ko: boolean): string[] {
  const errors: string[] = [];
  if (!entityType) errors.push(ko ? '실행 종류가 주소에 없습니다. 목록에서 실행을 다시 여세요.' : 'The execution kind is missing from the address. Open the execution again from the list.');
  else if (!OCCURRENCE_ENTITY_TYPES.includes(entityType)) errors.push(ko ? '이 종류의 상세는 열 수 없습니다. 실행(job)만 열 수 있습니다.' : 'This kind of detail cannot be opened. Only an execution (job) can be opened.');
  if (!anchor) errors.push(ko ? '실행 키(anchor)가 없습니다. 목록에서 실행을 다시 여세요.' : 'The execution key (anchor) is missing. Open the execution again from the list.');
  else if (!isAnchor(anchor)) errors.push(ko ? '실행 키(anchor)의 형식이 올바르지 않습니다. 목록에서 실행을 다시 여세요.' : 'The execution key (anchor) is not in the expected form. Open the execution again from the list.');
  return errors;
}

function secondsBetween(from: string, to: string): number {
  return (parseDateTime(to, 'to').getTime() - parseDateTime(from, 'from').getTime()) / 1000;
}
