import { LineChart } from 'lucide-react';
import { useLayoutEffect, useMemo, useState } from 'react';
import { useI18n, type QueryState } from '@ap/kernel';
import { AnalysisChartFrame, QueryView, StateMessage } from '@ap/components';
import type { ThemeColorToken } from '@ap/ui/theme';
import { HW_TIME_UNIT, type HwTimeTrendData } from '../../endpoints';
import { formatSeconds, rowIdLabel } from '../format';

const TREND_COLORS: ThemeColorToken[] = ['chart-blue', 'chart-teal', 'chart-purple', 'chart-series-1', 'cat-amber', 'chart-series-2', 'chart-series-3', 'chart-series-4'];

export type TrendPanelProps = {
  chartId: string;
  title: string;
  rowIds: readonly string[];
  query: QueryState<HwTimeTrendData>;
  /** Drill level of the page (0 = Module list): the empty-state hint depends on where the rows can be picked. */
  level: number;
};

/** Header, legend and summary lines the Frame draws around its plot, px (the SDK `fill` size cannot go under 320 px, which a short trend section cannot give). */
const FRAME_CHROME = 104;
const MIN_PLOT = 120;

/** Daily line per row. No rows → an instruction, not a query. Free of layout. */
export function TrendPanel({ chartId, title, rowIds, query, level }: TrendPanelProps) {
  const { lang } = useI18n();
  if (rowIds.length === 0) return <StateMessage compact icon={<LineChart className="size-4" aria-hidden />} title={lang === 'ko' ? '행을 추가하세요' : 'Add a row'}
    body={level === 0
      ? (lang === 'ko' ? 'Module을 골라 들어간 뒤 행을 추세에 추가하세요.' : 'Pick a Module to drill in, then add a row to the trend.')
      : (lang === 'ko' ? '상세 행을 골라 추세에 추가하세요.' : 'Pick a detail row and add it to the trend.')} />;
  return <QueryView query={query} widgetName={title} hideWidgetName skeletonRows={3} fill>
    {data => <TrendChart chartId={chartId} title={title} data={data} />}
  </QueryView>;
}

function TrendChart({ chartId, title, data }: { chartId: string; title: string; data: HwTimeTrendData }) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!box) return;
    const measure = () => setAvailable(box.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);
  const { lang } = useI18n();
  const series = useMemo(() => data.rows.map((row, index) => ({
    id: row.id, name: rowIdLabel(row.id), color: TREND_COLORS[index % TREND_COLORS.length]!, kind: 'line' as const,
    points: row.points.map(point => [point.at, point.value] as [string, number | null]),
  })), [data.rows]);
  return <div ref={setBox} className="min-h-0 flex-1 overflow-hidden">
    <AnalysisChartFrame chartId={chartId} title={title} xType="category" size="compact" height={Math.max(MIN_PLOT, (available ?? 0) - FRAME_CHROME)} series={series}
      unit={HW_TIME_UNIT[lang]} valueFormat={formatSeconds} canApplyRange={false} />
  </div>;
}
