import { useMemo } from 'react';
import { QueryView } from '@ap/components';
import { isRecord } from '@ap/contracts';
import { useI18n, useMenuQuery, useMessages, type LentPanelProps } from '@ap/kernel';
import { hwTimeOverview, type HwTimeRunQueryParams, type HwTimeRuns } from '../../endpoints';
import { HW_TIME_NEW_PANEL_MESSAGES, HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import { LENT_EQUIPMENT_LABELS } from '../../panels';
import { readLentTrendInputs } from './lentTrendInputs';
import { RunTrendChart } from './RunTrendChart';
import { DEFAULT_RUN_TREND_SETTINGS, shapeRunTrend } from './runTrendData';

function DailyTrend({ daily, requested, equipmentLabels }: { daily: HwTimeRuns['daily']; requested: number; equipmentLabels: ReadonlyMap<string, string> }) {
  const { lang } = useI18n();
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const panel = useMessages(HW_TIME_NEW_PANEL_MESSAGES);
  const trend = useMemo(() => shapeRunTrend(daily, DEFAULT_RUN_TREND_SETTINGS, [], lang, { sharedBounds: true, equipmentLabels }), [daily, equipmentLabels, lang]);
  const returned = trend.series.length;
  return <>
    {returned < requested && <p className="t-caption shrink-0 px-4 text-text-secondary">{panel('lentEquipmentCoverage', { requested, returned })}</p>}
    {trend.categories.length < 2 ? <p className="t-caption px-4 text-text-secondary">{m('trendNeedsDays')}</p>
      : <RunTrendChart chartId="hw-time-lent-trend" trend={trend} description={m('synthetic')} />}
  </>;
}

export default function LentTrendPanel({ inputs, actions }: LentPanelProps) {
  const result = readLentTrendInputs(inputs);
  if ('missing' in result) return null;
  const labels = inputs.display?.[LENT_EQUIPMENT_LABELS];
  const equipmentLabels = new Map<string, string>();
  if (isRecord(labels)) {
    for (const id of inputs.context.selection ?? []) {
      const label = Object.hasOwn(labels, id) ? labels[id] : undefined;
      if (typeof label === 'string' && label.trim()) equipmentLabels.set(id, label);
    }
  }
  return <BoundTrend params={result.params} equipmentLabels={equipmentLabels} actions={actions} />;
}

function BoundTrend({ params, equipmentLabels, actions }: { params: HwTimeRunQueryParams; equipmentLabels: ReadonlyMap<string, string>; actions?: LentPanelProps['actions'] }) {
  const query = useMenuQuery(hwTimeOverview.runs, params);
  const m = useMessages(HW_TIME_NEW_PANEL_MESSAGES);
  const title = m('dailyRuns', { module: params.drillModule, motion: params.drillMotion });

  return <section aria-label={title} className="flex h-full min-h-0 min-w-0 flex-col overflow-auto break-keep">
    <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2">
      <h3 className="t-card-title min-w-0 flex-1 truncate" title={title}>{title}</h3>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
    <div className="flex min-h-0 flex-1 flex-col">
      <QueryView fill query={query}>{data => <DailyTrend daily={data.daily} equipmentLabels={equipmentLabels} requested={params.equipmentIds?.length ?? 1} />}</QueryView>
    </div>
  </section>;
}
