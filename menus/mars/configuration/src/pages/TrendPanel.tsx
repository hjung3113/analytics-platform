import { useMemo } from 'react';
import { X } from 'lucide-react';
import { formatWallClock } from '@ap/contracts';
import { useMenuQuery, useMessages, useQueryContext } from '@ap/kernel';
import { AnalysisChartFrame, LaneTimeline, QueryView, type ChartSeries } from '@ap/components';
import { Button, EmptyState } from '@ap/ui';
import { configurationHistoryEndpoint, historyPeriod, type CompareParams, type ConfigHistory } from '../endpoints';
import { MESSAGES } from '../messages';
import type { Message } from './comparison';
import { historyColors, historyPoints, MISSING, NEUTRAL, REFERENCE, timelineModel, trendSwatches } from './trend-model';

const TREND_TICK_SPACING = 72;
const TREND_CHART_MIN = 200;

type Period = NonNullable<ReturnType<typeof historyPeriod>>;
type LegendEntry = { value: string; color: keyof typeof trendSwatches };

function TrendLegend({ entries, m }: { entries: LegendEntry[]; m: Message }) {
  return <span className="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label={m('trendLegend')}>
    {entries.map(({ value, color }) => <span key={value} className="inline-flex items-center gap-1">
      <span className={`size-2 rounded-sm ${trendSwatches[color]}`} aria-hidden />{value}
    </span>)}
  </span>;
}

function NumericTrend({ history, itemId, period, reference, trust, m }: {
  history: ConfigHistory; itemId: string; period: Period; reference?: string; trust: Parameters<typeof AnalysisChartFrame>[0]['trust']; m: Message;
}) {
  const colors = historyColors(history, reference);
  const order = { [NEUTRAL]: 0, [REFERENCE]: 2 };
  const rank = (color: keyof typeof trendSwatches) => color === NEUTRAL || color === REFERENCE ? order[color] : 1;
  const equipmentLabel = (id: string) => id === reference ? `${id} · ${m('reference')}` : id;
  const lines = history.series.map(({ equipment, points }) => ({
    id: equipment, name: equipmentLabel(equipment), color: colors.get(equipment)!, points: historyPoints(points, period.to),
    kind: 'line', step: 'end',
  } satisfies ChartSeries)).sort((a, b) => rank(a.color) - rank(b.color));
  const count = lines.filter(line => line.color === NEUTRAL).length;
  const legend: LegendEntry[] = lines.filter(line => line.color !== NEUTRAL).map(line => ({ value: line.name, color: line.color }));
  if (count > 0) legend.unshift({ value: m('trendRemainder', { count }), color: NEUTRAL });
  return <div className="flex min-h-0 flex-1 flex-col" data-configuration-numeric>
    <AnalysisChartFrame chartId={`configuration-trend-${itemId}`} title={m('values')} unit="" series={lines}
      yFit xType="time" period={period} size="fill" fillMin={TREND_CHART_MIN} summary="quiet" zoomOnly
      legend={false} legendCaption={<TrendLegend entries={legend} m={m} />} visibleSeriesIds={lines.map(line => line.id)} trust={trust} />
  </div>;
}

function HistoryChart({ history, itemId, period, reference, trust, m }: Parameters<typeof NumericTrend>[0]) {
  const referenceLabel = m('reference');
  const { to } = period;
  const timeline = useMemo(() => history.valueType === 'string' ? timelineModel(history, to, reference, referenceLabel) : null,
    [history, to, reference, referenceLabel]);
  if (!timeline) return <NumericTrend {...{ history, itemId, period, reference, trust, m }} />;
  const { lanes, values, labels, hasMissing } = timeline;
  const legend: LegendEntry[] = hasMissing ? [...values, { value: m('missing'), color: MISSING }] : values;
  return <LaneTimeline quiet separateRows tickSpacing={TREND_TICK_SPACING} description={<TrendLegend entries={legend} m={m} />}
    ariaLabel={m('values')} lanes={lanes} neutralColorToken={MISSING} trust={trust}
    formatTooltip={segment => labels.get(segment.id) ?? m('missing')} formatState={segment => labels.get(segment.id) ?? m('missing')} />;
}

/** A successful history result covers exactly the applied equipment and the entire period. */
function validHistory(data: ConfigHistory, equipment: readonly string[], period: Period) {
  if (typeof data?.item !== 'string' || !data.item || (data.valueType !== 'number' && data.valueType !== 'string') || !Array.isArray(data.series)) return false;
  const ids = new Set(data.series.map(series => series?.equipment));
  if (data.series.length !== equipment.length || ids.size !== equipment.length || !equipment.every(eq => ids.has(eq))) return false;
  return data.series.every(({ points }) => {
    if (!Array.isArray(points) || !points.length) return false;
    let previous = period.start - 1;
    return points.every((point, index) => {
      if (typeof point?.at !== 'string') return false;
      const at = Date.parse(point.at);
      const valid = at > previous && at < period.end && (index !== 0 || at === period.start)
        && (point.value === null || (typeof point.value === data.valueType && (typeof point.value !== 'number' || Number.isFinite(point.value))));
      previous = at;
      return valid;
    });
  });
}

export function TrendPanel({ itemId, params, close }: { itemId: string; params: CompareParams; close: () => void }) {
  const m = useMessages(MESSAGES);
  const period = historyPeriod(useQueryContext());
  const query = useMenuQuery(configurationHistoryEndpoint, { itemId, equipment: params.eq }, { enabled: period !== null });
  const trust = query.response?.trust;
  const reference = params.mode === 'reference' ? params.ref : undefined;
  return <div className="flex h-full min-h-0 min-w-0 flex-col overflow-auto break-keep" data-configuration-trend>
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-2">
      <div className="min-w-0">
        {query.response?.data && typeof query.response.data.item === 'string' && <h2 className="t-card-title">{query.response.data.item}</h2>}
        {period && <p className="t-caption tabular text-text-secondary">{formatWallClock(period.from, 'minute')} → {formatWallClock(period.to, 'minute')}</p>}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={m('closeTrend')} onClick={close}><X aria-hidden /></Button>
    </div>
    <QueryView query={query} fill>{history => period && validHistory(history, params.eq, period)
      ? <HistoryChart {...{ history, itemId, period, reference, trust, m }} />
      : <EmptyState title={m('invalidHistory')} />}</QueryView>
  </div>;
}
