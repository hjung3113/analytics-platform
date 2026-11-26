import { useContext, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button, cn, InfoTip } from '@ap/ui';
import { formatMetricVersion } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import type { ChartChrome, ChartChromeOptions } from './chartChrome';
import type { AnalysisChartFrameProps } from './AnalysisChartFrame';
import { chartTrustText, sameTrustFooter, type ChartTrust } from '../state/trustFormat';
import { DeclaredQueryPanelContext } from '../workspace/panelContext';

/** Internal frame fragments: preserve the time-series frame's element tree. */
export function AnalysisChartPart({ enabled, body, bounded, children }: { enabled: boolean; body?: boolean; bounded?: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return body ? <div data-analysis-chart-body className={cn('flex flex-1 flex-col', bounded && 'min-h-0')}>{children}</div>
    : <div data-analysis-chart-head>{children}</div>;
}

export function ChartCardHeader({ title, subtitle, actions, reserveCorner }: { title: ReactNode; subtitle?: ReactNode; actions: ReactNode; reserveCorner: boolean }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <header className={cn('flex flex-wrap items-start justify-between gap-2 px-4 pt-3', reserveCorner && 'pr-12')}>
    <div className="min-w-0">
      {title}
      {subtitle}
    </div>
    <div role="toolbar" aria-label={m('chartActions')} className="ml-auto flex flex-wrap items-center justify-end gap-1">{actions}</div>
  </header>;
}

export function ChartZoomButton({ label, icon: Icon, onClick, disabled = false, reason, reasonId }: {
  label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; reason?: string; reasonId?: string;
}) {
  const described = disabled && reason ? reasonId : undefined;
  return <Button size="icon-xs" variant="ghost" aria-label={label} title={described ? reason : label} aria-describedby={described} disabled={disabled} onClick={onClick}><Icon className="size-3.5" aria-hidden /></Button>;
}

export function chartDescriptionContent(description: ReactNode, gestureHint: string | undefined) {
  if (!gestureHint) return description;
  return <>
    {description && <div>{description}</div>}
    <p className={cn(description && 'mt-2')}>{gestureHint}</p>
  </>;
}

export function ChartHeading({ titleId, title, description, gestureHint, descriptionId, metricVersion, compact = false, hideTitle = false }: { hideTitle?: boolean; titleId: string; title: ReactNode; description?: ReactNode; gestureHint?: string; descriptionId?: string; metricVersion?: string; compact?: boolean }) {
  const { t } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const [infoFocused, setInfoFocused] = useState(false);
  const info = chartDescriptionContent(compact || infoFocused ? description : undefined, gestureHint);
  // The resolved chrome level decides whether the title is already carried by a workspace tab.
  return <div className="min-w-0">
    <div className="flex items-center gap-1">
      <h2 id={titleId} className={cn('t-card-title', hideTitle && 'sr-only')}>{title}</h2>
      {/* Compact charts carry the description in an InfoTip (#2364): a persistent sr-only copy describes the button, so screen readers get it
          without the tooltip. Full charts show it as the visible subtitle below; a focused ⓘ stays mounted when the chart leaves compact size. */}
      {info && <InfoTip label={m('chartDescription')} descriptionId={descriptionId} onFocus={() => setInfoFocused(compact)} onBlur={() => setInfoFocused(false)}>{info}</InfoTip>}
    </div>
    {hideTitle && metricVersion && <span className="sr-only">{t('metricVersion')} {formatMetricVersion(metricVersion)}</span>}
    {((!compact && description) || (!hideTitle && metricVersion)) && <p className="t-caption">{!compact && description}{!hideTitle && metricVersion && <>{!compact ? ' · ' : null}<span className="tabular">{t('metricVersion')} {formatMetricVersion(metricVersion)}</span></>}</p>}
  </div>;
}

export function ChartTrustFooter({ trust: input, metricVersion, singleLine }: { trust?: ChartTrust; metricVersion?: string; singleLine?: boolean }) {
  const { t, lang } = useI18n();
  const declared = useContext(DeclaredQueryPanelContext);
  const trust = chartTrustText(input, lang);
  const panelTrust = declared?.trust ?? null;
  // Drop only the duplicate source line. A different Trust, or a panel with no result yet, keeps the chart's own line.
  const sourceTrust = trust != null && panelTrust != null && sameTrustFooter(trust, panelTrust) ? undefined : trust;
  // singleLine: each item stays whole and a narrow pane wraps between items, never a sideways scroll.
  const item = singleLine ? 'whitespace-nowrap' : undefined;
  return (sourceTrust || metricVersion) && <footer className={cn('shrink-0 border-t border-border-subtle px-4 py-2 t-caption tabular')}>
    {sourceTrust && <><span className={item}>{t('source')}: <span className="t-mono">{sourceTrust.source}</span></span> · <span className={item}>{t('updated')}: {sourceTrust.updated}</span> · <span className={item}>{t('coverage')}: {sourceTrust.coverage}</span></>}
    {metricVersion && <>{sourceTrust && ' · '}<span className={item}>{t('metricVersion')} {formatMetricVersion(metricVersion)}</span></>}
  </footer>;
}

export function ChartLegendLabel({ name, children = name }: { name: string; children?: ReactNode }) {
  return <span className="min-w-0 max-w-full truncate" title={name}>{children}</span>;
}

/** Internal standard-chrome layout. Full/minimal retain their original plot tree. */
export function ChartLegendLayout({ enabled, keys: named = true, placement = 'bottom', legend, caption, fill, floor, children }: { enabled: boolean; /** false = no series keys (`legend={false}`): what is left (a hint, the caption) is plain text, not a focusable 범례 group. */ keys?: boolean; fill?: boolean; /** Frame only (#2869): the row is at least as tall as its contents, so a plot with its own floor is never clipped; the plot is size-contained and the side keys have no height of their own, so neither feeds that height. */ floor?: boolean; placement?: ChartChromeOptions['legendPlacement']; legend: ReactNode; caption?: ReactNode; children: ReactNode }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  if (!enabled) return <>{children}</>;
  const side = placement === 'side';
  const list = <div tabIndex={named ? 0 : undefined} role={named ? 'group' : undefined} aria-label={named ? m('chartLegend') : undefined} className={cn('t-caption', side ? 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 py-1 [scrollbar-gutter:stable] [&>*]:shrink-0' : 'flex max-h-20 min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 overflow-y-auto whitespace-nowrap px-2 py-1')}>
    {legend}
    {caption && <span className="min-w-0 max-w-56 truncate text-text-muted" title={typeof caption === 'string' ? caption : undefined}>{caption}</span>}
  </div>;
  // Side keys (#2889): as wide as the longest name, between 128px and the smaller of 224px and 40% of the chart row (a narrow panel keeps 128px for the plot's sake); a longer name ends in an ellipsis with its full `title`. The
  // column in a fill row has no height of its own (h-0, then min-h-full of the row, which is definite there), so the list scrolls inside the
  // row instead of making it taller (#2869 floor); a column flexbox would still count the list's content height, hence the explicit 0. A
  // fixed-size row takes its height from content, where the percentage would not resolve, so its column keeps its own (auto) height as
  // before. Items never shrink vertically; the list scrolls.
  const keys = side ? <div data-testid="chart-side-legend" className={cn('flex w-max min-w-32 max-w-[min(14rem,40%)] shrink-0 flex-col', fill && 'h-0 min-h-full')}>{list}</div> : list;
  return <div data-testid="chart-legend-layout" data-legend-placement={placement} className={cn('flex min-w-0 flex-1', floor ? 'min-h-min' : 'min-h-0', fill && 'basis-0 overflow-hidden', side ? 'flex-row' : 'flex-col')}>
    {placement === 'top' && keys}
    {side ? <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div> : children}
    {placement !== 'top' && keys}
  </div>;
}

/** What the selection summary under the plot has to show; facts only, no element state. */
export type SummaryFacts = {
  chrome: ChartChrome;
  summary?: AnalysisChartFrameProps['summary'];
  selection: boolean;
  preview: boolean;
  applyPeriod: boolean;
  note: boolean;
  clipNotice: boolean;
  annotationAlert: boolean;
  annotations: number;
  ownAnnotation: boolean;
  /** A controlled active row the plot draws. */
  activeRow: boolean;
  selectedPoint: boolean;
  /** Row groups, point status or bounds give a selected point a detail line. */
  pointDetail: boolean;
  /** The selected point's series has a min/max or all-equal line. */
  pointExtremes: boolean;
};

export type SummaryPresentation = {
  /** `summary="quiet"` applies (compact chrome only). */
  quiet: boolean;
  /** The summary region renders at all. */
  show: boolean;
  /** Quiet and nothing to say: the region stays for screen readers only (`sr-only`). */
  rest: boolean;
  /** The region holds its own controls, so it is not a tab stop itself. */
  hasControls: boolean;
  /** Compact chrome with only text: the region is a tab stop so keyboard users can read it. */
  focusable: boolean;
};

/** The selection summary display rules of AnalysisChartFrame (#2472). Pure, so the rules read as one table. */
export function summaryPresentation(f: SummaryFacts): SummaryPresentation {
  const compact = f.chrome !== 'full';
  const quiet = compact && f.summary === 'quiet';
  const feedback = f.preview || f.note || f.clipNotice || f.annotationAlert || f.annotations > 0;
  const show = f.selection || feedback || f.activeRow || (f.selectedPoint && (f.pointDetail || f.pointExtremes));
  const rest = quiet && !f.selection && !feedback;
  const hasControls = f.selection || (f.preview && f.applyPeriod) || f.annotationAlert || f.ownAnnotation;
  return { quiet, show, rest, hasControls, focusable: show && compact && !hasControls && !rest };
}
