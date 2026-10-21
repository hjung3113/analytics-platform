import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n, usePlatform, useQueryHistory, type QueryHistoryRow } from '@ap/kernel';
import { formatQuerySummary, useQueryBarExtension } from '@ap/components';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';

export function QueryHistoryControl() {
  const { session, revision, paneId, pathname, global, queryHistoryStore } = usePlatform();
  const [identity, setIdentity] = useState({ session, revision, queryHistoryStore, generation: 0 });
  if (identity.session !== session || identity.revision !== revision || identity.queryHistoryStore !== queryHistoryStore) setIdentity({ session, revision, queryHistoryStore, generation: identity.generation + 1 });
  return <HistorySession key={JSON.stringify([identity.generation, paneId, pathname, global.scopeId])} />;
}
function HistorySession() {
  const history = useQueryHistory();
  const { lang } = useI18n();
  const { route, equipmentAxes } = usePlatform();
  const extension = useQueryBarExtension();
  const ko = lang === 'ko';
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
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-(minutes < 60 ? minutes : minutes < 1440 ? Math.floor(minutes / 60) : Math.floor(minutes / 1440)), minutes < 60 ? 'minute' : minutes < 1440 ? 'hour' : 'day');
  };
  return <Popover open={open} onOpenChange={value => { setOpen(value); setConfirm(false); if (value) history.open(); }}>
    <PopoverTrigger asChild><Button ref={trigger} type="button" variant="ghost" size="toolbar">{ko ? '최근 조건' : 'Recent conditions'}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)]" onEscapeKeyDown={() => { setOpen(false); trigger.current?.focus(); }}>
      <div className="space-y-2">
      <p className="text-xs text-text-secondary">{ko ? '조건만 복원합니다. 적용을 눌러야 조회합니다.' : 'Restores conditions only. Apply to run the query.'}</p>
      {history.status === 'unavailable' && <p role="status" className="text-xs text-text-secondary">{ko ? '최근 조건을 사용할 수 없습니다.' : 'Recent conditions unavailable.'}</p>}
      {history.status === 'loading' && <p role="status" className="text-xs text-text-secondary">{ko ? '확인 중' : 'Checking'}</p>}
      <div ref={list} role="listbox" aria-label={ko ? '최근 조회 조건' : 'Recent query conditions'} tabIndex={0} onKeyDown={keyboard} className="max-h-80 overflow-auto">
        {history.entries.map((row, index) => {
          const summary = row.status === 'ready' ? formatQuerySummary(row.candidate.global, row.candidate.page, { lang, axes: equipmentAxes, context: route?.menu.context, pageSummary: extension?.historyPageSummary?.(row.candidate.global, row.candidate.page) }) : row.status === 'loading' ? (ko ? '확인 중' : 'Checking') : (ko ? '현재 사용할 수 없음' : 'Currently unavailable');
          return <div role="none" key={`${row.id}:${index}`} className="flex items-start gap-1">
            <button type="button" role="option" aria-selected={false} aria-disabled={row.status !== 'ready' || undefined} tabIndex={-1} onClick={() => { void restore(row); }} className="min-w-0 flex-1 rounded p-2 text-left text-xs text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring">
              <span className="block [overflow-wrap:anywhere]">{summary}</span>
              <span className="block text-text-muted">{time(row.lastAppliedAt)}</span>
              {row.status === 'unavailable' && <span>{row.reason === 'invalid' ? (ko ? '조건 형식이 변경되었습니다.' : 'Condition format changed.') : (ko ? '현재 권한으로 확인할 수 없습니다.' : 'Cannot verify current access.')}</span>}
            </button>
            <Button type="button" variant="ghost" size="toolbar" aria-label={ko ? `${index + 1}번째 조건 삭제` : `Remove condition ${index + 1}`} onClick={() => { removalFocus.current = index; void history.remove(row.id); }}>{ko ? '삭제' : 'Remove'}</Button>
          </div>;
        })}
      </div>
      {history.status === 'ready' && history.entries.length === 0 && <p className="text-xs text-text-secondary">{ko ? '최근 조회 조건이 없습니다.' : 'No recent conditions.'}</p>}
      {confirm ? <div role="group" aria-label={ko ? '최근 조건 모두 지우기 확인' : 'Confirm clearing history'} className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary">{ko ? '최근 조건을 모두 지울까요?' : 'Clear all recent conditions?'}</span>
        <Button ref={cancelButton} type="button" variant="ghost" size="toolbar" onClick={() => { confirmationFocus.current = 'clear'; setConfirm(false); }}>{ko ? '취소' : 'Cancel'}</Button>
        <Button type="button" variant="secondary" size="toolbar" onClick={() => { confirmationFocus.current = 'list'; setConfirm(false); void history.clear(); }}>{ko ? '지우기 확인' : 'Confirm clear'}</Button>
      </div> : <Button ref={clearButton} type="button" variant="ghost" size="toolbar" disabled={history.entries.length === 0} onClick={() => { confirmationFocus.current = 'cancel'; setConfirm(true); }}>{ko ? '모두 지우기' : 'Clear all'}</Button>}
      </div>
    </PopoverContent>
  </Popover>;
}
