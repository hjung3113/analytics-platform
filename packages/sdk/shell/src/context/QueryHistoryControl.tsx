import { useContext, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { GlobalContext, Pair } from '@ap/contracts';
import { useI18n, useMessages, useQueryDraft } from '@ap/kernel';
import { drillHistorySummary, useHostPlatform, useQueryHistory, type QueryHistoryRow } from '@ap/kernel/host';
import { formatQuerySummary, useQueryBarExtension } from '@ap/components';
import { Button, Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@ap/ui';
import { SHELL_MESSAGES } from '../messages';
import { QueryBarTools } from './queryBarTools';

type HistoryConfirmation = { kind: 'clear' } | { kind: 'restore'; row: QueryHistoryRow };

function getRestoreButtons(list: HTMLDivElement | null) {
  return Array.from(list?.querySelectorAll<HTMLButtonElement>('[data-history-restore]') ?? []);
}

export function QueryHistoryControl() {
  const { session, revision, paneId, pathname, global, queryHistoryStore } = useHostPlatform();
  const [identity, setIdentity] = useState({ session, revision, queryHistoryStore, generation: 0 });
  if (identity.session !== session || identity.revision !== revision || identity.queryHistoryStore !== queryHistoryStore) setIdentity({ session, revision, queryHistoryStore, generation: identity.generation + 1 });
  return <HistorySession key={JSON.stringify([identity.generation, paneId, pathname, global.scopeId])} />;
}
function HistorySession() {
  const history = useQueryHistory();
  const { dirty } = useQueryDraft();
  const { lang, t } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const { route, equipmentAxes, queryPolicy } = useHostPlatform();
  const extension = useQueryBarExtension();
  // A history row names the page values that candidate restores: the declared drill steps when the menu opts in, then the menu's own items.
  const historySummary = (global: GlobalContext, page: readonly Pair[]) => {
    const own = extension?.historyPageSummary?.(global, page);
    if (!extension?.historyDrill) return own;
    return [...drillHistorySummary(route?.menu.drill, page, lang), ...own ?? []];
  };
  const tools = useContext(QueryBarTools);
  const external = tools?.folded ? tools : null;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = external ? external.active === 'history' : internalOpen;
  const openHistory = history.open;
  const [confirmation, setConfirmation] = useState<HistoryConfirmation | null>(null);
  const restorePromptId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const focusTrigger = () => (external?.anchorRef ?? trigger).current?.focus();
  const setOpen = (value: boolean) => {
    setConfirmation(null);
    if (external) { if (!value) external.close(); }
    else { setInternalOpen(value); if (value) openHistory(); }
  };
  const list = useRef<HTMLDivElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmationFocus = useRef<'cancel' | 'clear' | 'list' | null>(null);
  useLayoutEffect(() => {
    const target = confirmationFocus.current;
    confirmationFocus.current = null;
    if (target === 'cancel') cancelButton.current?.focus();
    else if (target === 'clear') clearButton.current?.focus();
    else if (target === 'list') list.current?.focus();
  });
  const removalFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (removalFocus.current === null || history.status === 'loading') return;
    const buttons = getRestoreButtons(list.current);
    const index = removalFocus.current; removalFocus.current = null;
    (buttons[Math.min(index, buttons.length - 1)] ?? list.current)?.focus();
  }, [history.entries, history.status]);
  if (history.status === 'disabled') return null;
  const restore = async (row: QueryHistoryRow) => {
    if (await history.restore(row)) { setOpen(false); focusTrigger(); }
  };
  const choose = (row: QueryHistoryRow) => {
    if (row.status !== 'ready') return;
    if (dirty.length === 0) { void restore(row); return; }
    confirmationFocus.current = 'cancel';
    setConfirmation({ kind: 'restore', row });
  };
  const dismissRestore = (row: QueryHistoryRow) => {
    setConfirmation(null);
    const button = getRestoreButtons(list.current)[history.entries.indexOf(row)];
    (button ?? list.current)?.focus();
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); focusTrigger(); return; }
    const buttons = getRestoreButtons(list.current);
    if (buttons.length === 0) return;
    const index = buttons.findIndex(button => button.parentElement?.contains(document.activeElement));
    let next: number;
    switch (event.key) {
      case 'Home': next = 0; break;
      case 'End': next = buttons.length - 1; break;
      case 'ArrowDown': next = (index + 1) % buttons.length; break;
      case 'ArrowUp': next = index <= 0 ? buttons.length - 1 : index - 1; break;
      default: return;
    }
    event.preventDefault();
    buttons[next].focus();
    buttons[next].scrollIntoView?.({ block: 'nearest' });
  };
  const time = (epoch: number) => {
    const minutes = Math.max(0, Math.floor((Date.now() - epoch) / 60_000));
    if (minutes === 0) return m('historyJustNow');
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-(minutes < 60 ? minutes : minutes < 1440 ? Math.floor(minutes / 60) : Math.floor(minutes / 1440)), minutes < 60 ? 'minute' : minutes < 1440 ? 'hour' : 'day');
  };
  return <Popover open={open && !queryPolicy.autoApplyingDefault} onOpenChange={setOpen}>
    {external ? <PopoverAnchor virtualRef={external.anchorRef} /> : <PopoverTrigger asChild><Button ref={trigger} type="button" variant="ghost" size="toolbar" disabled={queryPolicy.autoApplyingDefault}>{m('historyButton')}</Button></PopoverTrigger>}
    <PopoverContent align="end" aria-label={m('historyDialogLabel')} className="w-96 max-w-[calc(100vw-2rem)]"
      onOpenAutoFocus={event => {
        if (external) openHistory();
        event.preventDefault();
        list.current?.focus();
      }}
      onCloseAutoFocus={event => { if (external) { event.preventDefault(); focusTrigger(); } }}
      onEscapeKeyDown={() => { setOpen(false); focusTrigger(); }}>
      <div className="space-y-2">
      <p className="text-xs text-text-secondary">{m('historyRestoresNote')}</p>
      {history.status === 'unavailable' && <p role="status" className="text-xs text-text-secondary">{m('historyUnavailable')}</p>}
      {history.status === 'loading' && <p role="status" className="text-xs text-text-secondary">{m('historyChecking')}</p>}
      <div ref={list} role="list" aria-label={m('historyListLabel')} tabIndex={-1} onKeyDown={keyboard} className="max-h-80 overflow-auto">
        {history.entries.map((row, index) => {
          const summary = row.status === 'ready' ? formatQuerySummary(row.candidate.global, { lang, axes: equipmentAxes, context: route?.menu.context, pageSummary: historySummary(row.candidate.global, row.candidate.page) }) : row.status === 'loading' ? m('historyChecking') : m('historyRowUnavailable');
          return <div key={`${row.id}:${index}`} role="listitem" className="flex items-start gap-1">
            <button type="button" data-history-restore="" aria-disabled={row.status !== 'ready' || undefined} onClick={() => choose(row)} className="min-w-0 flex-1 rounded p-2 text-left text-xs text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring">
              <span className="block [overflow-wrap:anywhere]">{summary}</span>
              <span className="block text-text-muted">{time(row.lastAppliedAt)}</span>
              {row.status === 'unavailable' && <span>{row.reason === 'invalid' ? m('historyRowInvalidReason') : m('historyRowForbiddenReason')}</span>}
            </button>
            <Button type="button" variant="ghost" size="toolbar" aria-label={m('historyRemoveRowLabel', { index: index + 1 })} onClick={() => { removalFocus.current = index; void history.remove(row.id); }}>{m('historyRemove')}</Button>
          </div>;
        })}
      </div>
      {history.status === 'ready' && history.entries.length === 0 && <p className="text-xs text-text-secondary">{m('historyEmpty')}</p>}
      {confirmation?.kind === 'restore' && <div role="group" aria-labelledby={restorePromptId} className="flex flex-col gap-2">
        <span id={restorePromptId} className="text-xs text-text-secondary">{m('historyConfirmRestorePrompt')}</span>
        <div className="flex items-center gap-2">
          <Button ref={cancelButton} type="button" variant="ghost" size="toolbar" onClick={() => dismissRestore(confirmation.row)}>{t('cancel')}</Button>
          <Button type="button" variant="secondary" size="toolbar" onClick={() => { dismissRestore(confirmation.row); void restore(confirmation.row); }}>{m('historyConfirmRestoreAction')}</Button>
        </div>
      </div>}
      {confirmation?.kind === 'clear' && <div role="group" aria-label={m('historyConfirmClearGroup')} className="flex flex-wrap items-center gap-2">
        <span className="basis-full text-xs text-text-secondary">{m('historyConfirmClearPrompt')}</span>
        <Button ref={cancelButton} type="button" variant="ghost" size="toolbar" onClick={() => { confirmationFocus.current = 'clear'; setConfirmation(null); }}>{t('cancel')}</Button>
        <Button type="button" variant="secondary" size="toolbar" onClick={() => { confirmationFocus.current = 'list'; setConfirmation(null); void history.clear(); }}>{m('historyConfirmClearAction')}</Button>
      </div>}
      {!confirmation && <Button ref={clearButton} type="button" variant="ghost" size="toolbar" disabled={history.entries.length === 0} onClick={() => { confirmationFocus.current = 'cancel'; setConfirmation({ kind: 'clear' }); }}>{m('historyClearAll')}</Button>}
      </div>
    </PopoverContent>
  </Popover>;
}
