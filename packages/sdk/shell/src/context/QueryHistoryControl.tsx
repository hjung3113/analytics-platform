import { useContext, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useI18n, useMessages, useQueryDraft } from '@ap/kernel';
import { useHostPlatform, useQueryHistory, type QueryHistoryRow } from '@ap/kernel/host';
import { formatQuerySummary, useQueryBarExtension } from '@ap/components';
import { Button, Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@ap/ui';
import { SHELL_MESSAGES } from '../messages';
import { QueryBarTools } from './queryBarTools';

type HistoryConfirmation = { kind: 'clear' } | { kind: 'restore'; row: QueryHistoryRow };

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
  const getOptions = () => [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
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
    const options = list.current?.querySelectorAll<HTMLElement>('[role="option"]');
    const index = removalFocus.current; removalFocus.current = null;
    if (options?.length) options[Math.min(index, options.length - 1)].focus(); else list.current?.focus();
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
    const option = getOptions()[history.entries.indexOf(row)];
    (option ?? list.current)?.focus();
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); focusTrigger(); return; }
    const options = getOptions();
    if (options.length === 0) return;
    const index = options.findIndex(option => option === document.activeElement);
    let next: number;
    switch (event.key) {
      case 'Home': next = 0; break;
      case 'End': next = options.length - 1; break;
      case 'ArrowDown': next = (index + 1) % options.length; break;
      case 'ArrowUp': next = index <= 0 ? options.length - 1 : index - 1; break;
      case 'Enter':
        if (index >= 0) { event.preventDefault(); choose(history.entries[index]); }
        return;
      default: return;
    }
    event.preventDefault();
    options[next].focus();
    options[next].scrollIntoView?.({ block: 'nearest' });
  };
  const time = (epoch: number) => {
    const minutes = Math.max(0, Math.floor((Date.now() - epoch) / 60_000));
    if (minutes === 0) return m('historyJustNow');
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-(minutes < 60 ? minutes : minutes < 1440 ? Math.floor(minutes / 60) : Math.floor(minutes / 1440)), minutes < 60 ? 'minute' : minutes < 1440 ? 'hour' : 'day');
  };
  return <Popover open={open && !queryPolicy.autoApplyingDefault} onOpenChange={setOpen}>
    {external ? <PopoverAnchor virtualRef={external.anchorRef} /> : <PopoverTrigger asChild><Button ref={trigger} type="button" variant="ghost" size="toolbar" disabled={queryPolicy.autoApplyingDefault}>{m('historyButton')}</Button></PopoverTrigger>}
    <PopoverContent align="end" aria-label={m('historyDialogLabel')} className="w-96 max-w-[calc(100vw-2rem)]"
      onOpenAutoFocus={() => { if (external) openHistory(); }}
      onCloseAutoFocus={event => { if (external) { event.preventDefault(); focusTrigger(); } }}
      onEscapeKeyDown={() => { setOpen(false); focusTrigger(); }}>
      <div className="space-y-2">
      <p className="text-xs text-text-secondary">{m('historyRestoresNote')}</p>
      {history.status === 'unavailable' && <p role="status" className="text-xs text-text-secondary">{m('historyUnavailable')}</p>}
      {history.status === 'loading' && <p role="status" className="text-xs text-text-secondary">{m('historyChecking')}</p>}
      {/* Both columns share row heights and a scroll area, including when a summary wraps. */}
      <div className="grid max-h-80 grid-cols-[minmax(0,1fr)_auto] grid-rows-[repeat(var(--history-row-count),auto)] gap-x-1 overflow-auto"
        style={{ '--history-row-count': Math.max(1, history.entries.length) } as CSSProperties}>
        <div ref={list} role="listbox" aria-label={m('historyListLabel')} tabIndex={0} onKeyDown={keyboard}
          className="col-start-1 row-span-full grid grid-rows-subgrid">
          {history.entries.map((row, index) => {
            const summary = row.status === 'ready' ? formatQuerySummary(row.candidate.global, { lang, axes: equipmentAxes, context: route?.menu.context, pageSummary: extension?.historyPageSummary?.(row.candidate.global, row.candidate.page) }) : row.status === 'loading' ? m('historyChecking') : m('historyRowUnavailable');
            return <button key={`${row.id}:${index}`} type="button" role="option" aria-selected={false} aria-disabled={row.status !== 'ready' || undefined} tabIndex={-1} onClick={() => choose(row)} className="min-w-0 rounded p-2 text-left text-xs text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring">
              <span className="block [overflow-wrap:anywhere]">{summary}</span>
              <span className="block text-text-muted">{time(row.lastAppliedAt)}</span>
              {row.status === 'unavailable' && <span>{row.reason === 'invalid' ? m('historyRowInvalidReason') : m('historyRowForbiddenReason')}</span>}
            </button>;
          })}
        </div>
        <div className="col-start-2 row-span-full grid grid-rows-subgrid items-start">
          {history.entries.map((row, index) => (
            <Button key={`${row.id}:${index}`} type="button" variant="ghost" size="toolbar" aria-label={m('historyRemoveRowLabel', { index: index + 1 })} onClick={() => { removalFocus.current = index; void history.remove(row.id); }}>{m('historyRemove')}</Button>
          ))}
        </div>
      </div>
      {history.status === 'ready' && history.entries.length === 0 && <p className="text-xs text-text-secondary">{m('historyEmpty')}</p>}
      {confirmation?.kind === 'restore' && <div role="group" aria-labelledby={restorePromptId} className="flex flex-wrap items-center gap-2">
        <span id={restorePromptId} className="text-xs text-text-secondary">{m('historyConfirmRestorePrompt')}</span>
        <Button ref={cancelButton} type="button" variant="ghost" size="toolbar" onClick={() => dismissRestore(confirmation.row)}>{t('cancel')}</Button>
        <Button type="button" variant="secondary" size="toolbar" onClick={() => { dismissRestore(confirmation.row); void restore(confirmation.row); }}>{m('historyConfirmRestoreAction')}</Button>
      </div>}
      {confirmation?.kind === 'clear' && <div role="group" aria-label={m('historyConfirmClearGroup')} className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary">{m('historyConfirmClearPrompt')}</span>
        <Button ref={cancelButton} type="button" variant="ghost" size="toolbar" onClick={() => { confirmationFocus.current = 'clear'; setConfirmation(null); }}>{t('cancel')}</Button>
        <Button type="button" variant="secondary" size="toolbar" onClick={() => { confirmationFocus.current = 'list'; setConfirmation(null); void history.clear(); }}>{m('historyConfirmClearAction')}</Button>
      </div>}
      {!confirmation && <Button ref={clearButton} type="button" variant="ghost" size="toolbar" disabled={history.entries.length === 0} onClick={() => { confirmationFocus.current = 'cancel'; setConfirmation({ kind: 'clear' }); }}>{m('historyClearAll')}</Button>}
      </div>
    </PopoverContent>
  </Popover>;
}
