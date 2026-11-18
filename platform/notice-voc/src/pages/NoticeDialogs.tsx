import { formatText, usePlatform, useUnsavedGuard } from '@ap/kernel';
import { NOTICE_VOC_MESSAGES } from '../messages';
import { cloneElement, useEffect, useRef, useState, type ReactElement } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ActionResponse, Notice, ScopeOption } from '@ap/contracts';
import { StateMessage } from '@ap/components';
import { Button, Dialog, DirtyConfirmation, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@ap/ui';
import { attemptFor, CONTENT_MAX, emptyForm, fieldOfPath, formOf, TITLE_MAX, toDraft, validateForm, withSeconds, type Attempt, type FormErrors, type FormField, type NoticeForm } from '../notice-model';

/** What a write dialog tells the page when it ends. `reload`: the list must be read again (conflict or already gone). */
export type WriteDone = { kind: 'saved'; id: string } | { kind: 'deleted'; id: string } | { kind: 'reload' } | { kind: 'cancel' };

type Failure = { kind: 'conflict' | 'forbidden' | 'not_found' | 'retry' | 'invalid'; message?: string };

/** Outcome → what the dialog shows. `ok` (replayed or not) is success; `error`/`unknown` keep the key for an identical retry. */
function failureOf<T>(res: ActionResponse<T>): Failure | null {
  switch (res.outcome) {
    case 'ok': return null;
    case 'conflict': return { kind: 'conflict' };
    case 'forbidden': return { kind: 'forbidden' };
    case 'not_found': return { kind: 'not_found' };
    case 'invalid': return { kind: 'invalid' };
    default: return { kind: 'retry' };
  }
}

const concluded = (failure: Failure | null): boolean => failure === null || failure.kind !== 'retry';

/** True while the dialog is mounted: a write that finishes after the dialog went away (screen left, session or access changed) must not touch state, toast or navigate. */
function useAlive() {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return alive;
}

function FailureMessage({ failure, ko, onReload, onRetry }: { failure: Failure; ko: boolean; onReload: () => void; onRetry: () => void }) {
  if (failure.kind === 'conflict') {
    return <StateMessage icon={<AlertTriangle className="size-4" aria-hidden />} tone="warning" title={formatText(NOTICE_VOC_MESSAGES.noticeDialogsChangedElsewhereFirst, (ko ? 'ko' : 'en'))}
      body={formatText(NOTICE_VOC_MESSAGES.noticeDialogsThisNoticeWasChangedMeanwhileNothingWas, (ko ? 'ko' : 'en'))}
      action={<Button type="button" size="sm" variant="secondary" onClick={onReload}>{formatText(NOTICE_VOC_MESSAGES.noticeDialogsLoadLatest, (ko ? 'ko' : 'en'))}</Button>} />;
  }
  if (failure.kind === 'not_found') {
    return <StateMessage icon={<AlertTriangle className="size-4" aria-hidden />} tone="warning" title={formatText(NOTICE_VOC_MESSAGES.noticeDialogsNoticeNotFound, (ko ? 'ko' : 'en'))}
      body={formatText(NOTICE_VOC_MESSAGES.noticeDialogsThisNoticeWasAlreadyDeleted, (ko ? 'ko' : 'en'))}
      action={<Button type="button" size="sm" variant="secondary" onClick={onReload}>{formatText(NOTICE_VOC_MESSAGES.noticeDialogsReloadList, (ko ? 'ko' : 'en'))}</Button>} />;
  }
  if (failure.kind === 'forbidden') {
    return <StateMessage icon={<AlertTriangle className="size-4" aria-hidden />} tone="danger" title={formatText(NOTICE_VOC_MESSAGES.noticeDialogsNoPermissionToManageNotices, (ko ? 'ko' : 'en'))} body={formatText(NOTICE_VOC_MESSAGES.noticeDialogsYourAccessMayHaveBeenRevokedNothing, (ko ? 'ko' : 'en'))} />;
  }
  if (failure.kind === 'retry') {
    return <StateMessage icon={<AlertTriangle className="size-4" aria-hidden />} tone="danger" title={formatText(NOTICE_VOC_MESSAGES.noticeDialogsCouldNotConfirmTheResult, (ko ? 'ko' : 'en'))}
      body={formatText(NOTICE_VOC_MESSAGES.noticeDialogsResendingTheSameRequestWillNotDuplicate, (ko ? 'ko' : 'en'))}
      action={<Button type="button" size="sm" variant="secondary" onClick={onRetry}>{formatText(NOTICE_VOC_MESSAGES.noticeDialogsRetry, (ko ? 'ko' : 'en'))}</Button>} />;
  }
  return <StateMessage icon={<AlertTriangle className="size-4" aria-hidden />} tone="danger" title={formatText(NOTICE_VOC_MESSAGES.noticeDialogsCheckTheInput, (ko ? 'ko' : 'en'))} body={formatText(NOTICE_VOC_MESSAGES.noticeDialogsTheServerRejectedTheInputFixThe, (ko ? 'ko' : 'en'))} />;
}

const ERROR_TEXT = (ko: boolean): Record<NonNullable<FormErrors[FormField]>, string> => ({
  required: formatText(NOTICE_VOC_MESSAGES.noticeDialogsRequired, (ko ? 'ko' : 'en')),
  too_long: formatText(NOTICE_VOC_MESSAGES.noticeDialogsTooLong, (ko ? 'ko' : 'en')),
  invalid: formatText(NOTICE_VOC_MESSAGES.noticeDialogsNotAValidValue, (ko ? 'ko' : 'en')),
});

/** The error is linked to its control: `aria-invalid` plus `aria-describedby` → the message id. */
function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactElement<Record<string, unknown>> }) {
  return <div className="grid gap-1">
    <Label htmlFor={id}>{label}</Label>
    {cloneElement(children, error ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {})}
    {error && <p id={`${id}-error`} className="text-xs text-text-danger-label" role="alert">{error}</p>}
  </div>;
}

/** Create or edit dialog. Real sessions have no granted sites, so 전체 is the only target until `session.scopes` supplies some. */
export function NoticeFormDialog({ notice, ko, scopes, onDone }: { notice: Notice | null; ko: boolean; scopes: readonly ScopeOption[]; onDone: (done: WriteDone) => void }) {
  const { adapter, toast } = usePlatform();
  const [initial] = useState<NoticeForm>(() => notice ? formOf(notice) : emptyForm());
  const [form, setForm] = useState<NoticeForm>(initial);
  // The exit waiting for «버리기»: a close, or a reload after a conflict or a deleted notice.
  const [asking, setAsking] = useState<WriteDone | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const alive = useAlive();
  const text = ERROR_TEXT(ko);
  const lang = ko ? 'ko' : 'en';
  // #2533: a typed draft is never dropped without asking — Escape, outside click, the close button and «취소» all ask first, and leaving the menu asks through the shell.
  // `datetime-local` may drop `:00` seconds, so the end time compares through the wire form.
  const comparable = (f: NoticeForm) => JSON.stringify({ ...f, until: withSeconds(f.until) });
  const dirty = comparable(form) !== comparable(initial);
  // Stays registered through a pending save: a failed save keeps the draft, so leaving meanwhile must still ask.
  useUnsavedGuard(dirty, { message: formatText(NOTICE_VOC_MESSAGES.noticeDialogsDiscardMessage, lang) });
  const leave = (done: WriteDone) => { if (dirty) setAsking(done); else onDone(done); };
  const cancel = () => { if (!busy) leave({ kind: 'cancel' }); };
  const set = (patch: Partial<NoticeForm>) => { setForm(prev => ({ ...prev, ...patch })); setFailure(null); };
  const sites = [...scopes, ...(notice?.scopeId && !scopes.some(s => s.id === notice.scopeId) ? [{ id: notice.scopeId, label: notice.scopeId, grantedRooms: 0, totalRooms: 0 }] : [])];

  async function submit() {
    const found = validateForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const draft = toDraft(form);
    const input = notice ? { ...draft, id: notice.id, expectedVersion: notice.version } : draft;
    // Same operation and input → same key (identical retry); any change or a new operation → new key.
    attempt.current = attemptFor(attempt.current, JSON.stringify(input));
    setBusy(true);
    let res: ActionResponse<Notice>;
    try { res = await adapter.saveNotice({ ...input, idempotencyKey: attempt.current.key }); }
    catch { res = { outcome: 'unknown', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'client' }; }
    if (!alive.current) return;
    setBusy(false);
    const next = failureOf(res);
    if (concluded(next)) attempt.current = null;
    if (!next) {
      toast(formatText(NOTICE_VOC_MESSAGES.noticeDialogsNoticeSaved, (ko ? 'ko' : 'en')), 'info');
      onDone({ kind: 'saved', id: res.data?.id ?? notice?.id ?? '' });
      return;
    }
    if (next.kind === 'invalid') {
      const mapped: FormErrors = {};
      for (const e of res.fieldErrors) { const field = fieldOfPath(e.path); if (field) mapped[field] = 'invalid'; }
      setErrors(mapped);
    }
    setFailure(next);
  }

  return <Dialog open onOpenChange={open => { if (!open) cancel(); }}>
    <DialogContent className="max-w-xl" closeLabel={formatText(NOTICE_VOC_MESSAGES.noticeDialogsClose, (ko ? 'ko' : 'en'))}>
      <DialogHeader>
        <DialogTitle>{notice ? (formatText(NOTICE_VOC_MESSAGES.noticeDialogsEditNotice, (ko ? 'ko' : 'en'))) : (formatText(NOTICE_VOC_MESSAGES.noticeDialogsWriteNotice, (ko ? 'ko' : 'en')))}</DialogTitle>
        <DialogDescription>{formatText(NOTICE_VOC_MESSAGES.noticeDialogsAfterTheEndTimeTheNoticeLeaves, (ko ? 'ko' : 'en'))}</DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
        <Field id="notice-title-ko" label={formatText(NOTICE_VOC_MESSAGES.noticeDialogsTitleKorean, (ko ? 'ko' : 'en'))} error={errors.titleKo && text[errors.titleKo]}>
          <Input id="notice-title-ko" value={form.titleKo} maxLength={TITLE_MAX} onChange={e => set({ titleKo: e.target.value })} />
        </Field>
        <Field id="notice-title-en" label={formatText(NOTICE_VOC_MESSAGES.noticeDialogsTitleEnglish, (ko ? 'ko' : 'en'))} error={errors.titleEn && text[errors.titleEn]}>
          <Input id="notice-title-en" value={form.titleEn} maxLength={TITLE_MAX} onChange={e => set({ titleEn: e.target.value })} />
        </Field>
        <Field id="notice-content-ko" label={formatText(NOTICE_VOC_MESSAGES.noticeDialogsContentKorean, (ko ? 'ko' : 'en'))} error={errors.contentKo && text[errors.contentKo]}>
          <Textarea id="notice-content-ko" value={form.contentKo} maxLength={CONTENT_MAX} rows={4} onChange={e => set({ contentKo: e.target.value })} />
        </Field>
        <Field id="notice-content-en" label={formatText(NOTICE_VOC_MESSAGES.noticeDialogsContentEnglish, (ko ? 'ko' : 'en'))} error={errors.contentEn && text[errors.contentEn]}>
          <Textarea id="notice-content-en" value={form.contentEn} maxLength={CONTENT_MAX} rows={4} onChange={e => set({ contentEn: e.target.value })} />
        </Field>
        <Field id="notice-until" label={formatText(NOTICE_VOC_MESSAGES.noticeDialogsEndsAtSeoulTime, (ko ? 'ko' : 'en'))} error={errors.until && text[errors.until]}>
          <Input id="notice-until" type="datetime-local" step={1} value={form.until} onChange={e => set({ until: e.target.value })} />
        </Field>
        {sites.length > 0
          ? <div className="grid gap-1">
              <Label id="notice-scope-label">{formatText(NOTICE_VOC_MESSAGES.noticeDialogsTargetSite, (ko ? 'ko' : 'en'))}</Label>
              <Select value={form.scopeId ?? '__all'} onValueChange={value => set({ scopeId: value === '__all' ? null : value })}>
                <SelectTrigger aria-labelledby="notice-scope-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">{formatText(NOTICE_VOC_MESSAGES.noticeDialogsAll, (ko ? 'ko' : 'en'))}</SelectItem>
                  {sites.map(site => <SelectItem key={site.id} value={site.id}>{site.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          : <p className="text-sm text-text-secondary">{formatText(NOTICE_VOC_MESSAGES.noticeDialogsTargetSiteAll, (ko ? 'ko' : 'en'))}</p>}
        {failure && <FailureMessage failure={failure} ko={ko} onReload={() => leave({ kind: 'reload' })} onRetry={() => void submit()} />}
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={busy} onClick={cancel}>{formatText(NOTICE_VOC_MESSAGES.noticeDialogsCancel, (ko ? 'ko' : 'en'))}</Button>
          <Button type="submit" disabled={busy}>{formatText(NOTICE_VOC_MESSAGES.noticeDialogsSave, (ko ? 'ko' : 'en'))}</Button>
        </DialogFooter>
      </form>
      <DirtyConfirmation open={asking !== null} title={formatText(NOTICE_VOC_MESSAGES.noticeDialogsDiscardTitle, lang)}
        message={formatText(asking?.kind === 'reload' ? NOTICE_VOC_MESSAGES.noticeDialogsReloadDiscardMessage : NOTICE_VOC_MESSAGES.noticeDialogsDiscardMessage, lang)}
        confirmLabel={formatText(asking?.kind === 'reload' ? NOTICE_VOC_MESSAGES.noticeDialogsReloadDiscardConfirm : NOTICE_VOC_MESSAGES.noticeDialogsDiscardConfirm, lang)}
        cancelLabel={formatText(NOTICE_VOC_MESSAGES.noticeDialogsKeepWriting, lang)}
        onCancel={() => setAsking(null)} onConfirm={() => { const done = asking; setAsking(null); if (done) onDone(done); }} />
    </DialogContent>
  </Dialog>;
}

export function NoticeDeleteDialog({ notice, ko, onDone, onCloseAutoFocus }: { notice: Notice; ko: boolean; onDone: (done: WriteDone) => void; onCloseAutoFocus?: (event: Event) => void }) {
  const { adapter, toast } = usePlatform();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const alive = useAlive();

  async function submit() {
    const input = { id: notice.id, expectedVersion: notice.version };
    attempt.current = attemptFor(attempt.current, JSON.stringify(input));
    setBusy(true);
    let res: ActionResponse<{ id: string }>;
    try { res = await adapter.deleteNotice({ ...input, idempotencyKey: attempt.current.key }); }
    catch { res = { outcome: 'unknown', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'client' }; }
    if (!alive.current) return;
    setBusy(false);
    const next = failureOf(res);
    if (concluded(next)) attempt.current = null;
    if (!next) {
      toast(formatText(NOTICE_VOC_MESSAGES.noticeDialogsNoticeDeleted, (ko ? 'ko' : 'en')), 'info');
      onDone({ kind: 'deleted', id: notice.id });
      return;
    }
    setFailure(next);
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onDone({ kind: 'cancel' }); }}>
    <DialogContent className="max-w-md" closeLabel={formatText(NOTICE_VOC_MESSAGES.noticeDialogsClose2, (ko ? 'ko' : 'en'))} onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader>
        <DialogTitle>{formatText(NOTICE_VOC_MESSAGES.noticeDialogsDeleteNotice, (ko ? 'ko' : 'en'))}</DialogTitle>
        <DialogDescription>{formatText(NOTICE_VOC_MESSAGES.noticeDialogsDeleteThisCannotBeUndone, (ko ? 'ko' : 'en'), { titleKo: notice.title.ko, titleEn: notice.title.en || notice.title.ko })}</DialogDescription>
      </DialogHeader>
      {failure && <FailureMessage failure={failure} ko={ko} onReload={() => onDone({ kind: 'reload' })} onRetry={() => void submit()} />}
      <DialogFooter>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => onDone({ kind: 'cancel' })}>{formatText(NOTICE_VOC_MESSAGES.noticeDialogsCancel2, (ko ? 'ko' : 'en'))}</Button>
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void submit()}>{formatText(NOTICE_VOC_MESSAGES.noticeDialogsDelete, (ko ? 'ko' : 'en'))}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
