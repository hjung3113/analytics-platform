import { Info } from 'lucide-react';
import { useI18n } from '../kernel/i18n';
import { formatMetricVersion } from '../kernel/url';
import type { Assessment, Trust } from '../mock/server';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/components/shadcn/popover';
import { cn } from '../ui/utils/cn';
import { Dot, StatusBadge, type Tone } from './StatusBadge';

const time = (v: string | null | undefined) => (v ? v.replace('T', ' ').slice(5, 16) : '—');

const KIND: Record<Assessment['kind'], { ko: string; en: string }> = {
  collection: { ko: '수집', en: 'Collection' },
  processing_delay: { ko: '처리 지연', en: 'Processing delay' },
  coverage: { ko: '커버리지', en: 'Coverage' },
  time_domain: { ko: '시간역', en: 'Time domain' },
};

function assessmentTone(a: Assessment): Tone {
  return a.state === 'confirmed' ? 'warning' : a.state === 'clear' ? 'success' : 'neutral';
}

/**
 * Data Trust vocabulary (§18): one compressed line, details in a popover.
 * `clear` is a narrow, source-backed claim; `unknown` is always shown, never folded into healthy.
 */
export function DataTrustIndicator({ trust, assessments, className }: { trust: Trust | null; assessments: Assessment[]; className?: string }) {
  const { t, tx, lang } = useI18n();
  if (!trust) return null;
  const confirmed = assessments.filter(a => a.state === 'confirmed');
  const unknown = assessments.filter(a => a.state === 'unknown');
  const tone: Tone = confirmed.length ? 'warning' : unknown.length ? 'neutral' : 'success';
  const headline = confirmed.length
    ? (lang === 'ko' ? `확인된 이슈 ${confirmed.length}건` : `${confirmed.length} confirmed issue(s)`)
    : unknown.length
      ? (lang === 'ko' ? `일부 상태 미확인 (${unknown.length})` : `Some status unknown (${unknown.length})`)
      : (lang === 'ko' ? '확인된 이슈 없음' : 'No confirmed issues');
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" className={cn('inline-flex min-h-8 items-center gap-2 rounded-sm px-2 text-[12px] text-text-secondary hover:bg-surface-sunken', className)} aria-label={t('dataTrust')}>
        <Dot tone={tone} />
        <span className="tabular">{headline}</span>
        <span className="text-text-disabled" aria-hidden>·</span>
        <span className="tabular">{t('coverage')} {trust.coverage === null ? '—' : `${(trust.coverage * 100).toFixed(1)}%`}</span>
        <span className="text-text-disabled" aria-hidden>·</span>
        <span className="tabular">{t('updated')} {time(trust.updatedAt)}</span>
        {trust.provisional && <StatusBadge tone="warning">{t('provisional')}</StatusBadge>}
        <Info className="size-3.5 text-text-muted" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 rounded-md border border-border-strong bg-surface-card p-3 text-[12px] shadow-md">
      <p className="t-card-title mb-2">{t('dataTrust')}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular">
        <dt className="text-text-muted">{t('updated')}</dt><dd>{trust.updatedAt.replace('T', ' ')}</dd>
        <dt className="text-text-muted">{t('dataThrough')}</dt><dd>{trust.dataThrough?.replace('T', ' ') ?? '—'}</dd>
        <dt className="text-text-muted">{t('coverage')}</dt><dd>{trust.coverage === null ? t('stateUnknown') : `${(trust.coverage * 100).toFixed(1)}%`}</dd>
        {trust.metricVersion && <><dt className="text-text-muted">{t('metricVersion')}</dt><dd>{/^\d+$/.test(trust.metricVersion) ? formatMetricVersion(trust.metricVersion) : trust.metricVersion}</dd></>}
        <dt className="text-text-muted">{t('status')}</dt><dd>{trust.provisional ? t('provisional') : t('final')}</dd>
        <dt className="text-text-muted">{t('source')}</dt><dd className="t-mono">{trust.source}</dd>
      </dl>
      <ul className="mt-3 space-y-1.5 border-t border-border-subtle pt-2">
        {assessments.map(a => <li key={a.kind} className="flex items-start justify-between gap-2">
          <span>{tx(KIND[a.kind])}</span>
          <span className="text-right">
            <StatusBadge tone={assessmentTone(a)}>{a.state}</StatusBadge>
            <span className="mt-0.5 block text-[11px] text-text-muted">{a.state === 'unknown' ? a.reason : `${a.statusSource} · ${time(a.observedAt)}`}</span>
          </span>
        </li>)}
      </ul>
      <p className="mt-2 text-[11px] text-text-muted">{lang === 'ko' ? 'clear는 해당 kind 문제가 없음을 원천이 확인했다는 제한적 주장입니다.' : '“clear” only means the source confirmed that kind of problem is absent.'}</p>
    </PopoverContent>
  </Popover>;
}
