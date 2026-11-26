import { useState, type RefObject } from 'react';
import { Button, FormField, Input, Textarea, useImeEnterGuard, useValidatedSubmit, type ValidationErrors } from '@ap/ui';
import { randomUuidV4 } from '../../lib/api/idempotency';
import type { Model, Params, ScreenProps, WriteResult } from './contracts';
import { Choice, writeFailure, WriteError } from './presentation';
import { formCopy } from './messages';

/** Field values keyed like the controls that show their errors; sample rows use `sampleKey`. */
type LifecycleFields = Record<string, string>;
const SHA256 = /^[a-fA-F0-9]{64}$/;
const REASON_FORMS = ['projectSetStage', 'projectReopen', 'requestCancel'];
const sampleKey = (part: 'fileRef' | 'sha256', rowId: string) => `${part}:${rowId}`;
/** Submit-time errors of one lifecycle form (#2574); `sampleIds` gives the sample rows in their shown order. */
function validateLifecycle(name: string, fields: LifecycleFields, sampleIds: readonly string[]): ValidationErrors<LifecycleFields> {
  const errors: ValidationErrors<LifecycleFields> = {};
  const blank = (key: string) => !(fields[key] ?? '').trim();
  if ((name === 'projectCreate' || name === 'projectUpdate') && blank('ownerActorId')) errors.ownerActorId = formCopy.ownerRequired;
  if (REASON_FORMS.includes(name) && blank('reason')) errors.reason = formCopy.reasonRequired;
  if (name === 'roundOpen') {
    if (blank('sourceOwner')) errors.sourceOwner = formCopy.sourceOwnerRequired;
    sampleIds.forEach((rowId, i) => {
      if (blank(sampleKey('fileRef', rowId))) errors[sampleKey('fileRef', rowId)] = formCopy.sampleLocationRequired(i + 1);
      if (!SHA256.test(fields[sampleKey('sha256', rowId)] ?? '')) errors[sampleKey('sha256', rowId)] = formCopy.sampleShaMalformed;
    });
  }
  return errors;
}

/** Form lifetime is keyed by subject/action by the caller; failed and conflicting writes retain the draft. */
export function LifecycleForm({ api, ui, name, title, initial, version, model, returnFocusRef, onClose, onSuccess }: Pick<ScreenProps, 'api' | 'ui'> & { name: string; title: string; initial: Params; version?: string; model?: Model; returnFocusRef?: RefObject<HTMLElement | null>; onClose(): void; onSuccess?(result: WriteResult): void }) {
  const ime = useImeEnterGuard();
  const action = api.useAction(name);
  const [values, setValues] = useState(initial);
  const [files, setFiles] = useState(() => [{ id: randomUuidV4(), fileRef: '', sha256: '' }]);
  const [result, setResult] = useState<WriteResult | null>(null);
  const locked = action.pending || result?.outcome === 'unknown' || result?.outcome === 'error';
  const fields: LifecycleFields = Object.fromEntries([
    ...Object.entries(values).map(([key, value]) => [key, String(value ?? '')]),
    ...files.flatMap(f => [[sampleKey('fileRef', f.id), f.fileRef], [sampleKey('sha256', f.id), f.sha256]]),
  ]);
  const { errors, handleSubmit, clearError } = useValidatedSubmit<LifecycleFields>({ validate: current => validateLifecycle(name, current, files.map(f => f.id)), onValid: () => { void submit(); } });
  const change = (key: string, value: string) => { setValues(v => ({ ...v, [key]: value })); clearError(key); };
  const setSample = (i: number, part: 'fileRef' | 'sha256', value: string) => { setFiles(old => old.map((x, n) => n === i ? { ...x, [part]: value } : x)); const row = files[i]; if (row) clearError(sampleKey(part, row.id)); };
  const input = (key: string, label: string, required = true, type = 'text') => <FormField key={key} id={`lifecycle-${key}`} label={label} required={required} requiredMark="text" error={errors[key]}>{control => <Input {...control} inputSize="toolbar" type={type} value={String(values[key] ?? '')} onChange={e => change(key, e.target.value)} disabled={locked} />}</FormField>;
  async function submit() {
    let payload = values;
    if (name === 'projectCreate' || name === 'projectUpdate') payload = { ...values, ...(values.softwareId ? {} : { softwareId: null }), targetDate: values.targetDate || null };
    if (name === 'roundOpen') payload = { projectId: values.projectId, sampleSet: { sourceOwner: values.sourceOwner, files: files.map((f, i) => ({ fileRef: f.fileRef, sha256: f.sha256, order: i + 1 })) }, ...(values.note ? { note: values.note } : {}) };
    try {
      const next = await action.run(payload, version ? { expectedVersion: version } : undefined);
      setResult(next); if (next.outcome === 'ok') { onSuccess?.(next); onClose(); }
    } catch (cause) { const failure = writeFailure(cause); if (failure) setResult(failure); }
  }
  const body = <form onKeyDown={ime.onKeyDown} onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd} className="grid gap-4 break-keep" onSubmit={handleSubmit(fields)}>
    {name === 'projectCreate' || name === 'projectUpdate' ? <><p className="text-sm">{model?.code} · {model?.name}</p>{name === 'projectCreate' ? <Choice label="개발 종류" value={String(values.kind)} onChange={v => change('kind', v)} options={[[ 'new', '신규' ], ['redevelopment', '재개발']]} disabled={locked} /> : null}{input('ownerActorId', '담당 Actor ID')}{input('softwareId', 'SW ID', false)}{input('targetDate', '목표일', false, 'date')}</> : null}
    {name === 'roundOpen' ? <><p className="text-xs text-text-secondary">Round를 열면 샘플 순서·위치·해시와 서버가 고정한 명세를 바꿀 수 없습니다.</p>{input('sourceOwner', '원본 소유자')}
      <fieldset disabled={locked} className="grid gap-3"><legend className="mb-2 text-sm">샘플 순서</legend>{files.map((f, i) => <div key={f.id} className="grid gap-2 border-t border-border-subtle pt-3"><FormField id={`file-ref-${i}`} label={`샘플 ${i + 1} 위치`} required requiredMark="text" error={errors[sampleKey('fileRef', f.id)]}>{control => <Input {...control} inputSize="toolbar" value={f.fileRef} onChange={e => setSample(i, 'fileRef', e.target.value)} />}</FormField><FormField id={`file-sha-${i}`} label={`샘플 ${i + 1} SHA-256`} required requiredMark="text" error={errors[sampleKey('sha256', f.id)]}>{control => <Input {...control} inputSize="toolbar" value={f.sha256} onChange={e => setSample(i, 'sha256', e.target.value)} />}</FormField><div className="flex gap-2"><Button type="button" variant="secondary" size="toolbar" disabled={i === 0} onClick={() => setFiles(old => { const next = [...old]; const current = next[i], previous = next[i - 1]; if (current && previous) { next[i - 1] = current; next[i] = previous; } return next; })}>위로</Button><Button type="button" variant="secondary" size="toolbar" disabled={files.length === 1} onClick={() => setFiles(old => old.filter((_, n) => n !== i))}>샘플 제외</Button></div></div>)}<Button type="button" variant="secondary" size="toolbar" onClick={() => setFiles(old => [...old, { id: randomUuidV4(), fileRef: '', sha256: '' }])}>샘플 추가</Button></fieldset>{input('note', '메모', false)}</> : null}
    {REASON_FORMS.includes(name) ? <FormField id="lifecycle-reason" label="사유" required requiredMark="text" error={errors.reason}>{control => <Textarea {...control} maxLength={2000} value={String(values.reason ?? '')} disabled={locked} onChange={e => change('reason', e.target.value)} />}</FormField> : null}
    {name === 'roundClose' ? <p className="text-sm">Round 종료는 되돌릴 수 없습니다. 샘플과 결과는 이력으로 보존됩니다.</p> : null}
    <WriteError result={result} onRetry={() => { void result?.retry?.().then(next => { setResult(next); if (next.outcome === 'ok') { onSuccess?.(next); onClose(); } }).catch(cause => { const failure = writeFailure(cause); if (failure) setResult(failure); }); }} />
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" size="toolbar" disabled={action.pending} onClick={onClose}>닫기</Button><Button type="submit" variant="primary" size="toolbar" disabled={locked}>{action.pending ? '저장 중…' : title}</Button></div>
  </form>;
  return ui.drawer({ title, body, ...(returnFocusRef ? { returnFocusRef } : {}), requestClose: () => { if (!action.pending) onClose(); } });
}
