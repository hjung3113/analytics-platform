import { useId, useState } from 'react';
import { formatInstant, type ActionResult } from '@ap/contracts';
import { useMenuAction } from '@ap/kernel';
import { Button, Callout, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DirtyConfirmation, FieldLabel, Input, Label, RadioGroup, RadioGroupItem, Skeleton, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@ap/ui';
import { evidenceHandoff, handoffCheckEndpoint, handoffDraftsEndpoint, type HandoffResult, type Investigation } from '../endpoints';
import { HANDOFF_CONFIRM } from './ExplorerPanels';
import { HandoffOwnerFields, type HandoffOwner } from './HandoffOwnerFields';
import { useSourceRead } from './useSourceRead';

export function knowledgeHandoffBlock(investigation: Investigation): string | null {
  if (!investigation.handoff?.knowledgeDraft) return '넘기기 권한 없음';
  if (investigation.status !== 'open') return '열린 조사만';
  if (!investigation.evidence.length) return '담은 근거 위치 없음';
  return null;
}
const STATUS: Record<string, string> = { draft: '작성 중', submitted: '검토 중', changes_requested: '수정 요청' };
type Answer = ActionResult<HandoffResult>;
export function KnowledgeHandoffDialog({ investigation, onClose, onDone, onCloseAutoFocus }: { investigation: Investigation; onClose: () => void; onDone: (message: string) => void; onCloseAutoFocus: (event: Event) => void }) {
  const uid = useId();
  const send = useMenuAction(evidenceHandoff);
  const check = useSourceRead(handoffCheckEndpoint, { investigationId: investigation.id });
  const drafts = useSourceRead(handoffDraftsEndpoint, {});
  const [mode, setMode] = useState<'create' | 'append'>('create');
  const [form, setForm] = useState<HandoffOwner & { title: string; observation: string }>({ ownerKind: 'model', modelId: '', softwareId: '', title: '', observation: '' });
  const [draftId, setDraftId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [again, setAgain] = useState<null | (() => Promise<Answer>)>(null);
  const [retryMode, setRetryMode] = useState(mode);
  const pending = busy || send.pending;
  const locked = pending || again !== null;
  const data = check.response?.outcome === 'ok' ? check.response.data : null;
  const rows = drafts.response?.outcome === 'ok' ? drafts.response.data?.rows ?? [] : [];
  const selected = rows.find(row => row.draftId === draftId);
  const statuses = new Map(data?.refs.map(ref => [`${ref.fileRef}:${ref.line}`, ref.status]));
  // A missing status is never guessed eligible (including stale or incomplete check responses).
  const eligible = data?.state === 'ok' ? investigation.evidence.filter(({ ref }) => { const status = statuses.get(`${ref.fileRef}:${ref.line}`); return status === 'ok' || status === 'hash_mismatch'; }) : [];
  const excluded = investigation.evidence.length - eligible.length;
  const mismatched = eligible.filter(({ ref }) => statuses.get(`${ref.fileRef}:${ref.line}`) === 'hash_mismatch').length;
  const total = eligible.length + (mode === 'append' ? selected?.evidenceCount ?? 0 : 0);
  const required = form.title.trim() && form.observation.trim() && (form.ownerKind === 'model' ? form.modelId : form.softwareId);
  const sourceError = data?.state === 'source_forbidden' ? '원본 접근 권한이 없어 넘길 수 없습니다.' : !check.loading && (!data || data.state !== 'ok') ? '원본 연결을 확인할 수 없어 넘길 수 없습니다.' : '';
  const reason = check.loading ? '근거 위치를 확인하고 있습니다.' : sourceError || (eligible.length === 0 ? '넘길 근거 위치가 없습니다.' : total > 20 ? `초안 근거는 20개까지입니다 (${total}/20)` : mode === 'create' && !required ? '소유 대상·제목·관찰 사실을 모두 입력하세요.' : mode === 'append' && !selected ? '덧붙일 내 초안을 고르세요.' : '');
  const close = () => { if (pending) return; if (dirty) setAsking(true); else onClose(); };
  function edit(patch: Partial<typeof form>) { setForm(previous => ({ ...previous, ...patch })); setDirty(true); setError(''); }
  function settle(r: Answer, submittedMode: 'create' | 'append') {
    setBusy(false);
    if (r.outcome === 'ok' && r.data?.targetKind === 'knowledgeDraft') { setAgain(null); onDone(`${submittedMode === 'create' ? '새 초안에' : '내 초안에'} ${r.data.handedOff}개 넘김`); return; }
    if ((r.outcome === 'unknown' || r.outcome === 'error') && r.retry) {
      setAgain(() => r.retry!); setRetryMode(submittedMode);
      setError(r.outcome === 'unknown' ? '응답을 받지 못했습니다. 넘겨졌는지 확인할 수 없어 같은 요청으로 다시 시도합니다.' : '넘기지 못했습니다. 같은 요청으로 다시 시도할 수 있습니다.'); return;
    }
    setAgain(null);
    if (r.fieldErrors.some(field => field.path.join('.') === 'expectedVersion' && field.code === 'conflict')) { setConflict(true); return; }
    if (r.fieldErrors.some(field => field.path[0] === 'refs' && field.code === 'unresolved')) { setError('원본을 찾을 수 없는 위치가 생겼습니다. 다시 확인합니다.'); check.retry(); return; }
    const labels: Record<string, string> = { source_forbidden: '원본 접근 권한이 없어 넘길 수 없습니다.', source_unavailable: '원본 연결을 확인할 수 없어 넘길 수 없습니다.', too_many: '초안 근거는 20개까지입니다', forbidden: '넘기기 권한이 없습니다' };
    setError(r.outcome === 'conflict' ? '조사가 바뀌었습니다. 다시 열어 주세요' : r.outcome === 'forbidden' ? '넘기기 권한이 없습니다' : r.fieldErrors.map(field => labels[field.code] ?? `${field.path.join('.')}: ${field.code}`).join(' · ') || '근거 위치를 넘기지 못했습니다');
  }
  function confirm() {
    if (pending || (!again && (reason || conflict))) return;
    setBusy(true); setError('');
    const work = again ? again() : send.run({ id: investigation.id, refs: eligible.map(({ ref }) => ({ fileRef: ref.fileRef, line: ref.line, fileSha256: ref.fileSha256 })), target: mode === 'create'
      ? { kind: 'knowledgeDraft', mode: 'create', owner: form.ownerKind === 'model' ? { modelId: form.modelId } : { softwareId: form.softwareId }, title: form.title.trim(), observation: form.observation.trim() }
      : { kind: 'knowledgeDraft', mode: 'append', draftId, draftExpectedVersion: selected?.version ?? '' } }, { expectedVersion: investigation.version });
    void work.then(r => settle(r, again ? retryMode : mode)).catch(() => { setBusy(false); setError('근거 위치를 넘기지 못했습니다'); });
  }
  return <><Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="flex max-h-11/12 max-w-xl flex-col break-keep" onCloseAutoFocus={onCloseAutoFocus} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onInteractOutside={event => { if (pending) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>지식 초안으로 넘기기</DialogTitle><DialogDescription>{HANDOFF_CONFIRM}</DialogDescription></DialogHeader>
    <form className="contents" onSubmit={event => { event.preventDefault(); confirm(); }}>
    <div className="-m-1 grid min-h-0 gap-4 overflow-y-auto p-1">
      <section className="grid gap-2 text-xs" aria-label="전달 전 근거 위치 확인">
        {check.loading ? <div aria-label="근거 위치 확인 중" aria-busy="true"><Skeleton className="h-4" /></div> : sourceError ? <p role="alert" className="text-text-danger-label">{sourceError}</p> : <>
          <p className="font-semibold">넘길 {eligible.length} · 제외 {excluded} · 해시 불일치 {mismatched}</p>
          <p className="text-text-secondary">해시가 다른 위치는 메모 앞에 [해시 불일치]를 붙여 전달합니다.</p>
          <details><summary className="cursor-pointer">위치별 확인 결과 · {investigation.evidence.length}개</summary><ul className="mt-2 grid gap-2" aria-label="근거 위치 확인 결과">{investigation.evidence.map(({ ref }) => {
            const status = statuses.get(`${ref.fileRef}:${ref.line}`) ?? 'unresolved';
            return <li key={`${ref.fileRef}:${ref.line}`} className="grid gap-1 border-b border-border-subtle pb-2"><div className="flex flex-wrap items-center gap-2"><span className="t-mono">{ref.fileRef}:{ref.line}</span><StatusBadge tone={status === 'unresolved' ? 'danger' : status === 'hash_mismatch' ? 'warning' : 'neutral'}>{status === 'unresolved' ? '제외 · 원본 없음' : status === 'hash_mismatch' ? '전달 · 해시 불일치' : '전달 가능'}</StatusBadge></div><p className="break-all t-mono">SHA-256 {ref.fileSha256}</p><p>{status === 'unresolved' ? 'Source에서 파일을 찾을 수 없어 전달하지 않습니다. 바구니에 남습니다.' : `${status === 'hash_mismatch' ? '[해시 불일치] ' : ''}${ref.note ?? ''}`}</p></li>;
          })}</ul></details>
        </>}
        {check.failed && <div><Button type="button" variant="secondary" size="sm" onClick={check.retry}>다시 확인</Button></div>}
      </section>
      <Tabs value={mode} onValueChange={next => { if (!locked) { setMode(next === 'append' ? 'append' : 'create'); setError(''); } }}>
        <TabsList aria-label="지식 초안 대상"><TabsTrigger value="create" disabled={locked}>새 초안</TabsTrigger><TabsTrigger value="append" disabled={locked}>내 초안에 덧붙이기</TabsTrigger></TabsList>
        <TabsContent value="create"><div className="grid gap-4 text-sm">
          <HandoffOwnerFields uid={uid} value={form} disabled={locked} onChange={edit} />
          <div className="grid gap-1.5"><FieldLabel htmlFor={`${uid}-title`} required>제목</FieldLabel><Input id={`${uid}-title`} maxLength={200} disabled={locked} value={form.title} onChange={e => edit({ title: e.target.value })} placeholder="관찰한 현상을 적어 주세요" /></div>
          <div className="grid gap-1.5"><FieldLabel htmlFor={`${uid}-observation`} required>관찰 사실</FieldLabel><Textarea id={`${uid}-observation`} rows={3} maxLength={20000} disabled={locked} value={form.observation} onChange={e => edit({ observation: e.target.value })} placeholder="근거 위치에서 관찰한 내용을 직접 적어 주세요" /></div>
          <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">유형 <StatusBadge tone="neutral">확인 필요</StatusBadge><span>작성 중 · 작성자만 볼 수 있음</span></p>
        </div></TabsContent>
        <TabsContent value="append"><section className="grid gap-3 text-sm" aria-label="내 초안 목록">
          <p className="text-xs text-text-secondary">내가 쓴, 끝나지 않은 초안 {rows.length}개 · 같은 파일·줄·해시는 중복으로 더하지 않습니다.</p>
          {drafts.loading && <Skeleton className="h-16" />}
          {drafts.failed && <p role="alert">내 초안 목록을 불러오지 못했습니다. <Button type="button" variant="secondary" size="sm" onClick={drafts.retry}>목록 다시 확인</Button></p>}
          {!drafts.loading && !drafts.failed && !rows.length && <p>덧붙일 내 초안이 없습니다.</p>}
          <RadioGroup aria-label="덧붙일 내 초안" disabled={locked} value={draftId} onValueChange={value => { setDraftId(value); setDirty(true); setError(''); }}>{rows.map(row => <div key={row.draftId} className="flex items-start gap-2 border-b border-border-subtle py-2"><RadioGroupItem id={`${uid}-${row.draftId}`} value={row.draftId} aria-describedby={`${uid}-${row.draftId}-meta`} /><Label htmlFor={`${uid}-${row.draftId}`} className="min-w-0 flex-1"><span className="block text-sm">{row.title}</span><span id={`${uid}-${row.draftId}-meta`} className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary"><span>{row.ownerLabel}</span><StatusBadge tone={row.status === 'changes_requested' ? 'warning' : 'neutral'}>{STATUS[row.status] ?? row.status}</StatusBadge><span>근거 {row.evidenceCount}/20</span><span>마지막 수정 {formatInstant(row.updatedAt, 'ko')}</span></span></Label></div>)}</RadioGroup>
          {selected && <p className="text-xs">기존 {selected.evidenceCount} + 새 위치 최대 {eligible.length} = 최대 {total}/20 · 중복은 서버에서 제외</p>}
        </section></TabsContent>
      </Tabs>
      {reason && !sourceError && <p id={`${uid}-reason`} className="text-xs text-text-secondary">{reason}</p>}
      {!reason && <p className="text-xs text-text-secondary">{mode === 'create' ? `새 초안에 근거 위치 ${eligible.length}개를 넘깁니다. 발행·승인이 아닙니다.` : '선택한 초안에 근거 위치만 덧붙입니다. 기존 관찰은 바꾸지 않습니다.'}</p>}
      {error && <p role="alert" className="text-sm text-text-danger-label">{error}</p>}
      {conflict && <Callout tone="amber" title="초안 버전 충돌" action={<Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => { drafts.retry(); setDraftId(''); setConflict(false); }}>목록 다시 확인</Button>}>다른 변경으로 초안 버전이 달라졌습니다. 아무 위치도 추가하지 않았습니다. 목록을 다시 확인하고 대상을 고르세요.</Callout>}
    </div>
    <DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={close}>취소</Button><Button type="submit" disabled={pending || (!again && (!!reason || conflict))} aria-describedby={reason && !sourceError ? `${uid}-reason` : undefined}>{pending ? '전달 중…' : again ? '같은 요청 다시 시도' : mode === 'create' ? '새 초안으로 넘기기' : '내 초안에 덧붙이기'}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
    <DirtyConfirmation open={asking} title="작성 중인 내용이 사라집니다. 닫을까요?" message="닫으면 입력한 내용을 되찾을 수 없습니다." confirmLabel="닫기" cancelLabel="계속 작성" onCancel={() => setAsking(false)} onConfirm={() => { if (!pending) onClose(); }} />
  </>;
}
