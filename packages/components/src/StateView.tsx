import { AnalysisSectionContext } from './AnalysisSectionContext';
import { useSharedOutcome } from './OutcomeScope';
import { AlertTriangle, Ban, Clock, HelpCircle, Inbox, Loader2, Maximize2, RotateCw, ServerCrash } from 'lucide-react';
import { useContext, useId, type ReactNode } from 'react';
import { type QueryState, useI18n } from '@ap/kernel';
import type { ApiResponse } from '@ap/contracts';
import { Button, cn, Skeleton } from '@ap/ui';

type WidgetStateProps = { grouped?: boolean; widgetName?: string; hideWidgetName?: boolean };

type StateProps = { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode; tone?: 'neutral' | 'danger' | 'warning'; correlationId?: string; compact?: boolean };

export function StateMessage({ icon, title, body, action, tone = 'neutral', correlationId, compact }: StateProps) {
  const { t } = useI18n();
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex flex-col items-start gap-2 rounded-md p-4',
    tone === 'danger' ? 'bg-accent-danger-soft text-text-danger-label' : tone === 'warning' ? 'bg-accent-warn-soft text-text-warning-label' : 'bg-surface-sunken text-text-secondary',
    compact ? 'p-3' : 'min-h-24')}>
    <div className="flex items-center gap-2 font-semibold text-[13px]"><span className={cn(tone === 'danger' ? 'text-text-danger' : tone === 'warning' && 'text-text-warning')}>{icon}</span>{title}</div>
    {body && <div className={cn('max-w-prose text-[12px] leading-4', tone === 'neutral' && 'opacity-90')}>{body}</div>}
    {(action || correlationId) && <div className="flex flex-wrap items-center gap-3">
      {action}
      {correlationId && <span className={cn('t-mono text-[11px]', tone === 'neutral' && 'opacity-80')}>{t('correlationId')}: {correlationId}</span>}
    </div>}
  </div>;
}

function GroupedStateMessage({ icon, title, body, action, tone = 'neutral', correlationId, widgetName, hideWidgetName }: StateProps & WidgetStateProps) {
  const { t } = useI18n();
  const nameId = useId();
  return <div data-widget-state role="group" aria-labelledby={widgetName && !hideWidgetName ? nameId : undefined} aria-label={hideWidgetName ? widgetName : undefined} className="min-w-0 rounded-md bg-surface-sunken p-3 text-text-secondary">
    {widgetName && !hideWidgetName && <p id={nameId} className="mb-1.5 text-[13px] font-semibold">{widgetName}</p>}
    <div className={cn('flex items-center gap-2 text-[12px] font-semibold', tone === 'danger' && 'text-text-danger-label', tone === 'warning' && 'text-text-warning-label')}><span className="shrink-0">{icon}</span>{title}</div>
    {body && <div className="mt-1.5 break-words text-[12px] leading-4">{body}</div>}
    {(action || correlationId) && <div className="mt-2 flex flex-wrap items-center gap-3">
      {action}
      {correlationId && <span className="t-mono break-all text-[11px]">{t('correlationId')}: {correlationId}</span>}
    </div>}
  </div>;
}

function OutcomeStateMessage({ grouped, widgetName, hideWidgetName, ...props }: StateProps & WidgetStateProps) {
  return grouped ? <GroupedStateMessage {...props} widgetName={widgetName} hideWidgetName={hideWidgetName} /> : <StateMessage {...props} />;
}

export function LoadingBlock({ rows = 3, height = 96, className }: { rows?: number; height?: number; className?: string }) {
  const { t } = useI18n();
  return <div role="status" aria-busy className={cn('space-y-2', className)} style={{ minHeight: height }}>
    <span className="sr-only">{t('loading')}</span>
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-5 rounded-sm bg-surface-sunken" style={{ width: `${90 - i * 12}%` }} />)}
  </div>;
}

/** Maps the exclusive outcome to the §19 taxonomy. Only `ok` renders children. */
function OutcomeContent<T>({ response, onRetry, emptyAction, compact, grouped, widgetName, hideWidgetName, children }: {
  response: ApiResponse<T>; onRetry: () => void; emptyAction?: ReactNode; compact?: boolean; children: (data: T) => ReactNode; grouped?: boolean; widgetName?: string; hideWidgetName?: boolean;
}) {
  const { t } = useI18n();
  const icon = 'size-4';
  const widget = { grouped, widgetName, hideWidgetName };
  switch (response.outcome) {
    case 'ok': return <>{children(response.data as T)}</>;
    case 'empty': {
      const explained = response.assessments.filter(a => a.explainsEmpty && a.state === 'confirmed');
      return <OutcomeStateMessage {...widget} compact={compact} icon={<Inbox className={icon} aria-hidden />} title={t('stateEmpty')}
        body={<>{grouped && response.message && <span className="mb-1 block">{response.message}</span>}{explained.length ? explained.map(a => a.detail).join(' · ') : t('stateEmptyBody')}</>} action={grouped ? <><Button size="sm" variant="secondary" onClick={onRetry}><RotateCw aria-hidden className="size-3.5" />{t('retry')}</Button>{emptyAction}</> : emptyAction} correlationId={grouped ? response.correlationId : undefined} />;
    }
    case 'forbidden': return <OutcomeStateMessage {...widget} compact={compact} tone="warning" icon={<Ban className={icon} aria-hidden />} title={t('stateForbidden')}
      body={<>{t('stateForbiddenBody')}{response.message && <span className="t-mono mt-1 block">{response.message}</span>}</>} correlationId={response.correlationId} />;
    case 'too_large': return <OutcomeStateMessage {...widget} compact={compact} tone="warning" icon={<Maximize2 className={icon} aria-hidden />} title={t('stateTooLarge')}
      body={<>{t('stateTooLargeBody')}{response.message && <span className="t-mono mt-1 block">{response.message}</span>}</>} correlationId={response.correlationId} />;
    case 'timeout': return <OutcomeStateMessage {...widget} compact={compact} tone="danger" icon={<Clock className={icon} aria-hidden />} title={t('stateTimeout')}
      body={<>{grouped && response.message && <span className="mb-1 block">{response.message}</span>}{t('stateTimeoutBody')}</>}
      action={<Button size="sm" variant="secondary" onClick={onRetry}><RotateCw className="size-3.5" />{t('retry')}</Button>} correlationId={response.correlationId} />;
    case 'error': return <OutcomeStateMessage {...widget} compact={compact} tone="danger" icon={<ServerCrash className={icon} aria-hidden />} title={t('stateError')}
      body={response.message} action={<Button size="sm" variant="secondary" onClick={onRetry}><RotateCw className="size-3.5" />{t('retry')}</Button>} correlationId={response.correlationId} />;
    default: return <OutcomeStateMessage {...widget} compact={compact} icon={<HelpCircle className={icon} aria-hidden />} title={t('stateUnknown')} body={t('stateUnknownBody')} />;
  }
}

/** Standalone outcome API; grouping is owned exclusively by QueryView's scope. */
export function OutcomeView<T>({ response, onRetry, emptyAction, compact, children }: {
  response: ApiResponse<T>; onRetry: () => void; emptyAction?: ReactNode; compact?: boolean; children: (data: T) => ReactNode;
}) {
  return <OutcomeContent response={response} onRetry={onRetry} emptyAction={emptyAction} compact={compact}>{children}</OutcomeContent>;
}

/** Query boundary: first load → skeleton; same-Context refresh → keep data + label; otherwise outcome taxonomy. */
export function QueryView<T>({ query, children, skeletonRows, skeletonHeight, emptyAction, compact, widgetName, hideWidgetName }: {
  query: QueryState<T>; children: (data: T, response: ApiResponse<T>) => ReactNode; skeletonRows?: number; skeletonHeight?: number; emptyAction?: ReactNode; compact?: boolean; widgetName?: string; hideWidgetName?: boolean;
}) {
  const { t } = useI18n();
  const analysisSection = useContext(AnalysisSectionContext);
  const chart = analysisSection?.kind === 'chart';
  const grouped = useSharedOutcome(query.response, query.refetch, widgetName, query.status);
  if (!query.response) return <LoadingBlock rows={skeletonRows} height={skeletonHeight} className={chart ? 'row-span-2 pr-12' : undefined} />;
  const response = query.response;
  return <div aria-busy={query.status === 'refreshing'} className={cn('relative', chart && 'row-span-2', chart && response.outcome === 'ok' && 'grid grid-rows-subgrid gap-y-0', analysisSection && response.outcome !== 'ok' && 'pr-12')}>
    {query.status === 'refreshing' && !grouped && (analysisSection && analysisSection.kind !== 'kpi'
      // Icon only, in the header's reserved right column under the corner collapse button: never over the toolbar.
      ? <span role="status" title={t('refreshing')} className="absolute right-5 top-11 z-[1] inline-flex text-text-muted">
        <Loader2 className="size-3 animate-spin" aria-hidden /><span className="sr-only">{t('refreshing')}</span>
      </span>
      : <span role="status" className={analysisSection ? 'absolute right-9 -top-7 inline-flex items-center gap-1 text-[11px] text-text-muted' : 'absolute right-0 -top-7 inline-flex items-center gap-1 text-[11px] text-text-muted'}>
        <Loader2 className="size-3 animate-spin" aria-hidden />{t('refreshing')}
      </span>)}
    <OutcomeContent grouped={grouped} widgetName={widgetName} hideWidgetName={hideWidgetName} response={response} onRetry={query.refetch} emptyAction={emptyAction} compact={compact}>{data => children(data, response)}</OutcomeContent>
  </div>;
}

export function PartialFailureNote({ count }: { count: number }) {
  const { t } = useI18n();
  if (!count) return null;
  return <StateMessage compact tone="warning" icon={<AlertTriangle className="size-4" aria-hidden />} title={`${t('statePartial')} (${count})`} />;
}
