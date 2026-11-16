import { AnalysisChart, AuditTimeline, QueryView } from '@ap/components';
import { formatText, useI18n, useMenuQuery, useMessages, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { HTM_STATUSES, HW_TIME_UNIT, hwTimeOverview, verdictCodec, type HtmStatus, type HwTimeMatrix, type HwTimePanelParams } from '../../endpoints';
import { HW_TIME_NEW_PANEL_MESSAGES as N, HW_TIME_OVERVIEW_MESSAGES as O } from '../../messages';
import { formatSeconds } from '../../shared/format';
import type { HwTimeFilter } from '../../shared/useHwTimeFilter';
import { paretoItems, VERDICT_CATEGORIES, verdictCounts, verdictEmphasis } from './newPanelData';
import { runColor } from './runScatterData';

export function VerdictDonut({ matrices, filter, verdict }: { matrices: readonly HwTimeMatrix[]; filter: HwTimeFilter; verdict: HtmStatus | null }) {
  const m = useMessages(N);
  const { setPage } = usePlatform();
  const counts = verdictCounts(matrices, filter.selectionFor);
  // The SDK fits the ring and owns its readable minimum; the panel scrolls only below that minimum.
  return <div className="flex h-full min-h-0 flex-col overflow-auto">
    {verdict && <div className="flex shrink-0 flex-wrap items-center gap-2 px-2 py-1">
      <Button size="toolbar" variant="ghost" onClick={() => setPage({ verdict: null })}>{m('verdict')}: {m(verdict)} ×</Button>
    </div>}<div className="flex min-h-0 flex-1 flex-col">
    <AnalysisChart chartId="hw-verdict-donut" title={m('donut')} unit={m('count')} size="fill" description={m('population')}
    spec={{ kind: 'donut', maxSlices: HTM_STATUSES.length, centerLabel: m('all'), selectedId: verdict,
      slices: HTM_STATUSES.map(id => ({ id, label: m(id), value: counts[id], color: runColor(id, 0, 'status') })),
      onSliceClick: raw => { const next = verdictCodec.decode(raw); if (next) setPage({ verdict: next === verdict ? null : next }); } }} />
  </div></div>;
}
export function ParetoPanel({ matrices, filter }: { matrices: readonly HwTimeMatrix[]; filter: HwTimeFilter }) {
  const m = useMessages(N);
  const items = paretoItems(matrices, filter.selectionFor);
  return <div className="flex h-full min-h-0 flex-col">
    <AnalysisChart chartId="hw-pareto" title={m('pareto')} unit={m('count')} size="fill" description={m('paretoNote')}
      spec={{ kind: 'pareto', items, maxItems: Math.max(1, items.length) }} />
  </div>;
}
export function EquipmentDaysPanel({ input, verdict, date }: { input: HwTimePanelParams; verdict: HtmStatus | null; date: string | null }) {
  const m = useMessages(N);
  const { lang } = useI18n();
  const { setPage } = usePlatform();
  const query = useMenuQuery(hwTimeOverview.equipmentDays, input);
  return <div className="flex h-full min-h-0 flex-col">
    {date && <div className="shrink-0 px-2 py-1"><Button size="toolbar" variant="ghost" onClick={() => setPage({ date: null })}>{m('date')}: {date.slice(5)} ×</Button></div>}
    <QueryView fill query={query}>{data => <AnalysisChart chartId="hw-equipment-days" title={m('equipmentDays')} unit={HW_TIME_UNIT[lang]} size="fill"
    spec={{ kind: 'heatmap', minRowHeight: 24, statusDisplay: 'border', categories: VERDICT_CATEGORIES, xLabels: [...new Set(data.rows.map(row => row.date))].sort(), yLabels: [...new Set(data.rows.map(row => row.equipmentId))],
      cells: data.rows.map(row => ({ x: row.date, y: row.equipmentId, value: row.judgement.value, category: row.judgement.status, status: verdictEmphasis(row.judgement, verdict, lang) })),
      valueFormat: value => formatSeconds(value, lang), cellActivation: { on: 'click', onActivate: next => setPage({ date: next === date ? null : next }) } }} />}</QueryView></div>;
}
export function BoundHistoryPanel({ input }: { input: HwTimePanelParams }) {
  const m = useMessages(N);
  const { lang } = useI18n();
  const query = useMenuQuery(hwTimeOverview.boundHistory, input);
  const seconds = (value: unknown) => {
    if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return String(value ?? '—');
    const number = Number(value);
    return Number.isFinite(number) ? `${formatSeconds(number, lang)} ${HW_TIME_UNIT[lang]}` : String(value);
  };
  return <QueryView fill query={query}>{events => <section aria-label={m('syntheticHistory')}><AuditTimeline events={events}
    fields={{ upper: { label: O.upper, format: seconds }, lower: { label: O.lower, format: seconds } }}
    actorName={actor => { const name = events.find(event => event.actor === actor && event.actorName)?.actorName; return name ? formatText(name, lang) : undefined; }} /></section>}</QueryView>;
}
