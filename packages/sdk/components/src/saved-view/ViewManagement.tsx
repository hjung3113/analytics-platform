import { useMemo, useRef, useState, type ReactNode } from 'react';
import { formatInstant } from '@ap/contracts';
import type { SavedView, SavedViewEntry, SavedViewListItem } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Input } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { SegmentedRadio } from '../RadioGroup';
import { QueuePanel } from './ApprovalQueue';
import { ViewDetail, ViewRow, rowHasReason, useRowElements, useVanishedLayers } from './ViewParts';
import { type ApprovalRequestInfo, type ViewDecideHandler, type ViewDiagnosis, type ViewRevokeHandler } from './viewInfo';

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

const DONE_KEY = {
  approve: 'svManageOutcomeApprove',
  reject: 'svManageOutcomeReject',
  revoke: 'svManageOutcomeRevoke',
} as const;

/** The requested `뷰 관리` surface: views with owner, time, contents, status and why-text, and the approval queue as a filter. */
export function ViewManagement(props: ViewManagementProps) {
  const { open, onOpenChange, trigger } = props;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
    {open && <Body {...props} />}
  </Dialog>;
}

function Body({ entries, requests, diagnoses, currentUserId, initialFilter = 'all', onDecide, onRevoke, onMigrate, personName = id => id, groupName = id => id, describeView, formatTime: suppliedFormatTime, onDone }: ViewManagementProps) {
  const { t, lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const formatTime = suppliedFormatTime ?? ((ms: number) => formatInstant(ms, lang));
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
  const done = (kind: 'approve' | 'reject' | 'revoke', name: string) => { setNotice(m(DONE_KEY[kind], { name })); onDone?.(kind, name); };

  return <DialogContent className="max-w-4xl" onEscapeKeyDown={onEscapeKeyDown} aria-describedby={undefined}>
    <DialogHeader>
      <DialogTitle>{m('svManage')}</DialogTitle>
      <DialogDescription>{m('svManageDescription')}</DialogDescription>
    </DialogHeader>
    <SegmentedRadio<ViewManagementFilter>
      label={m('svManageFilterLabel')} value={filter}
      onChange={next => { setFilter(next); setSelectedId(null); setReasonsId(null); }}
      options={[{ value: 'all', label: t('all') }, { value: 'pending', label: m('svManagePending') }, { value: 'attention', label: m('svManageAttention') }]} />
    <p role="status" className="min-h-4 text-xs text-text-muted">{notice}</p>
    {filter === 'pending'
      ? <QueuePanel
        items={entries} requests={requests} diagnoses={diagnoses} currentUserId={currentUserId} defaultStatus="pending"
        selectedId={selectedId} onSelectedChange={setSelectedId} reasonsId={reasonsId} onReasonsChange={setReasonsId} elements={els}
        onDecide={onDecide} onRevoke={onRevoke} onMigrate={onMigrate} personName={personName} groupName={groupName} describeView={describeView} formatTime={formatTime} onDone={done} />
      : <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          <Input ref={search} type="search" aria-label={m('svManageSearch')} placeholder={m('svManageSearch')} value={query} onChange={event => setQuery(event.target.value)} />
          <p role="status" className="text-xs text-text-muted">{m('svManageCount', { count: visible.length })}</p>
          {visible.length === 0
            ? <p className="text-sm text-text-muted">{m('svNoResult')}</p>
            : <ul aria-label={m('svManageList')} className="max-h-96 min-h-0 overflow-y-auto">
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
