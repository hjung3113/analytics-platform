import { LineChart } from 'lucide-react';
import { useMemo } from 'react';
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
  /** Caption in the Frame's header line: what quantity the line is, when the title alone does not say. */
  description?: string;
  /** The least plot height, px; the Frame raises anything below 160 to 160. Default 160. */
  fillMin?: number;
};

/** The least trend plot height (the Frame's own floor): a short trend section fits with two rows open at 1280×800. */
const TREND_FILL_MIN = 160;

/** Daily line per row. No rows → an instruction, not a query. Free of layout. */
export function TrendPanel({ chartId, title, rowIds, query, level, description, fillMin = TREND_FILL_MIN }: TrendPanelProps) {
  const { lang } = useI18n();
  if (rowIds.length === 0) return <StateMessage compact icon={<LineChart className="size-4" aria-hidden />} title={lang === 'ko' ? '행을 추가하세요' : 'Add a row'}
    body={level === 0
      ? (lang === 'ko' ? 'Module을 골라 들어간 뒤 행을 추세에 추가하세요.' : 'Pick a Module to drill in, then add a row to the trend.')
      : (lang === 'ko' ? '상세 행을 골라 추세에 추가하세요.' : 'Pick a detail row and add it to the trend.')} />;
  return <QueryView query={query} widgetName={title} hideWidgetName skeletonRows={3} fill>
    {data => <TrendChart chartId={chartId} title={title} description={description} data={data} fillMin={fillMin} />}
  </QueryView>;
}

function TrendChart({ chartId, title, description, data, fillMin }: { chartId: string; title: string; description?: string; data: HwTimeTrendData; fillMin: number }) {
  const { lang } = useI18n();
  const series = useMemo(() => data.rows.map((row, index) => ({
    id: row.id, name: rowIdLabel(row.id), color: TREND_COLORS[index % TREND_COLORS.length]!, kind: 'line' as const,
    points: row.points.map(point => [point.at, point.value] as [string, number | null]),
  })), [data.rows]);
  return <div className="flex flex-1 flex-col">
    <AnalysisChartFrame emphasisFocus="none" chartId={chartId} title={title} description={description} xType="category" size="fill" fillMin={fillMin} series={series}
      unit={HW_TIME_UNIT[lang]} valueFormat={formatSeconds} canApplyRange={false} />
  </div>;
}
