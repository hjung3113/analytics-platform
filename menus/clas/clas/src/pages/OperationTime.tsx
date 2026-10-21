import { useMemo } from 'react';
import { Clock, Cpu, Gauge } from 'lucide-react';
import { useI18n, useMenuQuery, usePlatform } from '@ap/kernel';
import { AnalysisChart, AnalysisLayout, DataTrustIndicator, LaneTimeline, PlatformPage, QueryView, StatCard, type TimelineLane } from '@ap/components';
import { operationTimeEndpoint, type OperationKind, type OperationTimeData } from '../endpoints';

const KIND_COLOR = { process: 'chart-series-1', transfer: 'chart-series-2', wait: 'chart-series-3' } as const;
const KIND_LABEL: Record<OperationKind, { ko: string; en: string }> = {
  process: { ko: '공정', en: 'Process' }, transfer: { ko: '이송', en: 'Transfer' }, wait: { ko: '대기', en: 'Wait' },
};
const ROOM_COLORS = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'] as const;

// Same wall-clock display convention as the analytics sample menus.
const displayTime = (value: string | null) => (value ?? '').replace('T', ' ');

export default function OperationTimeScreen() {
  const { pageParam } = usePlatform();
  const query = useMenuQuery(operationTimeEndpoint, { eqp: pageParam('eqp') ?? '' });
  return <PlatformPage dataTrustSummary={query.response ? <DataTrustIndicator trust={query.response.trust} assessments={query.response.assessments} /> : undefined}>
    <QueryView query={query}>{data => <OperationTimeBody data={data} />}</QueryView>
  </PlatformPage>;
}

function OperationTimeBody({ data }: { data: OperationTimeData }) {
  const { tx, lang } = useI18n();
  const { global, setPage } = usePlatform();
  const ko = lang === 'ko';
  const number = (value: number) => value.toLocaleString(ko ? 'ko-KR' : 'en-US');
  const rooms = useMemo(() => [...new Set(data.ranking.map(row => row.room))], [data.ranking]);
  const roomColor = (room: string) => ROOM_COLORS[rooms.indexOf(room) % ROOM_COLORS.length];
  const lanes = useMemo<TimelineLane[]>(() => data.lanes.map(lane => ({
    ...lane, segments: lane.segments.map(segment => ({ id: segment.id, start: segment.start, end: segment.end, colorToken: KIND_COLOR[segment.kind], rank: segment.kind })),
  })), [data.lanes]);
  const total = data.ranking.reduce((sum, row) => sum + row.minutes, 0);
  const top = data.ranking[0];
  const period = `${tx({ ko: '합성 데이터', en: 'Synthetic data' })} · ${displayTime(global.from)} – ${displayTime(global.to)}`;
  const trust = { source: tx({ ko: '합성 데이터', en: 'Synthetic data' }), updated: displayTime(global.to), coverage: tx({ ko: '견본 데이터', en: 'Sample data' }) };
  const flowTitle = `${data.equipmentId ?? ''} ${tx({ ko: '모듈별 동작 흐름', en: 'operation flow by module' })}`;
  return <AnalysisLayout
    kpi={{ id: 'summary', title: tx({ ko: '동작시간 요약', en: 'Operation time summary' }), node: <div className="grid grid-cols-1 gap-3 @min-[720px]/analysis:grid-cols-3">
      <StatCard icon={Cpu} chip="blue" label={tx({ ko: '집계 설비', en: 'Equipment ranked' })} value={number(data.ranking.length)} caption={tx({ ko: '동작시간 상위 30대까지', en: 'Up to the top 30' })} />
      <StatCard icon={Clock} chip="teal" label={tx({ ko: '총 동작시간', en: 'Total operation time' })} value={number(Math.round(total / 60))} unit={tx({ ko: '시간', en: 'h' })} caption={tx({ ko: '집계 설비 합계', en: 'Sum over ranked equipment' })} />
      <StatCard icon={Gauge} chip="amber" label={tx({ ko: '설비당 평균', en: 'Average per equipment' })} value={number(Math.round(total / data.ranking.length / 6) / 10)} unit={tx({ ko: '시간', en: 'h' })} caption={`${tx({ ko: '최장', en: 'Longest' })} ${top.equipmentId}`} />
    </div> }}
    charts={[
      { id: 'ranking', title: tx({ ko: '설비별 동작시간', en: 'Operation time by equipment' }), node: <AnalysisChart chartId="clas-operation-ranking"
        title={tx({ ko: '설비별 동작시간', en: 'Operation time by equipment' })} description={period}
        metricVersion="synthetic v1" unit={tx({ ko: '분', en: 'min' })} size="hero" height={360} trust={trust}
        spec={{ kind: 'topNBar', topN: 10, defaultExpanded: true, onItemClick: id => setPage({ eqp: id }),
          items: data.ranking.map(row => ({ id: row.equipmentId, label: row.equipmentId, value: row.minutes, colorToken: roomColor(row.room) })),
          legend: rooms.map(room => ({ label: room, colorToken: roomColor(room) })) }} /> },
    ]}
    breakdown={{ id: 'flow', title: flowTitle, node: <div className="space-y-2">
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
