import { createPortal } from 'react-dom';
import { useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { pageConditionKeys, type PageConditions, type Pair } from '@ap/contracts';
import { decodePageConditions, derivePageConditionExtension, encodePageConditions, useI18n, useMessages, useQueryDraft, type PageConditionValues } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { Button } from '@ap/ui';
import { WorkspaceQueryBarContext } from '../archetypes/WorkspaceQueryBar';
import { PageConditionLayer } from './PageConditionLayer';
import type { PageConditionOptionsLoader } from './pageConditionOptions';
import type { QueryBarExtension } from './QueryBarExtension';
import { querySummaryItems } from './querySummary';
import { PAGE_CONDITION_MESSAGES } from './pageConditionMessages';

/** Menu supplies only its S2 endpoint adapter and the identity of its declared endpoint params. */
export type PageConditionLayerOptions = { loadOptions: PageConditionOptionsLoader; inputsKey: string; ready?: boolean };
type LayerState = ({ status: 'closed' } | { status: 'open'; focusCategoryId?: string }) & { attentionKey: string };
type Binding = { trigger: ReactNode; layer: ReactNode; extension: QueryBarExtension };
export function DeclaredPageConditions({ declaration, options, extension: legacy, children }: {
  declaration: PageConditions; options?: PageConditionLayerOptions; extension?: QueryBarExtension; children: (binding: Binding) => ReactNode;
}) {
  const host = useHostPlatform();
  // All ephemeral presentation and request state is discarded across a session/Scope/menu/pane generation.
  return <ConditionSession key={JSON.stringify([host.session, host.revision, host.global.scopeId, host.paneId, host.route?.menu.id, host.route?.params])}
    declaration={declaration} options={options} extension={legacy}>{children}</ConditionSession>;
}
function ConditionSession({ declaration, options, extension: legacy, children }: {
  declaration: PageConditions; options?: PageConditionLayerOptions; extension?: QueryBarExtension; children: (binding: Binding) => ReactNode;
}) {
  const host = useHostPlatform();
  const query = useQueryDraft();
  const { lang, t } = useI18n();
  const m = useMessages(PAGE_CONDITION_MESSAGES);
  const menu = host.route!.menu;
  const id = useId();
  const missingCategory = declaration.categories.find(category => category.required && pageConditionKeys(category).some(key => !query.draft.page.some(([name, value]) => name === key && value !== '')));
  const decoded = decodePageConditions(menu, query.draft.page);
  const attention = declaration.categories.find(category => category.id === missingCategory?.id || decoded.issues.some(issue => issue.categoryId === category.id));
  const attentionKey = attention ? JSON.stringify([missingCategory?.id, decoded.issues, query.draft.page.filter(([key]) => pageConditionKeys(attention).includes(key))]) : '';
  const [state, setState] = useState<LayerState>(() => attention ? { status: 'open', focusCategoryId: attention.id, attentionKey } : { status: 'closed', attentionKey });
  if (state.attentionKey !== attentionKey) setState(attention ? { status: 'open', focusCategoryId: attention.id, attentionKey } : { ...state, attentionKey });
  const open = state.status === 'open';
  const opener = useRef<HTMLButtonElement | null>(null);
  const fallback = useRef<HTMLButtonElement>(null);
  const wroteInSession = useRef(false);
  const extension = derivePageConditionExtension({ menu, lang, draft: query.draft.page, applied: host.page, extension: legacy });
  const summary = extension.appliedPageSummary;
  const summaryText = summary.map(item => `${item.label}: ${item.value || m('explicitEmpty')}`).join(' · ');
  const previousSummary = useRef<{ closed: boolean; text: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useLayoutEffect(() => {
    const previous = previousSummary.current;
    setAnnouncement(!open && previous?.closed && previous.text !== summaryText ? summaryText || m('unconstrained') : '');
    previousSummary.current = { closed: !open, text: summaryText };
  }, [open, summaryText, m]);
  function show(button: HTMLButtonElement) {
    if (open) { document.getElementById(`${id}-title`)?.focus({ preventScroll: true }); return; }
    opener.current = button; wroteInSession.current = false; setState({ status: 'open', attentionKey });
  }
  function close() {
    setState({ status: 'closed', attentionKey });
    const target = opener.current?.isConnected ? opener.current : fallback.current;
    target?.focus({ preventScroll: true });
  }
  function write(patch: Record<string, string | readonly string[] | null>) {
    if (query.mode === 'apply') query.setDraftPage(patch);
    else {
      // The first edit creates the undo point; later toggles replace that one entry.
      host.setPage(patch, { replace: open && wroteInSession.current });
      if (open) wroteInSession.current = true;
    }
  }
  function clear(categoryId?: string) {
    const categories = declaration.categories.filter(category => categoryId === undefined || category.id === categoryId);
    const keys = categories.flatMap(pageConditionKeys);
    fallback.current?.focus({ preventScroll: true });
    write(Object.fromEntries(keys.map(key => [key, null])));
  }
  function change(categoryId: string, next: PageConditionValues | null) {
    const category = declaration.categories.find(item => item.id === categoryId)!;
    const keys = pageConditionKeys(category);
    // Encode only the edited category: other malformed raw categories remain intact until explicitly corrected.
    const pairs = encodeCategory(category, next);
    write(Object.fromEntries(keys.map(key => {
      const values = pairs.filter(([name]) => name === key).map(([, value]) => value);
      return [key, values.length ? values : null];
    })));
  }
  const globalSummary = <>{host.global.scopeId && <p>{m('scope')}: {host.global.scopeId}</p>}{querySummaryItems(host.global, { lang, axes: host.equipmentAxes, context: menu.context }).map(item => <p key={item.key}>{item.label}: {item.value}</p>)}</>;
  const inputsKey = JSON.stringify([host.session, host.revision, host.global.scopeId, query.draft.global, options?.inputsKey, options?.ready]);
  const trigger = <div data-page-condition-triggers className="flex min-w-0 flex-wrap items-center gap-2 py-2 text-xs">
    <Button ref={fallback} type="button" size="toolbar" variant="secondary" aria-expanded={open} aria-controls={id} onClick={event => show(event.currentTarget)}>{m('title')}</Button>
    {declaration.categories.map(category => {
      const keys = pageConditionKeys(category);
      const items = summary.filter(item => keys.includes(item.key));
      if (!items.length) return null;
      const values = items.map(item => `${category.kind.type === 'groupedChecks' ? `${item.label} ` : ''}${item.value || m('explicitEmpty')}`);
      const value = category.kind.type === 'date' ? keys.map(key => items.find(item => item.key === key)?.value ?? '—').join(' → ') : values.join(', ');
      return <span key={category.id} data-page-condition-chip className="inline-flex min-w-0 max-w-full items-center rounded-md border border-border-subtle bg-accent-primary-soft">
        <Button type="button" variant="ghost" size="toolbar" wrapText className="min-w-0 text-left [overflow-wrap:anywhere]" aria-expanded={open} aria-controls={id} onClick={event => show(event.currentTarget)}>{category.label[lang]}: {value}</Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={m('clearOne', { label: category.label[lang] })} onClick={() => clear(category.id)}><X className="size-3" aria-hidden /></Button>
      </span>;
    })}
    {query.draft.page.some(([key]) => declaration.categories.some(category => pageConditionKeys(category).includes(key))) && <Button type="button" variant="ghost" size="toolbar" onClick={() => clear()}>{m('clearAll')}</Button>}
    {query.dirty.some(key => declaration.categories.some(category => pageConditionKeys(category).includes(key))) && <span>{t('pageFilterPendingChanges')}</span>}
  </div>;
  const layer = <>
    <div data-page-condition-announcement aria-live="polite" className="sr-only">{announcement}</div>
    <PageConditionLayer id={id} open={open} focusCategoryId={state.status === 'open' ? state.focusCategoryId : undefined} onClose={close}
    declaration={declaration} values={decoded.values} rawPairs={query.draft.page} issues={decoded.issues} onChange={change} loadOptions={options?.loadOptions} inputsKey={inputsKey}
    globalSummary={globalSummary} onEditContext={() => {
      const page = fallback.current?.closest('[data-platform-page]');
      // A board has a single Context bar for the pane selected by the triggering focus/click.
      const surface = page?.querySelector('[data-query-bar]') ?? page?.querySelector('[data-context-key]')?.closest('[role="region"]') ?? document.querySelector('[data-board-context-row]');
      const control = surface?.querySelector<HTMLButtonElement>('[data-query-bar] button[aria-controls], button[aria-controls], [data-context-key] button:not(:disabled)');
      control?.focus({ preventScroll: true });
      if (control?.getAttribute('aria-expanded') === 'false') control.click();
    }} footer={query.mode === 'apply' ? <>
      {missingCategory && <p className="w-full text-xs text-text-secondary">{m('required', { label: missingCategory.label[lang] })}</p>}
      <Button type="button" variant="secondary" size="toolbar" onClick={query.revert}>{m('revert')}</Button>
      <Button type="button" size="toolbar" disabled={!query.canApply} aria-busy={query.applying} onClick={query.apply}>{m('apply')}</Button>
    </> : undefined} />
  </>;
  return children({ trigger, layer, extension });
}
function encodeCategory(category: PageConditions['categories'][number], values: PageConditionValues | null): Pair[] {
  return encodePageConditions({ pageConditions: { categories: [category] } }, values ?? {});
}

/** Uses ADR-0160's existing summary spot when the folded query row is mounted. */
export function PageConditionTriggerSlot({ children }: { children: ReactNode }) {
  const workspace = useContext(WorkspaceQueryBarContext);
  return workspace?.parameterTarget ? createPortal(children, workspace.parameterTarget) : <div className="px-4">{children}</div>;
}
