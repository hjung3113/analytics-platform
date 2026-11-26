import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { useContext, type ReactNode } from 'react';
import { formatNumber } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { cn } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { useInQueryPanel, useInWorkspacePanel } from '../workspace/panelContext';
import { WorkspaceQueryBarContext } from '../archetypes/WorkspaceQueryBar';
import { useCompactPageDensity } from '../pageDensity';

export type Delta = { value: string; direction: 'up' | 'down'; /** Whether this direction is good for the metric. */ good: boolean };

export type StatCardComparison = {
  current: number | null;
  previous: number | null;
  kind: 'value' | 'absolute' | 'percent';
  good?: 'up' | 'down';
  /** Inclusive distance from zero in the metric's unit. Missing, negative and non-finite bands use zero. */
  noChangeBand?: number;
  formatValue: (value: number) => string;
  /** Formats the unsigned absolute change in the metric's unit. The pill supplies the direction. */
  formatChange: (magnitude: number) => string;
};

export type StatCardProps = {
  icon?: LucideIcon; label: ReactNode; value: ReactNode; unit?: ReactNode; caption?: ReactNode;
  /** Full tooltip text for a formatted caption in the compact card. Plain text captions supply their own title. */
  captionTitle?: string;
  /** Icon chip colour: `blue` or `teal` (DESIGN.md). Deprecated: `purple` renders as `teal`, `amber` as `blue`; both are removed from the type in the next SDK minor (#1945). */
  chip?: 'blue' | 'teal' | /** @deprecated Use `teal`; removed next SDK minor. */ 'purple' | /** @deprecated Use `blue`; removed next SDK minor. */ 'amber'; onClick?: () => void; active?: boolean; footnote?: ReactNode;
  /** Paired secondary number in the same tile (e.g. P95 beside P50), shown in the secondary colour. */
  secondary?: ReactNode;
  /** Decorative trend for observations already available in text. Nulls break the line. */
  trend?: readonly (number | null)[];
} & (
  | { comparison?: never; delta?: Delta }
  | { comparison: StatCardComparison; delta?: never }
);

const comparisonTone = {
  neutral: 'bg-surface-sunken text-text-secondary',
  improved: 'bg-accent-success-soft text-text-success-label',
  worsened: 'bg-accent-danger-soft text-text-danger-label',
};
const compactValueRow = 'col-span-full row-start-2 flex min-w-0 items-baseline gap-x-1.5 whitespace-nowrap';

function ComparisonRows({ comparison, children }: { comparison: StatCardComparison; children: ReactNode }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { lang } = useI18n();
  const { current, previous, kind, good, noChangeBand = 0, formatValue, formatChange } = comparison;
  const prior = previous !== null && Number.isFinite(previous) ? formatValue(previous) : '—';
  const hasObservations = current !== null && previous !== null;
  const change = hasObservations ? current - previous : NaN;
  let flat = false;
  let tone: keyof typeof comparisonTone = 'neutral';
  let amount = '—';
  let direction: 'up' | 'down' | undefined;
  if (hasObservations && Number.isFinite(change)) {
    const magnitude = Math.abs(change);
    const band = Number.isFinite(noChangeBand) && noChangeBand > 0 ? noChangeBand : 0;
    const tolerance = Number.EPSILON * Math.max(Math.abs(current), Math.abs(previous), band);
    flat = magnitude === 0 || (band > 0 && magnitude - band <= tolerance);
    if (!flat) {
      direction = change > 0 ? 'up' : 'down';
      if (good) tone = good === direction ? 'improved' : 'worsened';
      if (kind === 'value') {
        amount = prior;
      } else {
        const percent = kind === 'percent' && previous !== 0 ? magnitude / Math.abs(previous) * 100 : null;
        const sign = direction === 'up' ? '+' : '−';
        amount = percent !== null && Number.isFinite(percent)
          ? `${sign}${formatNumber(percent, lang, { decimals: 1 })}%`
          : formatChange(magnitude);
      }
    }
  }
  return <>
    <span className={compactValueRow}>
      {children}
      <span className={cn('t-delta rounded-pill px-1.5', comparisonTone[tone],
        flat ? 'shrink-0' : 'inline-grid min-w-min grid-cols-[auto_minmax(0,1fr)] items-baseline')}>
        {flat ? m('statComparisonNoChange') : <>
          {direction && (kind === 'value'
            ? <span className="col-start-1 row-start-1 whitespace-pre">{m('statComparisonPriorLabel')}{' '}</span>
            : <span aria-hidden="true" className="col-start-1 row-start-1 whitespace-pre">{direction === 'up' ? '▲ ' : '▼ '}</span>)}
          <span className="col-start-2 row-start-1 min-w-0 truncate">{amount}</span>
          {direction && <span className="sr-only"> {m(direction === 'up' ? 'statComparisonUp' : 'statComparisonDown')}</span>}
        </>}
        {tone !== 'neutral' && <span className="sr-only"> {m(tone === 'improved' ? 'statComparisonImproved' : 'statComparisonWorsened')}</span>}
      </span>
    </span>
    {(kind !== 'value' || flat || !hasObservations) && <span className="col-start-1 row-start-3 truncate text-xs text-text-secondary">{m('statComparisonPrior', { value: prior })}</span>}
  </>;
}

const trendWidth = 80;
const trendHeight = 28;
const trendInset = 4;

function StatCardTrend({ series }: { series: readonly (number | null)[] }) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of series) {
    if (value === null || !Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (min === Infinity) return null;

  // Halve the finite extrema and samples when subtraction would overflow.
  const scale = Number.isFinite(max - min) ? 1 : 0.5;
  const scaledMax = max * scale;
  const range = scaledMax - min * scale;
  const width = trendWidth - 2 * trendInset;
  const height = trendHeight - 2 * trendInset;
  const segments: { x: number; y: number }[][] = [];
  let segment: (typeof segments)[number] | undefined;
  for (const [index, value] of series.entries()) {
    if (value === null || !Number.isFinite(value)) {
      segment = undefined;
      continue;
    }
    if (!segment) {
      segment = [];
      segments.push(segment);
    }
    const x = series.length === 1 ? trendWidth / 2 : trendInset + index * width / (series.length - 1);
    const y = range === 0 ? trendHeight / 2 : trendInset + height * ((scaledMax - value * scale) / range);
    segment.push({ x, y });
  }
  const last = segments.at(-1)?.at(-1);
  return <svg aria-hidden="true" viewBox={`0 0 ${trendWidth} ${trendHeight}`}
    className="pointer-events-none col-start-2 row-span-2 row-start-3 h-7 w-20 self-center justify-self-end">
    {segments.map(points => {
      const first = points[0];
      if (points.length === 1) {
        return first === last ? null : <circle key={first.x} cx={first.x} cy={first.y} r={1.5} className="fill-text-muted" />;
      }
      return <path key={first.x} d={`M${points.map(({ x, y }) => `${x},${y}`).join(' L')}`}
        strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" className="fill-none stroke-text-muted" />;
    })}
    {last && <circle cx={last.x} cy={last.y} r={2.5} className="fill-text-muted" />}
  </svg>;
}

/**
 * One metric per tile. `secondary` renders between `value` and `unit`.
 */
export function StatCard({ icon: Icon, label, value, unit, delta, comparison, trend, caption, captionTitle, chip = 'blue', onClick, active, footnote, secondary }: StatCardProps) {
  const chipClass = { blue: 'bg-icon-blue-soft text-accent-primary', teal: 'bg-icon-teal-soft text-cat-teal', purple: 'bg-icon-teal-soft text-cat-teal', amber: 'bg-icon-blue-soft text-accent-primary' }[chip];
  const compact = useCompactPageDensity();
  const inPanel = useInWorkspacePanel();
  const workspace = useContext(WorkspaceQueryBarContext);
  const embedded = useInQueryPanel();
  const paneBorderOnly = embedded || (inPanel && workspace !== null);
  const compactStat = comparison !== undefined || trend !== undefined || !Icon;
  const Tag = onClick ? 'button' : 'div';
  const numbers = <>
    <span className={compactStat ? 't-stat min-w-0 truncate' : 't-stat'}>{value}</span>
    {secondary && <span className={compactStat ? 't-stat-2 min-w-0 truncate text-text-secondary' : 't-stat-2 text-text-secondary'}>{secondary}</span>}
    {unit && <span className={compactStat ? 'text-xs font-medium text-text-secondary' : 'text-sm font-medium text-text-muted'}>{unit}</span>}
  </>;
  const deltaLabel = delta && <span className={cn('t-delta inline-flex items-center', delta.good ? 'text-text-success-label' : 'text-text-danger-label')}>
    {delta.direction === 'up' ? <ArrowUpRight className={cn('size-3.5', delta.good ? 'text-text-success' : 'text-text-danger')} aria-hidden /> : <ArrowDownRight className={cn('size-3.5', delta.good ? 'text-text-success' : 'text-text-danger')} aria-hidden />}{delta.value}
  </span>;
  const plainCaption = typeof caption === 'string' || typeof caption === 'number' ? String(caption) : undefined;
  return <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? !!active : undefined}
    className={compactStat ? cn(
      'flex w-full min-w-0 items-start gap-2 rounded-lg bg-surface-card p-2 text-left break-keep tabular-nums',
      footnote ? 'h-30' : 'h-26',
      active ? 'stat-card-selected' : !paneBorderOnly && 'inset-ring inset-ring-border-subtle',
      onClick && 'transition-colors',
      onClick && !active && (paneBorderOnly ? 'hover:bg-surface-row-hover' : 'hover:inset-ring-border-strong'),
    ) : cn('flex min-h-[100px] w-full items-start rounded-lg bg-surface-card text-left', !paneBorderOnly && 'border elevation-panel', compact ? 'gap-2 p-3' : 'gap-3 p-4',
      !embedded && (active ? 'border-accent-primary ring-1 ring-accent-primary' : 'border-border-subtle'),
      onClick && (paneBorderOnly ? 'transition-colors hover:bg-surface-row-hover' : 'transition-colors hover:border-border-strong'),
      embedded && active && 'bg-surface-row-selected hover:bg-surface-row-selected')}>
    {Icon && <span className={cn('grid size-10 shrink-0 place-items-center rounded-md', chipClass)}><Icon className="size-6" strokeWidth={1.75} aria-hidden /></span>}
    {compactStat ? <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] content-start gap-x-2">
      <span className="col-span-full row-start-1 truncate text-xs font-medium text-text-secondary">{label}</span>
      {comparison
        ? <ComparisonRows comparison={comparison}>{numbers}</ComparisonRows>
        : <span className={compactValueRow}>{numbers}{deltaLabel}</span>}
      {caption != null && <span title={captionTitle ?? plainCaption} className={cn('t-caption col-start-1 min-w-0 truncate text-text-muted [&_*]:inline! [&_*]:whitespace-nowrap! [&_br]:hidden!', comparison ? 'row-start-4' : 'row-start-3')}>{caption}</span>}
      {trend && <StatCardTrend series={trend} />}
      {footnote && <span className="t-caption col-span-full truncate text-text-muted" title={typeof footnote === 'string' ? footnote : undefined}>{footnote}</span>}
    </span> :
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium text-text-secondary">{label}</span>
      <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
        {numbers}{deltaLabel}
      </span>
      {caption && <span className="t-caption mt-1 block text-text-muted tabular">{caption}</span>}
      {footnote && <span className="t-caption mt-0.5 block text-text-muted">{footnote}</span>}
    </span>}
  </Tag>;
}
