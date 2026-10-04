import { createContext, useContext, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Clock, Inbox, Loader2, RotateCw, ServerCrash } from 'lucide-react';
import type { ApiResponse } from '@ap/contracts';
import { useI18n, type QueryState } from '@ap/kernel';
import { Button, cn } from '@ap/ui';

type Widget = { id: string; response: ApiResponse<unknown> | null; retry: () => void; name?: string; status: QueryState<unknown>['status'] };
type Group = { key: string; widgets: Widget[]; busy: boolean };
type PendingMember = { response: Widget['response']; refreshing: boolean; done: boolean };
const EMPTY: Group[] = [];

function groupingKey(response: ApiResponse<unknown> | null): string | null {
  if (!response || !['error', 'timeout', 'empty'].includes(response.outcome)) return null;
  const explanations = response.assessments.filter(a => a.explainsEmpty && a.state === 'confirmed')
    .map(a => JSON.stringify([a.kind, a.state, a.statusSource, a.observedAt, a.reason, a.explainsEmpty, a.detail])).sort();
  return JSON.stringify([response.outcome, response.message, explanations]);
}

function createStore() {
  const widgets = new Map<string, Widget>();
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
    const next = [...groups].filter(([, members]) => members.length >= 2)
      .map(([key, members]) => ({ key, widgets: members, busy: pending.has(key) || members.some(widget => widget.status === 'refreshing') }))
      .sort((a, b) => b.widgets.length - a.widgets.length);
    if (next.length !== snapshot.length || next.some((group, i) => group.key !== snapshot[i].key || group.busy !== snapshot[i].busy ||
      group.widgets.some((widget, j) => widget !== snapshot[i].widgets[j]) || group.widgets.length !== snapshot[i].widgets.length)) snapshot = next;
    listeners.forEach(listener => listener());
  };
  const store = {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    isGrouped: (id: string, key: string | null) => key !== null && [...widgets.values()].some(widget => widget.id !== id && groupingKey(widget.response) === key),
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

export function OutcomeScope({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  return <OutcomeContext.Provider value={store}>{children}</OutcomeContext.Provider>;
}

export function useSharedOutcome(response: Widget['response'], retry: () => void, name: string | undefined, status: Widget['status']) {
  const store = useContext(OutcomeContext);
  const id = useId();
  const key = groupingKey(response);
  useLayoutEffect(() => { store?.set({ id, response, retry, name, status }); }, [store, id, response, retry, name, status]);
  useLayoutEffect(() => () => { store?.remove(id); }, [store, id]);
  // A primitive snapshot avoids running successful children for unrelated registrations.
  const getSnapshot = () => store?.isGrouped(id, key) ?? false;
  return useSyncExternalStore(store?.subscribe ?? subscribeNone, getSnapshot, () => false);
}

function OutcomeBanner({ group, onRetry }: { group: Group; onRetry: () => void }) {
  const { t } = useI18n();
  const banner = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = banner.current;
    return () => {
      if (element?.contains(document.activeElement)) {
        const target = element.closest<HTMLElement>('[data-platform-page-content], [data-outcome-focus-target], [role="dialog"]');
        if (target?.isConnected) target.focus({ preventScroll: true });
      }
    };
  }, []);
  const outcome = group.widgets[0].response!.outcome;
  const danger = outcome === 'error' || outcome === 'timeout';
  const title = outcome === 'error' ? t('stateError') : outcome === 'timeout' ? t('stateTimeout') : t('stateEmpty');
  const label = outcome === 'error' ? t('sharedOutcomeError') : outcome === 'timeout' ? t('sharedOutcomeTimeout') : t('sharedOutcomeEmpty');
  const Icon = outcome === 'error' ? ServerCrash : outcome === 'timeout' ? Clock : Inbox;
  return <section ref={banner} data-outcome-banner role="group" aria-label={t('sharedOutcomeRegion')}
    className={cn('mb-3 rounded-md border p-3 text-xs text-text-secondary', danger ? 'border-text-danger-label bg-accent-danger-soft' : 'border-border-control bg-surface-sunken')}>
    <div className={cn('mb-1.5 flex items-center gap-2 text-sm font-semibold', danger ? 'text-text-danger-label' : 'text-text-secondary')}><Icon aria-hidden className="size-4 shrink-0" />{title}</div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 flex-[1_1_18rem]">{t('sharedOutcomeSummary', { count: group.widgets.length, outcome: label })}</p>
      <Button type="button" size="sm" variant="secondary" aria-busy={group.busy} aria-disabled={group.busy} onClick={onRetry}>
        {group.busy ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <RotateCw aria-hidden className="size-3.5" />}{t('retry')}
      </Button>
    </div>
  </section>;
}

export function OutcomeBanners() {
  const store = useContext(OutcomeContext);
  const groups = useSyncExternalStore(store?.subscribe ?? subscribeNone, store?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const { t } = useI18n();
  const announcement = (danger: boolean) => groups.filter(group => (group.widgets[0].response!.outcome !== 'empty') === danger).map(group => {
    const outcome = group.widgets[0].response!.outcome;
    const label = outcome === 'error' ? t('sharedOutcomeError') : outcome === 'timeout' ? t('sharedOutcomeTimeout') : t('sharedOutcomeEmpty');
    return <span key={group.key} className="block">{t('sharedOutcomeSummary', { count: group.widgets.length, outcome: label })}{group.busy ? ` ${t('refreshing')}` : ''}</span>;
  });
  // Empty from the first commit; visible banners/groups are never additional live channels.
  return <>
    <div data-outcome-announcer="assertive" aria-live="assertive" aria-atomic="true" className="sr-only">{announcement(true)}</div>
    <div data-outcome-announcer="polite" aria-live="polite" aria-atomic="true" className="sr-only">{announcement(false)}</div>
    {groups.map(group => <OutcomeBanner key={group.key} group={group} onRetry={() => store?.retry(group.key)} />)}
  </>;
}
