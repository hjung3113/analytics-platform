import { useMemo } from 'react';
import { QueryView } from '@ap/components';
import { useI18n, useMenuQuery, useMessages, type LentPanelProps } from '@ap/kernel';
import { hwTimeOverview, type HwTimeRunQueryParams, type HwTimeRuns } from '../../endpoints';
import { HW_TIME_NEW_PANEL_MESSAGES, HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import { readLentTrendInputs } from './lentTrendInputs';
import { RunTrendChart } from './RunTrendChart';
import { DEFAULT_RUN_TREND_SETTINGS, shapeRunTrend } from './runTrendData';

function DailyTrend({ daily }: { daily: HwTimeRuns['daily'] }) {
  const { lang } = useI18n();
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const trend = useMemo(() => shapeRunTrend(daily, DEFAULT_RUN_TREND_SETTINGS, [], lang), [daily, lang]);
  if (trend.categories.length < 2) return <p className="t-caption px-4 text-text-secondary">{m('trendNeedsDays')}</p>;
  return <RunTrendChart chartId="hw-time-lent-trend" trend={trend} description={m('synthetic')} />;
}

export default function LentTrendPanel({ inputs, actions }: LentPanelProps) {
  const result = readLentTrendInputs(inputs);
  if ('missing' in result) return null;
  return <BoundTrend params={result.params} actions={actions} />;
}

function BoundTrend({ params, actions }: { params: HwTimeRunQueryParams; actions?: LentPanelProps['actions'] }) {
  const query = useMenuQuery(hwTimeOverview.runs, params);
  const m = useMessages(HW_TIME_NEW_PANEL_MESSAGES);
  const title = m('dailyRuns', { module: params.drillModule, motion: params.drillMotion });

  return <section aria-label={title} className="flex h-full min-h-0 min-w-0 flex-col overflow-auto break-keep">
    <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2">
      <h3 className="t-card-title min-w-0 flex-1 truncate" title={title}>{title}</h3>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
    <div className="flex min-h-0 flex-1 flex-col">
      <QueryView fill query={query}>{data => <DailyTrend daily={data.daily} />}</QueryView>
    </div>
  </section>;
}
