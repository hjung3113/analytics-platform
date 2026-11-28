import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Result } from '@ap/contracts';
import { failureText } from '@ap/components';
import { useI18n, useMessages } from '@ap/kernel';
import { Button, Dialog, DialogContent, DialogTitle, StatusBadge, Textarea } from '@ap/ui';
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
  return <div className="absolute inset-x-0 top-0 z-40 flex h-[50px] items-center gap-3 border-b border-border-chrome bg-surface-card px-4" role="region" aria-label={m('savedViewReview')}>
    <StatusBadge tone="info">{m('savedViewReview')}</StatusBadge>
    <p className="min-w-0 truncate text-sm font-semibold" title={name}>{name}</p>
    <span className="whitespace-nowrap text-sm text-text-muted">{m('savedViewReviewCopies')}</span>
    {activeCopy && <span className="whitespace-nowrap text-sm font-semibold" role="status">{m(activeCopy === 'proposal' ? 'savedViewReviewProposal' : 'savedViewReviewApproved')}</span>}
    <span className="min-w-0 truncate text-sm text-text-muted" title={scope}>{m('savedViewReviewScope', { scope })}</span>
    <div className="ml-auto flex shrink-0 gap-2">
      <Button ref={close} size="sm" variant="secondary" disabled={busy} onClick={onClose}>{m('savedViewCloseReview')}</Button>
      {canWithdraw && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run('withdraw')}>{m('savedViewWithdraw')}</Button>}
      {canDecide && <><Button size="sm" disabled={busy || !canApprove} onClick={() => void run('approve')}>{m('savedViewReviewApprove')}</Button>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => { setReason(''); setSubmission({ busy: false }); setReject(true); }}>{m('savedViewReviewRejectOpen')}</Button></>}
    </div>
    {!reject && error && <p role="alert" className="absolute right-4 top-full bg-surface-card p-2 text-sm text-text-danger-label">{error}</p>}
    <Dialog open={reject} onOpenChange={open => { if (!busy) { setReject(open); setSubmission({ busy: false }); } }}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{m('savedViewReviewReject')}</DialogTitle>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (reason.trim()) void run('reject', reason.trim()); }}>
          <label htmlFor={reasonId}>{m('savedViewReviewReason')}</label>
          <Textarea id={reasonId} required value={reason} onChange={event => setReason(event.target.value)} disabled={busy} />
          {error && <p role="alert" className="text-text-danger-label">{error}</p>}
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setReject(false)}>{t('cancel')}</Button>
          <Button type="submit" variant="destructive" disabled={busy || !reason.trim()}>{m('savedViewReviewReject')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
