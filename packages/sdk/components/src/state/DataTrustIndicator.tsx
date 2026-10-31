import { Info } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { type Assessment, formatMetricVersion, type Trust } from '@ap/contracts';
import { cn, Dot, Popover, PopoverContent, PopoverTrigger, StatusBadge, type Tone } from '@ap/ui';

const time = (v: string | null | undefined) => (v ? v.replace('T', ' ').slice(5, 16) : '—');

const KIND: Record<Assessment['kind'], { ko: string; en: string }> = {
  collection: { ko: '수집', en: 'Collection' },
  processing_delay: { ko: '처리 지연', en: 'Processing delay' },
  coverage: { ko: '커버리지', en: 'Coverage' },
  time_domain: { ko: '시간역', en: 'Time domain' },
  respondent_history: { ko: '응답 이력', en: 'Respondent history' },
};

function assessmentTone(a: Assessment): Tone {
  return a.state === 'confirmed' ? 'warning' : a.state === 'clear' ? 'success' : 'neutral';
}

const STATE_LABEL: Record<Assessment['state'], { ko: string; en: string }> = {
  confirmed: { ko: '확인됨', en: 'Confirmed' },
  clear: { ko: '문제 없음', en: 'No issue' },
  unknown: { ko: '미확인', en: 'Not confirmed' },
};

const REASON_LABEL: Record<NonNullable<Assessment['reason']>, { ko: string; en: string }> = {
  source_unavailable: { ko: '원천을 확인하지 못했습니다', en: 'The source could not be checked' },
  check_failed: { ko: '확인에 실패했습니다', en: 'The check failed' },
};

/**
 * Data Trust vocabulary (§18): one compressed line, details in a popover.
 * `clear` is a narrow, source-backed claim; `unknown` is always shown, never folded into healthy.
 */
export function DataTrustIndicator({ trust, assessments, className, compact = false, hideProvisional = false, wrap = false, summary = false, probe }: {
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
}) {
  const { t, tx, lang } = useI18n();
  if (!trust) return null;
  const confirmed = assessments.filter(a => a.state === 'confirmed');
  const unknown = assessments.filter(a => a.state === 'unknown');
  const mixed = (trust.sourceLogicVersions?.length ?? 0) >= 2;
  const mixedText = lang === 'ko' ? '로직 버전 혼재' : 'Logic versions mixed';
  const collapsed = compact || summary;
  const tone: Tone = (collapsed && mixed) || confirmed.length ? 'warning' : unknown.length ? 'neutral' : 'success';
  const headline = confirmed.length
    ? (lang === 'ko' ? `확인된 이슈 ${confirmed.length}건` : `${confirmed.length} confirmed issue(s)`)
    : unknown.length
      ? (lang === 'ko' ? `일부 상태를 확인하지 못했습니다 (${unknown.length})` : `Some status could not be confirmed (${unknown.length})`)
      : (lang === 'ko' ? '확인된 이슈 없음' : 'No confirmed issues');
  const coverageText = `${t('coverage')} ${trust.coverage === null ? '—' : `${(trust.coverage * 100).toFixed(1)}%`}`;
  const updatedText = `${t('updated')} ${time(trust.updatedAt)}`;
  const shortStatus = confirmed.length
    ? (lang === 'ko' ? `이슈 ${confirmed.length}건` : `${confirmed.length} issue(s)`)
    : unknown.length ? (lang === 'ko' ? '일부 미확인' : 'Partly unconfirmed') : (lang === 'ko' ? '이슈 없음' : 'No issues');
  const detailsText = lang === 'ko' ? '자세히' : 'Details';
  const summaryName = `${headline} · ${coverageText} · ${updatedText}${collapsed && mixed ? ` · ${mixedText}` : ''}`;
  if (probe) {
    // The words come from `data-text` through a pseudo-element: they size the line but are not text nodes, so nothing else finds them twice.
    const ghost = (text: string, cls?: string) => <span data-text={text} className={cn('after:content-[attr(data-text)]', cls)} />;
    return <span aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden">
      <span ref={probe} data-trust-probe className="inline-flex items-center gap-2 whitespace-nowrap text-xs">
        <Dot tone={tone} />{ghost(headline, 'tabular')}{ghost('·')}{ghost(coverageText, 'tabular')}{ghost('·')}{ghost(updatedText, 'tabular')}
        {trust.provisional && <StatusBadge tone="warning">{ghost(t('provisional'))}</StatusBadge>}
        {mixed && <StatusBadge tone="warning">{ghost(mixedText)}</StatusBadge>}
        <Info className="size-3.5" />
      </span>
    </span>;
  }
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" className={cn('group/trust inline-flex min-h-8 items-center gap-2 rounded-sm px-2 text-xs text-text-secondary hover:bg-surface-sunken', wrap && 'min-w-0 max-w-full flex-wrap text-left', className)} aria-label={summary ? `${t('dataTrust')} · ${shortStatus} · ${detailsText}${mixed ? ` · ${mixedText}` : ''}` : compact && mixed ? summaryName : mixed ? `${t('dataTrust')} · ${mixedText}` : t('dataTrust')} title={summaryName}>
        <Dot tone={tone} />
        {summary && <span data-trust-short className="inline-flex items-center gap-2 whitespace-nowrap"><span className="tabular">{shortStatus}</span><span className="text-text-disabled" aria-hidden>·</span><span className="text-accent-primary underline-offset-2 group-hover/trust:underline">{detailsText}</span></span>}
        <span data-trust-summary-details className={cn('inline-flex items-center gap-2', wrap && 'min-w-0 flex-wrap gap-y-0', (compact || summary) && 'sr-only')}>
          <span className="tabular">{headline}</span>
          <span className="text-text-disabled" aria-hidden>·</span>
          <span className="tabular">{coverageText}</span>
          <span className="text-text-disabled" aria-hidden>·</span>
          <span className="tabular">{updatedText}</span>
        </span>
        {trust.provisional && !hideProvisional && !summary && <StatusBadge tone="warning">{t('provisional')}</StatusBadge>}
        {mixed && !hideProvisional && !summary && <StatusBadge tone="warning">{mixedText}</StatusBadge>}
        <Info className="size-3.5 text-text-muted" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80">
      <p className="t-card-title mb-2">{t('dataTrust')}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular">
        <dt className="text-text-secondary">{t('updated')}</dt><dd>{trust.updatedAt.replace('T', ' ')}</dd>
        <dt className="text-text-secondary">{t('dataThrough')}</dt><dd>{trust.dataThrough?.replace('T', ' ') ?? '—'}</dd>
        <dt className="text-text-secondary">{t('coverage')}</dt><dd>{trust.coverage === null ? t('stateUnknown') : `${(trust.coverage * 100).toFixed(1)}%`}</dd>
        {trust.metricVersion && <><dt className="text-text-secondary">{t('metricVersion')}</dt><dd>{/^\d+$/.test(trust.metricVersion) ? formatMetricVersion(trust.metricVersion) : trust.metricVersion}</dd></>}
        {!!trust.sourceLogicVersions?.length && <><dt className="text-text-secondary">{lang === 'ko' ? '원천 로직 버전' : 'Source logic versions'}</dt><dd>{trust.sourceLogicVersions.join(', ')}</dd></>}
        <dt className="text-text-secondary">{t('status')}</dt><dd>{trust.provisional ? t('provisional') : t('final')}</dd>
        <dt className="text-text-secondary">{t('source')}</dt><dd className="t-mono">{trust.source}</dd>
      </dl>
      <ul className="mt-3 space-y-1.5 border-t border-border-subtle pt-2">
        {assessments.map(a => <li key={a.kind} className="flex items-start justify-between gap-2">
          <span>{tx(KIND[a.kind])}</span>
          <span className="text-right">
            <StatusBadge tone={assessmentTone(a)}>{tx(STATE_LABEL[a.state])}</StatusBadge>
            <span className="mt-0.5 block text-tiny text-text-secondary">{a.state === 'unknown' ? (a.reason ? tx(REASON_LABEL[a.reason]) : (lang === 'ko' ? '이유를 확인하지 못했습니다' : 'The reason could not be confirmed')) : `${a.statusSource} · ${time(a.observedAt)}`}</span>
          </span>
        </li>)}
      </ul>
      <p className="mt-2 text-tiny text-text-secondary">{lang === 'ko' ? '문제 없음은 그 항목의 문제가 없음을 원천이 확인했다는 뜻입니다.' : 'No issue means the source confirmed that kind of problem is absent.'}</p>
    </PopoverContent>
  </Popover>;
}
