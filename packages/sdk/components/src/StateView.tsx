import { AnalysisSectionContext } from './archetypes/AnalysisSectionContext';
import { useInWorkspacePanel } from './workspace/panelContext';
import { useSharedOutcomeNotice } from './filters/OutcomeScope';
import { useQueryBarStatus, useRequestContextEditor } from './filters/QueryBarStatus';
import { useOutcomeRecovery } from './state/OutcomeActions';
import { QueryRefreshNotice } from './state/QueryRefreshNotice';
import { outcomeDiagnostic, outcomeIsBlocked, outcomePresentation, outcomeTone } from './state/outcomePresentation';
import { HelpCircle } from 'lucide-react';
import { useContext, useId, useState, type ReactNode } from 'react';
import { queryMissingSentence, type QueryState, useI18n } from '@ap/kernel';
import type { ApiResponse } from '@ap/contracts';
import { Button, cn, Skeleton } from '@ap/ui';

type WidgetStateProps = { grouped?: boolean; bannerId?: string; statusLabel?: string; widgetName?: string; hideWidgetName?: boolean };

type StateProps = { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode; tone?: 'neutral' | 'danger' | 'warning'; correlationId?: string; compact?: boolean; detail?: string };

function ServerDetail({ detail, correlationId }: { detail?: string; correlationId?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panel = useId();
  if (!detail && !correlationId) return null;
  // Support detail is folded until the user opens it (#1940).
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

function GroupedStateMessage({ action, correlationId, detail, bannerId, statusLabel, widgetName, hideWidgetName }: StateProps & WidgetStateProps) {
  const { t } = useI18n();
  const nameId = useId();
  const notice = statusLabel ? t('sharedOutcomeNoticeFor', { status: statusLabel }) : t('sharedOutcomeNotice');
  return <div data-widget-state role="group" aria-labelledby={widgetName && !hideWidgetName ? nameId : undefined} aria-label={hideWidgetName ? widgetName : undefined} aria-describedby={bannerId} className="min-w-0 rounded-md bg-surface-sunken p-3 text-text-secondary">
    {widgetName && !hideWidgetName && <p id={nameId} className="mb-1.5 text-sm font-semibold">{widgetName}</p>}
    <p className="text-xs leading-4">{notice}</p>
    {(action || correlationId || detail) && <div className="mt-2 flex flex-wrap items-center gap-3">
      {action}
      <ServerDetail detail={detail} correlationId={correlationId} />
    </div>}
  </div>;
}

function OutcomeStateMessage({ grouped, bannerId, statusLabel, widgetName, hideWidgetName, ...props }: StateProps & WidgetStateProps) {
  const nameId = useId();
  // Non-grouped compact states otherwise look identical to every sibling's error box; draw the same
  // name line the grouped path draws (UXA-3). Grouping decision and alert/status roles stay untouched.
  if (!grouped && widgetName) {
    return <div role="group" aria-labelledby={hideWidgetName ? undefined : nameId} aria-label={hideWidgetName ? widgetName : undefined} className="min-w-0">
      {!hideWidgetName && <p id={nameId} className="mb-1.5 text-sm font-semibold">{widgetName}</p>}
      <StateMessage {...props} />
    </div>;
  }
  return grouped ? <GroupedStateMessage {...props} bannerId={bannerId} statusLabel={statusLabel} widgetName={widgetName} hideWidgetName={hideWidgetName} /> : <StateMessage {...props} />;
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
export function OutcomeContent<T>({ response, onRetry, emptyAction, compact, grouped, bannerId, widgetName, hideWidgetName, busy, current, children }: {
  response: ApiResponse<T>; onRetry: () => void; emptyAction?: ReactNode; compact?: boolean; children: (data: T) => ReactNode; grouped?: boolean; bannerId?: string; widgetName?: string; hideWidgetName?: boolean;
  busy?: boolean; current?: boolean;
}) {
  const { t } = useI18n();
  const icon = 'size-4';
  const recovery = useOutcomeRecovery(response, onRetry, { busy, current: !outcomeIsBlocked(response) && current !== false, emptyAction });
  if (response.outcome === 'ok') return <>{children(response.data as T)}</>;
  const detail = outcomeDiagnostic(response);
  const state = outcomePresentation(response, t);
  if (!state) return <OutcomeStateMessage compact={compact} widgetName={widgetName} hideWidgetName={hideWidgetName}
    icon={<HelpCircle className={icon} aria-hidden />} title={t('stateUnknown')} body={t('stateUnknownBody')} detail={detail}
    correlationId={detail ? response.correlationId : undefined} />;
  return <OutcomeStateMessage grouped={grouped} bannerId={bannerId} statusLabel={state.label}
    widgetName={widgetName} hideWidgetName={hideWidgetName} compact={compact}
    icon={<state.Icon className={icon} aria-hidden />} title={state.title} tone={outcomeTone(response)}
    body={<>{state.body}{recovery.evidence && <p className="mt-1 break-words">{recovery.evidence}</p>}</>}
    action={grouped ? undefined : recovery.action} detail={detail} correlationId={response.correlationId} />;
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
  const { grouped, bannerId } = useSharedOutcomeNotice(query.showingPrevious ? null : query.response, query.refetch, widgetName, query.status);
  const barStatus = useQueryBarStatus();
  const requestEditor = useRequestContextEditor();
  const actionable = query.missing.some(item => barStatus?.conditionEditorKeys?.includes(item.key) || (item.key === 'time' && barStatus?.periodAwaitingApply));
  const idleReasons = (actionable || !barStatus || !query.missing.every(item => barStatus.reasonKeys.includes(item.key)))
    ? <ul>{query.missing.map(item => {
      const text = queryMissingSentence(lang, item.label);
      if (item.key === 'time' && barStatus?.periodAwaitingApply) return <li key={item.key}>{t('statePeriodAwaitingApply')}</li>;
      if (barStatus?.conditionEditorKeys?.includes(item.key)) return <li key={item.key}><Button type="button" variant="outline" size="toolbar" onClick={event => requestEditor({ key: item.key, opener: event.currentTarget })}>{text}</Button></li>;
      return <li key={item.key}>{text}</li>;
    })}</ul> : t('stateIdleSeeQueryBar');
  if (query.status === 'idle') return <StateMessage icon={<HelpCircle className="size-4" aria-hidden />} title={t('stateIdle')}
    body={query.missing.length ? idleReasons : undefined} compact={compact} />;
  if (!query.response) return <LoadingBlock rows={skeletonRows} height={skeletonHeight} className={chart ? 'row-span-2 pr-12' : undefined} />;
  const response = query.response;
  // A kept result of other params is not "the same context": say so (ADR-0114).
  const refreshingLabel = t(query.showingPrevious ? 'refreshingPrevious' : 'refreshing');
  const showingPrevious = query.status === 'refreshing' && query.showingPrevious === true;
  const noticeVisible = query.status === 'refreshing' && !grouped && refreshNotice === 'visible';
  const content = <OutcomeContent grouped={grouped} bannerId={bannerId} busy={query.status === 'refreshing'} current={!showingPrevious} widgetName={widgetName} hideWidgetName={hideWidgetName} response={response} onRetry={query.refetch} emptyAction={emptyAction} compact={compact}>{data => children(data, response)}</OutcomeContent>;
  return <div aria-busy={query.status === 'refreshing'} className={cn('relative', query.showingPrevious !== undefined && 'isolate', inPanel && 'h-full min-h-0', (fill || (inPanel && query.showingPrevious !== undefined)) && 'flex min-h-0 flex-1 flex-col', chart && 'row-span-2', chart && response.outcome === 'ok' && 'grid grid-rows-subgrid gap-y-0', analysisSection && response.outcome !== 'ok' && 'pr-12')}>
    {/* One band over the result's bottom edge, only while refreshing (#2381): it takes no layout space, so nothing moves. */}
    {noticeVisible && <QueryRefreshNotice label={refreshingLabel} />}
    {/* Preserve the original DOM for non-opt-in queries. Opt-in results keep a real layout
        box across live/previous transitions; enable the option from the first render to avoid a remount. */}
    {query.showingPrevious === undefined ? content : <div data-query-result-content className={cn('relative min-w-0', (inPanel || fill) && 'flex min-h-0 flex-1 flex-col', chart && response.outcome === 'ok' && 'row-span-2 grid grid-rows-subgrid gap-y-0')}>
      {showingPrevious && <div data-query-stale-tint aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-surface-sunken/20 mix-blend-multiply" />}
      {content}
    </div>}
  </div>;
}
