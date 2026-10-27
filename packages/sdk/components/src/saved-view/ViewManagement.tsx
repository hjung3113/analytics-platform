import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { SavedView, SavedViewEntry, SavedViewListItem } from '@ap/contracts';
import { useI18n, type Text } from '@ap/kernel';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Input } from '@ap/ui';
import { SegmentedRadio } from '../RadioGroup';
import { QueuePanel } from './ApprovalQueue';
import { ViewDetail, ViewRow, rowHasReason, useRowElements, useVanishedLayers } from './ViewParts';
import { formatKst, type ApprovalRequestInfo, type ViewDecideHandler, type ViewDiagnosis, type ViewRevokeHandler } from './viewInfo';

export type ViewManagementFilter = 'all' | 'pending' | 'attention';

export type ViewManagementProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The control that opens the surface; focus returns to it on close. Omit when the caller returns focus itself. */
  trigger?: ReactNode;
  entries: readonly SavedViewListItem[];
  requests?: Readonly<Record<string, ApprovalRequestInfo>>;
  diagnoses?: Readonly<Record<string, ViewDiagnosis>>;
  currentUserId: string;
  /** The filter each opening starts on; `pending` opens the approval queue directly. */
  initialFilter?: ViewManagementFilter;
  onDecide?: ViewDecideHandler;
  onRevoke?: ViewRevokeHandler;
  onMigrate?: (id: string) => void;
  personName?: (id: string) => string;
  /** Display name of a share-target group; the id when absent. */
  groupName?: (id: string) => string;
  /** Read-only lines for what a menu view saved beyond its context (charts, layout, panels); the SDK does not read those. */
  describeView?: (view: SavedView) => readonly string[];
  formatTime?: (ms: number) => string;
  onDone?: (kind: 'approve' | 'reject' | 'revoke', name: string) => void;
};

const L = {
  title: { ko: '뷰 관리', en: 'Manage views' },
  description: { ko: '저장한 뷰의 상태를 확인하고 승인 요청을 처리합니다.', en: 'Check saved views and handle approval requests.' },
  filter: { ko: '보기', en: 'Show' },
  all: { ko: '전체', en: 'All' },
  pending: { ko: '승인 대기', en: 'Awaiting approval' },
  attention: { ko: '낡음·권한 부족', en: 'Out of date or no access' },
  search: { ko: '뷰 이름·소유자 검색', en: 'Search view name or owner' },
  list: { ko: '저장한 뷰', en: 'Saved views' },
  empty: { ko: '조건에 맞는 뷰가 없습니다.', en: 'No views match.' },
  count: (n: number): Text => ({ ko: `${n}건`, en: `${n} items` }),
  done: (kind: 'approve' | 'reject' | 'revoke', name: string): Text => ({
    ko: `${name}: ${{ approve: '승인', reject: '반려', revoke: '회수' }[kind]}했습니다.`,
    en: `${name}: ${{ approve: 'approved', reject: 'rejected', revoke: 'revoked' }[kind]}.`,
  }),
} as const;

/** The requested `뷰 관리` surface: views with owner, time, contents, status and why-text, and the approval queue as a filter. */
export function ViewManagement(props: ViewManagementProps) {
  const { open, onOpenChange, trigger } = props;
  const { tx } = useI18n();
  return <Dialog open={open} onOpenChange={onOpenChange}>
    {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
    {open && <Body {...props} tx={tx} />}
  </Dialog>;
}

function Body({ entries, requests, diagnoses, currentUserId, initialFilter = 'all', onDecide, onRevoke, onMigrate, personName = id => id, groupName = id => id, describeView, formatTime = formatKst, onDone, tx }: ViewManagementProps & { tx: (text: Text) => string }) {
  const [filter, setFilter] = useState<ViewManagementFilter>(initialFilter);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reasonsId, setReasonsId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const els = useRowElements();
  const search = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter(item => {
      if (filter === 'attention') { if (item.denied !== true && (diagnoses?.[item.view.id]?.status ?? 'ok') === 'ok') return false; }
      if (item.denied === true) return filter !== 'pending' && needle === '';
      return needle === '' || [item.view.name, personName(item.view.ownerId)].some(text => text.toLowerCase().includes(needle));
    });
  }, [entries, filter, query, diagnoses, personName]);
  const idOf = (item: SavedViewListItem) => item.denied === true ? item.id : item.view.id;
  useVanishedLayers({
    selectedId: filter === 'pending' ? null : selectedId, reasonsId: filter === 'pending' ? null : reasonsId,
    visibleIds: visible.map(idOf), reasonIds: visible.filter(item => rowHasReason(item, diagnoses?.[idOf(item)])).map(idOf),
    onVanish: ({ selected: detail, reasons }) => { if (detail) setSelectedId(null); if (reasons) setReasonsId(null); }, els, fallback: search,
  });
  const selected = visible.find((item): item is SavedViewEntry => item.denied !== true && item.view.id === selectedId);

  const closeDetail = (id: string) => { setSelectedId(null); requestAnimationFrame(() => els.focusRow(id)); };
  // Escape closes one layer wherever focus is in the surface: an open reason, then an open detail, then the dialog.
  // The queue shows the same layers from this state, so both filters take the same path.
  const onEscapeKeyDown = (event: KeyboardEvent) => {
    if (reasonsId) { event.preventDefault(); const id = reasonsId; setReasonsId(null); els.focusReason(id); }
    else if (selectedId) { event.preventDefault(); closeDetail(selectedId); }
  };
  const done = (kind: 'approve' | 'reject' | 'revoke', name: string) => { setNotice(tx(L.done(kind, name))); onDone?.(kind, name); };

  return <DialogContent className="max-w-4xl" onEscapeKeyDown={onEscapeKeyDown} aria-describedby={undefined}>
    <DialogHeader>
      <DialogTitle>{tx(L.title)}</DialogTitle>
      <DialogDescription>{tx(L.description)}</DialogDescription>
    </DialogHeader>
    <SegmentedRadio<ViewManagementFilter>
      label={tx(L.filter)} value={filter}
      onChange={next => { setFilter(next); setSelectedId(null); setReasonsId(null); }}
      options={[{ value: 'all', label: tx(L.all) }, { value: 'pending', label: tx(L.pending) }, { value: 'attention', label: tx(L.attention) }]} />
    <p role="status" className="min-h-4 text-xs text-text-muted">{notice}</p>
    {filter === 'pending'
      ? <QueuePanel
        items={entries} requests={requests} diagnoses={diagnoses} currentUserId={currentUserId} defaultStatus="pending"
        selectedId={selectedId} onSelectedChange={setSelectedId} reasonsId={reasonsId} onReasonsChange={setReasonsId} elements={els}
        onDecide={onDecide} onRevoke={onRevoke} onMigrate={onMigrate} personName={personName} groupName={groupName} describeView={describeView} formatTime={formatTime} onDone={done} />
      : <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          <Input ref={search} type="search" aria-label={tx(L.search)} placeholder={tx(L.search)} value={query} onChange={event => setQuery(event.target.value)} />
          <p role="status" className="text-xs text-text-muted">{tx(L.count(visible.length))}</p>
          {visible.length === 0
            ? <p className="text-sm text-text-muted">{tx(L.empty)}</p>
            : <ul aria-label={tx(L.list)} className="max-h-96 min-h-0 overflow-y-auto">
              {visible.map(item => {
                const id = item.denied === true ? item.id : item.view.id;
                return <ViewRow
                  key={id} entry={item} selected={id === selectedId} diagnosis={diagnoses?.[id]} reasonsOpen={reasonsId === id}
                  onSelect={() => setSelectedId(id)} onToggleReasons={() => setReasonsId(reasonsId === id ? null : id)}
                  rowRef={els.rowRef(id)} reasonRef={els.reasonRef(id)} personName={personName} formatTime={formatTime} />;
              })}
            </ul>}
        </div>
        {selected && <ViewDetail
          key={selected.view.id} entry={selected} request={requests?.[selected.view.id]} diagnosis={diagnoses?.[selected.view.id]}
          personName={personName} groupName={groupName} describeView={describeView} formatTime={formatTime} onDecide={onDecide} onRevoke={onRevoke} onMigrate={onMigrate}
          onClose={() => closeDetail(selected.view.id)} onDone={done} />}
      </div>}
  </DialogContent>;
}
