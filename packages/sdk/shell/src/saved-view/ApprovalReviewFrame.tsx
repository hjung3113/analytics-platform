import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Result } from '@ap/contracts';
import { failureText } from '@ap/components';
import { useI18n, useMessages } from '@ap/kernel';
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle, StatusBadge, Textarea, useIsTruncated } from '@ap/ui';
import { SHELL_MESSAGES } from '../messages';

export type ReviewAction = 'approve' | 'reject' | 'withdraw';
export type ApprovalReviewFrameProps = {
  name: string; scope: string; canDecide: boolean; canWithdraw: boolean;
  canApprove?: boolean;
  activeCopy?: 'proposal' | 'approved' | undefined;
  onAction: (action: ReviewAction, reason?: string) => Promise<Result<unknown>>;
  onClose: () => void;
};

export function ApprovalReviewFrame({ name, scope, canDecide, canApprove = true, canWithdraw, activeCopy, onAction, onClose }: ApprovalReviewFrameProps) {
  const m = useMessages(SHELL_MESSAGES);
  const { t, tx } = useI18n();
  const [reason, setReason] = useState('');
  const [reject, setReject] = useState(false);
  const [submission, setSubmission] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const { busy, error } = submission;
  const close = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLParagraphElement>(null);
  const scopeRef = useRef<HTMLSpanElement>(null);
  const nameClipped = useIsTruncated(nameRef);
  const scopeClipped = useIsTruncated(scopeRef);
  const scopeLabel = m('savedViewReviewScope', { scope });
  const reasonId = useId();
  useLayoutEffect(() => { close.current?.focus(); }, []);
  const run = async (action: ReviewAction, note?: string) => {
    if (busy) return;
    setSubmission({ busy: true });
    try {
      const result = note === undefined ? await onAction(action) : await onAction(action, note);
      if (result.ok) { setSubmission({ busy: false }); onClose(); }
      else setSubmission({ busy: false, error: failureText(result, tx) });
    } catch { setSubmission({ busy: false, error: m('savedViewUnavailable') }); }
  };
  return <div className="shrink-0 border-b border-border-chrome bg-surface-card break-keep" role="region" aria-label={m('savedViewReview')}>
    <div className="flex min-h-toolbar items-center gap-3 px-4">
      <StatusBadge tone="info">{m('savedViewReview')}</StatusBadge>
      <p ref={nameRef} className="min-w-0 truncate text-sm font-semibold" title={nameClipped ? name : undefined}>{name}</p>
      <span className="whitespace-nowrap text-sm text-text-muted">{m('savedViewReviewCopies')}</span>
      {activeCopy && <span className="whitespace-nowrap text-sm font-semibold" role="status">{m(activeCopy === 'proposal' ? 'savedViewReviewProposal' : 'savedViewReviewApproved')}</span>}
      <span ref={scopeRef} className="min-w-0 truncate text-sm text-text-muted" title={scopeClipped ? scopeLabel : undefined}>{scopeLabel}</span>
      <div className="ml-auto flex shrink-0 gap-2">
        <Button ref={close} size="toolbar" variant="secondary" disabled={busy} onClick={onClose}>{m('savedViewCloseReview')}</Button>
        {canWithdraw && <Button size="toolbar" variant="secondary" disabled={busy} onClick={() => void run('withdraw')}>{m('savedViewWithdraw')}</Button>}
        {canDecide && <><Button size="toolbar" disabled={busy || !canApprove} onClick={() => void run('approve')}>{m('savedViewReviewApprove')}</Button>
          <Button size="toolbar" variant="destructive" disabled={busy} onClick={() => { setReason(''); setSubmission({ busy: false }); setReject(true); }}>{m('savedViewReviewRejectOpen')}</Button></>}
      </div>
    </div>
    {!reject && error && <p role="alert" className="px-4 pb-2 text-sm text-text-danger-label [overflow-wrap:anywhere]">{error}</p>}
    <Dialog open={reject} onOpenChange={open => { if (!busy) { setReject(open); setSubmission({ busy: false }); } }}>
      <DialogContent aria-describedby={undefined} closeLabel={t('close')} className="break-keep [overflow-wrap:anywhere]">
        <DialogTitle>{m('savedViewReviewReject')}</DialogTitle>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (reason.trim()) void run('reject', reason.trim()); }}>
          <label htmlFor={reasonId}>{m('savedViewReviewReason')}</label>
          <Textarea id={reasonId} required value={reason} onChange={event => setReason(event.target.value)} disabled={busy} />
          {error && <p role="alert" className="text-text-danger-label">{error}</p>}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="secondary" disabled={busy}>{t('cancel')}</Button></DialogClose>
            <Button type="submit" variant="destructive" disabled={busy || !reason.trim()}>{m('savedViewReviewReject')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
