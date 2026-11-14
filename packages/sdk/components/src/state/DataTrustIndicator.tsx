import { Info } from 'lucide-react';
import { useI18n, useMessages } from '@ap/kernel';
import { type Assessment, formatMetricVersion, type Trust } from '@ap/contracts';
import { cn, Dot, Popover, PopoverContent, PopoverTrigger, StatusBadge, type Tone } from '@ap/ui';
import { trustCoverageText, trustInstantText } from './trustFormat';
import { COMPONENTS_MESSAGES } from '../messages';

const KIND_KEY: Record<Assessment['kind'], keyof typeof COMPONENTS_MESSAGES> = {
  collection: 'trustKindCollection',
  processing_delay: 'trustKindProcessingDelay',
  coverage: 'trustKindCoverage',
  time_domain: 'trustKindTimeDomain',
  respondent_history: 'trustKindRespondentHistory',
};

function assessmentTone(a: Assessment): Tone {
  return a.state === 'confirmed' ? 'warning' : a.state === 'clear' ? 'success' : 'neutral';
}

const STATE_KEY: Record<Assessment['state'], keyof typeof COMPONENTS_MESSAGES> = {
  confirmed: 'trustStateConfirmed',
  clear: 'trustStateClear',
  unknown: 'trustNotConfirmed',
};

const REASON_KEY: Record<NonNullable<Assessment['reason']>, keyof typeof COMPONENTS_MESSAGES> = {
  source_unavailable: 'trustReasonSourceUnavailable',
  check_failed: 'trustReasonCheckFailed',
};

/**
 * Data Trust vocabulary (§18): one compressed line, details in a popover.
 * `clear` is a narrow, source-backed claim; `unknown` is always shown, never folded into healthy.
 */
export function DataTrustIndicator({ trust, assessments, className, compact = false, hideProvisional = false, wrap = false, summary = false, probe, showWithoutTrust = false }: {
  trust: Trust | null; assessments: Assessment[]; className?: string;
  /** Header yield (#303): keep the summary name on title/aria and show the dot. */
  compact?: boolean;
  /** Header yield (#303): drop the provisional and mixed-version badges once the summary is already compact. */
  hideProvisional?: boolean;
  /** Table status line: let headline · coverage · updated wrap inside the button instead of widening the line. */
  wrap?: boolean;
  /** Narrow container (table status line in a ~400px pane): dot + short status + a `자세히` control; the full items stay in the popover. */
  summary?: boolean;
  /** Ref callback that turns this into the measuring copy of the full line for the host's fit test (the callback receives the content element): hidden, not focusable, not announced; it ignores `summary`, `compact` and `wrap` so the shown form never changes what it measures. */
  probe?: (node: HTMLElement | null) => void;
  /** When `trust` is null and `assessments` is non-empty, show the assessment items alone. The line and popover claim no update time, coverage or final/provisional status and say the response carried no Trust. Off by default: a null `trust` renders nothing. */
  showWithoutTrust?: boolean;
}) {
  const { t, lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  if (!trust && !(showWithoutTrust && assessments.length)) return null;
  const confirmed = assessments.filter(a => a.state === 'confirmed');
  const unknown = assessments.filter(a => a.state === 'unknown');
  const mixed = (trust?.sourceLogicVersions?.length ?? 0) >= 2;
  const mixedText = m('trustLogicMixed');
  const collapsed = compact || summary;
  const tone: Tone = (collapsed && mixed) || confirmed.length ? 'warning' : unknown.length ? 'neutral' : 'success';
  const headline = confirmed.length
    ? m('trustConfirmedIssues', { count: confirmed.length })
    : unknown.length
      ? m('trustPartialUnconfirmedCount', { count: unknown.length })
      : m('trustNoConfirmedIssues');
  const coverageText = trust ? `${t('coverage')} ${trustCoverageText(trust.coverage, lang)}` : '';
  const updatedText = trust ? `${t('updated')} ${trustInstantText(trust.updatedAt, lang)}` : '';
  const noTrustText = m('trustNoTrust');
  const shortStatus = confirmed.length
    ? m('trustIssues', { count: confirmed.length })
    : unknown.length ? m('trustPartlyUnconfirmed') : m('trustNoIssues');
  // Wrapping form: a line break may fall between the fragments, never inside one.
  const fragment = cn('tabular', wrap && 'whitespace-nowrap');
  // Wrapping form (not collapsed): the dot travels with the headline and the info icon with the last fragment, so a break falls only between fragments and neither sits alone on a line.
  const grouped = wrap && !collapsed;
  const unit = 'inline-flex items-center gap-2 whitespace-nowrap';
  const infoIcon = <Info className="size-3.5 text-text-muted" aria-hidden />;
  const detailsText = t('outcomeDetails');
  const summaryName = `${trust ? `${headline} · ${coverageText} · ${updatedText}` : `${headline} · ${noTrustText}`}${collapsed && mixed ? ` · ${mixedText}` : ''}`;
  if (probe) {
    // The words come from `data-text` through a pseudo-element: they size the line but are not text nodes, so nothing else finds them twice.
    const ghost = (text: string, cls?: string) => <span data-text={text} className={cn('after:content-[attr(data-text)]', cls)} />;
    return <span aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden">
      <span ref={probe} data-trust-probe className="inline-flex items-center gap-2 whitespace-nowrap text-xs">
        <Dot tone={tone} />{ghost(headline, 'tabular')}{trust ? <>{ghost('·')}{ghost(coverageText, 'tabular')}{ghost('·')}{ghost(updatedText, 'tabular')}</> : <>{ghost('·')}{ghost(noTrustText, 'tabular')}</>}
        {trust?.provisional && <StatusBadge tone="warning">{ghost(t('provisional'))}</StatusBadge>}
        {mixed && <StatusBadge tone="warning">{ghost(mixedText)}</StatusBadge>}
        <Info className="size-3.5" />
      </span>
    </span>;
  }
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" className={cn('group/trust inline-flex min-h-8 items-center gap-2 rounded-sm px-2 text-xs text-text-secondary hover:bg-surface-sunken', wrap && 'min-w-0 max-w-full flex-wrap text-left', className)} aria-label={summary ? `${t('dataTrust')} · ${shortStatus} · ${detailsText}${mixed ? ` · ${mixedText}` : ''}` : compact && mixed ? summaryName : mixed ? `${t('dataTrust')} · ${mixedText}` : t('dataTrust')} title={summaryName}>
        {!grouped && <Dot tone={tone} />}
        {summary && <span data-trust-short className="inline-flex items-center gap-2 whitespace-nowrap"><span className="tabular">{shortStatus}</span><span className="text-text-disabled" aria-hidden>·</span><span className="text-accent-primary underline-offset-2 group-hover/trust:underline">{detailsText}</span></span>}
        <span data-trust-summary-details className={cn('inline-flex items-center gap-2', wrap && 'min-w-0 flex-wrap justify-start gap-y-0 text-left', (compact || summary) && 'sr-only')}>
          {grouped ? <span className={unit}><Dot tone={tone} /><span className={fragment}>{headline}</span></span> : <span className={fragment}>{headline}</span>}
          <span className="text-text-disabled" aria-hidden>·</span>
          {trust ? <>
            <span className={fragment}>{coverageText}</span>
            <span className="text-text-disabled" aria-hidden>·</span>
            {grouped ? <span className={unit}><span className={fragment}>{updatedText}</span>{infoIcon}</span> : <span className={fragment}>{updatedText}</span>}
          </> : <>
            {grouped ? <span className={unit}><span className={fragment}>{noTrustText}</span>{infoIcon}</span> : <span className={fragment}>{noTrustText}</span>}
          </>}
        </span>
        {trust?.provisional && !hideProvisional && !summary && <StatusBadge tone="warning">{t('provisional')}</StatusBadge>}
        {mixed && !hideProvisional && !summary && <StatusBadge tone="warning">{mixedText}</StatusBadge>}
        {!grouped && infoIcon}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80">
      <p className="t-card-title mb-2">{t('dataTrust')}</p>
      {trust ? <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular">
        <dt className="text-text-secondary">{t('updated')}</dt><dd>{trustInstantText(trust.updatedAt, lang, 'minute')}</dd>
        <dt className="text-text-secondary">{t('dataThrough')}</dt><dd>{trustInstantText(trust.dataThrough, lang, 'minute')}</dd>
        <dt className="text-text-secondary">{t('coverage')}</dt><dd>{trustCoverageText(trust.coverage, lang)}</dd>
        {trust.metricVersion && <><dt className="text-text-secondary">{t('metricVersion')}</dt><dd>{/^\d+$/.test(trust.metricVersion) ? formatMetricVersion(trust.metricVersion) : trust.metricVersion}</dd></>}
        {!!trust.sourceLogicVersions?.length && <><dt className="text-text-secondary">{m('trustSourceLogicVersions')}</dt><dd>{trust.sourceLogicVersions.join(', ')}</dd></>}
        <dt className="text-text-secondary">{t('status')}</dt><dd>{trust.provisional ? t('provisional') : t('final')}</dd>
        <dt className="text-text-secondary">{t('source')}</dt><dd className="t-mono">{trust.source}</dd>
      </dl> : <p className="text-text-secondary">{m('trustNoTrustSummary')}</p>}
      <ul className="mt-3 space-y-1.5 border-t border-border-subtle pt-2">
        {assessments.map(a => <li key={a.kind} className="flex items-start justify-between gap-2">
          <span>{m(KIND_KEY[a.kind])}</span>
          <span className="text-right">
            <StatusBadge tone={assessmentTone(a)}>{m(STATE_KEY[a.state])}</StatusBadge>
            <span className="mt-0.5 block text-tiny text-text-secondary">{a.state === 'unknown' ? (a.reason ? m(REASON_KEY[a.reason]) : m('trustUnknownReasonFallback')) : `${a.statusSource} · ${trustInstantText(a.observedAt, lang)}`}</span>
          </span>
        </li>)}
      </ul>
      <p className="mt-2 text-tiny text-text-secondary">{m('trustClearExplanation')}</p>
    </PopoverContent>
  </Popover>;
}
