import { cloneElement, useEffect, useRef, useState, type ReactElement } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ActionResponse, Notice, ScopeOption } from '@ap/contracts';
import { usePlatform } from '@ap/kernel';
import { StateMessage } from '@ap/components';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@ap/ui';
import { attemptFor, CONTENT_MAX, emptyForm, fieldOfPath, formOf, TITLE_MAX, toDraft, validateForm, type Attempt, type FormErrors, type FormField, type NoticeForm } from '../notice-model';

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
    return <StateMessage icon={<AlertTriangle className="size-4" aria-hidden />} tone="warning" title={ko ? '다른 곳에서 먼저 바뀌었습니다' : 'Changed elsewhere first'}
      body={ko ? '이 공지가 그 사이 수정되거나 삭제되었습니다. 저장하지 않았습니다. 최신 내용을 불러온 뒤 다시 시도하세요.' : 'This notice was changed meanwhile. Nothing was saved. Load the latest and try again.'}
      action={<Button type="button" size="sm" variant="secondary" onClick={onReload}>{ko ? '최신 내용 불러오기' : 'Load latest'}</Button>} />;
  }
  if (failure.kind === 'not_found') {
    return <StateMessage icon={<AlertTriangle className="size-4" aria-hidden />} tone="warning" title={ko ? '공지를 찾을 수 없습니다' : 'Notice not found'}
      body={ko ? '이미 삭제된 공지입니다.' : 'This notice was already deleted.'}
      action={<Button type="button" size="sm" variant="secondary" onClick={onReload}>{ko ? '목록 새로 읽기' : 'Reload list'}</Button>} />;
  }
  if (failure.kind === 'forbidden') {
    return <StateMessage icon={<AlertTriangle className="size-4" aria-hidden />} tone="danger" title={ko ? '공지를 관리할 권한이 없습니다' : 'No permission to manage notices'} body={ko ? '권한이 회수되었을 수 있습니다. 변경하지 않았습니다.' : 'Your access may have been revoked. Nothing was changed.'} />;
  }
  if (failure.kind === 'retry') {
    return <StateMessage icon={<AlertTriangle className="size-4" aria-hidden />} tone="danger" title={ko ? '저장 결과를 확인하지 못했습니다' : 'Could not confirm the result'}
      body={ko ? '같은 요청을 다시 보내도 중복 저장되지 않습니다.' : 'Resending the same request will not duplicate it.'}
      action={<Button type="button" size="sm" variant="secondary" onClick={onRetry}>{ko ? '다시 시도' : 'Retry'}</Button>} />;
  }
  return <StateMessage icon={<AlertTriangle className="size-4" aria-hidden />} tone="danger" title={ko ? '입력을 확인하세요' : 'Check the input'} body={ko ? '서버가 입력을 받아들이지 않았습니다. 표시된 항목을 고쳐 다시 저장하세요.' : 'The server rejected the input. Fix the marked fields and save again.'} />;
}

const ERROR_TEXT = (ko: boolean): Record<NonNullable<FormErrors[FormField]>, string> => ({
  required: ko ? '필수 항목입니다.' : 'Required.',
  too_long: ko ? '허용 길이를 넘었습니다.' : 'Too long.',
  invalid: ko ? '올바른 값이 아닙니다.' : 'Not a valid value.',
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
  const [form, setForm] = useState<NoticeForm>(notice ? formOf(notice) : emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const alive = useAlive();
  const text = ERROR_TEXT(ko);
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
      toast(ko ? '공지를 저장했습니다.' : 'Notice saved.', 'info');
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

  return <Dialog open onOpenChange={open => { if (!open && !busy) onDone({ kind: 'cancel' }); }}>
    <DialogContent className="max-w-xl" closeLabel={ko ? '닫기' : 'Close'}>
      <DialogHeader>
        <DialogTitle>{notice ? (ko ? '공지 수정' : 'Edit notice') : (ko ? '공지 작성' : 'Write notice')}</DialogTitle>
        <DialogDescription>{ko ? '종료 일시가 지나면 홈 배너에서 내려가고 목록의 「종료됨」으로 옮겨집니다.' : 'After the end time the notice leaves the Home banner and moves to “Ended”.'}</DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
        <Field id="notice-title-ko" label={ko ? '제목 (한국어)' : 'Title (Korean)'} error={errors.titleKo && text[errors.titleKo]}>
          <Input id="notice-title-ko" value={form.titleKo} maxLength={TITLE_MAX} onChange={e => set({ titleKo: e.target.value })} />
        </Field>
        <Field id="notice-title-en" label={ko ? '제목 (English)' : 'Title (English)'} error={errors.titleEn && text[errors.titleEn]}>
          <Input id="notice-title-en" value={form.titleEn} maxLength={TITLE_MAX} onChange={e => set({ titleEn: e.target.value })} />
        </Field>
        <Field id="notice-content-ko" label={ko ? '내용 (한국어)' : 'Content (Korean)'} error={errors.contentKo && text[errors.contentKo]}>
          <Textarea id="notice-content-ko" value={form.contentKo} maxLength={CONTENT_MAX} rows={4} onChange={e => set({ contentKo: e.target.value })} />
        </Field>
        <Field id="notice-content-en" label={ko ? '내용 (English)' : 'Content (English)'} error={errors.contentEn && text[errors.contentEn]}>
          <Textarea id="notice-content-en" value={form.contentEn} maxLength={CONTENT_MAX} rows={4} onChange={e => set({ contentEn: e.target.value })} />
        </Field>
        <Field id="notice-until" label={ko ? '종료 일시 (서울 시각)' : 'Ends at (Seoul time)'} error={errors.until && text[errors.until]}>
          <Input id="notice-until" type="datetime-local" step={1} value={form.until} onChange={e => set({ until: e.target.value })} />
        </Field>
        {sites.length > 0
          ? <div className="grid gap-1">
              <Label id="notice-scope-label">{ko ? '대상 사이트' : 'Target site'}</Label>
              <Select value={form.scopeId ?? '__all'} onValueChange={value => set({ scopeId: value === '__all' ? null : value })}>
                <SelectTrigger aria-labelledby="notice-scope-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">{ko ? '전체' : 'All'}</SelectItem>
                  {sites.map(site => <SelectItem key={site.id} value={site.id}>{site.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          : <p className="text-sm text-text-secondary">{ko ? '대상 사이트: 전체' : 'Target site: All'}</p>}
        {failure && <FailureMessage failure={failure} ko={ko} onReload={() => onDone({ kind: 'reload' })} onRetry={() => void submit()} />}
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => onDone({ kind: 'cancel' })}>{ko ? '취소' : 'Cancel'}</Button>
          <Button type="submit" disabled={busy}>{ko ? '저장' : 'Save'}</Button>
        </DialogFooter>
      </form>
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
      toast(ko ? '공지를 삭제했습니다.' : 'Notice deleted.', 'info');
      onDone({ kind: 'deleted', id: notice.id });
      return;
    }
    setFailure(next);
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onDone({ kind: 'cancel' }); }}>
    <DialogContent className="max-w-md" closeLabel={ko ? '닫기' : 'Close'} onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader>
        <DialogTitle>{ko ? '공지 삭제' : 'Delete notice'}</DialogTitle>
        <DialogDescription>{ko ? `「${notice.title.ko}」 공지를 삭제합니다. 되돌릴 수 없습니다.` : `Delete “${notice.title.en || notice.title.ko}”. This cannot be undone.`}</DialogDescription>
      </DialogHeader>
      {failure && <FailureMessage failure={failure} ko={ko} onReload={() => onDone({ kind: 'reload' })} onRetry={() => void submit()} />}
      <DialogFooter>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => onDone({ kind: 'cancel' })}>{ko ? '취소' : 'Cancel'}</Button>
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void submit()}>{ko ? '삭제' : 'Delete'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
