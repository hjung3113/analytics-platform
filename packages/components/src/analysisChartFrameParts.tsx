import type { ReactNode } from 'react';
import { formatMetricVersion } from '@ap/contracts';
import { useI18n } from '@ap/kernel';

/** Internal frame fragments: preserve the time-series frame's element tree. */
export function AnalysisChartPart({ enabled, body, children }: { enabled: boolean; body?: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return body ? <div data-analysis-chart-body className="flex flex-1 flex-col">{children}</div>
    : <div data-analysis-chart-head>{children}</div>;
}

export function ChartHeading({ titleId, title, description, metricVersion }: { titleId: string; title: ReactNode; description?: ReactNode; metricVersion?: string }) {
  const { t } = useI18n();
  return <div className="min-w-0">
    <h2 id={titleId} className="t-card-title">{title}</h2>
    {(description || metricVersion) && <p className="text-xs text-text-muted">{description}{metricVersion && <> · <span className="tabular">{t('metricVersion')} {formatMetricVersion(metricVersion)}</span></>}</p>}
  </div>;
}

export function ChartTrustFooter({ trust }: { trust?: { source: string; updated: string; coverage: string } }) {
  const { t } = useI18n();
  return trust && <footer className="border-t border-border-subtle px-4 py-2 text-tiny text-text-muted tabular">
    {t('source')}: <span className="t-mono text-tiny">{trust.source}</span> · {t('updated')}: {trust.updated} · {t('coverage')}: {trust.coverage}
  </footer>;
}
