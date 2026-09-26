import { AlertTriangle, Ban, Clock, HelpCircle, Inbox, Loader2, Maximize2, RotateCw, ServerCrash } from 'lucide-react';
import type { ReactNode } from 'react';
import { type QueryState, useI18n } from '@ap/kernel';
import type { ApiResponse } from '@ap/contracts';
import { Button, cn, Skeleton } from '@ap/ui';

type StateProps = { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode; tone?: 'neutral' | 'danger' | 'warning'; correlationId?: string; compact?: boolean };

export function StateMessage({ icon, title, body, action, tone = 'neutral', correlationId, compact }: StateProps) {
  const { t } = useI18n();
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex flex-col items-start gap-2 rounded-md p-4',
    tone === 'danger' ? 'bg-accent-danger-soft text-text-danger' : tone === 'warning' ? 'bg-accent-warn-soft text-text-warning' : 'bg-surface-sunken text-text-secondary',
    compact ? 'p-3' : 'min-h-24')}>
    <div className="flex items-center gap-2 font-semibold text-[13px]">{icon}{title}</div>
    {body && <div className="max-w-prose text-[12px] leading-4 opacity-90">{body}</div>}
    {(action || correlationId) && <div className="flex flex-wrap items-center gap-3">
      {action}
      {correlationId && <span className="t-mono text-[11px] opacity-80">{t('correlationId')}: {correlationId}</span>}
    </div>}
  </div>;
}

export function LoadingBlock({ rows = 3, height = 96 }: { rows?: number; height?: number }) {
  const { t } = useI18n();
  return <div role="status" aria-busy className="space-y-2" style={{ minHeight: height }}>
    <span className="sr-only">{t('loading')}</span>
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-5 rounded-sm bg-surface-sunken" style={{ width: `${90 - i * 12}%` }} />)}
  </div>;
}

/** Maps the exclusive outcome to the §19 taxonomy. Only `ok` renders children. */
export function OutcomeView<T>({ response, onRetry, emptyAction, compact, children }: {
  response: ApiResponse<T>; onRetry: () => void; emptyAction?: ReactNode; compact?: boolean; children: (data: T) => ReactNode;
}) {
  const { t, lang } = useI18n();
  const icon = 'size-4';
  switch (response.outcome) {
    case 'ok': return <>{children(response.data as T)}</>;
    case 'empty': {
      const explained = response.assessments.filter(a => a.explainsEmpty && a.state === 'confirmed');
      return <StateMessage compact={compact} icon={<Inbox className={icon} aria-hidden />} title={t('stateEmpty')}
        body={explained.length ? explained.map(a => a.detail).join(' · ') : t('stateEmptyBody')} action={emptyAction} />;
    }
    case 'forbidden': return <StateMessage compact={compact} tone="warning" icon={<Ban className={icon} aria-hidden />} title={t('stateForbidden')}
      body={<>{t('stateForbiddenBody')}{response.message && <span className="t-mono mt-1 block">{response.message}</span>}</>} correlationId={response.correlationId} />;
    case 'too_large': return <StateMessage compact={compact} tone="warning" icon={<Maximize2 className={icon} aria-hidden />} title={t('stateTooLarge')}
      body={<>{t('stateTooLargeBody')}{response.message && <span className="t-mono mt-1 block">{response.message}</span>}</>} correlationId={response.correlationId} />;
    case 'timeout': return <StateMessage compact={compact} tone="danger" icon={<Clock className={icon} aria-hidden />} title={t('stateTimeout')}
      body={lang === 'ko' ? '기간을 줄이거나 집계 단위를 키워 다시 시도하세요.' : 'Shorten the period or coarsen the granularity and retry.'}
      action={<Button size="sm" variant="secondary" onClick={onRetry}><RotateCw className="size-3.5" />{t('retry')}</Button>} correlationId={response.correlationId} />;
    case 'error': return <StateMessage compact={compact} tone="danger" icon={<ServerCrash className={icon} aria-hidden />} title={t('stateError')}
      body={response.message} action={<Button size="sm" variant="secondary" onClick={onRetry}><RotateCw className="size-3.5" />{t('retry')}</Button>} correlationId={response.correlationId} />;
    default: return <StateMessage compact={compact} icon={<HelpCircle className={icon} aria-hidden />} title={t('stateUnknown')} body={t('stateUnknownBody')} />;
  }
}

/** Query boundary: first load → skeleton; same-Context refresh → keep data + label; otherwise outcome taxonomy. */
export function QueryView<T>({ query, children, skeletonRows, skeletonHeight, emptyAction, compact }: {
  query: QueryState<T>; children: (data: T, response: ApiResponse<T>) => ReactNode; skeletonRows?: number; skeletonHeight?: number; emptyAction?: ReactNode; compact?: boolean;
}) {
  const { t } = useI18n();
  if (!query.response) return <LoadingBlock rows={skeletonRows} height={skeletonHeight} />;
  const response = query.response;
  return <div aria-busy={query.status === 'refreshing'} className="relative">
    {query.status === 'refreshing' && <span role="status" className="absolute right-0 -top-7 inline-flex items-center gap-1 text-[11px] text-text-muted">
      <Loader2 className="size-3 animate-spin" aria-hidden />{t('refreshing')}
    </span>}
    <OutcomeView response={response} onRetry={query.refetch} emptyAction={emptyAction} compact={compact}>{data => children(data, response)}</OutcomeView>
  </div>;
}

export function PartialFailureNote({ count }: { count: number }) {
  const { t } = useI18n();
  if (!count) return null;
  return <StateMessage compact tone="warning" icon={<AlertTriangle className="size-4" aria-hidden />} title={`${t('statePartial')} (${count})`} />;
}
