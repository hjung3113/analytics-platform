import { useMessages, useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { ADMIN_MESSAGES } from '../messages';
import { useId, useState } from 'react';
import { Inbox, Shield } from 'lucide-react';
import { formatNumber, type UsageNextScreens as NextScreens, type UsageVia } from '@ap/contracts';
import { QueryView, StateMessage } from '@ap/components';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';

// Fixed bar/legend order. Direct entry is not a movement; all other ungrouped ways belong to Other.
const GROUPS = [
  { ...ADMIN_MESSAGES.usageNextScreensMenuNavigation, color: 'var(--color-chart-series-1)', swatch: 'bg-chart-series-1', vias: ['sidebar', 'switcher'] },
  { ...ADMIN_MESSAGES.usageNextScreensMenuSearch, color: 'var(--color-chart-series-2)', swatch: 'bg-chart-series-2', vias: ['palette'] },
  { ...ADMIN_MESSAGES.usageNextScreensInScreenLinks, color: 'var(--color-chart-series-3)', swatch: 'bg-chart-series-3', vias: ['crossLink', 'drill', 'link'] },
  { ...ADMIN_MESSAGES.usageNextScreensAnalysisBoard, color: 'var(--color-cat-purple)', swatch: 'bg-cat-purple', vias: ['board'] },
  { ...ADMIN_MESSAGES.usageNextScreensOther, color: 'var(--color-chart-series-4)', swatch: 'bg-chart-series-4', vias: [] },
] as const;
const VIA_LABELS: Record<UsageVia, { ko: string; en: string }> = {
  sidebar: ADMIN_MESSAGES.usageNextScreensSidebar, switcher: ADMIN_MESSAGES.usageNextScreensSwitcher,
  palette: ADMIN_MESSAGES.usageNextScreensMenuSearch2, board: ADMIN_MESSAGES.usageNextScreensAnalysisBoard2,
  crossLink: ADMIN_MESSAGES.usageNextScreensCrossMenuLink, drill: ADMIN_MESSAGES.usageNextScreensDrill,
  link: ADMIN_MESSAGES.usageNextScreensLink, history: ADMIN_MESSAGES.usageNextScreensBackForward,
  return: ADMIN_MESSAGES.usageNextScreensReturn, direct: ADMIN_MESSAGES.usageNextScreensDirectEntry,
  paneOpen: ADMIN_MESSAGES.usageNextScreensOpenPane, paneReplace: ADMIN_MESSAGES.usageNextScreensReplacePane,
};
const groupFor = (via: string) => {
  const index = GROUPS.findIndex(group => (group.vias as readonly string[]).includes(via));
  return index < 0 ? 4 : index;
};
const percent = (value: number, total: number) => `${(total ? value / total * 100 : 0).toFixed(1)}%`;
function groupCounts(vias: Partial<Record<UsageVia, number>>): number[] {
  const values = GROUPS.map(() => 0);
  for (const [via, count] of Object.entries(vias)) {
    if (via === 'direct') continue;
    values[groupFor(via)] += count ?? 0;
  }
  return values;
}
/** Decorative widths only; the adjacent text carries every value. */
function StackedBar({ values, colors, scale = 100, destination = false }: { values: number[]; colors: readonly string[]; scale?: number; destination?: boolean }) {
  const total = values.reduce((sum, count) => sum + count, 0);
  return <svg aria-hidden="true" className="block h-2 w-full" viewBox="0 0 100 8" preserveAspectRatio="none">
    <rect width="100" height="8" fill="var(--color-surface-sunken)" />
    <svg width={`${scale}%`} height="8" data-destination-bar={destination ? '' : undefined}>
      {values.map((value, i) => <rect key={i} x={`${values.slice(0, i).reduce((sum, n) => sum + n, 0) / (total || 1) * 100}%`} width={`${value / (total || 1) * 100}%`} height="8" fill={colors[i]} />)}
    </svg>
  </svg>;
}

export default function UsageNextScreens({ menuId }: { menuId: string }) {
  const m = useMessages(ADMIN_MESSAGES);
  const { lang } = useI18n();
  const { adapter } = usePlatform();
  const [includeBack, setIncludeBack] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const switchId = useId();
  const listId = useId();
  const query = usePlatformQuery<NextScreens>(signal => adapter.usageNextScreens({ menuId, includeBack }, signal), { menuId, includeBack }, true, 'session');
  return <div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="t-card-title">{m('usageNextScreensNextScreens')}</h3>
      <label htmlFor={switchId} className="flex items-center gap-2 text-xs">
        <Button id={switchId} role="switch" aria-checked={includeBack} aria-label={m('usageNextScreensIncludeBackAndReturn')} variant="secondary" size="sm" onClick={() => { setIncludeBack(!includeBack); setExpanded(false); }}>{includeBack ? m('usageNextScreensOn') : m('usageNextScreensOff')}</Button>
        {m('usageNextScreensIncludeBackAndReturn2')}
      </label>
    </div>
    <QueryView query={query} widgetName={m('usageNextScreensNextScreens2')}>{data => <NextScreenResult data={data} expanded={expanded} onExpand={() => setExpanded(true)} listId={listId} />}</QueryView>
  </div>;
}

function NextScreenResult({ data, expanded, onExpand, listId }: { data: NextScreens; expanded: boolean; onExpand: () => void; listId: string }) {
  const m = useMessages(ADMIN_MESSAGES);
  const { lang } = useI18n();
  const { registry } = usePlatform();
  if (data.masked) return <StateMessage icon={<Shield aria-hidden />} title={m('usageNextScreensMovementPathsAreWithheldForThisMenu')} />;
  if (data.entries === 0) return <StateMessage icon={<Inbox aria-hidden />} title={m('usageNextScreensNoEntriesRecorded')} />;
  const summary = [data.summary.moved, data.summary.sameMenu, data.summary.backOrReturn, data.summary.noMove];
  const summaryTotal = summary.reduce((sum, count) => sum + count, 0);
  const summaryLabels = [m('usageNextScreensAnotherMenu'), m('usageNextScreensSameMenu'), m('usageNextScreensBackReturn'), m('usageNextScreensNoSubsequentMenuMove')];
  // Neutral ink ramp distinguishes movement outcomes from the categorical via colors below.
  const summaryColors = ['var(--color-text-primary)', 'rgb(var(--text-primary) / 0.8)', 'rgb(var(--text-primary) / 0.65)', 'rgb(var(--text-primary) / 0.5)'];
  const summarySwatches = ['bg-text-primary', 'bg-text-primary/80', 'bg-text-primary/65', 'bg-text-primary/50'];
  const returned = data.next.slice(0, 20);
  const visible = returned.slice(0, expanded ? 20 : 5);
  const max = Math.max(1, ...visible.map(row => row.count));
  const viaTotals = new Map<UsageVia, number>();
  returned.forEach(row => (Object.entries(row.vias) as [UsageVia, number][]).forEach(([via, count]) => { if (via !== 'direct' && count > 0) viaTotals.set(via, (viaTotals.get(via) ?? 0) + count); }));
  const totals = GROUPS.map(() => 0);
  returned.forEach(row => groupCounts(row.vias).forEach((count, i) => { totals[i] += count; }));
  return <div className="flex min-w-0 flex-col gap-4">
    <section aria-label={m('usageNextScreensEntryMovementSummary')} className="flex flex-col gap-2">
      <h4 className="t-card-title">{m('usageNextScreensEntryMovementSummary2')}</h4>
      <p className="text-xs text-text-secondary">{m('usageNextScreensEntriesIntoThisScreen', { entriesLang: formatNumber(data.entries, lang) })}</p>
      <StackedBar values={summary} colors={summaryColors} />
      <ul className="grid grid-cols-2 gap-2 text-xs">
        {summary.map((count, i) => <li key={i} className="flex flex-col gap-1">
          <div className="flex items-start gap-1"><span aria-hidden className={`mt-0.5 size-2.5 shrink-0 ${summarySwatches[i]}`} />{i === 3 ? <TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" className="w-fit text-left underline decoration-dotted underline-offset-2">{summaryLabels[i]}</button></TooltipTrigger><TooltipContent portal size="sm">{m('usageNextScreensRefreshANewTabOrEnteringA')}</TooltipContent></Tooltip></TooltipProvider> : <span>{summaryLabels[i]}</span>}</div>
          <span className="tabular text-text-secondary">{m('usageNextScreensMoves', { count })} · {percent(count, summaryTotal)}</span>
        </li>)}
      </ul>
    </section>
    {viaTotals.size > 0 && <section aria-label={m('usageNextScreensMovementMethods')} className="flex flex-col gap-2 border-t border-border-subtle pt-4">
      <h4 className="t-card-title">{m('usageNextScreensMovementMethods2')}</h4>
      <ul aria-label={m('usageNextScreensMovementLegend')} className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary">
      {GROUPS.map((group, i) => <li key={group.en} className="flex items-center gap-1"><span aria-hidden className={`size-2.5 shrink-0 ${group.swatch}`} />{group[lang]}<span className="tabular">{m('usageNextScreensMoves2', { i: totals[i] })}</span></li>)}
      </ul>
    </section>}
    {visible.length > 0 ? <ol id={listId} aria-label={m('usageNextScreensNextScreenRanking')} className="flex flex-col">
      {visible.map((row, i) => {
        const label = registry.menus.find(menu => menu.id === row.menuId)?.label[lang] ?? row.menuId;
        const counts = groupCounts(row.vias);
        const hasBreakdown = Object.keys(row.vias).length > 0;
        return <li key={row.menuId} className="flex min-h-14 flex-col justify-center gap-0.5 border-b border-border-subtle py-1">
          <div className="flex min-w-0 items-baseline justify-between gap-2 text-xs"><span className="min-w-0 break-words" title={label}><span className="mr-2 tabular text-text-muted">{i + 1}</span>{label}</span><span className="shrink-0 tabular">{m('usageNextScreensMoves3', { count: row.count })}{hasBreakdown && ` · ${percent(row.count, data.entries)}`}</span></div>
          {hasBreakdown && <StackedBar values={counts} colors={GROUPS.map(group => group.color)} scale={row.count / max * 100} destination />}
          <p className="text-xs text-text-secondary">{m('usageNextScreensUsers', { distinctUsers: row.distinctUsers })}{counts.map((count, j) => count > 0 ? ` · ${GROUPS[j][lang]} ${count}` : '').join('')}</p>
        </li>;
      })}
    </ol> : data.hiddenDestinations === 0 ? <StateMessage icon={<Inbox aria-hidden />} title={m('usageNextScreensNoNextScreenMoves')} /> : null}
    {visible.some(row => Object.keys(row.vias).length === 0) && <p className="text-xs text-text-muted">{m('usageNextScreensMovementBreakdownsAreHiddenBecauseSomeGroups')}</p>}
    {data.hiddenDestinations > 0 && <p className="text-xs text-text-secondary">{m('usageNextScreensDestinationsWithFewerThan3Users', { hiddenDestinations: data.hiddenDestinations })}</p>}
    {!expanded && returned.length > 5 && <Button variant="secondary" size="sm" aria-expanded={false} aria-controls={listId} onClick={onExpand}>{m('usageNextScreensShowMore')}</Button>}
    {viaTotals.size > 0 && <section className="flex flex-col gap-2">
      <h3 className="t-card-title">{m('usageNextScreensAllMovementMethods')}</h3>
      <ul aria-label={m('usageNextScreensAllMovementMethods2')} className="flex flex-col gap-1 text-xs">
        {[...viaTotals].sort((a, b) => b[1] - a[1]).map(([via, count]) => <li key={via} className="flex items-center justify-between gap-2 rounded-sm bg-surface-sunken px-2 py-1"><span className="flex items-center gap-2"><span aria-hidden className={`size-2.5 ${GROUPS[groupFor(via)].swatch}`} />{VIA_LABELS[via][lang]}</span><span className="tabular">{m('usageNextScreensMoves4', { count })}</span></li>)}
      </ul>
    </section>}
  </div>;
}
