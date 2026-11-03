import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Inbox, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Notice, NoticeListPage } from '@ap/contracts';
import { useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { PlatformPage, QueryView, StateMessage } from '@ap/components';
import { Button, cn } from '@ap/ui';
import { groupNotices, longDate, pickText, seoulWallClock, shortDate } from '../notice-model';
import { NoticeDeleteDialog, NoticeFormDialog, type WriteDone } from './NoticeDialogs';

type Session = ReturnType<typeof usePlatform>['session'];
/** A dialog remembers the session it was opened under: another session or lost write access closes it. */
type Dialog = ({ kind: 'form'; notice: Notice | null } | { kind: 'delete'; notice: Notice }) & { session: Session };

/**
 * 공지 (#1290 L): list + reading pane. Reads need `notice:view`; write controls show only with `console:access`
 * (a hint — the server decides). Only the Kernel notice ports are used, so the Home banner refresh the app assembly
 * wraps around `saveNotice`/`deleteNotice` applies. `clock` is the Seoul wall clock (injected by tests).
 */
export function NoticesScreen({ clock }: { clock: () => string }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { adapter, can, session, pageParam, setPage } = usePlatform();
  const query = usePlatformQuery<NoticeListPage>(signal => adapter.listNotices(signal), null, true, 'session');
  const [openDialog, setDialog] = useState<Dialog | null>(null);
  const [expiredOpen, setExpiredOpen] = useState<boolean | null>(null);
  const canWrite = can('console:access');
  // null = absent; any present value (even '') is checked against the list (06 §6.4).
  const focus = pageParam('focus');
  const dialog = openDialog && canWrite && openDialog.session === session ? openDialog : null;
  useEffect(() => { if (openDialog && !dialog) setDialog(null); }, [openDialog, dialog]);
  const listRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const afterDelete = useRef<HTMLElement | null>(null);
  const openWith = (next: { kind: 'form'; notice: Notice | null } | { kind: 'delete'; notice: Notice }) => setDialog({ ...next, session });

  /** After a delete the focus goes to the next row, else to the list region, which stays mounted in the populated and the empty state. */
  const focusTargetAfter = (id: string): HTMLElement | null => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-notice-id]') ?? []);
    const index = rows.findIndex(row => row.dataset.noticeId === id);
    return (index >= 0 ? rows[index + 1] : undefined) ?? regionRef.current;
  };

  const onDone = (done: WriteDone) => {
    if (done.kind === 'deleted') afterDelete.current = focusTargetAfter(done.id);
    setDialog(null);
    if (done.kind === 'cancel') return;
    query.refetch();
    if (done.kind === 'saved') setPage({ focus: done.id });
    else if (done.kind === 'deleted') setPage({ focus: null });
  };
  const onDeleteClosed = (event: Event) => {
    const target = afterDelete.current;
    afterDelete.current = null;
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

  const rejected = (value: string) => <StateMessage tone="warning" icon={<AlertTriangle className="size-4" aria-hidden />}
    title={ko ? '찾을 수 없는 공지입니다' : 'Notice not found'}
    body={ko ? `주소의 공지 「${value}」를 목록에서 찾지 못했습니다. 삭제되었거나 볼 수 없는 공지일 수 있습니다.` : `The notice “${value}” in the address is not in the list. It may be deleted or not visible to you.`}
    action={<Button size="sm" variant="secondary" onClick={() => setPage({ focus: null })}>{ko ? '값 지우기' : 'Clear value'}</Button>} />;

  const siteLabel = (notice: Notice) => notice.scopeId === null ? (ko ? '전체' : 'All') : (session.scopes.find(s => s.id === notice.scopeId)?.label ?? notice.scopeId);

  const body = (items: readonly Notice[]) => {
    const { active, expired } = groupNotices(items, clock());
    const selected = focus !== null ? items.find(n => n.id === focus) ?? null : null;
    const open = expiredOpen ?? (selected !== null && expired.includes(selected));
    const row = (notice: Notice, ended: boolean) => <li key={notice.id}>
      <button type="button" data-notice-id={notice.id} aria-current={notice.id === focus ? 'true' : undefined} onClick={() => setPage({ focus: notice.id })}
        className={cn('flex w-full flex-col gap-0.5 border-b border-border-subtle px-3 py-2 text-left hover:bg-surface-row-hover', notice.id === focus && 'bg-surface-row-selected', ended && 'text-text-muted')}>
        <span className="flex items-center justify-between gap-2 text-xs text-text-muted"><span>{siteLabel(notice)}</span><span>{shortDate(notice.until)}</span></span>
        <span className="text-sm">{pickText(notice.title, lang)}</span>
      </button>
    </li>;
    let pane;
    if (focus !== null && !selected) {
      // 06 §6.4: an unknown value is rejected and kept in the address; only the user clears it.
      pane = rejected(focus);
    } else if (selected) {
      pane = <article aria-label={pickText(selected.title, lang)} className="grid gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="text-xs text-text-muted">{ko ? '대상 사이트' : 'Target site'}: {siteLabel(selected)} · {ko ? '종료' : 'Ends'} {longDate(selected.until)}</p>
            <h2 className="text-base font-semibold">{pickText(selected.title, lang)}</h2>
          </div>
          {canWrite && <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="secondary" onClick={() => openWith({ kind: 'form', notice: selected })}><Pencil className="size-3.5" aria-hidden />{ko ? '수정' : 'Edit'}</Button>
            <Button size="sm" variant="secondary" onClick={() => openWith({ kind: 'delete', notice: selected })}><Trash2 className="size-3.5" aria-hidden />{ko ? '삭제' : 'Delete'}</Button>
          </div>}
        </div>
        <p className="whitespace-pre-wrap text-sm">{pickText(selected.content, lang)}</p>
      </article>;
    } else {
      pane = <p className="p-4 text-sm text-text-muted">{ko ? '목록에서 공지를 고르세요.' : 'Pick a notice from the list.'}</p>;
    }
    return <div className="grid min-h-96 grid-cols-1 rounded-md border border-border-subtle md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
      <div ref={listRef} className="border-b border-border-subtle md:border-b-0 md:border-r">
        <h2 className="border-b border-border-subtle px-3 py-2 text-sm font-semibold">{ko ? '공지 목록' : 'Notice list'}</h2>
        {active.length === 0 && <p className="border-b border-border-subtle p-3 text-sm text-text-muted">{ko ? '진행 중인 공지가 없습니다.' : 'No active notices.'}</p>}
        <ul aria-label={ko ? '진행 중인 공지' : 'Active notices'}>{active.map(n => row(n, false))}</ul>
        {expired.length > 0 && <div>
          <button type="button" aria-expanded={open} onClick={() => setExpiredOpen(!open)} className="flex w-full items-center gap-1 px-3 py-2 text-xs text-text-muted hover:bg-surface-row-hover">
            {open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
            {ko ? `종료됨 ${expired.length}` : `Ended ${expired.length}`}
          </button>
          {open && <ul aria-label={ko ? '종료된 공지' : 'Ended notices'}>{expired.map(n => row(n, true))}</ul>}
        </div>}
      </div>
      <section aria-label={ko ? '공지 내용' : 'Notice content'}>{pane}</section>
    </div>;
  };

  return <PlatformPage
    description={ko ? '플랫폼 공지 목록과 내용입니다.' : 'Platform notices and their content.'}
    primaryAction={canWrite ? <Button size="sm" onClick={() => openWith({ kind: 'form', notice: null })}><Plus className="size-3.5" aria-hidden />{ko ? '공지 작성' : 'Write notice'}</Button> : undefined}>
    {focus !== null && query.response?.outcome === 'empty' && rejected(focus)}
    <div ref={regionRef} role="region" aria-label={ko ? '공지 목록 영역' : 'Notice list area'} tabIndex={-1} className="focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
      {query.response?.outcome === 'empty'
        // The Kernel's empty body tells the user to change query conditions this screen does not have: say plainly there are no notices.
        ? <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={ko ? '공지가 없습니다' : 'No notices'}
          action={canWrite ? <Button size="sm" onClick={() => openWith({ kind: 'form', notice: null })}>{ko ? '공지 작성' : 'Write notice'}</Button> : undefined} />
        : <QueryView widgetName={ko ? '공지' : 'Notices'} query={query}>
          {data => body(data.items)}
        </QueryView>}
    </div>
    {dialog?.kind === 'form' && <NoticeFormDialog key={dialog.notice?.id ?? 'new'} notice={dialog.notice} ko={ko} scopes={session.scopes} onDone={onDone} />}
    {dialog?.kind === 'delete' && <NoticeDeleteDialog notice={dialog.notice} ko={ko} onDone={onDone} onCloseAutoFocus={onDeleteClosed} />}
  </PlatformPage>;
}

export default function Notices() {
  return <NoticesScreen clock={seoulWallClock} />;
}
