import { AnalysisSectionContext } from './archetypes/AnalysisSectionContext';
import { useInWorkspacePanel } from './workspace/panelContext';
import { useCompactPageDensity } from './pageDensity';
import { useSharedOutcome } from './filters/OutcomeScope';
import { useQueryBarStatus } from './filters/QueryBarStatus';
import { QueryRefreshNotice } from './state/QueryRefreshNotice';
import { emptyCauses, emptyOutcomeText } from './state/emptyCause';
import { Ban, Clock, HelpCircle, Inbox, Loader2, Maximize2, RotateCw, ServerCrash } from 'lucide-react';
import { useContext, useId, useState, type ReactNode } from 'react';
import { errorGuidance, queryMissingSentence, type QueryState, useI18n } from '@ap/kernel';
import type { ApiResponse } from '@ap/contracts';
import { Button, cn, Skeleton } from '@ap/ui';

type WidgetStateProps = { grouped?: boolean; widgetName?: string; hideWidgetName?: boolean };

type StateProps = { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode; tone?: 'neutral' | 'danger' | 'warning'; correlationId?: string; compact?: boolean; detail?: string };

function ServerDetail({ detail, correlationId }: { detail?: string; correlationId?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panel = useId();
  if (!detail && !correlationId) return null;
  // The server's own sentence is for support, not the reader: folded until the user opens it (#1940).
  return <span className="max-w-full text-tiny">
    <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(value => !value)} className="cursor-pointer underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">{t('technicalInfo')}</button>
    {open && <span id={panel} className="mt-1 block max-w-full break-all" role="note" aria-label={t('serverDetail')}>{correlationId && <span className="t-mono block">{t('correlationId')}: {correlationId}</span>}{detail}</span>}
  </span>;
}

export function StateMessage({ icon, title, body, action, tone = 'neutral', correlationId, compact, detail }: StateProps) {
  const { t } = useI18n();
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex flex-col items-start gap-2 rounded-md p-4',
    tone === 'danger' ? 'border border-text-danger-label bg-accent-danger-soft text-text-secondary' : tone === 'warning' ? 'bg-accent-warn-soft text-text-warning-label' : 'bg-surface-sunken text-text-secondary',
    compact ? 'p-3' : 'min-h-24')}>
    <div className={cn("flex items-center gap-2 font-semibold text-sm", tone === 'danger' && 'text-text-danger-label')}><span className={cn(tone === 'danger' ? 'text-text-danger' : tone === 'warning' && 'text-text-warning')}>{icon}</span>{title}</div>
    {body && <div className={cn("max-w-prose text-xs leading-4 break-keep", tone === 'danger' && 'text-text-secondary')}>{body}</div>}
    {(action || correlationId || detail) && <div className="flex flex-wrap items-center gap-3">
      {action}
      {correlationId && <span className="t-mono text-tiny">{t('correlationId')}: {correlationId}</span>}
      <ServerDetail detail={detail} />
    </div>}
  </div>;
}

function GroupedStateMessage({ action, correlationId, detail, widgetName, hideWidgetName }: StateProps & WidgetStateProps) {
  const { t } = useI18n();
  const nameId = useId();
  return <div data-widget-state role="group" aria-labelledby={widgetName && !hideWidgetName ? nameId : undefined} aria-label={hideWidgetName ? widgetName : undefined} className="min-w-0 rounded-md bg-surface-sunken p-3 text-text-secondary">
    {widgetName && !hideWidgetName && <p id={nameId} className="mb-1.5 text-sm font-semibold">{widgetName}</p>}
    <p className="text-xs leading-4">{t('sharedOutcomeNotice')}</p>
    {(action || correlationId || detail) && <div className="mt-2 flex flex-wrap items-center gap-3">
      {action}
      <ServerDetail detail={detail} correlationId={correlationId} />
    </div>}
  </div>;
}

function OutcomeStateMessage({ grouped, widgetName, hideWidgetName, ...props }: StateProps & WidgetStateProps) {
  const nameId = useId();
  // Non-grouped compact states otherwise look identical to every sibling's error box; draw the same
  // name line the grouped path draws (UXA-3). Grouping decision and alert/status roles stay untouched.
  if (!grouped && props.compact && widgetName && !hideWidgetName) {
    return <div role="group" aria-labelledby={nameId} className="min-w-0"><p id={nameId} className="mb-1.5 text-sm font-semibold">{widgetName}</p><StateMessage {...props} /></div>;
  }
  return grouped ? <GroupedStateMessage {...props} widgetName={widgetName} hideWidgetName={hideWidgetName} /> : <StateMessage {...props} />;
}

export function LoadingBlock({ rows = 3, height = 96, className }: { rows?: number; height?: number; className?: string }) {
  const { t } = useI18n();
  // eslint-disable-next-line shadcn/no-inline-styles -- block height comes from the height prop at runtime
  return <div role="status" aria-busy className={cn('space-y-2', className)} style={{ minHeight: height }}>
    <span className="sr-only">{t('loading')}</span>
    {/* eslint-disable-next-line shadcn/no-inline-styles -- skeleton widths are per-row percentages computed at runtime */}
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-5" style={{ width: `${90 - i * 12}%` }} />)}
  </div>;
}

/** Maps the exclusive outcome to the §19 taxonomy. Only `ok` renders children. Package-internal (not re-exported by `index.ts`): QueryView and PlatformDataTable draw their outcome through it. */
export function OutcomeContent<T>({ response, onRetry, emptyAction, compact, grouped, widgetName, hideWidgetName, children }: {
  response: ApiResponse<T>; onRetry: () => void; emptyAction?: ReactNode; compact?: boolean; children: (data: T) => ReactNode; grouped?: boolean; widgetName?: string; hideWidgetName?: boolean;
}) {
  const { t } = useI18n();
  const icon = 'size-4';
  const widget = { grouped, widgetName, hideWidgetName };
  const detail = response.message || undefined;
  switch (response.outcome) {
    case 'ok': return <>{children(response.data as T)}</>;
    case 'empty': {
      const empty = emptyOutcomeText(emptyCauses(response), t);
      return <OutcomeStateMessage {...widget} compact={compact} icon={<Inbox className={icon} aria-hidden />} title={empty.title}
        body={empty.body} action={grouped ? <><Button size="sm" variant="secondary" onClick={onRetry}><RotateCw aria-hidden className="size-3.5" />{t('retry')}</Button></> : emptyAction} correlationId={grouped ? response.correlationId : undefined} detail={grouped ? detail : undefined} />;
    }
    case 'forbidden': return <OutcomeStateMessage {...widget} compact={compact} tone="warning" icon={<Ban className={icon} aria-hidden />} title={t('stateForbidden')}
      body={t('stateForbiddenBody')} detail={detail} correlationId={response.correlationId} />;
    case 'too_large': return <OutcomeStateMessage {...widget} compact={compact} tone="warning" icon={<Maximize2 className={icon} aria-hidden />} title={t('stateTooLarge')}
      body={t('stateTooLargeBody')} detail={detail} correlationId={response.correlationId} />;
    case 'timeout': return <OutcomeStateMessage {...widget} compact={compact} tone="danger" icon={<Clock className={icon} aria-hidden />} title={t('stateTimeout')}
      body={t('stateTimeoutBody')} detail={detail}
      action={<Button size="sm" variant="secondary" onClick={onRetry}><RotateCw className="size-3.5" />{t('retry')}</Button>} correlationId={response.correlationId} />;
    case 'error': {
      const guide = errorGuidance(response.message);
      return <OutcomeStateMessage {...widget} compact={compact} tone="danger" icon={<ServerCrash className={icon} aria-hidden />} title={t('stateError')}
        body={<>{t(guide.cause)} {t(guide.action)}</>} detail={detail} action={<Button size="sm" variant="secondary" onClick={onRetry}><RotateCw className="size-3.5" />{t('retry')}</Button>} correlationId={response.correlationId} />;
    }
    default: return <OutcomeStateMessage {...widget} compact={compact} icon={<HelpCircle className={icon} aria-hidden />} title={t('stateUnknown')} body={t('stateUnknownBody')} detail={detail} correlationId={detail ? response.correlationId : undefined} />;
  }
}

/** Standalone outcome API: it never registers with an OutcomeScope. QueryView and PlatformDataTable register their results and draw the grouped state through `OutcomeContent`. */
export function OutcomeView<T>({ response, onRetry, emptyAction, compact, children }: {
  response: ApiResponse<T>; onRetry: () => void; emptyAction?: ReactNode; compact?: boolean; children: (data: T) => ReactNode;
}) {
  return <OutcomeContent response={response} onRetry={onRetry} emptyAction={emptyAction} compact={compact}>{children}</OutcomeContent>;
}

/** Query boundary: first load → skeleton; same-Context refresh → keep data + label; otherwise outcome taxonomy. */
export function QueryView<T>({ query, children, skeletonRows, skeletonHeight, emptyAction, compact, widgetName, hideWidgetName, fill, refreshNotice = 'visible' }: {
  query: QueryState<T>; children: (data: T, response: ApiResponse<T>) => ReactNode; skeletonRows?: number; skeletonHeight?: number; emptyAction?: ReactNode; compact?: boolean; widgetName?: string; hideWidgetName?: boolean;
  /** The wrapper takes the parent's height (`flex min-h-0 flex-1 flex-col`) so a `size="fill"` chart inside has a bounded parent, as it does in a workspace panel. */
  fill?: boolean;
  /** Hide a duplicate refresh notice while retaining the result's aria-busy state and stale tint. */
  refreshNotice?: 'visible' | 'hidden';
}) {
  const { t, lang } = useI18n();
  const analysisSection = useContext(AnalysisSectionContext);
  const chart = analysisSection?.kind === 'chart';
  // In a workspace panel the wrapper takes the panel's height so a `size="fill"` chart inside has a bounded parent.
  const inPanel = useInWorkspacePanel();
  const compactPage = useCompactPageDensity();
  const grouped = useSharedOutcome(query.response, query.refetch, widgetName, query.status);
  const barStatus = useQueryBarStatus();
  // The page's query bar already draws these reasons (#1170): only when it covers every idle item is the list left to the bar.
  const barCoversMissing = query.missing.length > 0 && barStatus !== null && query.missing.every(item => barStatus.reasonKeys.includes(item.key));
  if (query.status === 'idle') return <StateMessage icon={<HelpCircle className="size-4" aria-hidden />} title={t('stateIdle')}
    body={barCoversMissing ? t('stateIdleSeeQueryBar') : query.missing.length ? <ul>{query.missing.map(item => <li key={item.key}>{queryMissingSentence(lang, item.label)}</li>)}</ul> : undefined} compact={compact} />;
  if (!query.response) return <LoadingBlock rows={skeletonRows} height={skeletonHeight} className={chart ? 'row-span-2 pr-12' : undefined} />;
  const response = query.response;
  // A kept result of other params is not "the same context": say so (ADR-0114).
  const refreshingLabel = t(query.showingPrevious ? 'refreshingPrevious' : 'refreshing');
  const showingPrevious = query.status === 'refreshing' && query.showingPrevious === true;
  const noticeVisible = showingPrevious && !grouped && refreshNotice === 'visible';
  const content = <OutcomeContent grouped={grouped} widgetName={widgetName} hideWidgetName={hideWidgetName} response={response} onRetry={query.refetch} emptyAction={emptyAction} compact={compact}>{data => children(data, response)}</OutcomeContent>;
  return <div aria-busy={query.status === 'refreshing'} className={cn('relative', query.showingPrevious !== undefined && 'isolate', inPanel && 'h-full min-h-0', (fill || (inPanel && query.showingPrevious !== undefined)) && 'flex min-h-0 flex-1 flex-col', chart && 'row-span-2', chart && response.outcome === 'ok' && ['grid gap-y-0', noticeVisible ? 'grid-rows-[auto_auto_minmax(0,1fr)]' : 'grid-rows-subgrid'], analysisSection && response.outcome !== 'ok' && 'pr-12')}>
    {noticeVisible && <QueryRefreshNotice label={refreshingLabel} />}
    {query.status === 'refreshing' && !showingPrevious && !grouped && refreshNotice === 'visible' && (analysisSection && analysisSection.kind !== 'kpi'
      // Icon only, in the header's reserved right column under the corner collapse button: never over the toolbar.
      ? <span role="status" aria-label={refreshingLabel} title={refreshingLabel} className="absolute right-5 top-11 z-[1] inline-flex text-text-muted">
        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden /><span className="sr-only">{refreshingLabel}</span>
      </span>
      // Compact pages stack panels 12px apart, so the label above the view would sit inside the previous panel: it goes inside the view's own top-right corner instead.
      : <span role="status" aria-label={refreshingLabel} className={analysisSection ? 'absolute right-9 -top-7 inline-flex items-center gap-1 text-tiny text-text-muted' : compactPage ? 'absolute right-3 top-2 z-[1] inline-flex items-center gap-1 text-tiny text-text-muted' : 'absolute right-0 -top-7 inline-flex items-center gap-1 text-tiny text-text-muted'}>
        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />{refreshingLabel}
      </span>)}
    {/* Preserve the original DOM for non-opt-in queries. Opt-in results keep a real layout
        box across live/previous transitions; enable the option from the first render to avoid a remount. */}
    {query.showingPrevious === undefined ? content : <div data-query-result-content className={cn('relative min-w-0', (inPanel || fill) && 'flex min-h-0 flex-1 flex-col', chart && response.outcome === 'ok' && 'row-span-2 grid grid-rows-subgrid gap-y-0')}>
      {showingPrevious && <div data-query-stale-tint aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-surface-sunken/20 mix-blend-multiply" />}
      {content}
    </div>}
  </div>;
}
