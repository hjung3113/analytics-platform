import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Button, cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { formatMetricVersion } from '@ap/contracts';
import { useI18n } from '@ap/kernel';
import { useInWorkspacePanel } from '../workspace/panelContext';

/** Internal frame fragments: preserve the time-series frame's element tree. */
export function AnalysisChartPart({ enabled, body, children }: { enabled: boolean; body?: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return body ? <div data-analysis-chart-body className="flex flex-1 flex-col">{children}</div>
    : <div data-analysis-chart-head>{children}</div>;
}

export function ChartHeading({ titleId, title, description, metricVersion, compact = false }: { titleId: string; title: ReactNode; description?: ReactNode; metricVersion?: string; compact?: boolean }) {
  const { t, lang } = useI18n();
  const [infoFocused, setInfoFocused] = useState(false);
  // The workspace tab already shows this name.
  const inPanel = useInWorkspacePanel();
  return <div className="min-w-0">
    <div className="flex items-center gap-1">
      <h2 id={titleId} className={cn('t-card-title', inPanel && 'sr-only')}>{title}</h2>
      {description && <span hidden={!compact && !infoFocused}><TooltipProvider delayDuration={200}><Tooltip>
        <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" onFocus={() => setInfoFocused(true)} onBlur={() => setInfoFocused(false)} aria-label={lang === 'ko' ? '차트 설명' : 'Chart description'}>
          <Info className="size-3.5" aria-hidden />
        </Button></TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip></TooltipProvider></span>}
    </div>
    {((!compact && description) || metricVersion) && <p className="text-xs text-text-muted">{!compact && description}{metricVersion && <>{!compact ? ' · ' : null}<span className="tabular">{t('metricVersion')} {formatMetricVersion(metricVersion)}</span></>}</p>}
  </div>;
}

export function ChartTrustFooter({ trust }: { trust?: { source: string; updated: string; coverage: string } }) {
  const { t } = useI18n();
  return trust && <footer className="border-t border-border-subtle px-4 py-2 text-tiny text-text-muted tabular">
    {t('source')}: <span className="t-mono text-tiny">{trust.source}</span> · {t('updated')}: {trust.updated} · {t('coverage')}: {trust.coverage}
  </footer>;
}
