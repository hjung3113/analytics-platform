import { CircleAlert, Inbox, MoreHorizontal } from 'lucide-react';
import { isValidElement, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatInstant, type ApiResponse } from '@ap/contracts';
import { useI18n, useMessages, type QueryState } from '@ap/kernel';
import { Button, cn, Popover, PopoverContent, PopoverTrigger, SkeletonBlocks, SkeletonRows, TransientOverlayScope } from '@ap/ui';
import { Panel } from '../archetypes/Panel';
import { useSharedOutcomeNotice } from '../filters/OutcomeScope';
import { DockChartPaneId, useDockPendingChart } from '../dock/DockChartHead';
import { useContextEditorOpener } from '../filters/QueryBarStatus';
import { COMPONENTS_MESSAGES } from '../messages';
import { PanelBadge } from '../workspace/PanelBadge';
import { DeclaredQueryPanelContext, QueryPanelContentContext, useInQueryPanel, useInWorkspacePanel, WorkspacePanelVisibleContext } from '../workspace/panelContext';
import { usePublishWorkspaceQueryOverflow, useWorkspaceQueryHead, type QueryMenuItem } from '../workspace/WorkspaceQueryHeads';
import { DataTrustIndicator } from './DataTrustIndicator';
import { emptyCauses, emptyOutcomeText } from './emptyCause';
import { useOutcomeRecovery } from './OutcomeActions';
import { useElementSize } from './useElementSize';
import { classifyOutcome, outcomeDiagnostic, outcomePresentation, outcomeTone } from './outcomePresentation';
import { chartTrustText, trustInstantText, type ChartTrust } from './trustFormat';

export type QueryPanelOptions<T> = {
  title: string;
  subtitle?: ReactNode;
  titleNote?: ReactNode;
  /** Minimum plot height in pixels in page flow. The workspace assigns the body height. */
  height: number;
  /** Controls that change current query inputs, kept outside the result. */
  controls?: ReactNode;
  /** Declare only when the known reason for an empty reply is this selection. */
  selection?: { label: string; clear: () => void };
  emptyNote?: ReactNode;
  /** Overrides the formatted Trust footer, for example to add observation counts. */
  footerTrust?: (data: T, response: ApiResponse<T>) => ChartTrust;
} & (
  | { kind: 'chart' | 'table' | 'chart-table' }
  | { kind: 'kpi'; columns: readonly string[] }
);

const ELAPSED_SECONDS = 3;
const SLOW_SECONDS = 10;
const SECOND_MS = 1000;
const KPI_GRID = 'grid grid-flow-col auto-cols-fr divide-x divide-border-subtle';
const BARS = ['h-1/5', 'h-2/5', 'h-1/3', 'h-1/2', 'h-2/5', 'h-1/5'] as const;
// At this width the title, unwrapped chip, both English actions and trust/menu fit on one row.
const INLINE_ACTION_MIN_WIDTH = 640;
// A first-load error chip («불러오지 못함 · 다시 시도») keeps its retry inline on a half-width panel; only a header narrower than this moves it to ⋯.
const INLINE_ERROR_MIN_WIDTH = 420;
const recoveryOptions = { singleAction: true, retrySize: 'toolbar' } as const;

function PanelPlaceholder<T>({ panel, loading }: { panel: QueryPanelOptions<T>; loading: boolean }) {
  if (!loading && panel.kind !== 'kpi') return null;
  return <div aria-hidden={loading || undefined} className={cn('flex min-h-0 flex-1 flex-col gap-3 py-2', loading && 'motion-safe:animate-panel-skeleton')}>
    {panel.kind === 'kpi' && <div className={KPI_GRID}>{panel.columns.map(label => <div key={label} className="space-y-2 p-3">
      <div className="truncate text-sm font-medium text-text-secondary">{label}</div>
      {loading ? <SkeletonBlocks appearance="panel" blocks={[{ kind: 'title', size: 'large', width: 'half' }, { kind: 'line', width: 'two-thirds' }]} /> : <span className="t-stat">—</span>}
    </div>)}</div>}
    {(panel.kind === 'chart' || panel.kind === 'chart-table') && <div className={cn('flex h-40 items-end gap-3 border-b border-l border-border-subtle px-3', panel.kind === 'chart' && 'mt-auto')}>
      {BARS.map((height, i) => <div key={i} className={cn('flex flex-1 opacity-70', height)}>
        <SkeletonBlocks appearance="panel" blocks={[{ kind: 'body', size: 'fill', width: 'full' }]} />
      </div>)}
    </div>}
    {(panel.kind === 'table' || panel.kind === 'chart-table') && <div className="space-y-2">
      <SkeletonBlocks appearance="panel" blocks={[{ kind: 'title', size: 'small', width: 'full' }]} />
      <SkeletonRows appearance="panel" count={3} size="compact" />
    </div>}
  </div>;
}

function usePanelSeconds(visible: boolean, cancel?: () => void) {
  const [elapsed, setElapsed] = useState({ visible, cancel, seconds: 0 });
  if (elapsed.visible !== visible || elapsed.cancel !== cancel) setElapsed({ visible, cancel, seconds: 0 });
  useEffect(() => {
    if (!visible) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - start) / SECOND_MS);
      setElapsed({ visible, cancel, seconds });
      if (seconds >= SLOW_SECONDS) clearInterval(timer);
    }, SECOND_MS);
    return () => clearInterval(timer);
  }, [visible, cancel]);
  return elapsed.seconds;
}

function PanelOutcomeDetails({ response, grouped, priorLabel, refusalLabel, inlineRecovery, onRetry }: {
  response: ApiResponse<unknown>; grouped: boolean; priorLabel?: string; refusalLabel?: string; inlineRecovery: boolean; onRetry: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const m = useMessages(COMPONENTS_MESSAGES);
  const state = outcomePresentation(response, i18n);
  const isRefusal = refusalLabel !== undefined;
  const label = refusalLabel ?? t('sharedOutcomeNoticeFailed');
  const detailsId = useId();
  const [details, setDetails] = useState(false);
  const [open, setOpen] = useState(false);
  const retrying = useRef(false);
  const { action, evidence } = useOutcomeRecovery(response, () => {
    if (open) {
      retrying.current = true;
      setOpen(false);
    }
    onRetry();
  }, recoveryOptions);
  return <PanelBadge tone="neutral">
    {priorLabel}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button type="button" size={priorLabel ? 'icon-xs' : 'toolbar'} variant="ghost" aria-label={label}>
        {!isRefusal && <CircleAlert aria-hidden className="size-4 text-text-danger" />}
        {!priorLabel && <span className={inlineRecovery ? undefined : 't-badge'}>{label}</span>}
      </Button></PopoverTrigger>
      <PopoverContent aria-label={label} padding="compact" align="start" className="max-w-sm break-words" onCloseAutoFocus={event => {
        setDetails(false);
        if (retrying.current) {
          retrying.current = false;
          event.preventDefault();
        }
      }}>
        <div className="text-xs">
          {!grouped && <p>{state?.body}</p>}
          {!isRefusal && evidence && <p>{evidence}</p>}
          {priorLabel && action}
          <Button variant="ghost" size="toolbar" aria-expanded={details} aria-controls={detailsId} onClick={() => setDetails(!details)}>
            {isRefusal ? t('technicalInfo') : m('panelErrorDetails')} <span className={cn(details && 'rotate-90')}>▸</span>
          </Button>
          <div id={detailsId} hidden={!details} className="text-text-secondary">
            {!isRefusal && <p>{t('technicalInfo')}</p>}
            <p role="note" aria-label={t('serverDetail')}>{t('correlationId')}: <span className="t-mono">{response.correlationId}</span> {outcomeDiagnostic(response)}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
    {!priorLabel && inlineRecovery && action && <> · {action}</>}
  </PanelBadge>;
}

function PanelMenuRecovery({ response, onRetry }: { response: ApiResponse<unknown>; onRetry: () => void }) {
  const { action } = useOutcomeRecovery(response, onRetry, recoveryOptions);
  return action;
}

type RecoveryCommandProps = { label: string; run: () => void };
const RecoveryCommand = (_props: RecoveryCommandProps) => null;
const describeRecovery: QueryMenuItem = (label, run) => <RecoveryCommand label={label} run={run} />;

function WorkspaceRecovery({ id, response, onRetry }: { id: string; response: ApiResponse<unknown>; onRetry: () => void }) {
  const { action } = useOutcomeRecovery(response, onRetry, { ...recoveryOptions, renderAction: describeRecovery });
  // Resolve in the query tree. The menu owns ordinary items (including Radix keyboard navigation);
  // richer recovery such as an access request keeps its query-local providers in a portal.
  const command = isValidElement<RecoveryCommandProps>(action) && action.type === RecoveryCommand ? action.props : null;
  const target = useWorkspaceQueryHead(id, 'extras');
  const overflow = useMemo(() => command ? (item: QueryMenuItem) => item(command.label, command.run) : undefined, [command]);
  usePublishWorkspaceQueryOverflow(id, overflow);
  return target && !command && createPortal(action, target);
}

export function QueryPanel<T>({ query, panel, children, fallback, emptyAction, refreshNotice }: {
  query: QueryState<T>; panel: QueryPanelOptions<T>;
  children: (data: T, response: ApiResponse<T>, result: { stale: boolean }) => ReactNode;
  emptyAction?: ReactNode; refreshNotice: 'visible' | 'hidden';
  fallback: (notice: { grouped: boolean; bannerId?: string }) => ReactNode;
}) {
  const i18n = useI18n();
  const { t, lang } = i18n;
  const m = useMessages(COMPONENTS_MESSAGES);
  const id = useId();
  const dockId = useContext(DockChartPaneId);
  const inWorkspace = useInWorkspacePanel();
  const inQueryPanel = useInQueryPanel();
  const workspace = inWorkspace && !inQueryPanel ? dockId : null;
  const visible = useContext(WorkspacePanelVisibleContext);
  const workspaceId = visible ? workspace ?? undefined : undefined;
  const headTarget = useWorkspaceQueryHead(workspaceId, 'signal');
  const target = useRef<HTMLElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const { ref: measurePanel, width } = useElementSize();
  const bindPanel = useCallback((node: HTMLElement | null) => {
    target.current = node;
    measurePanel(node);
  }, [measurePanel]);
  const focus = useCallback(() => target.current?.focus(), []);
  useLayoutEffect(() => {
    const previous = lastFocused.current;
    if (!workspace || !visible || !previous) return;
    const active = previous.ownerDocument.activeElement;
    if (previous.isConnected && !previous.closest('[inert], :disabled')) return;
    lastFocused.current = null;
    if (active === previous || active === previous.ownerDocument.body) focus();
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const handledMenuAction = useRef(false);
  const runMenuAction = (action: () => void) => {
    if (menuOpen) {
      handledMenuAction.current = true;
      setMenuOpen(false);
    }
    action();
  };
  const response = query.response;
  const loading = query.status === 'loading' || query.status === 'refreshing';
  const showDelay = query.status === 'loading' || (query.status === 'refreshing' && refreshNotice === 'visible');
  const seconds = usePanelSeconds(loading, query.cancel);
  const slow = loading && seconds >= SLOW_SECONDS;
  const narrow = useContextEditorOpener();
  const inlineDelay = showDelay && width !== null && width >= INLINE_ACTION_MIN_WIDTH;
  const narrowHeader = workspace ? (width ?? 0) < INLINE_ERROR_MIN_WIDTH : width !== null && width > 0 && width < INLINE_ERROR_MIN_WIDTH;
  const notice = useSharedOutcomeNotice(query.cancelled || query.showingPrevious ? null : response, query.refetch, panel.title, query.status, focus);
  const error = response && outcomeTone(response) === 'danger' ? response : null;
  const refusalLabel = notice.grouped && response && classifyOutcome(response.outcome) === 'refusal'
    ? outcomePresentation(response, i18n)?.label : undefined;
  const prior = error && !query.cancelled ? query.previousResult : undefined;
  const stale = Boolean(prior) || query.showingPrevious === true;
  // A keep-previous refresh keeps the drawn result mounted (06 §19 keepPrevious, #1365). The body becomes inert;
  // a docked chart must also suspend result actions portaled outside the body while its layout menu stays available.
  const refreshingPrevious = stale && !prior;
  const priorContent = prior || (workspace && stale);
  const result = response?.outcome === 'ok' ? response : prior?.response;
  // Until its result draws, a chart panel still counts as one of its pane's charts (a pane head joins only a lone chart).
  useDockPendingChart((panel.kind === 'chart' || panel.kind === 'chart-table') && !result);
  const dimmed = stale || (workspace !== null && loading);
  const empty = response?.outcome === 'empty';
  const causes = empty ? emptyCauses(response) : [];
  const emptyExplanation = causes.length ? emptyOutcomeText(causes, t).body : undefined;
  const trust = !loading && !query.cancelled && response?.outcome === 'ok'
    ? chartTrustText(panel.footerTrust ? panel.footerTrust(response.data as T, response) : response.trust, lang) : undefined;
  // The drawn result's Trust (current, refreshing or previous): a chart drawing that same result folds its source line into this footer.
  const shownTrust = result ? chartTrustText(panel.footerTrust ? panel.footerTrust(result.data as T, result) : result.trust, lang) ?? null : null;
  // A declared workspace panel prints the drawn result's Trust (its chart folds into this line); the page flow keeps the settled one.
  const footerTrust = workspace ? shownTrust : trust;
  const source = footerTrust?.source ?? result?.trust?.source ?? response?.trust?.source ?? '—';
  const dataTrust = <DataTrustIndicator summary query={query} />;
  const footer = <footer className={cn('flex h-8 items-center border-t border-border-subtle px-4 text-tiny text-text-muted', workspace && 'shrink-0 justify-between gap-2')}>
    <span className="truncate">{t('source')} <span className="t-mono">{source}</span>
      {footerTrust && <> · {t('updated')} {footerTrust.updated} · {t('coverage')} {footerTrust.coverage}</>}</span>
    {workspace && dataTrust}
  </footer>;
  const trustUpdated = prior && trustInstantText(prior.response.trust?.updatedAt, lang);
  const priorTime = prior && (trustUpdated && trustUpdated !== '—' ? trustUpdated : formatInstant(prior.completedAt, lang, undefined, 'monthDayMinute')).split(' ').at(-1);
  const priorLabel = priorTime && m('panelPrior', { time: priorTime });
  const { refetch, cancel } = query;
  const retryQuery = useCallback(() => { focus(); refetch(); }, [focus, refetch]);
  const retry = <Button type="button" variant="ghost" size="toolbar" onClick={retryQuery}>{t('retry')}</Button>;
  const announceFailure = prior !== undefined && !loading && !notice.grouped;
  const delayLabel = stale ? t('refreshingPrevious') : t(result ? 'refreshing' : 'loading');
  const selection = empty ? panel.selection : undefined;
  let stateLabel: ReactNode = <span role={notice.grouped ? undefined : 'alert'} className="inline-flex items-center gap-1"><CircleAlert className="size-4 text-text-danger" aria-hidden />{t('sharedOutcomeNoticeFailed')}</span>;
  if (query.cancelled) stateLabel = m('panelCancelled');
  else if (selection) stateLabel = <span>{m('panelSelectionEmpty', { selection: selection.label })}</span>;
  else if (empty) stateLabel = m('panelEmpty');
  else if (refusalLabel) stateLabel = t('sharedOutcomeNoticeFor', { status: refusalLabel });
  const narrowQuery = slow && showDelay ? narrow : undefined;
  const cancelRefresh = useCallback(() => { focus(); cancel?.(); }, [focus, cancel]);
  const cancelQuery = slow && cancel ? cancelRefresh : undefined;
  const narrowAction = narrowQuery && <Button size="toolbar" variant="ghost" onClick={() => runMenuAction(() => narrowQuery())}>{m('panelNarrow')}</Button>;
  const cancelAction = cancelQuery && <Button size="toolbar" variant="ghost" onClick={() => runMenuAction(cancelQuery)}>{t('cancel')}</Button>;
  const delayActions = <>{narrowAction}{cancelAction}</>;
  const visibleError = !loading && !query.cancelled ? error : null;
  const visibleOutcome = !loading && !query.cancelled && refusalLabel ? response : visibleError;
  const compactError = narrowHeader && visibleError !== null && !priorLabel;
  const signal = <>
    {panel.titleNote}
    {(workspace || (showDelay && !slow)) && <span role="status" className="sr-only">{showDelay && (slow ? m('panelSlow') : delayLabel)}</span>}
    {showDelay && seconds >= ELAPSED_SECONDS && <PanelBadge tone="warning">
      {slow ? <span role={workspace ? undefined : 'status'} aria-hidden={workspace ? true : undefined}>{m('panelSlow')}</span> : <span aria-hidden>{m('panelElapsed', { seconds })}</span>}
    </PanelBadge>}
    {inlineDelay && delayActions}
    {query.cancelled && <PanelBadge>{m('panelCancelled')}{retry}</PanelBadge>}
    {visibleOutcome && <PanelOutcomeDetails response={visibleOutcome} grouped={notice.grouped} priorLabel={priorLabel}
      refusalLabel={refusalLabel} inlineRecovery={visibleError !== null && !compactError} onRetry={retryQuery} />}
    <span role={announceFailure ? 'status' : undefined} aria-live="polite" aria-atomic="true" aria-label={panel.title} className="sr-only">
      {announceFailure && `${t('sharedOutcomeNoticeFailed')} · ${priorLabel ?? ''}`}
    </span>
  </>;
  const delayOverflow = useMemo(() => !inlineDelay && (narrowQuery || cancelQuery) ? (item: QueryMenuItem) => <>
    {narrowQuery && item(m('panelNarrow'), () => narrowQuery())}
    {cancelQuery && item(t('cancel'), cancelQuery)}
  </> : undefined, [inlineDelay, narrowQuery, cancelQuery, m, t]);
  usePublishWorkspaceQueryOverflow(compactError ? undefined : workspaceId, delayOverflow);
  const content = <>
    {panel.controls && <div className="mb-2 flex flex-wrap items-center gap-2">{panel.controls}</div>}
    <QueryPanelContentContext.Provider value={priorContent ? 'prior' : 'current'}>
      {/* eslint-disable-next-line shadcn/no-inline-styles -- the menu declares the runtime plot minimum */}
      <div className={cn('relative flex flex-col', workspace && 'min-h-0 flex-1')} style={workspace ? undefined : { minHeight: panel.height }} aria-busy={loading}>
        {result && <div inert={refreshingPrevious || undefined} className={cn(dimmed && 'opacity-40 grayscale', panel.kind === 'kpi' && KPI_GRID, workspace && panel.kind !== 'kpi' && 'flex min-h-0 flex-1 flex-col')}>
          <TransientOverlayScope active={!stale}>{children(result.data as T, result, { stale })}</TransientOverlayScope>
        </div>}
        {!result && loading && <div role="status" aria-label={t('loading')} aria-busy className="flex min-h-0 flex-1 flex-col"><PanelPlaceholder panel={panel} loading /></div>}
        {!result && !loading && <>
          <PanelPlaceholder panel={panel} loading={false} />
          {empty || error || refusalLabel || query.cancelled
            ? <div role="group" aria-label={panel.title} className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-xs text-text-secondary">
              {empty && panel.emptyNote}
              <span className="inline-flex flex-wrap items-center justify-center gap-1">
                {empty && <Inbox className="size-4" aria-hidden />}
                {stateLabel}
                {selection && <> · <Button type="button" variant="ghost" size="toolbar" onClick={selection.clear}>{m('panelClearSelection')}</Button></>}
              </span>
              {emptyExplanation && <p>{emptyExplanation}</p>}
              {empty && emptyAction}
            </div>
            : fallback(notice)}
        </>}
      </div>
    </QueryPanelContentContext.Provider>
  </>;
  const panelClass = 'min-w-0 break-keep focus-visible:outline-2 focus-visible:outline-focus-ring';
  if (workspace) return <DeclaredQueryPanelContext.Provider value={{ trust: shownTrust, lang }}>
    <section ref={bindPanel} tabIndex={-1} aria-label={panel.title} aria-describedby={notice.bannerId}
    className={cn(panelClass, 'flex h-full min-h-0 flex-col focus-visible:-outline-offset-2')}
    onFocus={event => { lastFocused.current = event.target; }}
    onBlur={event => { if (event.relatedTarget && event.relatedTarget !== event.target.ownerDocument.body) lastFocused.current = null; }}>
    {headTarget && createPortal(<div data-workspace-query-head className="flex items-center gap-1">{signal}</div>, headTarget)}
    {workspaceId && compactError && <WorkspaceRecovery id={workspaceId} response={visibleError} onRetry={retryQuery} />}
    {panel.subtitle && <p className="truncate px-4 text-xs text-text-secondary">{panel.subtitle}</p>}
    {content}{footer}
    </section>
  </DeclaredQueryPanelContext.Provider>;
  return <Panel ref={bindPanel} tabIndex={-1} aria-describedby={notice.bannerId} id={id} title={panel.title} subtitle={panel.subtitle}
    className={cn(panelClass, 'scroll-mt-40', compactError && '[&>header]:px-2 [&>header_h2]:min-w-0')} badge={signal} footer={footer}
    actions={<>{dataTrust}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild><Button type="button" size="icon-sm" variant="ghost" aria-label={m('panelMenu', { panel: panel.title })}><MoreHorizontal aria-hidden /></Button></PopoverTrigger>
        <PopoverContent padding="compact" align="end" onCloseAutoFocus={event => {
          if (!handledMenuAction.current) return;
          handledMenuAction.current = false;
          event.preventDefault();
        }}>
          {!inlineDelay && (narrowAction || cancelAction) && <div className="mb-2 flex flex-wrap gap-1">{delayActions}</div>}
          {compactError && <PanelMenuRecovery response={visibleError} onRetry={() => runMenuAction(retryQuery)} />}
          <div className="text-xs">{t('technicalInfo')}<p>{t('source')} {source}</p></div>
        </PopoverContent>
      </Popover></>}>
    {content}
  </Panel>;
}
