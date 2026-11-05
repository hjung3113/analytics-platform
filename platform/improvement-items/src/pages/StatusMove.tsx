import { useId, useState } from 'react';
import { useMenuAction, useMenuFetch, usePlatform } from '@ap/kernel';
import { Button, Callout, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@ap/ui';
import { FORWARD, REOPEN, detailEndpoint, itemReopen, itemSetStatus, type Effect, type ItemRow, type Status } from '../endpoints';
import { moveErrors } from '../model';
import { useCopy } from '../copy';
import { Field, ItemStatus } from './parts';
function MoveDialog({ item, move, onClose }: { item: ItemRow; move: Status | 'reopen'; onClose: () => void }) {
  const c = useCopy(), uid = useId();
  const statusAction = useMenuAction(itemSetStatus), reopenAction = useMenuAction(itemReopen), latest = useMenuFetch(detailEndpoint);
  const { toast } = usePlatform();
  const [action, setAction] = useState(item.action ?? ''), [actionDate, setDate] = useState(item.actionDate ?? ''), [effect, setEffect] = useState<Effect | ''>(''), [note, setNote] = useState(''), [reason, setReason] = useState('');
  const [base, setBase] = useState(item), [conflict, setConflict] = useState(false), [reviewing, setReviewing] = useState(false), [reviewed, setReviewed] = useState(false), [message, setMessage] = useState('');
  const [missing, setMissing] = useState<string[]>([]), [retry, setRetry] = useState<(() => void) | null>(null);
  const busy = statusAction.pending || reopenAction.pending || reviewing;
  const legal = move === 'reopen' ? !!REOPEN[base.status] : FORWARD[base.status].includes(move);
  function settle(r: Awaited<ReturnType<typeof statusAction.run>>) {
    if (r.outcome === 'ok') { toast(c.changed, 'info'); onClose(); return; }
    if (r.outcome === 'conflict') { setConflict(true); setMessage(c.conflict); return; }
    setMessage(r.outcome === 'unknown' ? c.unknown : r.outcome === 'forbidden' ? c.denied : r.outcome === 'not_found' ? c.notFound : c.failed);
    setRetry(r.retry ? () => () => { void r.retry!().then(settle).catch(() => setMessage(c.failed)); } : null);
  }
  function confirm() {
    setRetry(null);
    const errors = moveErrors(move, { action, actionDate, ...(effect ? { effect } : {}), reason }); setMissing(errors);
    if (errors.length || conflict || !legal) return;
    setMessage('');
    const promise = move === 'reopen' ? reopenAction.run({ itemId: base.id, reason: reason.trim() }, { expectedVersion: base.version }) : statusAction.run({ itemId: base.id, status: move, ...(['in_progress', 'done'].includes(move) ? { action: action.trim() } : {}), ...(move === 'done' ? { actionDate } : {}), ...(move === 'verified' && effect ? { effect: { result: effect, note: note.trim() || null } } : {}), ...(move === 'dropped' ? { reason: reason.trim() } : {}) }, { expectedVersion: base.version });
    void promise.then(settle).catch(() => setMessage(c.failed));
  }
  const labels: Record<string, string> = { action: c.action, actionDate: c.actionDate, effect: c.effect, reason: c.reason };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent closeLabel={c.cancel}><DialogHeader><DialogTitle>{c.moveTitle}</DialogTitle><DialogDescription>IM-{item.itemNo} · {move === 'reopen' ? c.reopen : c.statuses[move]}</DialogDescription></DialogHeader>
    <form className="space-y-4" noValidate onSubmit={e => { e.preventDefault(); if (!busy) confirm(); }}>
      <div className="flex flex-wrap items-center gap-2"><ItemStatus status={base.status} /><span>→ {move === 'reopen' ? c.statuses[REOPEN[base.status] ?? base.status] : c.statuses[move]}</span></div>
      {message && <Callout tone="amber" title={conflict ? c.moveTitle : c.failed}><p role="alert">{message}</p>{conflict && <Button type="button" variant="secondary" disabled={busy} onClick={() => {
        setReviewing(true);
        void latest.fetch({ itemId: base.id }).then(r => { if (r.outcome === 'ok' && r.data) { setBase(r.data); setConflict(false); setReviewed(true); setMessage(''); } else setMessage(c.failed); }).catch(() => setMessage(c.failed)).finally(() => setReviewing(false));
      }}>{c.reload}</Button>}{retry && <Button type="button" variant="secondary" disabled={busy} onClick={retry}>{c.retry}</Button>}</Callout>}
      {reviewed && <div role="status" className="space-y-2 rounded-md border border-border-subtle bg-surface-sunken p-3 text-sm text-text-secondary"><p>{c.recheck}</p><p>{base.problem}</p><p>{c.action}: {base.action ?? c.unset}</p><p>{c.actionDate}: {base.actionDate ?? c.unset}</p></div>}
      {!legal && <p role="alert">{c.failed}</p>}
      {missing.length > 0 && <p role="alert" className="text-sm text-text-danger-label">{c.inputError}{missing.map(k => labels[k]).join(' · ')}</p>}
      {['in_progress', 'done'].includes(move) && <Field id={`${uid}-action`} label={c.requiredAction}><Textarea id={`${uid}-action`} maxLength={2000} value={action} aria-invalid={missing.includes('action')} onChange={e => setAction(e.target.value)} /></Field>}
      {move === 'done' && <Field id={`${uid}-date`} label={c.requiredDate}><Input id={`${uid}-date`} type="date" value={actionDate} aria-invalid={missing.includes('actionDate')} onChange={e => setDate(e.target.value)} /></Field>}
      {move === 'verified' && <><Field id={`${uid}-effect`} label={c.result}><Select value={effect} onValueChange={v => setEffect(v as Effect)}><SelectTrigger id={`${uid}-effect`} aria-invalid={missing.includes('effect')}><SelectValue placeholder={c.resultPlaceholder} /></SelectTrigger><SelectContent>{Object.entries(c.effects).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select></Field><Field id={`${uid}-note`} label={c.note}><Textarea id={`${uid}-note`} value={note} maxLength={2000} onChange={e => setNote(e.target.value)} /></Field></>}
      {(move === 'dropped' || move === 'reopen') && <Field id={`${uid}-reason`} label={c.reason}><Textarea id={`${uid}-reason`} value={reason} maxLength={2000} aria-invalid={missing.includes('reason')} onChange={e => setReason(e.target.value)} /></Field>}
      <DialogFooter><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{c.cancel}</Button><Button type="submit" disabled={busy || conflict || !legal || !(move === 'reopen' ? reopenAction.ready : statusAction.ready)}>{busy ? c.saving : c.confirm}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
export function StatusMoves({ item }: { item: ItemRow }) {
  const c = useCopy();
  const [move, setMove] = useState<Status | 'reopen' | null>(null);
  return <><div className="flex flex-wrap gap-2">{FORWARD[item.status].map((s, i) => <Button key={s} variant={i === 0 && s !== 'dropped' ? 'primary' : 'secondary'} size="sm" onClick={() => setMove(s)}>{c.statuses[s]}</Button>)}{REOPEN[item.status] && <Button variant="secondary" size="sm" onClick={() => setMove('reopen')}>{c.reopen}</Button>}</div>{move && <MoveDialog key={`${item.id}:${move}`} item={item} move={move} onClose={() => setMove(null)} />}</>;
}
