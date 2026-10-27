import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SavedView, SavedViewListItem, SavedViewEntry, ViewApproval } from '@ap/contracts';
import { useI18n, type Text } from '@ap/kernel';
import { Input } from '@ap/ui';
import { SegmentedRadio } from '../RadioGroup';
import { ViewDetail, ViewRow, rowHasReason, useRowElements, useVanishedLayers } from './ViewParts';
import {
  APPROVAL_LABEL, formatKst,
  type ApprovalRequestInfo, type ViewDecideHandler, type ViewDiagnosis, type ViewRevokeHandler,
} from './viewInfo';

export type ApprovalQueueStatus = 'pending' | 'approved' | 'rejected' | 'all';

export type ApprovalQueueProps = {
  /** Every entry the caller has; the queue picks the ones with an application behind them. */
  items: readonly SavedViewListItem[];
  /** Applications by view id. Without one, the owner counts as the requester. */
  requests?: Readonly<Record<string, ApprovalRequestInfo>>;
  diagnoses?: Readonly<Record<string, ViewDiagnosis>>;
  currentUserId: string;
  /** The status filter to start on; default awaiting approval. */
  defaultStatus?: ApprovalQueueStatus;
  /** Controlled open detail (the hosting dialog needs it for Escape). Uncontrolled when absent. */
  selectedId?: string | null;
  onSelectedChange?: (id: string | null) => void;
  onDecide?: ViewDecideHandler;
  onRevoke?: ViewRevokeHandler;
  onMigrate?: (id: string) => void;
  personName?: (id: string) => string;
  /** Display name of a share-target group; the id when absent. */
  groupName?: (id: string) => string;
  /** Read-only lines for what a menu view saved beyond its context (charts, layout, panels); the SDK does not read those. */
  describeView?: (view: SavedView) => readonly string[];
  formatTime?: (ms: number) => string;
  /** Called after the store accepted an approve, reject or revoke; the caller refreshes `items`. */
  onDone?: (kind: 'approve' | 'reject' | 'revoke', name: string) => void;
};

const L = {
  search: { ko: '이름·소유자·신청자 검색', en: 'Search name, owner or requester' },
  status: { ko: '승인 상태', en: 'Approval status' },
  pending: { ko: '대기', en: 'Waiting' },
  all: { ko: '모든 상태', en: 'Any status' },
  count: (n: number): Text => ({ ko: `${n}건`, en: `${n} items` }),
  empty: { ko: '조건에 맞는 요청이 없습니다.', en: 'No requests match.' },
  list: { ko: '승인 요청 목록', en: 'Approval requests' },
} as const;

/** What `ViewManagement` adds when it owns the open layers; not part of the public props. */
export type QueuePanelProps = ApprovalQueueProps & {
  reasonsId?: string | null;
  onReasonsChange?: (id: string | null) => void;
  /** Row elements shared with the host so it can return focus; own ones when absent. */
  elements?: ReturnType<typeof useRowElements>;
};

const involves = (entry: SavedViewEntry, request: ApprovalRequestInfo | undefined, userId: string): boolean =>
  entry.view.approval !== 'none' && ((request?.requestedBy ?? entry.view.ownerId) === userId || entry.capabilities.canApprove || entry.capabilities.canRevoke);

/** The applications a requester made or an approver can act on: search, status filter, a scrolling list and the detail. */
export function ApprovalQueue(props: ApprovalQueueProps) {
  return <QueuePanel {...props} />;
}

export function QueuePanel({ items, requests, diagnoses, currentUserId, defaultStatus = 'pending', selectedId: controlledId, onSelectedChange, reasonsId: controlledReasons, onReasonsChange, elements, onDecide, onRevoke, onMigrate, personName = id => id, groupName = id => id, describeView, formatTime = formatKst, onDone }: QueuePanelProps) {
  const { tx } = useI18n();
  const [status, setStatus] = useState<ApprovalQueueStatus>(defaultStatus);
  const [query, setQuery] = useState('');
  const [ownId, setOwnId] = useState<string | null>(null);
  const [ownReasons, setOwnReasons] = useState<string | null>(null);
  const selectedId = controlledId !== undefined ? controlledId : ownId;
  const reasonsId = controlledReasons !== undefined ? controlledReasons : ownReasons;
  const select = (id: string | null) => { setOwnId(id); onSelectedChange?.(id); };
  const setReasonsId = (id: string | null) => { setOwnReasons(id); onReasonsChange?.(id); };
  const ownEls = useRowElements();
  const els = elements ?? ownEls;
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const settle = useRef<{ id: string; neighbours: string[] } | null>(null);

  const entries = useMemo(() => items.filter((item): item is SavedViewEntry => item.denied !== true && involves(item, requests?.[item.view.id], currentUserId)), [items, requests, currentUserId]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter(({ view }) => (status === 'all' || view.approval === status)
      && (needle === '' || [view.name, personName(view.ownerId), personName(requests?.[view.id]?.requestedBy ?? view.ownerId)].some(text => text.toLowerCase().includes(needle))));
  }, [entries, status, query, requests, personName]);

  // After a decision the opened row may leave this list; focus must not fall to the page.
  useEffect(() => {
    const pending = settle.current;
    if (!pending || root.current?.contains(document.activeElement)) return;
    settle.current = null;
    for (const id of [pending.id, ...pending.neighbours]) if (els.focusRow(id)) return;
    search.current?.focus();
  });

  useVanishedLayers({
    selectedId, reasonsId, visibleIds: visible.map(entry => entry.view.id), reasonIds: visible.filter(entry => rowHasReason(entry, diagnoses?.[entry.view.id])).map(entry => entry.view.id),
    onVanish: ({ selected: detail, reasons }) => { if (detail) select(null); if (reasons) setReasonsId(null); }, els, fallback: search,
  });

  const selected = visible.find(entry => entry.view.id === selectedId);
  const closeDetail = (focusId: string) => { select(null); requestAnimationFrame(() => els.focusRow(focusId)); };
  const onKeyDown = (event: KeyboardEvent) => {
    // A host that controls the layers closes them itself, from anywhere in its surface.
    if (event.key !== 'Escape' || controlledId !== undefined) return;
    if (reasonsId) { event.preventDefault(); event.stopPropagation(); const id = reasonsId; setReasonsId(null); els.focusReason(id); }
    else if (selectedId) { event.preventDefault(); event.stopPropagation(); closeDetail(selectedId); }
  };

  return <div ref={root} className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" onKeyDown={onKeyDown}>
    <div className="flex min-h-0 flex-col gap-2">
      <Input ref={search} type="search" aria-label={tx(L.search)} placeholder={tx(L.search)} value={query} onChange={event => setQuery(event.target.value)} />
      <SegmentedRadio<ApprovalQueueStatus>
        label={tx(L.status)} value={status} onChange={setStatus}
        options={[
          { value: 'pending', label: tx(L.pending) },
          ...(['approved', 'rejected'] as ViewApproval[]).map(value => ({ value: value as ApprovalQueueStatus, label: tx(APPROVAL_LABEL[value]) })),
          { value: 'all', label: tx(L.all) },
        ]} />
      <p role="status" className="text-xs text-text-muted">{tx(L.count(visible.length))}</p>
      {visible.length === 0
        ? <p className="text-sm text-text-muted">{tx(L.empty)}</p>
        : <ul aria-label={tx(L.list)} className="max-h-96 min-h-0 overflow-y-auto">
          {visible.map(entry => {
            const { view } = entry;
            const request = requests?.[view.id];
            return <ViewRow
              key={view.id} entry={entry} selected={view.id === selectedId} diagnosis={diagnoses?.[view.id]} reasonsOpen={reasonsId === view.id}
              onSelect={() => select(view.id)} onToggleReasons={() => setReasonsId(reasonsId === view.id ? null : view.id)}
              rowRef={els.rowRef(view.id)} reasonRef={els.reasonRef(view.id)} personName={personName} formatTime={formatTime}
              meta={request ? `${personName(request.requestedBy)} · v${request.targetVersion}` : undefined} />;
          })}
        </ul>}
    </div>
    {selected && <ViewDetail
      key={selected.view.id} entry={selected} request={requests?.[selected.view.id]} diagnosis={diagnoses?.[selected.view.id]}
      personName={personName} groupName={groupName} describeView={describeView} formatTime={formatTime} onDecide={onDecide} onRevoke={onRevoke} onMigrate={onMigrate}
      onClose={() => closeDetail(selected.view.id)}
      onDone={(kind, name) => {
        const at = visible.findIndex(entry => entry.view.id === selected.view.id);
        settle.current = { id: selected.view.id, neighbours: [visible[at + 1], visible[at - 1]].filter(Boolean).map(entry => entry.view.id) };
        closeDetail(selected.view.id);
        onDone?.(kind, name);
      }} />}
  </div>;
}
