import { useEffect, useId, useRef, useState, type RefObject, type Ref } from 'react';
import { canTransition, type DeniedSavedView, type SavedView, type SavedViewEntry, type SavedViewListItem } from '@ap/contracts';
import { useI18n, type Text } from '@ap/kernel';
import { Button, StatusBadge, Textarea } from '@ap/ui';
import { approvalText, contentLines, failureText, reasonText, visibilityText } from './text';
import { APPROVAL_TONE, type ApprovalRequestInfo, type ViewActionOutcome, type ViewDecideHandler, type ViewDiagnosis, type ViewRevokeHandler } from './viewInfo';

const L = {
  owner: { ko: '소유자', en: 'Owner' },
  updated: { ko: '갱신 시각', en: 'Updated' },
  contents: { ko: '저장 내용', en: 'Saved contents' },
  audience: { ko: '공개 대상', en: 'Shared with' },
  people: { ko: '사람', en: 'People' },
  state: { ko: '승인 상태', en: 'Approval' },
  target: { ko: '승인 대상 버전', en: 'Version to approve' },
  requester: { ko: '신청자', en: 'Requested by' },
  requestedAt: { ko: '신청 시각', en: 'Requested' },
  changes: { ko: '변경 내용', en: 'Changes' },
  rejectReason: { ko: '반려 이유', en: 'Rejection reason' },
  noChanges: { ko: '변경 내용이 전달되지 않았습니다.', en: 'No change summary was provided.' },
  why: { ko: '이유 보기', en: 'Show reason' },
  hideWhy: { ko: '이유 닫기', en: 'Hide reason' },
  stale: { ko: '낡음', en: 'Out of date' },
  denied: { ko: '열 수 없음', en: 'Cannot open' },
  noMigration: { ko: '자동으로 옮길 수 없습니다. 저장된 조건은 그대로 두었으니 메뉴에서 조건을 다시 선택하세요.', en: 'This cannot be moved automatically. The stored condition is kept; pick the condition again in the menu.' },
  preview: { ko: '이행하면 바뀌는 값', en: 'Values that change on update' },
  migrate: { ko: '미리 본 내용으로 갱신', en: 'Update with this preview' },
  note: { ko: '반려 이유(반려할 때 필요)', en: 'Reason (required to reject)' },
  approve: { ko: '승인', en: 'Approve' },
  reject: { ko: '반려', en: 'Reject' },
  revoke: { ko: '승인 회수', en: 'Revoke approval' },
  back: { ko: '목록으로', en: 'Back to list' },
  noRight: { ko: '이 뷰를 승인할 권한이 없습니다.', en: 'You cannot approve this view.' },
} satisfies Record<string, Text>;
export { L as VIEW_PART_TEXT };

/** Why an entry is out of date or closed, and the way forward; independent of any apply control. */
export function ReasonPanel({ id, diagnosis, onMigrate }: { id: string; diagnosis: ViewDiagnosis; onMigrate?: (id: string) => void }) {
  const { tx } = useI18n();
  return <div className="space-y-2 text-sm" data-reason-panel={id}>
    <ul className="list-disc pl-5">{diagnosis.reasons.map((reason, index) => <li key={index}>{reasonText(reason, tx)}</li>)}</ul>
    {diagnosis.status === 'stale' && (diagnosis.migration
      ? <div className="space-y-1">
        <p className="font-semibold">{tx(L.preview)}</p>
        <ul className="space-y-0.5 text-text-muted">{diagnosis.migration.preview.map(line => <li key={line.key}>{`${line.key}: ${JSON.stringify(line.before)} → ${JSON.stringify(line.after)}${line.note ? ` (${line.note})` : ''}`}</li>)}</ul>
        {onMigrate && <Button type="button" size="sm" onClick={() => onMigrate(id)}>{tx(L.migrate)}</Button>}
      </div>
      : <p className="text-text-muted">{tx(L.noMigration)}</p>)}
  </div>;
}

/** A row that opens its detail, with the reason control beside it (siblings, never nested buttons). */
export function ViewRow({ entry, selected, diagnosis, reasonsOpen, onSelect, onToggleReasons, rowRef, reasonRef, personName, formatTime, meta }: {
  entry: SavedViewEntry | DeniedSavedView;
  selected: boolean;
  diagnosis?: ViewDiagnosis;
  reasonsOpen: boolean;
  onSelect: () => void;
  onToggleReasons: () => void;
  rowRef: Ref<HTMLButtonElement>;
  reasonRef: Ref<HTMLButtonElement>;
  personName: (id: string) => string;
  formatTime: (ms: number) => string;
  meta?: string;
}) {
  const { tx, lang } = useI18n();
  const panelId = useId();
  const denied = 'denied' in entry && entry.denied === true;
  const hasReason = denied || (diagnosis !== undefined && diagnosis.status !== 'ok');
  return <li className="border-b border-border-subtle py-1.5">
    <div className="flex items-center gap-2">
      {denied
        ? <span className="min-w-0 flex-1 truncate px-2 text-sm text-text-muted">{tx(L.denied)}</span>
        : <button
          type="button" ref={rowRef} onClick={onSelect} aria-current={selected ? 'true' : undefined}
          className="min-w-0 flex-1 rounded-md px-2 py-1 text-left hover:bg-surface-raised focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
          <span className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-text-primary">{(entry as SavedViewEntry).view.name}</span>
            <StatusBadge tone={APPROVAL_TONE[(entry as SavedViewEntry).view.approval]}>{approvalText((entry as SavedViewEntry).view.approval, lang)}</StatusBadge>
            {diagnosis?.status === 'stale' && <StatusBadge tone="warning">{tx(L.stale)}</StatusBadge>}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {`${personName((entry as SavedViewEntry).view.ownerId)} · ${formatTime((entry as SavedViewEntry).view.updatedAt)}${meta ? ` · ${meta}` : ''}`}
          </span>
        </button>}
      {hasReason && <Button type="button" variant="ghost" size="sm" ref={reasonRef} aria-expanded={reasonsOpen} aria-controls={panelId} onClick={onToggleReasons}>
        {reasonsOpen ? tx(L.hideWhy) : tx(L.why)}
      </Button>}
    </div>
    {hasReason && reasonsOpen && <div id={panelId} className="px-2 pt-1.5">
      <ReasonPanel id={denied ? entry.id : (entry as SavedViewEntry).view.id} diagnosis={denied ? { status: 'denied', reasons: [(entry as DeniedSavedView).reason] } : diagnosis!} />
    </div>}
  </li>;
}

/** Detail of one entry. Approve / reject / revoke exist only while the store's capabilities and the state allow them. */
export function ViewDetail({ entry, request, diagnosis, personName, groupName, describeView, formatTime, onDecide, onRevoke, onMigrate, onClose, onDone }: {
  entry: SavedViewEntry;
  request?: ApprovalRequestInfo;
  diagnosis?: ViewDiagnosis;
  personName: (id: string) => string;
  groupName: (id: string) => string;
  describeView?: (view: SavedView) => readonly string[];
  formatTime: (ms: number) => string;
  onDecide?: ViewDecideHandler;
  onRevoke?: ViewRevokeHandler;
  onMigrate?: (id: string) => void;
  onClose: () => void;
  onDone: (kind: 'approve' | 'reject' | 'revoke', name: string) => void;
}) {
  const { tx, lang } = useI18n();
  const { view, capabilities } = entry;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const noteId = useId();
  const canDecide = view.approval === 'pending' && capabilities.canApprove && canTransition(view.approval, 'approve') && onDecide !== undefined;
  const canRevoke = view.approval === 'approved' && capabilities.canRevoke && canTransition(view.approval, 'revoke') && onRevoke !== undefined;
  const groupNames = view.visibility.kind === 'groups' ? Object.fromEntries(view.visibility.groupIds.map(id => [id, groupName(id)])) : {};

  const run = async (kind: 'approve' | 'reject' | 'revoke', call: () => Promise<ViewActionOutcome>) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const outcome = await call();
      if (outcome.ok) { setNote(''); onDone(kind, view.name); } else setFailure(failureText(outcome, tx));
    } catch {
      setFailure(failureText({ ok: false, reason: 'unavailable' }, tx));
    } finally { setBusy(false); }
  };

  const rows: [Text, string][] = [
    [L.owner, personName(view.ownerId)],
    [L.updated, formatTime(view.updatedAt)],
    [L.state, approvalText(view.approval, lang)],
  ];
  return <section role="region" aria-label={view.name} className="space-y-3 rounded-md border border-border-subtle p-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="min-w-0 truncate text-sm font-semibold text-text-primary">{view.name}</h3>
      <Button type="button" variant="ghost" size="sm" onClick={onClose}>{tx(L.back)}</Button>
    </div>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {rows.map(([label, value]) => <div key={label.en} className="contents"><dt className="text-text-muted">{tx(label)}</dt><dd>{value}</dd></div>)}
      <dt className="text-text-muted">{tx(L.audience)}</dt>
      <dd>
        <p>{visibilityText(view.visibility, lang, groupNames)}</p>
        {view.visibility.kind === 'people' && <ul aria-label={tx(L.people)} className="break-words">{view.visibility.userIds.map(id => <li key={id}>{personName(id)}</li>)}</ul>}
      </dd>
      <dt className="text-text-muted">{tx(L.contents)}</dt>
      <dd><ul>{[...contentLines(view, tx, lang), ...(describeView?.(view) ?? [])].map((line, index) => <li key={index}>{line}</li>)}</ul></dd>
      {request && <>
        <dt className="text-text-muted">{tx(L.target)}</dt><dd>{`v${request.targetVersion}`}</dd>
        <dt className="text-text-muted">{tx(L.requester)}</dt><dd>{personName(request.requestedBy)}</dd>
        <dt className="text-text-muted">{tx(L.requestedAt)}</dt><dd>{formatTime(request.requestedAt)}</dd>
        <dt className="text-text-muted">{tx(L.changes)}</dt>
        <dd>{request.changes.length > 0 ? <ul>{request.changes.map(change => <li key={change}>{change}</li>)}</ul> : <span className="text-text-muted">{tx(L.noChanges)}</span>}</dd>
      </>}
      {view.approval === 'rejected' && view.approvalNote && <><dt className="text-text-muted">{tx(L.rejectReason)}</dt><dd>{view.approvalNote}</dd></>}
    </dl>
    {diagnosis && diagnosis.status !== 'ok' && <ReasonPanel id={view.id} diagnosis={diagnosis} {...(onMigrate ? { onMigrate } : {})} />}
    {canDecide && <div className="space-y-1.5">
      <label htmlFor={noteId} className="block text-xs text-text-muted">{tx(L.note)}</label>
      <Textarea id={noteId} value={note} disabled={busy} onChange={event => setNote(event.target.value)} />
    </div>}
    {!canDecide && view.approval === 'pending' && <p className="text-sm text-text-muted">{capabilities.reason ?? tx(L.noRight)}</p>}
    {(canDecide || canRevoke) && <div className="flex gap-2">
      {canDecide && <Button type="button" size="sm" disabled={busy} onClick={() => void run('approve', () => onDecide(view.id, 'approve', note.trim() || undefined, view.version))}>{tx(L.approve)}</Button>}
      {canDecide && <Button type="button" size="sm" variant="destructive" disabled={busy || note.trim() === ''} onClick={() => void run('reject', () => onDecide(view.id, 'reject', note.trim(), view.version))}>{tx(L.reject)}</Button>}
      {canRevoke && <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void run('revoke', () => onRevoke(view.id, view.version))}>{tx(L.revoke)}</Button>}
    </div>}
    {failure && <p role="alert" className="text-sm text-text-danger-label">{failure}</p>}
  </section>;
}

/** Whether a row carries a reason control. */
export const rowHasReason = (item: SavedViewListItem, diagnosis: ViewDiagnosis | undefined): boolean =>
  item.denied === true || (diagnosis !== undefined && diagnosis.status !== 'ok');

type RowElements = ReturnType<typeof useRowElements>;

/**
 * When the list changes under an open detail or reason (a refresh, a removal), the layer is dropped here, not left behind to eat
 * the next Escape, and a focus that fell to the page goes to the same row, the next or previous one, or the fallback control.
 */
export function useVanishedLayers({ selectedId, reasonsId, visibleIds, reasonIds, onVanish, els, fallback }: {
  selectedId: string | null;
  reasonsId: string | null;
  visibleIds: readonly string[];
  /** Ids whose reason control still exists. */
  reasonIds: readonly string[];
  onVanish: (layers: { selected: boolean; reasons: boolean }) => void;
  els: RowElements;
  fallback: RefObject<HTMLElement | null>;
}) {
  const before = useRef<readonly string[]>(visibleIds);
  useEffect(() => {
    const gone = selectedId !== null && !visibleIds.includes(selectedId);
    const reasonGone = reasonsId !== null && !reasonIds.includes(reasonsId);
    if (gone || reasonGone) {
      onVanish({ selected: gone, reasons: reasonGone });
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) {
        const id = (gone ? selectedId : reasonsId) ?? '';
        const at = before.current.indexOf(id);
        const near = [id, before.current[at + 1], before.current[at - 1]].filter((candidate): candidate is string => candidate !== undefined && visibleIds.includes(candidate));
        if (!near.some(candidate => els.focusRow(candidate))) fallback.current?.focus();
      }
    }
    before.current = visibleIds;
  });
}

/** Row and reason-toggle elements by id, so focus can go back to the row that opened a detail or a reason. */
export function useRowElements() {
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const reasons = useRef(new Map<string, HTMLButtonElement>());
  const keep = (map: Map<string, HTMLButtonElement>, id: string) => (node: HTMLButtonElement | null) => { if (node) map.set(id, node); else map.delete(id); };
  return {
    rowRef: (id: string) => keep(rows.current, id),
    reasonRef: (id: string) => keep(reasons.current, id),
    focusRow: (id: string) => { const node = rows.current.get(id); node?.focus(); return node !== undefined; },
    focusReason: (id: string) => { const node = reasons.current.get(id); node?.focus(); return node !== undefined; },
  };
}
