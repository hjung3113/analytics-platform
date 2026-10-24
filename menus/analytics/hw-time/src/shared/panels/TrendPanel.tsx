import { LineChart } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n, type QueryState } from '@ap/kernel';
import { AnalysisChartFrame, QueryView, StateMessage } from '@ap/components';
import type { ThemeColorToken } from '@ap/ui/theme';
import { HW_TIME_UNIT, type HwTimeTrendData } from '../../endpoints';
import { formatSeconds } from '../format';

const TREND_COLORS: ThemeColorToken[] = ['chart-blue', 'chart-teal', 'chart-purple', 'chart-series-1', 'cat-amber', 'chart-series-2', 'chart-series-3', 'chart-series-4'];

export type TrendPanelProps = {
  chartId: string;
  title: string;
  rowIds: readonly string[];
  query: QueryState<HwTimeTrendData>;
};

/** Daily line per row. No rows → an instruction, not a query. Free of layout. */
export function TrendPanel({ chartId, title, rowIds, query }: TrendPanelProps) {
  const { lang } = useI18n();
  if (rowIds.length === 0) return <StateMessage compact icon={<LineChart className="size-4" aria-hidden />} title={lang === 'ko' ? '행을 추가하세요' : 'Add a row'}
    body={lang === 'ko' ? '막대를 고른 뒤 “추세에 추가”를 실행하면 이 행의 일별 추세가 여기에 나옵니다.' : 'Select a bar and run “Add to trend” to see that row’s daily trend here.'} />;
  return <QueryView query={query} widgetName={title} hideWidgetName skeletonRows={3}>
    {data => <TrendChart chartId={chartId} title={title} data={data} />}
  </QueryView>;
}

function TrendChart({ chartId, title, data }: { chartId: string; title: string; data: HwTimeTrendData }) {
  const { lang } = useI18n();
  const series = useMemo(() => data.rows.map((row, index) => ({
    id: row.id, name: row.id, color: TREND_COLORS[index % TREND_COLORS.length]!, kind: 'line' as const,
    points: row.points.map(point => [point.at, point.value] as [string, number | null]),
  })), [data.rows]);
  return <AnalysisChartFrame chartId={chartId} title={title} xType="category" size="fill" series={series}
    unit={HW_TIME_UNIT[lang]} valueFormat={formatSeconds} canApplyRange={false} />;
}
