import { useState } from 'react';
import { Button, Input, Label, Textarea } from '@ap/ui';
import { randomUuidV4 } from '../../lib/api/idempotency';
import type { Model, Params, ScreenProps, WriteResult } from './contracts';
import { Choice, writeFailure, WriteError } from './presentation';

/** Form lifetime is keyed by subject/action by the caller; failed and conflicting writes retain the draft. */
export function LifecycleForm({ api, ui, name, title, initial, version, model, onClose, onSuccess }: Pick<ScreenProps, 'api' | 'ui'> & { name: string; title: string; initial: Params; version?: string; model?: Model; onClose(): void; onSuccess?(result: WriteResult): void }) {
  const action = api.useAction(name);
  const [values, setValues] = useState(initial);
  const [files, setFiles] = useState(() => [{ id: randomUuidV4(), fileRef: '', sha256: '' }]);
  const [result, setResult] = useState<WriteResult | null>(null);
  const locked = action.pending || result?.outcome === 'unknown' || result?.outcome === 'error';
  const change = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }));
  const input = (key: string, label: string, required = true, type = 'text') => <div className="grid gap-2" key={key}><Label htmlFor={`lifecycle-${key}`}>{label}</Label><Input inputSize="toolbar" id={`lifecycle-${key}`} required={required} type={type} value={String(values[key] ?? '')} onChange={e => change(key, e.target.value)} disabled={locked} /></div>;
  async function submit() {
    let payload = values;
    if (name === 'projectCreate' || name === 'projectUpdate') payload = { ...values, ...(values.softwareId ? {} : { softwareId: null }), targetDate: values.targetDate || null };
    if (name === 'roundOpen') payload = { projectId: values.projectId, sampleSet: { sourceOwner: values.sourceOwner, files: files.map((f, i) => ({ fileRef: f.fileRef, sha256: f.sha256, order: i + 1 })) }, ...(values.note ? { note: values.note } : {}) };
    try {
      const next = await action.run(payload, version ? { expectedVersion: version } : undefined);
      setResult(next); if (next.outcome === 'ok') { onSuccess?.(next); onClose(); }
    } catch (cause) { const failure = writeFailure(cause); if (failure) setResult(failure); }
  }
  const body = <form className="grid gap-4 break-keep" onSubmit={e => { e.preventDefault(); void submit(); }}>
    {name === 'projectCreate' || name === 'projectUpdate' ? <><p className="text-sm">{model?.code} · {model?.name}</p>{name === 'projectCreate' ? <Choice label="개발 종류" value={String(values.kind)} onChange={v => change('kind', v)} options={[[ 'new', '신규' ], ['redevelopment', '재개발']]} disabled={locked} /> : null}{input('ownerActorId', '담당 Actor ID (필수)')}{input('softwareId', 'SW ID', false)}{input('targetDate', '목표일', false, 'date')}</> : null}
    {name === 'roundOpen' ? <><p className="text-xs text-text-secondary">Round를 열면 샘플 순서·위치·해시와 서버가 고정한 명세를 바꿀 수 없습니다.</p>{input('sourceOwner', '원본 소유자 (필수)')}
      <fieldset disabled={locked} className="grid gap-3"><legend className="mb-2 text-sm">샘플 순서</legend>{files.map((f, i) => <div key={f.id} className="grid gap-2 border-t border-border-subtle pt-3"><Label htmlFor={`file-ref-${i}`}>샘플 {i + 1} 위치 (필수)</Label><Input inputSize="toolbar" id={`file-ref-${i}`} required value={f.fileRef} onChange={e => setFiles(old => old.map((x, n) => n === i ? { ...x, fileRef: e.target.value } : x))} /><Label htmlFor={`file-sha-${i}`}>샘플 {i + 1} SHA-256 (필수)</Label><Input inputSize="toolbar" id={`file-sha-${i}`} required pattern="[a-fA-F0-9]{64}" value={f.sha256} onChange={e => setFiles(old => old.map((x, n) => n === i ? { ...x, sha256: e.target.value } : x))} /><div className="flex gap-2"><Button type="button" variant="secondary" size="toolbar" disabled={i === 0} onClick={() => setFiles(old => { const next = [...old]; const current = next[i], previous = next[i - 1]; if (current && previous) { next[i - 1] = current; next[i] = previous; } return next; })}>위로</Button><Button type="button" variant="secondary" size="toolbar" disabled={files.length === 1} onClick={() => setFiles(old => old.filter((_, n) => n !== i))}>샘플 제외</Button></div></div>)}<Button type="button" variant="secondary" size="toolbar" onClick={() => setFiles(old => [...old, { id: randomUuidV4(), fileRef: '', sha256: '' }])}>샘플 추가</Button></fieldset>{input('note', '메모', false)}</> : null}
    {['projectSetStage', 'projectReopen', 'requestCancel'].includes(name) ? <div className="grid gap-2"><Label htmlFor="lifecycle-reason">사유 (필수)</Label><Textarea id="lifecycle-reason" required maxLength={2000} value={String(values.reason ?? '')} disabled={locked} onChange={e => change('reason', e.target.value)} /></div> : null}
    {name === 'roundClose' ? <p className="text-sm">Round 종료는 되돌릴 수 없습니다. 샘플과 결과는 이력으로 보존됩니다.</p> : null}
    <WriteError result={result} onRetry={() => { void result?.retry?.().then(next => { setResult(next); if (next.outcome === 'ok') { onSuccess?.(next); onClose(); } }).catch(cause => { const failure = writeFailure(cause); if (failure) setResult(failure); }); }} />
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" size="toolbar" disabled={action.pending} onClick={onClose}>닫기</Button><Button type="submit" variant="primary" size="toolbar" disabled={locked}>{action.pending ? '저장 중…' : title}</Button></div>
  </form>;
  return ui.drawer({ title, body, requestClose: () => { if (!action.pending) onClose(); } });
}
