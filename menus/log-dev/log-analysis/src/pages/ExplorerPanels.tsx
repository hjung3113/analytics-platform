import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import type { ActionResult } from '@ap/contracts';
import { useMenuAction, usePlatform } from '@ap/kernel';
import { DetailDrawer, StateMessage } from '@ap/components';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger, Input, Label, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Skeleton, StatusBadge, Textarea } from '@ap/ui';
import { evidenceAdd, evidenceHandoff, evidenceRemove, investigationCreate, parsedEndpoint, windowEndpoint, type HandoffResult, type Investigation, type SampleSet, type SourceAnswer } from '../endpoints';
import { evidenceFor, exportRange, sourceReadable } from './explorerModel';
import { useSourceRead } from './useSourceRead';

const SOURCE_REASON: Record<string, string> = { source_not_connected: 'Source가 연결되지 않았습니다.', source_missing: '파일을 찾을 수 없습니다.', capability_not_held: '원본 조회 권한이 없습니다.', source_owner_not_granted: '이 Source의 접근 권한이 없습니다.', source_denied: 'Source 접근 권한이 철회되었습니다.', parser_not_connected: 'Parser가 연결되지 않았습니다.', periods_not_supported: '기간 행을 제공하지 않습니다.', capability_missing: '이 조회를 지원하지 않습니다.' };
export function SourceNotice({ answer }: { answer: SourceAnswer | null | undefined }) {
  if (!answer || answer.state === 'ok') return null;
  const labels = { partial: '일부 결과 · 원본 범위를 모두 읽지 못했습니다.', truncated: '원문 잘림 · 줄당 8,000자 한도입니다.', source_absent: '원본 없음 · Source 연결 또는 파일을 확인하세요.', permission_denied: '권한 철회 · 원문을 열 수 없습니다.', unsupported: '미지원 · Source가 이 보기를 제공하지 않습니다.' };
  return <StateMessage compact icon={<Info aria-hidden className="size-4" />} tone={answer.state === 'permission_denied' ? 'warning' : 'neutral'} title={labels[answer.state]} body={answer.reason ? SOURCE_REASON[answer.reason] : undefined} />;
}
export const HANDOFF_CONFIRM = '근거 위치 참조만 전달합니다. 공식 FAIL이나 지식 발행을 확정하지 않습니다. 받는 쪽에서 원본 접근 권한을 다시 확인합니다.';
const HANDOFF_ERROR: Record<string, string> = { source_unavailable: '원본 연결을 확인할 수 없어 넘기지 못했습니다', source_forbidden: '원본 접근 권한이 없습니다', round_closed: '닫힌 Round입니다', not_in_sample_set: 'Round 샘플 목록에 없는 파일이 있습니다', forbidden: '넘기기 권한이 없습니다' };
/** Why 「Round」 is not offered, in the order a person can act on it; null = offered. */
export function roundHandoffBlock(investigation: Investigation): string | null {
  if (investigation.origin !== 'round' || !investigation.roundId) return 'Round에서 시작한 조사만';
  if (!investigation.handoff?.round) return '넘기기 권한 없음';
  if (investigation.status !== 'open') return '열린 조사만';
  if (investigation.evidence.length === 0) return '담은 근거 위치 없음';
  return null;
}
type HandoffAnswer = ActionResult<HandoffResult>;
function RoundHandoffDialog({ investigation, onOpenChange, onDone, onCloseAutoFocus }: { investigation: Investigation; onOpenChange: (open: boolean) => void; onDone: (message: string) => void; onCloseAutoFocus: (event: Event) => void }) {
  const send = useMenuAction(evidenceHandoff);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // An unknown answer is uncertain: the next click resends the same request (same idempotency key), never a new handoff.
  const [again, setAgain] = useState<null | (() => Promise<HandoffAnswer>)>(null);
  const pending = busy || send.pending;
  const refs = investigation.evidence.map(({ ref }) => ({ fileRef: ref.fileRef, line: ref.line, fileSha256: ref.fileSha256 }));
  function settle(r: HandoffAnswer) {
    setBusy(false);
    if (r.outcome === 'ok' && r.data) { setAgain(null); onDone(`Round에 ${r.data.handedOff}개 넘김 · 이미 있던 위치 ${r.data.alreadyAttached}개 · 원본 없음 ${r.data.byStatus.unresolved}개`); return; }
    if ((r.outcome === 'unknown' || r.outcome === 'error') && r.retry) { setAgain(() => r.retry!); setError(r.outcome === 'unknown' ? '응답을 받지 못했습니다. 넘겨졌는지 확인할 수 없어 같은 요청으로 다시 시도합니다.' : '넘기지 못했습니다. 같은 요청으로 다시 시도할 수 있습니다.'); return; }
    setAgain(null);
    setError(r.outcome === 'conflict' ? '조사가 바뀌었습니다. 다시 열어 주세요' : r.outcome === 'forbidden' ? HANDOFF_ERROR.forbidden! : HANDOFF_ERROR[r.fieldErrors[0]?.code ?? ''] ?? '근거 위치를 넘기지 못했습니다');
  }
  function fail() { setBusy(false); setAgain(null); setError('근거 위치를 넘기지 못했습니다'); }
  function confirm() {
    if (!investigation.roundId) return;
    setError(''); setBusy(true);
    if (again) { void again().then(settle).catch(fail); return; }
    void send.run({ id: investigation.id, refs, target: { kind: 'round', roundId: investigation.roundId } }, { expectedVersion: investigation.version }).then(settle).catch(fail);
  }
  return <AlertDialog open onOpenChange={open => { if (!open && !pending) onOpenChange(false); }}><AlertDialogContent onCloseAutoFocus={onCloseAutoFocus} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }}><AlertDialogHeader><AlertDialogTitle>Round에 근거 위치 {refs.length}개 넘기기</AlertDialogTitle><AlertDialogDescription className="break-keep">참조만 전달됩니다. 공식 FAIL·기술 지식 확정이 아닙니다</AlertDialogDescription></AlertDialogHeader>
    <p className="break-keep text-xs text-text-secondary">fileRef · line · fileSha256만 전달 · 본문 없음</p>
    {error && <p role="alert" className="break-keep text-sm text-text-danger-label">{error}</p>}
    <AlertDialogFooter><AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>{/* A plain button, not AlertDialogAction: a refusal keeps the dialog open. */}<Button disabled={pending} onClick={confirm}>{pending ? '전달 중…' : again ? '같은 요청 다시 시도' : '참조 전달'}</Button></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
export function BasketDrawer({ investigation, onClose }: { investigation: Investigation; onClose: () => void }) {
  const { setPage } = usePlatform();
  const remove = useMenuAction(evidenceRemove);
  const [notice, setNotice] = useState('');
  const [round, setRound] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const block = roundHandoffBlock(investigation);
  return <DetailDrawer title="근거 위치 바구니" subtitle={`담은 근거 위치 ${investigation.evidence.length}/100`} onClose={onClose} tabs={[{ id: 'basket', label: '근거 위치', content: <div className="flex flex-col gap-4 break-keep text-sm">
    <p className="text-xs text-text-secondary">{HANDOFF_CONFIRM}</p>
    <DropdownMenu><DropdownMenuTrigger asChild><Button ref={trigger} variant="secondary" size="toolbar">넘기기</Button></DropdownMenuTrigger><DropdownMenuContent align="start" side="bottom" className="min-w-64"><DropdownMenuGroup>
      <DropdownMenuItem disabled={block !== null} onSelect={() => setRound(true)}>{block ? `Round · ${block}` : 'Round'}</DropdownMenuItem><DropdownMenuItem disabled>지식 초안 · 준비 중</DropdownMenuItem><DropdownMenuItem disabled>결함 · 수신 대상 없음</DropdownMenuItem>
    </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
    {round && <RoundHandoffDialog investigation={investigation} onOpenChange={open => { if (!open) setRound(false); }} onDone={message => { setRound(false); setNotice(message); }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }} />}
    {investigation.evidence.length === 0 && <p className="text-text-secondary">담은 근거 위치가 없습니다.</p>}
    {investigation.evidence.map(({ ref, state }) => <div key={`${ref.fileRef}:${ref.line}`} className="flex items-start gap-2">
      <div className="min-w-0 flex-1"><Button variant="link" size="sm" disabled={state.code === 'no_access'} onClick={() => { const file = investigation.sampleSet?.files.find(f => f.fileRef === ref.fileRef); if (file) setPage({ focus: `${file.order}:${ref.line}`, drawer: 'record' }); }}>{ref.fileRef}:{ref.line}</Button>
        <p className="text-xs text-text-secondary">파일 해시</p><p className="t-mono break-all">{ref.fileSha256}</p>{ref.note && <p>{ref.note}</p>}{state.code === 'no_access' && <p className="text-xs text-text-secondary">원본 접근 불가 · {state.reason}</p>}</div>
      <Button variant="ghost" size="toolbar" disabled={!investigation.canInvestigate || investigation.status !== 'open' || remove.pending} onClick={() => { void remove.run({ id: investigation.id, ref: { fileRef: ref.fileRef, line: ref.line } }, { expectedVersion: investigation.version }).then(r => setNotice(r.outcome === 'ok' ? '근거 위치를 뺐습니다.' : r.outcome === 'conflict' ? '조사가 변경되었습니다. 새 버전을 확인하고 다시 시도하세요.' : '근거 위치를 빼지 못했습니다.')).catch(() => undefined); }}>빼기</Button>
    </div>)}<p role="status" className="text-xs text-text-secondary">{notice}</p>
  </div> }]} />;
}
export function RecordDrawer({ investigation, set, selection, blocked, onDenied, onClose }: { blocked: boolean; onDenied: () => void; investigation: Investigation; set: SampleSet; selection: { fileRef: string; line: number }; onClose: () => void }) {
  const location = { fileRef: selection.fileRef, line: selection.line }; // the read contracts reject unknown keys such as fileOrder
  const windowRead = useSourceRead(windowEndpoint, { sourceOwner: set.sourceOwner, ...location, before: 3, after: 3 });
  const parsedRead = useSourceRead(parsedEndpoint, { sourceOwner: set.sourceOwner, ...location });
  const add = useMenuAction(evidenceAdd);
  const [notice, setNotice] = useState('');
  const windowData = windowRead.response?.data;
  const parsed = parsedRead.response?.data;
  // A refusal from either read hides every source-derived field in this drawer, including the other request's older answer.
  const denied = blocked || windowData?.state === 'permission_denied' || parsed?.state === 'permission_denied';
  useEffect(() => { if (denied) onDenied(); }, [denied, onDenied]);
  const row = !denied && windowData && sourceReadable(windowData.state) ? windowData.rows.find(r => r.fileRef === selection.fileRef && r.line === selection.line) : null;
  const ref = evidenceFor(set, selection);
  const already = investigation.evidence.some(e => e.ref.fileRef === selection.fileRef && e.ref.line === selection.line);
  const writable = investigation.canInvestigate && investigation.status === 'open' && !!row && !!ref && !already && investigation.evidence.length < 100;
  return <DetailDrawer title="레코드 상세" subtitle={`${selection.fileRef}:${selection.line}`} onClose={onClose} tabs={[{ id: 'record', label: '레코드 상세', content: <div className="flex flex-col gap-5 break-keep text-xs">
    <section className="flex flex-col gap-2"><h3 className="text-xs font-semibold text-text-secondary">근거 위치</h3><p className="t-mono break-all">{selection.fileRef}:{selection.line}</p><p className="text-text-secondary">파일 해시</p><p className="t-mono break-all">{ref?.fileSha256}</p>
      <Button variant="secondary" size="toolbar" disabled={!writable || add.pending} onClick={() => { if (!ref) return; void add.run({ id: investigation.id, ref }, { expectedVersion: investigation.version }).then(r => setNotice(r.outcome === 'ok' ? '근거 위치를 담았습니다.' : r.outcome === 'conflict' ? '조사가 변경되었습니다. 새 버전을 확인하고 다시 시도하세요.' : '근거 위치를 담지 못했습니다.')).catch(() => undefined); }}>{already ? '담은 근거 위치' : '근거 위치 담기'}</Button>
      {!investigation.canInvestigate && <p>조사 쓰기 권한이 없습니다.</p>}<p role="status">{notice}</p>
    </section>
    {windowRead.loading || parsedRead.loading ? <div aria-busy="true"><Skeleton className="h-16" /><p>원문 불러오는 중</p></div> : null}
    {denied ? <SourceNotice answer={{ state: 'permission_denied', reason: null, synthetic: false, label: null }} /> : <><SourceNotice answer={windowData} /><SourceNotice answer={parsed} />
      {windowRead.failed && <Button variant="secondary" size="toolbar" onClick={windowRead.retry}>원문 다시 시도</Button>}
      {row && <><section><h3 className="text-xs font-semibold text-text-secondary">원문 줄</h3><pre className="mt-2 whitespace-pre-wrap break-all t-mono">{row.text}</pre>{row.timeReversal && <p>시간 역전 · 파일 순서 유지</p>}</section>
        <details><summary>앞뒤 줄</summary>{windowData?.rows.map(r => <pre key={`${r.fileRef}:${r.line}`} className="mt-2 whitespace-pre-wrap break-all t-mono">{r.line} {r.text}</pre>)}</details></>}
      <section><h3 className="text-xs font-semibold text-text-secondary">판정 축</h3><div className="mt-2 grid grid-cols-2 gap-3"><div>스크립트 판정 <StatusBadge tone="neutral">미검증</StatusBadge><p className="mt-1 text-text-secondary">규칙 결과 연결 준비 중</p></div><div>LLM 가설 <StatusBadge tone="neutral">없음 · 미저장</StatusBadge></div></div></section>
      {!parsedRead.loading && parsedRead.failed && <Button variant="secondary" size="toolbar" onClick={parsedRead.retry}>Parser 다시 시도</Button>}
      {parsed && sourceReadable(parsed.state) && <><section><h3 className="text-xs font-semibold text-text-secondary">추출 필드</h3><dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{Object.entries(parsed.extractedFields ?? {}).map(([k, v]) => <div key={k} className="contents"><dt className="text-text-secondary">{k}</dt><dd className="min-w-0 break-all">{v}</dd></div>)}</dl></section>
        <section><h3 className="text-xs font-semibold text-text-secondary">Parser 입력·출력</h3><p className="mt-2 text-text-secondary">입력</p><pre className="whitespace-pre-wrap break-all t-mono">{parsed.parserIn}</pre><p className="mt-3 text-text-secondary">출력</p><pre className="whitespace-pre-wrap break-all t-mono">{parsed.parserOut}</pre></section></>}
    </>}
  </div> }]} />;
}

/** No export adapter exists yet. Keep the confirmed range/limit dialog and an honest disabled reason; never bypass PlatformAdapter. */
export function ExportDialog({ open, onOpenChange, set, querySummary, onCloseAutoFocus }: { onCloseAutoFocus?: (event: Event) => void; open: boolean; onOpenChange: (open: boolean) => void; set: SampleSet; querySummary: string }) {
  const [rows, setRows] = useState('200');
  const [format, setFormat] = useState('csv');
  const range = exportRange(Number(rows));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent onCloseAutoFocus={onCloseAutoFocus}><DialogHeader><DialogTitle>현재 범위 내보내기</DialogTitle><DialogDescription>샘플 목록·현재 조건·줄 범위를 확인하세요.</DialogDescription></DialogHeader>
    <div className="flex flex-col gap-3 break-keep text-sm"><p>{[...set.files].sort((a, b) => a.order - b.order).map(f => f.fileRef).join(' → ')}</p><p>{querySummary}</p>
      <Label htmlFor="explorer-export-rows">파일 순서 → 줄 번호 기준 첫 N행</Label><Input id="explorer-export-rows" type="number" min={1} max={10000} value={rows} onChange={e => setRows(e.target.value)} aria-invalid={!range} />
      {!range && <p role="alert">1–10,000행 범위를 입력하세요. 초과 범위를 자르지 않습니다.</p>}
      <Label htmlFor="explorer-export-format">형식</Label><Select value={format} onValueChange={setFormat}><SelectTrigger id="explorer-export-format"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="csv">CSV</SelectItem><SelectItem value="jsonl">JSONL</SelectItem></SelectGroup></SelectContent></Select>
      <p className="text-xs text-text-secondary">행 10,000 · 5MB · 일일 20회 · 동시 1건. 권한과 남은 한도는 요청마다 다시 확인합니다.</p>
      <p id="explorer-export-reason" className="text-xs text-text-secondary">현재 어댑터에서 내보내기를 지원하지 않습니다. 내보내기 권한과 연결이 필요합니다.</p>
    </div><DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>닫기</Button><Button disabled aria-describedby="explorer-export-reason">내보내기</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export function SampleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useMenuAction(investigationCreate);
  const { can, navigate, linkTo } = usePlatform();
  const [title, setTitle] = useState('');
  const [sourceOwner, setOwner] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  // An unknown answer is uncertain: the next click resends the same request (same idempotency key), never a new create.
  const [again, setAgain] = useState<null | (() => Promise<ActionResult<{ id: string }>>)>(null);
  const edit = (set: (value: string) => void) => (value: string) => { set(value); setAgain(null); setError(''); };
  function settle(r: ActionResult<{ id: string }>) {
    if (r.outcome === 'ok' && r.data) { setAgain(null); onOpenChange(false); navigate(linkTo('log-explorer-view', { params: { investigationId: r.data.id } })); return; }
    if ((r.outcome === 'unknown' || r.outcome === 'error') && r.retry) { setAgain(() => r.retry!); setError(r.outcome === 'unknown' ? '응답을 받지 못했습니다. 만들어졌는지 확인할 수 없어 같은 요청으로 다시 시도합니다.' : '조사를 만들지 못했습니다. 같은 요청으로 다시 시도할 수 있습니다.'); return; }
    setAgain(null); setError('조사를 만들지 못했습니다. 입력과 권한을 확인하세요.');
  }
  function submit() {
    if (again) { void again().then(settle).catch(() => undefined); return; }
    const files = text.trim().split('\n').map((line, i) => { const at = line.lastIndexOf('\t'); return { fileRef: at < 0 ? '' : line.slice(0, at).trim(), sha256: at < 0 ? '' : line.slice(at + 1).trim(), order: i + 1 }; });
    if (!title.trim() || title.trim().length > 200 || !sourceOwner.trim() || !files.length || files.length > 1000 || files.some(f => !f.fileRef || !/^[0-9a-f]{64}$/.test(f.sha256)) || new Set(files.map(f => f.fileRef)).size !== files.length) { setError('조사 이름·Source 소유자·중복 없는 파일 참조와 SHA-256을 확인하세요.'); return; }
    void create.run({ title: title.trim(), origin: 'standalone', sampleSet: { sourceOwner: sourceOwner.trim(), files } }).then(settle).catch(() => undefined);
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>조사 만들기</DialogTitle><DialogDescription>Source 소유자가 제공한 파일 참조와 SHA-256을 읽을 순서대로 입력하세요. 원문은 저장하지 않습니다.</DialogDescription></DialogHeader>
    <Label htmlFor="explorer-title">조사 이름</Label><Input id="explorer-title" value={title} onChange={e => edit(setTitle)(e.target.value)} maxLength={200} />
    <Label htmlFor="explorer-owner">Source 소유자</Label><Input id="explorer-owner" value={sourceOwner} onChange={e => edit(setOwner)(e.target.value)} maxLength={200} />
    <Label htmlFor="explorer-files">파일 참조 · 탭 · SHA-256 · 한 줄에 한 파일</Label><Textarea id="explorer-files" value={text} onChange={e => edit(setText)(e.target.value)} />
    {error && <p role="alert" className="text-sm">{error}</p>}{!can(investigationCreate.permission) && <p className="text-xs text-text-secondary">조사 쓰기 권한이 없습니다.</p>}
    <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={create.pending || !can(investigationCreate.permission)} onClick={submit}>{again ? '같은 요청 다시 시도' : '조사 만들기'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
