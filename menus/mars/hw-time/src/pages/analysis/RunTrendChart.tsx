import { useCallback, type ReactNode } from 'react';
import { AnalysisChartFrame, type ChartPoint } from '@ap/components';
import { useI18n, useMessages } from '@ap/kernel';
import { HW_TIME_UNIT } from '../../endpoints';
import { HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import { formatSeconds } from '../../shared/format';
import { htmEmphasisStatus } from '../../shared/htm';
import type { shapeRunTrend } from './runTrendData';

/** Lowest plot height before the panel body scrolls (px). */
const RUN_FILL_MIN = 200;

export function RunTrendChart({ chartId, trend, description, activeCategory, toolbarStart }: {
  chartId: string;
  trend: ReturnType<typeof shapeRunTrend>;
  description: string;
  activeCategory?: string | null;
  toolbarStart?: ReactNode;
}) {
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const { lang } = useI18n();
  const pointStatus = useCallback((point: ChartPoint) => htmEmphasisStatus(trend.pointStatusOf(point)), [trend]);
  return <AnalysisChartFrame summary="quiet" legendPlacement="side" toolsReveal="hover" description={description} chartId={chartId}
    toolbarStart={toolbarStart} title={m('trend')} series={trend.series} xType="category" unit={HW_TIME_UNIT[lang]}
    valueFormat={value => formatSeconds(value, lang)} size="fill" fillMin={RUN_FILL_MIN}
    emphasisFocus="none" canApplyRange={false} activeCategory={activeCategory} pointStatus={pointStatus}
    bounds={trend.bounds.size ? trend.bounds : undefined} boundLabels={trend.boundLabels} />;
}
