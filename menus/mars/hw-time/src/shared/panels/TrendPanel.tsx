import { useMessages } from '@ap/kernel';
import { HW_TIME_MESSAGES } from '../../messages';
import { LineChart } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n, usePlatform, type QueryState } from '@ap/kernel';
import { AnalysisChartFrame, QueryView, StateMessage } from '@ap/components';
import { Button } from '@ap/ui';
import type { ThemeColorToken } from '@ap/ui/theme';
import { HW_TIME_UNIT, type HwTimeTrendData } from '../../endpoints';
import { formatSeconds, rowIdLabel } from '../format';

const TREND_COLORS: ThemeColorToken[] = ['chart-blue', 'chart-teal', 'chart-series-3', 'chart-series-1', 'cat-amber', 'chart-series-2', 'chart-green', 'chart-series-4'];

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
  const m = useMessages(HW_TIME_MESSAGES);
  const { setPage } = usePlatform();
  const response = query.response;
  const missing = !query.showingPrevious && response && (response.outcome === 'ok' || response.outcome === 'empty') && response.data
    ? rowIds.filter(id => !response.data!.rows.some(row => row.id === id)) : [];
  if (rowIds.length === 0) return <StateMessage compact icon={<LineChart className="size-4" aria-hidden />} title={m('trendPanelAddARow')}
    body={level === 0
      ? (m('trendPanelPickAModuleToDrillInThen'))
      : (m('trendPanelPickADetailRowAndAddIt'))} />;
  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    {missing.length > 0 && <div role="status" className="text-sm text-text-secondary"><p>{m('trendPanelRowsOutsideScope')}</p>
      {missing.map(id => <div key={id} className="flex items-center gap-2"><span>{rowIdLabel(id)}</span><Button variant="secondary" size="sm" aria-label={m('trendPanelRemoveRowFromTrend', { row: rowIdLabel(id) })} onClick={() => setPage({ trend: rowIds.filter(row => row !== id).join(',') || null })}>{m('trendPanelRemove')}</Button></div>)}
    </div>}
    <QueryView query={query} widgetName={title} hideWidgetName skeletonRows={3} fill>
    {data => <TrendChart chartId={chartId} title={title} description={description} data={data} fillMin={fillMin} />}
  </QueryView></div>;
}

function TrendChart({ chartId, title, description, data, fillMin }: { chartId: string; title: string; description?: string; data: HwTimeTrendData; fillMin: number }) {
  const { lang } = useI18n();
  const series = useMemo(() => data.rows.map((row, index) => ({
    id: row.id, name: rowIdLabel(row.id), color: TREND_COLORS[index % TREND_COLORS.length]!, kind: 'line' as const,
    points: row.points.map(point => [point.at, point.value] as [string, number | null]),
  })), [data.rows]);
  return <div className="flex flex-1 flex-col">
    <AnalysisChartFrame emphasisFocus="none" chartId={chartId} title={title} description={description} xType="category" size="fill" fillMin={fillMin} series={series}
      unit={HW_TIME_UNIT[lang]} valueFormat={value => formatSeconds(value, lang)} canApplyRange={false} />
  </div>;
}
