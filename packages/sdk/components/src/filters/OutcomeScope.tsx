import { createContext, useContext, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { readQueryRecovery, type ApiResponse } from '@ap/contracts';
import { errorGuidance, useI18n, useMessages, type QueryState } from '@ap/kernel';
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { useOutcomeRecovery } from '../state/OutcomeActions';
import { outcomeIsBlocked, outcomePresentation, outcomeTone } from '../state/outcomePresentation';
import { COMPONENTS_MESSAGES } from '../messages';

type Widget = { id: string; response: ApiResponse<unknown> | null; retry: () => void; name?: string; status: QueryState<unknown>['status']; focus?: () => void };
type Group = { key: string; bannerId: string; widgets: Widget[]; busy: boolean };
type PendingMember = { response: Widget['response']; refreshing: boolean; done: boolean };
const EMPTY: Group[] = [];

function memberNames(widgets: readonly Widget[]): string[] {
  return [...new Set(widgets.map(widget => widget.name?.trim()).filter((name): name is string => Boolean(name)))];
}
const includesPanels = (group: Group) => group.widgets.some(widget => widget.focus);

function groupingKey(response: ApiResponse<unknown> | null): string | null {
  if (!response || !['error', 'timeout', 'empty', 'forbidden', 'too_large'].includes(response.outcome)) return null;
  const explanations = response.assessments.filter(a => a.explainsEmpty && a.state === 'confirmed')
    .map(a => JSON.stringify([a.kind, a.state, a.statusSource, a.observedAt, a.reason, a.explainsEmpty, a.detail])).sort();
  return JSON.stringify([response.outcome, response.message, explanations, readQueryRecovery(response.recovery)]);
}

function createStore(scopeId: string) {
  const prefix = scopeId.replace(/[^a-zA-Z0-9_-]/g, '') || 'scope';
  const widgets = new Map<string, Widget>();
  const keyIds = new Map<string, string>();
  let nextKeyId = 0;
  const listeners = new Set<() => void>();
  const pending = new Map<string, Map<string, PendingMember>>();
  let snapshot = EMPTY;
  const publish = () => {
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
    getNoticeSnapshot: (id: string, key: string | null) => {
      if (!isGrouped(id, key) || key === null) return '0|';
      const bannerId = keyIds.get(key) ?? '';
      return `1|${bannerId}`;
    },
    set: (widget: Widget) => {
      const old = widgets.get(widget.id);
      if (old?.response === widget.response && old?.retry === widget.retry && old?.name === widget.name && old?.status === widget.status && old?.focus === widget.focus) return;
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

export function OutcomeScope({ children }: { children: ReactNode }) {
  const scopeId = useId();
  const [store] = useState(() => createStore(scopeId));
  return <OutcomeContext.Provider value={store}>{children}</OutcomeContext.Provider>;
}

function useOutcomeSnapshot(response: Widget['response'], retry: () => void, name: string | undefined, status: Widget['status'], focus?: () => void) {
  const store = useContext(OutcomeContext);
  const id = useId();
  const key = groupingKey(response);
  useLayoutEffect(() => { store?.set({ id, response, retry, name, status, focus }); }, [store, id, response, retry, name, status, focus]);
  useLayoutEffect(() => () => { store?.remove(id); }, [store, id]);
  // A primitive snapshot avoids running successful children for unrelated registrations.
  const getSnapshot = () => store?.getNoticeSnapshot(id, key) ?? '0|';
  return useSyncExternalStore(store?.subscribe ?? subscribeNone, getSnapshot, () => '0|');
}

export function useSharedOutcome(response: Widget['response'], retry: () => void, name: string | undefined, status: Widget['status']) {
  return useOutcomeSnapshot(response, retry, name, status).startsWith('1|');
}

export function useSharedOutcomeNotice(response: Widget['response'], retry: () => void, name: string | undefined, status: Widget['status'], focus?: () => void) {
  const raw = useOutcomeSnapshot(response, retry, name, status, focus);
  if (!raw.startsWith('1|')) return { grouped: false as const, bannerId: undefined };
  return { grouped: true as const, bannerId: raw.slice('1|'.length) || undefined };
}

/** How many shared-cause banners the scope shows now; 0 outside an OutcomeScope. */
export function useOutcomeBannerCount() {
  const store = useContext(OutcomeContext);
  return useSyncExternalStore(store?.subscribe ?? subscribeNone, () => store?.getSnapshot().length ?? 0, () => 0);
}

/** `compact` (page bodies): a one-line strip with the same group, tone, retry and live rules; the sentence truncates and `자세히` shows it in full. */
function OutcomeBanner({ group, onRetry, compact = false }: { group: Group; onRetry: () => void; compact?: boolean }) {
  const i18n = useI18n();
  const { t } = i18n;
  const m = useMessages(COMPONENTS_MESSAGES);
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
  const response = group.widgets[0].response!;
  const { outcome } = response;
  const notice = outcomePresentation(response, i18n);
  const tone = outcomeTone(response);
  const danger = tone === 'danger';
  const warning = tone === 'warning';
  const panels = includesPanels(group);
  const count = group.widgets.length;
  const region = panels ? m('outcomePanelRegion') : t('sharedOutcomeRegion');
  const summary = panels ? m('outcomePanelSummary', { count }) : t('sharedOutcomeSummary', { count });
  const recovery = useOutcomeRecovery(response, onRetry, { busy: group.busy, current: !outcomeIsBlocked(response), groupReplies: group.widgets.map(widget => widget.response!), retryLabel: panels ? m('outcomeRetryAll') : undefined });
  // A registered group always has a known failure or empty presentation.
  if (!notice) return null;
  const { title, body, label, Icon } = notice;
  const names = memberNames(group.widgets);
  const panelNames = panels && <span className="flex min-w-0 items-center gap-1 overflow-x-auto">
    {group.widgets.map(widget => widget.name && (widget.focus
      ? <Button key={widget.id} type="button" variant="ghost" size="toolbar" onClick={widget.focus}>{widget.name}</Button>
      : <span key={widget.id} className="shrink-0">{widget.name}</span>))}
  </span>;
  if (compact) {
    const inlineText = notice.fixedEquipmentReason ?? recovery.evidence
      ?? ((outcome === 'error' && errorGuidance(response.message).code === null) || outcome === 'timeout' ? summary : body);
    const border = danger ? 'border-text-danger/28 bg-accent-danger-soft' : warning ? 'border-border-control bg-accent-warn-soft text-text-warning-label' : 'border-border-strong bg-surface-card';
    return <section id={group.bannerId} ref={banner} data-outcome-banner data-outcome-compact role="group" aria-label={region}
      className={cn('mb-3 flex items-center gap-2 rounded-md border px-3 text-xs text-text-secondary', panels ? ['h-10 whitespace-nowrap', border] : ['flex-wrap py-1.5', danger ? 'border-text-danger-label bg-accent-danger-soft' : warning ? 'border-border-control bg-accent-warn-soft text-text-warning-label' : 'border-border-control bg-surface-sunken'])}>
      <Icon aria-hidden className={cn('size-4 shrink-0', danger ? 'text-text-danger-label' : warning ? 'text-text-warning-label' : 'text-text-secondary')} />
      <span className={cn('shrink-0 whitespace-nowrap font-semibold', danger ? 'text-text-danger-label' : warning ? 'text-text-warning-label' : 'text-text-secondary')}>{label} ·</span>
      <p className="min-w-0 flex-1 truncate break-keep" title={inlineText}>{inlineText}</p>
      {panelNames}
      {!panels && names.length > 0 && <span className="sr-only">{names.join(' · ')}</span>}
      <Popover>
        <PopoverTrigger asChild><Button type="button" size="toolbar" variant="ghost" className="shrink-0">{t('outcomeDetails')}</Button></PopoverTrigger>
        <PopoverContent data-outcome-details={detailsId} aria-labelledby={titleId} align="end" padding="compact" className="max-w-sm"
          onCloseAutoFocus={event => { if (unmounting.current) event.preventDefault(); }}>
          <div className="text-xs text-text-secondary">
            <p id={titleId} className={cn('mb-1 text-sm font-semibold', danger ? 'text-text-danger-label' : warning ? 'text-text-warning-label' : 'text-text-secondary')}>{title}</p>
            <p>{summary}</p>
            {names.length > 0 && <p className="mt-1">{names.join(' · ')}</p>}
            <div className="mt-1 break-keep">{body}</div>
            {recovery.evidence && <p className="mt-1 break-words">{recovery.evidence}</p>}
          </div>
        </PopoverContent>
      </Popover>
      {recovery.action}
    </section>;
  }
  return <section id={group.bannerId} ref={banner} data-outcome-banner role="group" aria-label={region}
    className={cn('mb-3 rounded-md border p-3 text-xs text-text-secondary', danger ? 'border-text-danger-label bg-accent-danger-soft' : warning ? 'border-border-control bg-accent-warn-soft text-text-warning-label' : 'border-border-control bg-surface-sunken')}>
    <div className={cn('mb-1.5 flex items-center gap-2 text-sm font-semibold', danger ? 'text-text-danger-label' : warning ? 'text-text-warning-label' : 'text-text-secondary')}><Icon aria-hidden className="size-4 shrink-0" />{title}</div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-[1_1_18rem]">
        <p>{summary}</p>
        {panelNames}
        {!panels && names.length > 0 && <p className="mt-0.5">{names.join(' · ')}</p>}
        <div className="mt-1 break-keep">{body}</div>
        {recovery.evidence && <p className="mt-1 break-words">{recovery.evidence}</p>}
      </div>
      {recovery.action}
    </div>
  </section>;
}

const outcomeIsDanger = (response: ApiResponse<unknown>) => outcomeTone(response) === 'danger';

export function OutcomeBanners({ compact = false }: { compact?: boolean } = {}) {
  const store = useContext(OutcomeContext);
  const groups = useSyncExternalStore(store?.subscribe ?? subscribeNone, store?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const { t } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const announcement = (danger: boolean) => groups.filter(group => outcomeIsDanger(group.widgets[0].response!) === danger).map(group => {
    const count = group.widgets.length;
    return <span key={group.key} className="block">{includesPanels(group) ? m('outcomePanelSummary', { count }) : t('sharedOutcomeSummary', { count })}{group.busy ? ` ${t('refreshing')}` : ''}</span>;
  });
  // Empty from the first commit; visible banners/groups are never additional live channels.
  return <>
    <div data-outcome-announcer="assertive" aria-live="assertive" aria-atomic="true" className="sr-only">{announcement(true)}</div>
    <div data-outcome-announcer="polite" aria-live="polite" aria-atomic="true" className="sr-only">{announcement(false)}</div>
    {groups.map(group => <OutcomeBanner key={group.key} group={group} compact={compact} onRetry={() => store?.retry(group.key)} />)}
  </>;
}
