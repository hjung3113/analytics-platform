import { useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button, cn, InfoTip, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { formatMetricVersion } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import type { ChartChromeOptions } from './chartChrome';
import { chartTrustText, type ChartTrust } from '../state/trustFormat';

/** Internal frame fragments: preserve the time-series frame's element tree. */
export function AnalysisChartPart({ enabled, body, bounded, children }: { enabled: boolean; body?: boolean; bounded?: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return body ? <div data-analysis-chart-body className={cn('flex flex-1 flex-col', bounded && 'min-h-0')}>{children}</div>
    : <div data-analysis-chart-head>{children}</div>;
}

/** Panel tabs own the title. Keep the plot's primary tools on one row; disclose the existing secondary controls unchanged. */
export function PanelChartChrome({ enabled, start, toolsReveal, titleId, title, description, metricVersion, actions, open, onOpenChange, onOpenAutoFocus, children }: { enabled: boolean; start?: ReactNode; toolsReveal?: ChartChromeOptions['toolsReveal']; titleId: string; title: ReactNode; description?: ReactNode; metricVersion?: string; actions: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; onOpenAutoFocus?: (event: Event) => void; children: ReactNode }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const [localOpen, setLocalOpen] = useState(false);
  const expanded = open ?? localOpen;
  if (!enabled) return <>{children}</>;
  return <header data-tools-reveal={toolsReveal} className={cn('flex shrink-0 items-center gap-1 px-2 pt-1', toolsReveal === 'hover' && !expanded && 'opacity-0 group-hover/chart:opacity-100 group-focus-within/chart:opacity-100')}>
    <ChartHeading titleId={titleId} title={title} description={description} metricVersion={metricVersion} compact hideTitle />
    {/* Menu controls share the plot tools' row (#2459): one row above the plot instead of an option row plus a tool row. */}
    {start != null && <div data-chart-toolbar-start className="flex min-w-0 items-center gap-1">{start}</div>}
    <div role="toolbar" aria-label={m('chartActions')} className="ml-auto flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto">
      {actions}
      <Popover open={expanded} onOpenChange={next => { setLocalOpen(next); onOpenChange?.(next); }}>
        <PopoverTrigger asChild><Button variant="ghost" size="icon-xs" className="shrink-0" aria-label={m('chartMore')} title={m('chartMore')}><MoreHorizontal className="size-3.5" aria-hidden /></Button></PopoverTrigger>
        <PopoverContent align="end" className="max-h-96 w-80 overflow-auto" aria-label={m('chartMore')} onOpenAutoFocus={onOpenAutoFocus}>{children}</PopoverContent>
      </Popover>
    </div>
  </header>;
}

export function ChartHeading({ titleId, title, description, metricVersion, compact = false, hideTitle = false }: { hideTitle?: boolean; titleId: string; title: ReactNode; description?: ReactNode; metricVersion?: string; compact?: boolean }) {
  const { t } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const [infoFocused, setInfoFocused] = useState(false);
  // The resolved chrome level decides whether the title is already carried by a workspace tab.
  return <div className="min-w-0">
    <div className="flex items-center gap-1">
      <h2 id={titleId} className={cn('t-card-title', hideTitle && 'sr-only')}>{title}</h2>
      {/* Compact charts carry the description in an InfoTip (#2364): a persistent sr-only copy describes the button, so screen readers get it
          without the tooltip. Full charts show it as the visible subtitle below; a focused ⓘ stays mounted when the chart leaves compact size. */}
      {description && (compact || infoFocused) && <InfoTip label={m('chartDescription')} onFocus={() => setInfoFocused(true)} onBlur={() => setInfoFocused(false)}>{description}</InfoTip>}
    </div>
    {hideTitle && metricVersion && <span className="sr-only">{t('metricVersion')} {formatMetricVersion(metricVersion)}</span>}
    {!hideTitle && ((!compact && description) || metricVersion) && <p className="text-xs text-text-muted">{!compact && description}{metricVersion && <>{!compact ? ' · ' : null}<span className="tabular">{t('metricVersion')} {formatMetricVersion(metricVersion)}</span></>}</p>}
  </div>;
}

export function ChartTrustFooter({ trust: input }: { trust?: ChartTrust }) {
  const { t, lang } = useI18n();
  const trust = chartTrustText(input, lang);
  return trust && <footer className="shrink-0 border-t border-border-subtle px-4 py-2 text-tiny text-text-muted tabular">
    {t('source')}: <span className="t-mono text-tiny">{trust.source}</span> · {t('updated')}: {trust.updated} · {t('coverage')}: {trust.coverage}
  </footer>;
}

/** Internal standard-chrome layout. Full/minimal retain their original plot tree. */
export function ChartLegendLayout({ enabled, keys: named = true, placement = 'bottom', legend, caption, fill, children }: { enabled: boolean; /** false = no series keys (`legend={false}`): what is left (a hint, the caption) is plain text, not a focusable 범례 group. */ keys?: boolean; fill?: boolean; placement?: ChartChromeOptions['legendPlacement']; legend: ReactNode; caption?: ReactNode; children: ReactNode }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  if (!enabled) return <>{children}</>;
  const side = placement === 'side';
  const keys = <div tabIndex={named ? 0 : undefined} role={named ? 'group' : undefined} aria-label={named ? m('chartLegend') : undefined} className={cn('text-xs text-text-secondary', side ? 'flex max-h-full w-32 shrink-0 flex-col gap-1 overflow-auto px-2 py-1' : 'flex max-h-20 min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 overflow-y-auto whitespace-nowrap px-2 py-1')}>
    {legend}
    {caption && <span className="min-w-0 max-w-56 truncate text-text-muted" title={typeof caption === 'string' ? caption : undefined}>{caption}</span>}
  </div>;
  return <div data-testid="chart-legend-layout" data-legend-placement={placement} className={cn('flex min-h-0 min-w-0 flex-1', fill && 'basis-0 overflow-hidden', side ? 'flex-row' : 'flex-col')}>
    {placement === 'top' && keys}
    {side ? <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div> : children}
    {placement !== 'top' && keys}
  </div>;
}
