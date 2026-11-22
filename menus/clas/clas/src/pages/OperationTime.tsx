import { formatWallClock, type GlobalContext, type Pair } from '@ap/contracts';
import { useCallback, useMemo } from 'react';
import { AlertTriangle, Clock, Cpu, Gauge } from 'lucide-react';
import { formatNumber } from '@ap/contracts';
import { formatSummaryTime, useI18n, useMenuQuery, usePlatform } from '@ap/kernel';
import { AnalysisChart, AnalysisLayout, DataTrustIndicator, LaneTimeline, PlatformPage, QueryView, RecoverButton, ReturnLink, StateMessage, StatCard, type TimelineLane } from '@ap/components';
import { operationTimeEndpoint, type OperationKind, type OperationTimeData } from '../endpoints';

const KIND_COLOR = { process: 'chart-series-1', transfer: 'chart-series-2', wait: 'chart-series-3' } as const;
const KIND_LABEL: Record<OperationKind, { ko: string; en: string }> = {
  process: { ko: '공정', en: 'Process' }, transfer: { ko: '이송', en: 'Transfer' }, wait: { ko: '대기', en: 'Wait' },
};
const ROOM_COLORS = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'] as const;


const EQUIPMENT_LABEL = { ko: '설비', en: 'Equipment' } as const;
/** The page value a query-history row shows (#2691): the picked equipment; no `eqp` (top of the ranking) adds nothing. */
export function operationTimeHistorySummary(page: readonly Pair[], lang: 'ko' | 'en') {
  const eqp = page.find(([key]) => key === 'eqp')?.[1];
  return eqp ? [{ key: 'eqp', label: EQUIPMENT_LABEL[lang], value: eqp }] : [];
}

export default function OperationTimeScreen() {
  const { pageParam } = usePlatform();
  const { lang } = useI18n();
  const historyPageSummary = useCallback((_global: GlobalContext, page: readonly Pair[]) => operationTimeHistorySummary(page, lang), [lang]);
  // keepPrevious ON (#1365, ADR-0114): picking another equipment re-reads the same period and Scope; the ranking and the flow title (from the data) stay until the new flow arrives.
  const query = useMenuQuery(operationTimeEndpoint, { eqp: pageParam('eqp') ?? '' }, { keepPrevious: true });
  // Opened from another screen's object list (06 §22, #1930): the way back to that screen.
  const returning = pageParam('returnTo') !== null;
  // Only query-history rows describe page values (#2691); the current summaries stay as they are.
  return <PlatformPage queryBarExtension={{ pageSummary: [], issues: [], historyPageSummary }} {...(returning ? { secondaryActions: <ReturnLink /> } : {})} dataTrustSummary={query.response ? <DataTrustIndicator trust={query.response.trust} assessments={query.response.assessments} /> : undefined}>
    <QueryView query={query}>{data => <OperationTimeBody data={data} updatedAt={query.response?.trust?.updatedAt ?? null} previousEquipment={query.showingPrevious ? acceptedEquipment(query.resultParams?.eqp, data.equipmentId) : null} />}</QueryView>
  </PlatformPage>;
}

// The data names the equipment it shows (no `eqp` picks the top of the ranking; a request outside the conditions shows none and the page says so, #2055), so the response's id wins and the accepted request only fills in when the response has none.
export function acceptedEquipment(eqp: string | undefined, dataEquipmentId: string | null | undefined): string { return dataEquipmentId || eqp || ''; }

// A long result scrolls the Kernel notice off screen, so the section that reads the accepted equipment says it again locally (no role: the Kernel notice announces).
export function PreviousEquipmentLine({ equipment }: { equipment: string | null }) {
  const { tx } = useI18n();
  if (equipment === null) return null;
  return <p className="px-1 text-xs text-text-secondary">{tx({ ko: `이전 설비(${equipment})의 결과 · 갱신 중`, en: `Result of the previous equipment (${equipment}) · refreshing` })}</p>;
}

function OperationTimeBody({ data, updatedAt, previousEquipment }: { data: OperationTimeData; updatedAt: string | null; previousEquipment: string | null }) {
  const { tx, lang } = useI18n();
  const { global, setPage } = usePlatform();
  const number = (value: number) => formatNumber(value, lang);
  // The shown equipment's own row joins the chart input only when it ranks below the response's cap (#2187).
  const chartRows = useMemo(() => data.equipmentRow ? [...data.ranking, data.equipmentRow] : data.ranking, [data.ranking, data.equipmentRow]);
  const rooms = useMemo(() => [...new Set(chartRows.map(row => row.room))], [chartRows]);
  const roomColor = (room: string) => ROOM_COLORS[rooms.indexOf(room) % ROOM_COLORS.length];
  const lanes = useMemo<TimelineLane[]>(() => data.lanes.map(lane => ({
    ...lane, segments: lane.segments.map(segment => ({ id: segment.id, start: segment.start, end: segment.end, colorToken: KIND_COLOR[segment.kind], rank: segment.kind })),
  })), [data.lanes]);
  const total = data.ranking.reduce((sum, row) => sum + row.minutes, 0);
  const topMinutes = data.ranking.length ? Math.max(...data.ranking.map(row => row.minutes)) : null;
  const leaders = topMinutes === null ? [] : data.ranking.filter(row => row.minutes === topMinutes).map(row => row.equipmentId).sort((a, b) => a.localeCompare(b));
  let leaderCaption = '—';
  if (leaders.length > 1) leaderCaption = tx({ ko: `공동 1위 ${leaders.length}대 · ${leaders.join(', ')}`, en: `Tied first, ${leaders.length} · ${leaders.join(', ')}` });
  else if (leaders.length === 1) leaderCaption = tx({ ko: `최장 ${leaders[0]}`, en: `Longest ${leaders[0]}` });
  const minutes = tx({ ko: '분', en: 'min' });
  const period = `${tx({ ko: '합성 데이터', en: 'Synthetic data' })} · ${formatWallClock(global.from)} – ${formatWallClock(global.to)}`;
  const updated = formatSummaryTime(updatedAt, lang);
  const trust = { source: tx({ ko: '합성 데이터', en: 'Synthetic data' }), updated, coverage: tx({ ko: '견본 데이터', en: 'Sample data' }) };
  const flowTitle = `${data.equipmentId ?? ''} ${tx({ ko: '모듈별 동작 흐름', en: 'operation flow by module' })}`.trim();
  return <AnalysisLayout
    kpi={{ id: 'summary', title: tx({ ko: '동작시간 요약', en: 'Operation time summary' }), node: <div className="grid grid-cols-1 gap-3 @min-[720px]/analysis:grid-cols-3">
      <StatCard icon={Cpu} chip="blue" label={tx({ ko: '집계 설비', en: 'Equipment ranked' })} value={number(data.ranking.length)} caption={tx({ ko: '동작시간 상위 30대까지', en: 'Up to the top 30' })} />
      <StatCard icon={Clock} chip="teal" label={tx({ ko: '총 동작시간', en: 'Total operation time' })} value={number(total)} unit={minutes} caption={tx({ ko: '집계 설비 합계', en: 'Sum over ranked equipment' })} />
      <StatCard icon={Gauge} chip="blue" label={tx({ ko: '설비당 평균', en: 'Average per equipment' })} value={number(data.ranking.length ? Math.round(total / data.ranking.length) : 0)} unit={minutes} caption={<span className="break-keep">{leaderCaption}</span>} />
    </div> }}
    charts={[
      { id: 'ranking', title: tx({ ko: '설비별 동작시간', en: 'Operation time by equipment' }), node: <AnalysisChart chartId="clas-operation-ranking"
        title={tx({ ko: '설비별 동작시간', en: 'Operation time by equipment' })} description={period}
        metricVersion="synthetic v1" unit={minutes} size="hero" height={360} trust={trust}
        spec={{ kind: 'topNBar', topN: 10, defaultExpanded: true, onItemClick: id => setPage({ eqp: id }), selectedId: data.equipmentId,
          items: chartRows.map(row => ({ id: row.equipmentId, label: row.equipmentId, value: row.minutes, colorToken: roomColor(row.room) })),
          legend: rooms.map(room => ({ label: room, colorToken: roomColor(room) })) }} /> },
    ]}
    breakdown={{ id: 'flow', title: flowTitle, node: data.missingEquipment !== null
      ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />} title={tx({ ko: `요청한 설비 ${data.missingEquipment}는 현재 Scope·room 조건에 없습니다`, en: `The requested equipment ${data.missingEquipment} is not in the current Scope and room conditions` })}
          body={tx({ ko: '다른 설비로 바꿔 그리지 않습니다. 설비 선택을 지우면 순위 1위 설비의 흐름을 봅니다.', en: 'No other equipment is drawn in its place. Clear the selection to see the flow of the top-ranked equipment.' })}
          action={<RecoverButton onRecover={() => setPage({ eqp: null })} label={tx({ ko: '설비 선택 지우기', en: 'Clear equipment selection' })} />} />
      : <div className="space-y-2">
        <PreviousEquipmentLine equipment={previousEquipment} />
        <LaneTimeline key={data.equipmentId} lanes={lanes} ariaLabel={flowTitle} description={period} trust={trust} height={320}
          formatTooltip={(segment, lane) => `${lane.label} · ${tx(KIND_LABEL[segment.rank as OperationKind])}`} />
        <ul aria-label={tx({ ko: '동작 종류', en: 'Operation kinds' })} className="flex flex-wrap gap-3 px-1 text-xs text-text-secondary">
          {(Object.keys(KIND_LABEL) as OperationKind[]).map(kind => <li key={kind} className="flex items-center gap-1">
            <span aria-hidden className={`size-2.5 rounded-sm ${SWATCH[kind]}`} />{tx(KIND_LABEL[kind])}
          </li>)}
        </ul>
      </div> }}
  />;
}

const SWATCH: Record<OperationKind, string> = { process: 'bg-chart-series-1', transfer: 'bg-chart-series-2', wait: 'bg-chart-series-3' };
