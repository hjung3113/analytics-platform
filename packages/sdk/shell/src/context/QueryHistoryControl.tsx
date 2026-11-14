import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n, useMessages } from '@ap/kernel';
import { useHostPlatform, useQueryHistory, type QueryHistoryRow } from '@ap/kernel/host';
import { formatQuerySummary, useQueryBarExtension } from '@ap/components';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { SHELL_MESSAGES } from '../messages';

export function QueryHistoryControl() {
  const { session, revision, paneId, pathname, global, queryHistoryStore } = useHostPlatform();
  const [identity, setIdentity] = useState({ session, revision, queryHistoryStore, generation: 0 });
  if (identity.session !== session || identity.revision !== revision || identity.queryHistoryStore !== queryHistoryStore) setIdentity({ session, revision, queryHistoryStore, generation: identity.generation + 1 });
  return <HistorySession key={JSON.stringify([identity.generation, paneId, pathname, global.scopeId])} />;
}
function HistorySession() {
  const history = useQueryHistory();
  const { lang, t } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const { route, equipmentAxes } = useHostPlatform();
  const extension = useQueryBarExtension();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
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
    const options = list.current?.querySelectorAll<HTMLElement>('[role="option"]');
    const index = removalFocus.current; removalFocus.current = null;
    if (options?.length) options[Math.min(index, options.length - 1)].focus(); else list.current?.focus();
  }, [history.entries, history.status]);
  if (history.status === 'disabled') return null;
  const restore = async (row: QueryHistoryRow) => {
    if (await history.restore(row)) { setOpen(false); trigger.current?.focus(); }
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); return; }
    const options = [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const index = options.indexOf(document.activeElement as HTMLElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus(); options[next]?.scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'Enter' && index >= 0) { event.preventDefault(); void restore(history.entries[index]); }
  };
  const time = (epoch: number) => {
    const minutes = Math.max(0, Math.floor((Date.now() - epoch) / 60_000));
    if (minutes === 0) return m('historyJustNow');
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-(minutes < 60 ? minutes : minutes < 1440 ? Math.floor(minutes / 60) : Math.floor(minutes / 1440)), minutes < 60 ? 'minute' : minutes < 1440 ? 'hour' : 'day');
  };
  return <Popover open={open} onOpenChange={value => { setOpen(value); setConfirm(false); if (value) history.open(); }}>
    <PopoverTrigger asChild><Button ref={trigger} type="button" variant="ghost" size="toolbar">{m('historyButton')}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)]" onEscapeKeyDown={() => { setOpen(false); trigger.current?.focus(); }}>
      <div className="space-y-2">
      <p className="text-xs text-text-secondary">{m('historyRestoresNote')}</p>
      {history.status === 'unavailable' && <p role="status" className="text-xs text-text-secondary">{m('historyUnavailable')}</p>}
      {history.status === 'loading' && <p role="status" className="text-xs text-text-secondary">{m('historyChecking')}</p>}
      <div ref={list} role="listbox" aria-label={m('historyListLabel')} tabIndex={0} onKeyDown={keyboard} className="max-h-80 overflow-auto">
        {history.entries.map((row, index) => {
          const summary = row.status === 'ready' ? formatQuerySummary(row.candidate.global, row.candidate.page, { lang, axes: equipmentAxes, context: route?.menu.context, pageSummary: extension?.historyPageSummary?.(row.candidate.global, row.candidate.page) }) : row.status === 'loading' ? m('historyChecking') : m('historyRowUnavailable');
          return <div role="none" key={`${row.id}:${index}`} className="flex items-start gap-1">
            <button type="button" role="option" aria-selected={false} aria-disabled={row.status !== 'ready' || undefined} tabIndex={-1} onClick={() => { void restore(row); }} className="min-w-0 flex-1 rounded p-2 text-left text-xs text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring">
              <span className="block [overflow-wrap:anywhere]">{summary}</span>
              <span className="block text-text-muted">{time(row.lastAppliedAt)}</span>
              {row.status === 'unavailable' && <span>{row.reason === 'invalid' ? m('historyRowInvalidReason') : m('historyRowForbiddenReason')}</span>}
            </button>
            <Button type="button" variant="ghost" size="toolbar" aria-label={m('historyRemoveRowLabel', { index: index + 1 })} onClick={() => { removalFocus.current = index; void history.remove(row.id); }}>{m('historyRemove')}</Button>
          </div>;
        })}
      </div>
      {history.status === 'ready' && history.entries.length === 0 && <p className="text-xs text-text-secondary">{m('historyEmpty')}</p>}
      {confirm ? <div role="group" aria-label={m('historyConfirmClearGroup')} className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary">{m('historyConfirmClearPrompt')}</span>
        <Button ref={cancelButton} type="button" variant="ghost" size="toolbar" onClick={() => { confirmationFocus.current = 'clear'; setConfirm(false); }}>{t('cancel')}</Button>
        <Button type="button" variant="secondary" size="toolbar" onClick={() => { confirmationFocus.current = 'list'; setConfirm(false); void history.clear(); }}>{m('historyConfirmClearAction')}</Button>
      </div> : <Button ref={clearButton} type="button" variant="ghost" size="toolbar" disabled={history.entries.length === 0} onClick={() => { confirmationFocus.current = 'cancel'; setConfirm(true); }}>{m('historyClearAll')}</Button>}
      </div>
    </PopoverContent>
  </Popover>;
}
