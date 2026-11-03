import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Notice, NoticeListPage } from '@ap/contracts';
import { useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { PlatformPage, QueryView, StateMessage } from '@ap/components';
import { Button, cn } from '@ap/ui';
import { groupNotices, longDate, pickText, seoulWallClock, shortDate } from '../notice-model';
import { NoticeDeleteDialog, NoticeFormDialog, type WriteDone } from './NoticeDialogs';

type Dialog = { kind: 'form'; notice: Notice | null } | { kind: 'delete'; notice: Notice } | null;

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
  const [dialog, setDialog] = useState<Dialog>(null);
  const [expiredOpen, setExpiredOpen] = useState<boolean | null>(null);
  const canWrite = can('console:access');
  const focus = pageParam('focus');

  const onDone = (done: WriteDone) => {
    setDialog(null);
    if (done.kind === 'cancel') return;
    query.refetch();
    if (done.kind === 'saved') setPage({ focus: done.id });
    else if (done.kind === 'deleted') setPage({ focus: null });
  };

  const siteLabel = (notice: Notice) => notice.scopeId === null ? (ko ? '전체' : 'All') : (session.scopes.find(s => s.id === notice.scopeId)?.label ?? notice.scopeId);

  const body = (items: readonly Notice[]) => {
    const { active, expired } = groupNotices(items, clock());
    const selected = focus ? items.find(n => n.id === focus) ?? null : null;
    const open = expiredOpen ?? (selected !== null && expired.includes(selected));
    const row = (notice: Notice, ended: boolean) => <li key={notice.id}>
      <button type="button" aria-current={notice.id === focus ? 'true' : undefined} onClick={() => setPage({ focus: notice.id })}
        className={cn('flex w-full flex-col gap-0.5 border-b border-border-subtle px-3 py-2 text-left hover:bg-surface-row-hover', notice.id === focus && 'bg-surface-row-selected', ended && 'text-text-muted')}>
        <span className="flex items-center justify-between gap-2 text-xs text-text-muted"><span>{siteLabel(notice)}</span><span>{shortDate(notice.until)}</span></span>
        <span className="text-sm">{pickText(notice.title, lang)}</span>
      </button>
    </li>;
    let pane;
    if (focus && !selected) {
      // 06 §6.4: an unknown value is rejected and kept in the address; only the user clears it.
      pane = <StateMessage tone="warning" icon={<AlertTriangle className="size-4" aria-hidden />}
        title={ko ? '찾을 수 없는 공지입니다' : 'Notice not found'}
        body={ko ? `주소의 공지 「${focus}」를 목록에서 찾지 못했습니다. 삭제되었거나 볼 수 없는 공지일 수 있습니다.` : `The notice “${focus}” in the address is not in the list. It may be deleted or not visible to you.`}
        action={<Button size="sm" variant="secondary" onClick={() => setPage({ focus: null })}>{ko ? '값 지우기' : 'Clear value'}</Button>} />;
    } else if (selected) {
      pane = <article aria-label={pickText(selected.title, lang)} className="grid gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="text-xs text-text-muted">{ko ? '대상 사이트' : 'Target site'}: {siteLabel(selected)} · {ko ? '종료' : 'Ends'} {longDate(selected.until)}</p>
            <h2 className="text-base font-semibold">{pickText(selected.title, lang)}</h2>
          </div>
          {canWrite && <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'form', notice: selected })}><Pencil className="size-3.5" aria-hidden />{ko ? '수정' : 'Edit'}</Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'delete', notice: selected })}><Trash2 className="size-3.5" aria-hidden />{ko ? '삭제' : 'Delete'}</Button>
          </div>}
        </div>
        <p className="whitespace-pre-wrap text-sm">{pickText(selected.content, lang)}</p>
      </article>;
    } else {
      pane = <p className="p-4 text-sm text-text-muted">{ko ? '목록에서 공지를 고르세요.' : 'Pick a notice from the list.'}</p>;
    }
    return <div className="grid min-h-96 grid-cols-[minmax(16rem,22rem)_1fr] rounded-md border border-border-subtle">
      <div className="border-r border-border-subtle">
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
    primaryAction={canWrite ? <Button size="sm" onClick={() => setDialog({ kind: 'form', notice: null })}><Plus className="size-3.5" aria-hidden />{ko ? '공지 작성' : 'Write notice'}</Button> : undefined}>
    <QueryView widgetName={ko ? '공지' : 'Notices'} query={query}
      emptyAction={canWrite ? <Button size="sm" onClick={() => setDialog({ kind: 'form', notice: null })}>{ko ? '공지 작성' : 'Write notice'}</Button> : undefined}>
      {data => body(data.items)}
    </QueryView>
    {dialog?.kind === 'form' && <NoticeFormDialog key={dialog.notice?.id ?? 'new'} notice={dialog.notice} ko={ko} scopes={session.scopes} onDone={onDone} />}
    {dialog?.kind === 'delete' && <NoticeDeleteDialog notice={dialog.notice} ko={ko} onDone={onDone} />}
  </PlatformPage>;
}

export default function Notices() {
  return <NoticesScreen clock={seoulWallClock} />;
}
