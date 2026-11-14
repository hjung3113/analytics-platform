import { useEffect, useId, useRef, useState, type RefObject, type Ref } from 'react';
import { canTransition, type DeniedSavedView, type SavedView, type SavedViewEntry, type SavedViewListItem } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { Button, StatusBadge, Textarea } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { approvalText, contentLines, failureText, reasonText, visibilityText } from './text';
import { APPROVAL_TONE, type ApprovalRequestInfo, type ViewActionOutcome, type ViewDecideHandler, type ViewDiagnosis, type ViewRevokeHandler } from './viewInfo';

/** Why an entry is out of date or closed, and the way forward; independent of any apply control. */
export function ReasonPanel({ id, diagnosis, onMigrate }: { id: string; diagnosis: ViewDiagnosis; onMigrate?: (id: string) => void }) {
  const { tx } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  return <div className="space-y-2 text-sm" data-reason-panel={id}>
    <ul className="list-disc pl-5">{diagnosis.reasons.map((reason, index) => <li key={index}>{reasonText(reason, tx)}</li>)}</ul>
    {diagnosis.status === 'stale' && (diagnosis.migration
      ? <div className="space-y-1">
        <p className="font-semibold">{m('svPartPreview')}</p>
        <ul className="space-y-0.5 text-text-muted">{diagnosis.migration.preview.map(line => <li key={line.key}>{`${line.key}: ${JSON.stringify(line.before)} → ${JSON.stringify(line.after)}${line.note ? ` (${line.note})` : ''}`}</li>)}</ul>
        {onMigrate && <Button type="button" size="sm" onClick={() => onMigrate(id)}>{m('svPartMigrate')}</Button>}
      </div>
      : <p className="text-text-muted">{m('svPartNoMigration')}</p>)}
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
  const { lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const panelId = useId();
  const denied = 'denied' in entry && entry.denied === true;
  const hasReason = denied || (diagnosis !== undefined && diagnosis.status !== 'ok');
  return <li className="border-b border-border-subtle py-1.5">
    <div className="flex items-center gap-2">
      {denied
        ? <span className="min-w-0 flex-1 truncate px-2 text-sm text-text-muted">{m('svPartDenied')}</span>
        : <button
          type="button" ref={rowRef} onClick={onSelect} aria-current={selected ? 'true' : undefined}
          className="min-w-0 flex-1 rounded-md px-2 py-1 text-left hover:bg-surface-raised focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
          <span className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-text-primary">{(entry as SavedViewEntry).view.name}</span>
            <StatusBadge tone={APPROVAL_TONE[(entry as SavedViewEntry).view.approval]}>{approvalText((entry as SavedViewEntry).view.approval, lang)}</StatusBadge>
            {diagnosis?.status === 'stale' && <StatusBadge tone="warning">{m('svStale')}</StatusBadge>}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {`${personName((entry as SavedViewEntry).view.ownerId)} · ${formatTime((entry as SavedViewEntry).view.updatedAt)}${meta ? ` · ${meta}` : ''}`}
          </span>
        </button>}
      {hasReason && <Button type="button" variant="ghost" size="sm" ref={reasonRef} aria-expanded={reasonsOpen} aria-controls={panelId} onClick={onToggleReasons}>
        {reasonsOpen ? m('svPartHideReason') : m('svPartShowReason')}
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
  const m = useMessages(COMPONENTS_MESSAGES);
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

  const rows: [string, string][] = [
    [m('svDetailOwner'), personName(view.ownerId)],
    [m('svPartUpdated'), formatTime(view.updatedAt)],
    [m('svPartApprovalState'), approvalText(view.approval, lang)],
  ];
  return <section role="region" aria-label={view.name} className="space-y-3 rounded-md border border-border-subtle p-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="min-w-0 truncate text-sm font-semibold text-text-primary">{view.name}</h3>
      <Button type="button" variant="ghost" size="sm" onClick={onClose}>{m('svBackToList')}</Button>
    </div>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-text-muted">{label}</dt><dd>{value}</dd></div>)}
      <dt className="text-text-muted">{m('svDetailAudience')}</dt>
      <dd>
        <p>{visibilityText(view.visibility, lang, groupNames)}</p>
        {view.visibility.kind === 'people' && <ul aria-label={m('svPartPeople')} className="break-words">{view.visibility.userIds.map(id => <li key={id}>{personName(id)}</li>)}</ul>}
      </dd>
      <dt className="text-text-muted">{m('svPartContents')}</dt>
      <dd><ul>{[...contentLines(view, tx, lang), ...(describeView?.(view) ?? [])].map((line, index) => <li key={index}>{line}</li>)}</ul></dd>
      {request && <>
        <dt className="text-text-muted">{m('svPartTargetVersion')}</dt><dd>{`v${request.targetVersion}`}</dd>
        <dt className="text-text-muted">{m('svPartRequester')}</dt><dd>{personName(request.requestedBy)}</dd>
        <dt className="text-text-muted">{m('svPartRequestedAt')}</dt><dd>{formatTime(request.requestedAt)}</dd>
        <dt className="text-text-muted">{m('svPartChanges')}</dt>
        <dd>{request.changes.length > 0 ? <ul>{request.changes.map(change => <li key={change}>{change}</li>)}</ul> : <span className="text-text-muted">{m('svPartNoChanges')}</span>}</dd>
      </>}
      {view.approval === 'rejected' && view.approvalNote && <><dt className="text-text-muted">{m('svPartRejectReason')}</dt><dd>{view.approvalNote}</dd></>}
    </dl>
    {diagnosis && diagnosis.status !== 'ok' && <ReasonPanel id={view.id} diagnosis={diagnosis} {...(onMigrate ? { onMigrate } : {})} />}
    {canDecide && <div className="space-y-1.5">
      <label htmlFor={noteId} className="block text-xs text-text-muted">{m('svPartRejectNote')}</label>
      <Textarea id={noteId} value={note} disabled={busy} onChange={event => setNote(event.target.value)} />
    </div>}
    {!canDecide && view.approval === 'pending' && <p className="text-sm text-text-muted">{capabilities.reason ?? m('svPartNoRight')}</p>}
    {(canDecide || canRevoke) && <div className="flex gap-2">
      {canDecide && <Button type="button" size="sm" disabled={busy} onClick={() => void run('approve', () => onDecide(view.id, 'approve', note.trim() || undefined, view.version))}>{m('svPartApprove')}</Button>}
      {canDecide && <Button type="button" size="sm" variant="destructive" disabled={busy || note.trim() === ''} onClick={() => void run('reject', () => onDecide(view.id, 'reject', note.trim(), view.version))}>{m('svPartReject')}</Button>}
      {canRevoke && <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void run('revoke', () => onRevoke(view.id, view.version))}>{m('svPartRevoke')}</Button>}
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
