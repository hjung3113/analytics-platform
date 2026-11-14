import { createContext, useContext, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Ban, Clock, Inbox, Loader2, RotateCw, ServerCrash } from 'lucide-react';
import type { ApiResponse } from '@ap/contracts';
import { errorGuidance, useI18n, type QueryState } from '@ap/kernel';
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { emptyCauses, emptyOutcomeText } from '../state/emptyCause';

type Widget = { id: string; response: ApiResponse<unknown> | null; retry: () => void; name?: string; status: QueryState<unknown>['status'] };
type Group = { key: string; bannerId: string; widgets: Widget[]; busy: boolean };
type PendingMember = { response: Widget['response']; refreshing: boolean; done: boolean };
const EMPTY: Group[] = [];

function memberNames(widgets: readonly Widget[]): string[] {
  return [...new Set(widgets.map(widget => widget.name?.trim()).filter((name): name is string => Boolean(name)))];
}

function groupingKey(response: ApiResponse<unknown> | null): string | null {
  if (!response || !['error', 'timeout', 'empty', 'forbidden'].includes(response.outcome)) return null;
  const explanations = response.assessments.filter(a => a.explainsEmpty && a.state === 'confirmed')
    .map(a => JSON.stringify([a.kind, a.state, a.statusSource, a.observedAt, a.reason, a.explainsEmpty, a.detail])).sort();
  return JSON.stringify([response.outcome, response.message, explanations]);
}

function createStore(scopeId: string) {
  const prefix = scopeId.replace(/[^a-zA-Z0-9_-]/g, '') || 'scope';
  const widgets = new Map<string, Widget>();
  const keyIds = new Map<string, string>();
  let nextKeyId = 0;
  const listeners = new Set<() => void>();
  const pending = new Map<string, Map<string, PendingMember>>();
  let snapshot = EMPTY;
  // Place (e) of the blocked-place request (ADR-0154 decision 6): whether at least one widget of this body answered `forbidden`.
  let forbidden = false;
  const publish = () => {
    forbidden = [...widgets.values()].some(widget => widget.response?.outcome === 'forbidden');
    for (const [key, members] of pending) {
      for (const [id, member] of members) {
        const widget = widgets.get(id);
        if (widget?.status === 'refreshing') member.refreshing = true;
        if (!widget || (widget.status !== 'refreshing' && (widget.response !== member.response || member.refreshing))) member.done = true;
      }
      if ([...members.values()].every(member => member.done)) pending.delete(key);
    }
    const groups = new Map<string, Widget[]>();
    for (const widget of widgets.values()) {
      const key = groupingKey(widget.response);
      if (key !== null) groups.set(key, [...(groups.get(key) ?? []), widget]);
    }
    for (const key of groups.keys()) {
      if (!keyIds.has(key)) keyIds.set(key, `outcome-${prefix}-g${++nextKeyId}`);
    }
    for (const key of keyIds.keys()) {
      if (!groups.has(key)) keyIds.delete(key);
    }
    const next = [...groups].filter(([, members]) => members.length >= 2)
      .map(([key, members]) => ({ key, bannerId: keyIds.get(key)!, widgets: members, busy: pending.has(key) || members.some(widget => widget.status === 'refreshing') }))
      .sort((a, b) => b.widgets.length - a.widgets.length);
    if (next.length !== snapshot.length || next.some((group, i) => group.key !== snapshot[i].key || group.bannerId !== snapshot[i].bannerId || group.busy !== snapshot[i].busy ||
      group.widgets.some((widget, j) => widget !== snapshot[i].widgets[j]) || group.widgets.length !== snapshot[i].widgets.length)) snapshot = next;
    listeners.forEach(listener => listener());
  };
  const isGrouped = (id: string, key: string | null) => key !== null && [...widgets.values()].some(widget => widget.id !== id && groupingKey(widget.response) === key);
  const store = {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    getForbidden: () => forbidden,
    getNoticeSnapshot: (id: string, key: string | null) => {
      if (!isGrouped(id, key) || key === null) return '0|0|';
      const bannerId = keyIds.get(key) ?? '';
      const multiple = snapshot.length > 1 || (snapshot.length === 1 && snapshot[0].key !== key);
      return `1|${multiple ? '1' : '0'}|${bannerId}`;
    },
    set: (widget: Widget) => {
      const old = widgets.get(widget.id);
      if (old?.response === widget.response && old?.retry === widget.retry && old?.name === widget.name && old?.status === widget.status) return;
      widgets.set(widget.id, widget);
      publish();
    },
    remove: (id: string) => { if (widgets.delete(id)) publish(); },
    retry: (key: string) => {
      const group = snapshot.find(group => group.key === key);
      if (!group || group.busy) return;
      pending.set(key, new Map(group.widgets.map(widget => [widget.id, { response: widget.response, refreshing: false, done: false }])));
      publish(); // Guard re-entry immediately, even before the query's refreshing commit.
      group.widgets.forEach(widget => widget.retry());
    },
  };
  return store;
}
const OutcomeContext = createContext<ReturnType<typeof createStore> | null>(null);
const subscribeNone = () => () => {};
const emptySnapshot = () => EMPTY;
const noForbidden = () => false;

export function OutcomeScope({ children }: { children: ReactNode }) {
  const scopeId = useId();
  const [store] = useState(() => createStore(scopeId));
  return <OutcomeContext.Provider value={store}>{children}</OutcomeContext.Provider>;
}

function useOutcomeSnapshot(response: Widget['response'], retry: () => void, name: string | undefined, status: Widget['status']) {
  const store = useContext(OutcomeContext);
  const id = useId();
  const key = groupingKey(response);
  useLayoutEffect(() => { store?.set({ id, response, retry, name, status }); }, [store, id, response, retry, name, status]);
  useLayoutEffect(() => () => { store?.remove(id); }, [store, id]);
  // A primitive snapshot avoids running successful children for unrelated registrations.
  const getSnapshot = () => store?.getNoticeSnapshot(id, key) ?? '0|0|';
  return useSyncExternalStore(store?.subscribe ?? subscribeNone, getSnapshot, () => '0|0|');
}

export function useSharedOutcome(response: Widget['response'], retry: () => void, name: string | undefined, status: Widget['status']) {
  return useOutcomeSnapshot(response, retry, name, status).startsWith('1|');
}

export function useSharedOutcomeNotice(response: Widget['response'], retry: () => void, name: string | undefined, status: Widget['status']) {
  const raw = useOutcomeSnapshot(response, retry, name, status);
  if (!raw.startsWith('1|')) return { grouped: false as const, multiple: false, bannerId: undefined };
  const parts = raw.split('|');
  return { grouped: true as const, multiple: parts[1] === '1', bannerId: parts[2] || undefined };
}

/** `compact` (fill pages): a one-line strip with the same group, tone, retry and live rules; the sentence truncates and `자세히` shows it in full. */
function OutcomeBanner({ group, multiple, onRetry, compact = false }: { group: Group; multiple: boolean; onRetry: () => void; compact?: boolean }) {
  const { t } = useI18n();
  const banner = useRef<HTMLElement>(null);
  const unmounting = useRef(false);
  const detailsId = useId();
  const titleId = `${detailsId}-title`;
  useLayoutEffect(() => {
    const element = banner.current;
    unmounting.current = false; // StrictMode re-runs the effect after a simulated cleanup
    return () => {
      unmounting.current = true;
      // Only this strip's own details popover (portaled out of it) counts as owned focus, never another group's.
      // Matched by id, not ref: the portaled node's ref may already be detached when this cleanup runs.
      const active = document.activeElement;
      if (element && (element.contains(active) || active?.closest<HTMLElement>('[data-outcome-details]')?.dataset.outcomeDetails === detailsId)) {
        // Detail panel (dialog) first, then the main landmark; the page content element is the fallback outside a shell.
        // No extra landmark is added around page content (06 §19, §26).
        const target = element.closest<HTMLElement>('[data-outcome-focus-target], [role="dialog"]')
          ?? element.closest<HTMLElement>('main[tabindex]') ?? element.closest<HTMLElement>('[data-platform-page-content]');
        if (target?.isConnected) target.focus({ preventScroll: true });
      }
    };
  }, [detailsId]);
  const outcome = group.widgets[0].response!.outcome;
  const danger = outcome === 'error' || outcome === 'timeout';
  const warning = outcome === 'forbidden';
  const title = warning ? t('stateForbidden') : outcome === 'error' ? t('stateError') : outcome === 'timeout' ? t('stateTimeout') : emptyOutcomeText(emptyCauses(group.widgets[0].response!), t).title;
  const label = warning ? t('sharedOutcomeForbidden') : outcome === 'error' ? t('sharedOutcomeError') : outcome === 'timeout' ? t('sharedOutcomeTimeout') : t('sharedOutcomeEmpty');
  const Icon = warning ? Ban : outcome === 'error' ? ServerCrash : outcome === 'timeout' ? Clock : Inbox;
  const summary = t('sharedOutcomeSummary', { count: group.widgets.length });
  const names = multiple ? memberNames(group.widgets) : [];
  const response = group.widgets[0].response!;
  const guide = errorGuidance(response.message);
  const body = warning ? t('stateForbiddenBody') : outcome === 'timeout' ? t('stateTimeoutBody')
    : outcome === 'error' ? <>{t(guide.cause)} {t(guide.action)}</> : emptyOutcomeText(emptyCauses(response), t).body;
  const retry = warning ? null : <Button type="button" size="sm" variant="secondary" aria-busy={group.busy} aria-disabled={group.busy} onClick={onRetry}>
    {group.busy ? <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" /> : <RotateCw aria-hidden className="size-3.5" />}{t('retry')}
  </Button>;
  if (compact) {
    return <section id={group.bannerId} ref={banner} data-outcome-banner data-outcome-compact role="group" aria-label={t('sharedOutcomeRegion')}
      className={cn('mb-3 flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-text-secondary', danger ? 'border-text-danger-label bg-accent-danger-soft' : warning ? 'border-border-control bg-accent-warn-soft text-text-warning-label' : 'border-border-control bg-surface-sunken')}>
      <Icon aria-hidden className={cn('size-4 shrink-0', danger ? 'text-text-danger-label' : warning ? 'text-text-warning-label' : 'text-text-secondary')} />
      <span className={cn('shrink-0 whitespace-nowrap font-semibold', danger ? 'text-text-danger-label' : warning ? 'text-text-warning-label' : 'text-text-secondary')}>{label} ·</span>
      <p className="min-w-0 flex-1 truncate" title={summary}>{summary}</p>
      <Popover>
        <PopoverTrigger asChild><Button type="button" size="toolbar" variant="ghost" className="shrink-0">{t('outcomeDetails')}</Button></PopoverTrigger>
        <PopoverContent data-outcome-details={detailsId} aria-labelledby={titleId} align="end" padding="compact" className="max-w-sm"
          onCloseAutoFocus={event => { if (unmounting.current) event.preventDefault(); }}>
          <div className="text-xs text-text-secondary">
            <p id={titleId} className={cn('mb-1 text-sm font-semibold', danger ? 'text-text-danger-label' : warning ? 'text-text-warning-label' : 'text-text-secondary')}>{title}</p>
            <p>{summary}</p>
            {names.length > 0 && <p className="mt-1">{names.join(' · ')}</p>}
            <div className="mt-1">{body}</div>
          </div>
        </PopoverContent>
      </Popover>
      {retry}
    </section>;
  }
  return <section id={group.bannerId} ref={banner} data-outcome-banner role="group" aria-label={t('sharedOutcomeRegion')}
    className={cn('mb-3 rounded-md border p-3 text-xs text-text-secondary', danger ? 'border-text-danger-label bg-accent-danger-soft' : warning ? 'border-border-control bg-accent-warn-soft text-text-warning-label' : 'border-border-control bg-surface-sunken')}>
    <div className={cn('mb-1.5 flex items-center gap-2 text-sm font-semibold', danger ? 'text-text-danger-label' : warning ? 'text-text-warning-label' : 'text-text-secondary')}><Icon aria-hidden className="size-4 shrink-0" />{title}</div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-[1_1_18rem]">
        <p>{summary}</p>
        {names.length > 0 && <p className="mt-0.5">{names.join(' · ')}</p>}
        <div className="mt-1">{body}</div>
      </div>
      {retry}
    </div>
  </section>;
}

/** Package-internal: the access-request entry also carries grouped forbidden outcomes, without another live region. */
export function ForbiddenRequestMessage({ body, action }: { body: ReactNode; action: ReactNode }) {
  const store = useContext(OutcomeContext);
  const groups = useSyncExternalStore(store?.subscribe ?? subscribeNone, store?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const forbiddenGroups = groups.filter(group => group.widgets[0].response!.outcome === 'forbidden');
  const multiple = groups.length > 1;
  const { t } = useI18n();
  return <div role={forbiddenGroups.length ? 'group' : 'status'} aria-label={forbiddenGroups.length ? t('sharedOutcomeRegion') : undefined} className="flex min-h-24 flex-col items-start gap-2 rounded-md bg-accent-warn-soft p-4 text-text-warning-label">
    <div className="flex items-center gap-2 text-sm font-semibold"><Ban aria-hidden className="size-4 text-text-warning" />{t('stateForbidden')}</div>
    {forbiddenGroups.map(group => {
      const names = multiple ? memberNames(group.widgets) : [];
      return <p key={group.key} id={group.bannerId} className="text-xs">
        {t('sharedOutcomeSummary', { count: group.widgets.length })}
        {names.length > 0 ? ` (${names.join(' · ')})` : ''}
      </p>;
    })}
    <div className="max-w-prose break-keep text-xs leading-4">{body}</div>
    <div className="flex flex-wrap items-center gap-3">{action}</div>
  </div>;
}

/** `forbidden`: the page's request banner, drawn once above the groups while at least one widget of the body answers `forbidden`. */
export function OutcomeBanners({ compact = false, forbidden }: { compact?: boolean; forbidden?: ReactNode } = {}) {
  const store = useContext(OutcomeContext);
  const groups = useSyncExternalStore(store?.subscribe ?? subscribeNone, store?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const anyForbidden = useSyncExternalStore(store?.subscribe ?? subscribeNone, store?.getForbidden ?? noForbidden, noForbidden);
  const { t } = useI18n();
  const multiple = groups.length > 1;
  const announcement = (danger: boolean) => groups.filter(group => ['error', 'timeout'].includes(group.widgets[0].response!.outcome) === danger).map(group => {
    return <span key={group.key} className="block">{t('sharedOutcomeSummary', { count: group.widgets.length })}{group.busy ? ` ${t('refreshing')}` : ''}</span>;
  });
  // Empty from the first commit; visible banners/groups are never additional live channels.
  return <>
    <div data-outcome-announcer="assertive" aria-live="assertive" aria-atomic="true" className="sr-only">{announcement(true)}</div>
    <div data-outcome-announcer="polite" aria-live="polite" aria-atomic="true" className="sr-only">{announcement(false)}</div>
    {anyForbidden && forbidden}
    {groups.filter(group => !forbidden || group.widgets[0].response!.outcome !== 'forbidden').map(group => <OutcomeBanner key={group.key} group={group} multiple={multiple} compact={compact} onRetry={() => store?.retry(group.key)} />)}
  </>;
}
