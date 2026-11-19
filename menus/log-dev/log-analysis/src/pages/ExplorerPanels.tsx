import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import type { ActionResult } from '@ap/contracts';
import { useMenuAction, useMenuQuery, useMessages, usePlatform } from '@ap/kernel';
import { DetailDrawer, StateMessage } from '@ap/components';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger, Input, Label, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea } from '@ap/ui';
import { usePageKeys } from './pageKeys';
import { evidenceAdd, evidenceHandoff, evidenceRemove, investigationCreate, investigationDetailEndpoint, investigationsEndpoint, parsedEndpoint, windowEndpoint, type HandoffResult, type Investigation, type InvestigationSummary, type SampleSet, type SourceAnswer } from '../endpoints';
import { evidenceFor, exportRange, sourceReadable } from './explorerModel';
import { KnowledgeHandoffDialog, knowledgeHandoffBlock } from './KnowledgeHandoffDialog';
import { useSourceRead } from './useSourceRead';
import { EXPLORER_MESSAGES } from '../messages';

const SAMPLE_SET_MAX_FILES = 1000;
const SAMPLE_TEXT_MAX_LENGTH = 200;
const SAMPLE_OWNER_MAX_LENGTH = SAMPLE_TEXT_MAX_LENGTH;
const SAMPLE_FILE_REF_MAX_LENGTH = 1024;
const SAMPLE_LINE_OFFSET = 1;
const INVESTIGATION_LIST_PAGE_SIZE = 200;
const RECENT_SOURCE_LIMIT = 5;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SOURCE_REASON: Record<string, string> = { source_not_connected: 'Source가 연결되지 않았습니다.', source_missing: '파일을 찾을 수 없습니다.', capability_not_held: '원본 조회 권한이 없습니다.', source_owner_not_granted: '이 Source의 접근 권한이 없습니다.', source_denied: 'Source 접근 권한이 철회되었습니다.', parser_not_connected: 'Parser가 연결되지 않았습니다.', periods_not_supported: '기간 행 미지원', capability_missing: '이 조회 미지원' };
export function SourceNotice({ answer }: { answer: SourceAnswer | null | undefined }) {
  if (!answer || answer.state === 'ok') return null;
  const labels = { partial: '일부 결과 · 원본 범위를 모두 읽지 못했습니다.', truncated: '원문 잘림 · 줄당 8,000자 한도입니다.', source_absent: '원본 없음 · Source 연결 또는 파일을 확인하세요.', permission_denied: '권한 철회 · 원문을 열 수 없습니다.', unsupported: '미지원 · Source의 보기 미지원' };
  return <StateMessage compact icon={<Info aria-hidden className="size-4" />} tone={answer.state === 'permission_denied' ? 'warning' : 'neutral'} title={labels[answer.state]} body={answer.reason ? SOURCE_REASON[answer.reason] : undefined} />;
}
export const HANDOFF_CONFIRM = '근거 위치 참조만 전달 · 공식 FAIL·지식 발행은 별도 확정 · 받는 쪽에서 원본 접근 권한 재확인';
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
    if (r.outcome === 'ok' && r.data?.targetKind === 'round') { setAgain(null); onDone(`Round에 ${r.data.handedOff}개 넘김 · 이미 있던 위치 ${r.data.alreadyAttached}개 · 원본 없음 ${r.data.byStatus.unresolved}개`); return; }
    if ((r.outcome === 'unknown' || r.outcome === 'error') && r.retry) { setAgain(() => r.retry!); setError(r.outcome === 'unknown' ? '응답을 받지 못했습니다. 넘겨졌는지 확인할 수 없어 같은 요청으로 다시 시도합니다.' : '넘기지 못했습니다. 같은 요청으로 다시 시도하세요.'); return; }
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
  return <AlertDialog open onOpenChange={open => { if (!open && !pending) onOpenChange(false); }}><AlertDialogContent onCloseAutoFocus={onCloseAutoFocus} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }}><AlertDialogHeader><AlertDialogTitle>Round에 근거 위치 {refs.length}개 넘기기</AlertDialogTitle><AlertDialogDescription className="break-keep">근거 위치 참조만 전달 · 공식 FAIL·기술 지식은 별도 확정</AlertDialogDescription></AlertDialogHeader>
    <p className="break-keep text-xs text-text-secondary">fileRef · line · fileSha256만 전달 · 본문 없음</p>
    {error && <p role="alert" className="break-keep text-sm text-text-danger-label">{error}</p>}
    <AlertDialogFooter><AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>{/* A plain button, not AlertDialogAction: a refusal keeps the dialog open. */}<Button disabled={pending} onClick={confirm}>{pending ? '전달 중…' : again ? '같은 요청 다시 시도' : '참조 전달'}</Button></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
export function BasketDrawer({ investigation, onClose, onVersion }: { investigation: Investigation; onClose: () => void; onVersion: (version: string) => void }) {
  const { setPage } = usePlatform();
  const keys = usePageKeys();
  const remove = useMenuAction(evidenceRemove);
  const [notice, setNotice] = useState('');
  const [round, setRound] = useState(false);
  const [knowledge, setKnowledge] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const block = roundHandoffBlock(investigation);
  const knowledgeBlock = knowledgeHandoffBlock(investigation);
  return <DetailDrawer title="근거 위치 바구니" subtitle={`담은 근거 위치 ${investigation.evidence.length}/100`} onClose={onClose} tabs={[{ id: 'basket', label: '근거 위치', content: <div className="flex flex-col gap-4 break-keep text-sm">
    <p className="text-xs text-text-secondary">{HANDOFF_CONFIRM}</p>
    <DropdownMenu><DropdownMenuTrigger asChild><Button ref={trigger} variant="secondary" size="toolbar">넘기기</Button></DropdownMenuTrigger><DropdownMenuContent align="start" side="bottom" className="min-w-64"><DropdownMenuGroup>
      <DropdownMenuItem disabled={block !== null} onSelect={() => setRound(true)}>{block ? `Round · ${block}` : 'Round'}</DropdownMenuItem><DropdownMenuItem disabled={knowledgeBlock !== null} onSelect={() => setKnowledge(true)}>{knowledgeBlock ? `지식 초안 · ${knowledgeBlock}` : '지식 초안'}</DropdownMenuItem><DropdownMenuItem disabled>결함 · 수신 대상 없음</DropdownMenuItem>
    </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
    {round && <RoundHandoffDialog investigation={investigation} onOpenChange={open => { if (!open) setRound(false); }} onDone={message => { setRound(false); setNotice(message); }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }} />}
    {knowledge && <KnowledgeHandoffDialog investigation={investigation} onClose={() => setKnowledge(false)} onDone={message => { setKnowledge(false); setNotice(message); }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }} />}
    {investigation.evidence.length === 0 && <p className="text-text-secondary">담은 근거 위치가 없습니다.</p>}
    {investigation.evidence.map(({ ref, state }) => <div key={`${ref.fileRef}:${ref.line}`} className="flex items-start gap-2">
      <div className="min-w-0 flex-1"><Button variant="link" size="sm" disabled={state.code === 'no_access'} onClick={() => { const file = investigation.sampleSet?.files.find(f => f.fileRef === ref.fileRef); if (file) setPage({ [keys.focus]: `${file.order}:${ref.line}`, [keys.drawer]: 'record' }); }}>{ref.fileRef}:{ref.line}</Button>
        <p className="text-xs text-text-secondary">파일 해시</p><p className="t-mono break-all">{ref.fileSha256}</p>{ref.note && <p>{ref.note}</p>}{state.code === 'no_access' && <p className="text-xs text-text-secondary">원본 접근 불가 · {state.reason}</p>}</div>
      <Button variant="ghost" size="toolbar" disabled={!investigation.canInvestigate || investigation.status !== 'open' || remove.pending} onClick={() => { void remove.run({ id: investigation.id, ref: { fileRef: ref.fileRef, line: ref.line } }, { expectedVersion: investigation.version }).then(r => { if (r.outcome === 'ok' && r.version) onVersion?.(r.version); setNotice(r.outcome === 'ok' ? '근거 위치를 뺐습니다.' : r.outcome === 'conflict' ? '조사가 변경되었습니다. 새 버전을 확인하고 다시 시도하세요.' : r.outcome === 'unknown' ? '응답을 받지 못했습니다. 근거 위치 삭제 여부를 다시 확인하세요.' : '근거 위치를 빼지 못했습니다.'); }).catch(() => undefined); }}>빼기</Button>
    </div>)}<p role="status" className="text-xs text-text-secondary">{notice}</p>
  </div> }]} />;
}
export type RoundStartLocation = 'toolbar' | 'drawer';
type RoundStartRetry = { run: () => Promise<ActionResult<{ id: string; version: string }>>; focus?: string };
type RoundStartState = { identity: string; again: RoundStartRetry | null; notice: string; noticeLocation: RoundStartLocation | null };
export type RoundStartController = {
  pending: boolean;
  retrying: boolean;
  reason: string | null;
  notice: string;
  noticeLocation: RoundStartLocation | null;
  start: (focus: string | undefined, location: RoundStartLocation) => void;
};

export function useRoundInvestigationStart(investigation: Investigation): RoundStartController {
  const create = useMenuAction(investigationCreate);
  const { can, navigate, linkTo, user, revision, scope } = usePlatform();
  const t = useMessages(EXPLORER_MESSAGES);
  const identity = JSON.stringify([user.id, revision, scope.scopeId]);
  const [attempt, setAttempt] = useState<RoundStartState>(() => ({ identity, again: null, notice: '', noticeLocation: null }));
  const currentAttempt = attempt.identity === identity ? attempt : { identity, again: null, notice: '', noticeLocation: null };
  if (attempt.identity !== identity) setAttempt(currentAttempt);
  const { again, notice, noticeLocation } = currentAttempt;
  function updateAttempt(patch: Partial<Omit<RoundStartState, 'identity'>>) {
    setAttempt(previous => ({
      identity,
      again: previous.identity === identity ? previous.again : null,
      notice: previous.identity === identity ? previous.notice : '',
      noticeLocation: previous.identity === identity ? previous.noticeLocation : null,
      ...patch,
    }));
  }
  const allowed = can(investigationCreate.permission);
  let reason: string | null = null;
  if (!allowed) reason = t('roundInvestigationPermission');
  else if (!investigation.roundId) reason = t('roundInvestigationMissing');
  const pending = create.pending;

  function settle(answer: ActionResult<{ id: string; version: string }>, focus: string | undefined, location: RoundStartLocation) {
    if (answer.outcome === 'ok' && answer.data?.id) {
      updateAttempt({ again: null, notice: '', noticeLocation: null });
      const page = focus ? { focus } : undefined;
      navigate(linkTo('log-explorer-view', { params: { investigationId: answer.data.id }, ...(page ? { page } : {}) }));
      return;
    }
    if ((answer.outcome === 'unknown' || answer.outcome === 'error') && answer.retry) {
      const retry = { run: answer.retry!, focus };
      const retryMessage = answer.outcome === 'unknown' ? 'roundInvestigationUnknown' : 'roundInvestigationError';
      updateAttempt({ again: retry, notice: t(retryMessage), noticeLocation: location });
      return;
    }
    updateAttempt({ again: null });
    const roundMissing = answer.fieldErrors.some(field => field.path[0] === 'roundId' && field.code === 'not_found');
    let message = t('roundInvestigationFailed');
    if (answer.outcome === 'forbidden') message = t('roundInvestigationPermission');
    else if (roundMissing) message = t('roundInvestigationMissing');
    updateAttempt({ notice: message, noticeLocation: location });
  }

  function fail(location: RoundStartLocation) {
    updateAttempt({ again: null, notice: t('roundInvestigationFailed'), noticeLocation: location });
  }

  function start(focus: string | undefined, location: RoundStartLocation) {
    if (pending || reason) return;
    updateAttempt({ notice: '', noticeLocation: null });
    if (again) {
      const retry = again;
      void retry.run().then(answer => settle(answer, retry.focus, location)).catch(() => fail(location));
      return;
    }
    const firstFile = investigation.sampleSet?.files.slice().sort((a, b) => a.order - b.order)[0]?.fileRef;
    let title = firstFile ? t('roundInvestigationTitle', { fileRef: firstFile }) : t('roundInvestigationTitleFallback');
    if (firstFile && [...title].length > SAMPLE_TEXT_MAX_LENGTH) {
      const prefix = t('roundInvestigationTitle', { fileRef: '' });
      const available = SAMPLE_TEXT_MAX_LENGTH - [...prefix].length - 1;
      const shortenedFile = [...firstFile].slice(0, available).join('') + '…';
      title = t('roundInvestigationTitle', { fileRef: shortenedFile });
    }
    void create.run({ title, origin: 'round', roundId: investigation.roundId! }).then(answer => settle(answer, focus, location)).catch(() => fail(location));
  }

  return { pending, retrying: again !== null, reason, notice, noticeLocation, start };
}

export function RoundStartButton({ action, location, focus }: { action: RoundStartController; location: RoundStartLocation; focus?: string }) {
  const t = useMessages(EXPLORER_MESSAGES);
  const id = useId();
  const reasonId = id + '-reason';
  const noticeId = id + '-notice';
  const showNotice = action.notice !== '' && action.noticeLocation === location;
  const describedBy = [action.reason ? reasonId : '', showNotice ? noticeId : ''].filter(Boolean).join(' ') || undefined;
  let buttonLabel = t('roundInvestigationStart');
  if (action.pending) buttonLabel = t('roundInvestigationStarting');
  else if (action.retrying) buttonLabel = t('roundInvestigationRetry');
  return <div className="flex flex-col items-start gap-1">
    <Button variant="secondary" size="toolbar" disabled={action.pending || action.reason !== null} aria-describedby={describedBy} onClick={() => action.start(focus, location)}>{buttonLabel}</Button>
    {action.reason && <p id={reasonId} className="text-xs text-text-secondary">{action.reason}</p>}
    {showNotice && <p id={noticeId} role="alert" className="text-xs text-text-danger-label">{action.notice}</p>}
  </div>;
}

export function RecordDrawer({ investigation, set, selection, blocked, embedded = false, roundStart, onDenied, onClose, onVersion }: { onVersion?: (version: string) => void; blocked: boolean; embedded?: boolean; roundStart?: RoundStartController; onDenied: () => void; investigation: Investigation; set: SampleSet; selection: { fileRef: string; line: number }; onClose: () => void }) {
  const location = { fileRef: selection.fileRef, line: selection.line }; // the read contracts reject unknown keys such as fileOrder
  const windowRead = useSourceRead(windowEndpoint, { sourceOwner: set.sourceOwner, ...location, before: 3, after: 3, ...(investigation.roundId ? { roundId: investigation.roundId } : {}) });
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
  const selectedFile = set.files.find(item => item.fileRef === selection.fileRef);
  const startFocus = selectedFile ? String(selectedFile.order) + ':' + selection.line : undefined;
  return <DetailDrawer id={`${selection.fileRef}:${selection.line}`} title="레코드 상세" onClose={onClose} tabs={[{ id: 'record', label: '레코드 상세', content: <div className="flex flex-col gap-5 break-keep text-xs">
    <section className="flex flex-col gap-2"><h3 className="text-xs font-semibold text-text-secondary">근거 위치</h3><p className="t-mono break-all">{selection.fileRef}:{selection.line}</p><p className="text-text-secondary">파일 해시</p><p className="t-mono break-all">{ref?.fileSha256}</p>
      {embedded && roundStart && <RoundStartButton action={roundStart} location="drawer" focus={startFocus} />}
      {!embedded && <><Button variant="secondary" size="toolbar" disabled={!writable || add.pending} onClick={() => { if (!ref) return; void add.run({ id: investigation.id, ref }, { expectedVersion: investigation.version }).then(r => { if (r.outcome === 'ok' && r.version) onVersion?.(r.version); setNotice(r.outcome === 'ok' ? '근거 위치를 담았습니다.' : r.outcome === 'conflict' ? '조사가 변경되었습니다. 새 버전을 확인하고 다시 시도하세요.' : r.outcome === 'unknown' ? '응답을 받지 못했습니다. 근거 위치 저장 여부를 다시 확인하세요.' : '근거 위치를 담지 못했습니다.'); }).catch(() => undefined); }}>{already ? '담은 근거 위치' : '근거 위치 담기'}</Button>
      {!investigation.canInvestigate && <p>조사 쓰기 권한이 없습니다.</p>}<p role="status">{notice}</p></>}
    </section>
    {windowRead.loading || parsedRead.loading ? <div aria-busy="true"><Skeleton className="h-16" /><p>원문 불러오는 중</p></div> : null}
    {denied ? <SourceNotice answer={{ state: 'permission_denied', reason: null, synthetic: false, label: null }} /> : <><SourceNotice answer={windowData} /><SourceNotice answer={parsed} />
      {windowRead.failed && <Button variant="secondary" size="toolbar" onClick={windowRead.retry}>원문 다시 시도</Button>}
      {row && <><section><h3 className="text-xs font-semibold text-text-secondary">원문 줄</h3><pre className="mt-2 whitespace-pre-wrap break-all t-mono">{row.text}</pre>{row.timeReversal && <p>시간 역전 · 파일 순서 유지</p>}</section>
        <details><summary>앞뒤 줄</summary>{windowData?.rows.map(r => <pre key={`${r.fileRef}:${r.line}`} className="mt-2 whitespace-pre-wrap break-all t-mono">{r.line} {r.text}</pre>)}</details></>}
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
      <p id="explorer-export-reason" className="text-xs text-text-secondary">현재 어댑터는 내보내기 미지원 · 연결·내보내기 권한 필요</p>
    </div><DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>닫기</Button><Button disabled aria-describedby="explorer-export-reason">내보내기</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function hasSampleControl(value: string) {
  return /[\u0000-\u001f\u007f-\u009f]/u.test(value) || /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(value);
}

function sampleFieldMessage(code: string, field: string) {
  const messages: Record<string, Record<string, string>> = {
    title: { required: '조사 이름을 입력하세요.', too_long: `조사 이름은 ${SAMPLE_TEXT_MAX_LENGTH}자 이내로 입력하세요.` },
    sourceOwner: { required: 'Source 소유자를 입력하세요.', malformed: '형식을 확인해 주세요.', too_long: `${SAMPLE_OWNER_MAX_LENGTH}자 이하로 입력하세요.` },
    files: { required: '파일을 하나 이상 입력하세요.', too_many: `파일 참조는 ${SAMPLE_SET_MAX_FILES.toLocaleString('ko-KR')}개까지 입력할 수 있습니다.`, malformed: '파일 목록 형식을 확인해 주세요.', order_invalid: '파일 순서를 확인하세요.' },
    fileRef: { required: '파일 참조를 입력하세요.', malformed: '제어 문자를 포함할 수 없습니다.', too_long: `${SAMPLE_FILE_REF_MAX_LENGTH.toLocaleString('ko-KR')}자 이하로 입력하세요.`, duplicate: '중복된 파일 참조입니다.' },
    sha256: { malformed: '소문자 16진수 64자리로 입력하세요.' },
  };
  return messages[field]?.[code] ?? '입력 형식을 확인해 주세요.';
}

function sampleFieldErrors(errors: readonly { path: readonly string[]; code: string }[]) {
  const mapped: Record<string, string> = {};
  for (const error of errors) {
    const [root, section, index, field] = error.path;
    if (root === 'title') { mapped.title = sampleFieldMessage(error.code, 'title'); continue; }
    if (root !== 'sampleSet') continue;
    if (section === 'sourceOwner') { mapped.sourceOwner = sampleFieldMessage(error.code, 'sourceOwner'); continue; }
    if (section !== 'files') continue;
    if (index === undefined) { mapped.files = sampleFieldMessage(error.code, 'files'); continue; }
    const line = Number(index) + SAMPLE_LINE_OFFSET;
    if (Number.isInteger(line) && line > 0 && (field === 'fileRef' || field === 'sha256')) mapped[`file:${line}:${field}`] = sampleFieldMessage(error.code, field);
    else mapped.files = sampleFieldMessage(error.code, 'files');
  }
  return mapped;
}

type RecentSourcesState = {
  identity: string;
  page: number;
  rows: InvestigationSummary[];
  loaded: number;
  status: 'idle' | 'loading' | 'done' | 'error';
  processedPage: number | null;
  responseKey: string | null;
};
type RecentSourcesAction =
  | { type: 'reset'; identity: string }
  | { type: 'page'; identity: string; page: number; responseKey: string; rows: InvestigationSummary[]; total: number }
  | { type: 'error'; identity: string; page: number; responseKey: string };

export function recentSourcesReducer(state: RecentSourcesState, action: RecentSourcesAction): RecentSourcesState {
  if (action.type === 'reset') return { identity: action.identity, page: 0, rows: [], loaded: 0, status: 'idle', processedPage: null, responseKey: null };
  const current = state.identity === action.identity ? state : { identity: action.identity, page: 0, rows: [], loaded: 0, status: 'idle' as const, processedPage: null, responseKey: null };
  const firstPage = action.page === 0;
  if (!firstPage && (current.status === 'done' || current.processedPage !== action.page - 1)) return current;
  if (current.processedPage === action.page && current.responseKey === action.responseKey) return current;
  if (action.type === 'error') {
    if (current.status === 'done') return current;
    return { ...current, status: 'error', responseKey: action.responseKey };
  }
  const baseRows = firstPage ? [] : current.rows;
  const baseLoaded = firstPage ? 0 : current.loaded;
  const rowsById = new Map([...baseRows, ...action.rows].map(row => [row.id, row]));
  const rows = [...rowsById.values()];
  const standaloneCount = rows.filter(row => row.origin === 'standalone' && row.status === 'open').length;
  const loaded = baseLoaded + action.rows.length;
  const complete = standaloneCount >= RECENT_SOURCE_LIMIT || loaded >= action.total || action.rows.length < INVESTIGATION_LIST_PAGE_SIZE;
  return { ...current, page: complete ? action.page : action.page + 1, rows, loaded, status: complete ? 'done' : 'loading', processedPage: action.page, responseKey: action.responseKey };
}

export function SampleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user, revision, scope } = usePlatform();
  const identity = JSON.stringify([user.id, revision, scope.scopeId]);
  return <SampleDialogContent key={identity} identity={identity} open={open} onOpenChange={onOpenChange} />;
}

function SampleDialogContent({ open, onOpenChange, identity }: { open: boolean; onOpenChange: (open: boolean) => void; identity: string }) {
  const create = useMenuAction(investigationCreate);
  const { can, navigate, linkTo } = usePlatform();
  const t = useMessages(EXPLORER_MESSAGES);
  const recentIdentity = identity;
  const [recentState, dispatchRecent] = useReducer(recentSourcesReducer, { identity: recentIdentity, page: 0, rows: [], loaded: 0, status: 'idle', processedPage: null, responseKey: null });
  const recentPage = recentState.identity === recentIdentity ? recentState.page : 0;
  const recent = useMenuQuery(investigationsEndpoint, { status: 'open', page: recentPage, pageSize: INVESTIGATION_LIST_PAGE_SIZE }, { enabled: open });
  const recentRows = recentState.identity === recentIdentity ? recentState.rows : [];
  const recentStatus = recentState.identity === recentIdentity ? recentState.status : 'idle';
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const selectedSource = useMenuQuery(investigationDetailEndpoint, { investigationId: selectedSourceId ?? '' }, { enabled: open && !!selectedSourceId });
  const [manualOpen, setManualOpen] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const prefilledSourceId = useRef<string | null>(null);
  const [title, setTitle] = useState('');
  const [sourceOwner, setOwner] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // An unknown answer is uncertain: the next click resends the same request (same idempotency key), never a new create.
  const [again, setAgain] = useState<null | (() => Promise<ActionResult<{ id: string }>>)>(null);
  const recentSources = recentRows.filter(row => row.origin === 'standalone' && row.status === 'open')
    .slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, RECENT_SOURCE_LIMIT);
  const recentLoading = recentStatus === 'idle' || recentStatus === 'loading' || recent.status === 'loading' || recent.status === 'refreshing';
  const recentError = recentStatus === 'error';

  useEffect(() => {
    if (!open) {
      dispatchRecent({ type: 'reset', identity: recentIdentity });
      setSelectedSourceId(null);
      prefilledSourceId.current = null;
      setSourceError('');
      setManualOpen(false);
      setTitle('');
      setOwner('');
      setText('');
      setError('');
      setFieldErrors({});
      setAgain(null);
      return;
    }
    if (recent.status !== 'done' || !recent.response) return;
    const response = recent.response;
    if (response.outcome === 'ok' && response.data) {
      dispatchRecent({ type: 'page', identity: recentIdentity, page: recentPage, responseKey: response.correlationId, rows: response.data.rows, total: response.data.total });
    } else if (response.outcome === 'empty') {
      dispatchRecent({ type: 'page', identity: recentIdentity, page: recentPage, responseKey: response.correlationId, rows: [], total: 0 });
    } else {
      dispatchRecent({ type: 'error', identity: recentIdentity, page: recentPage, responseKey: response.correlationId });
    }
  }, [open, recentIdentity, recent.status, recent.response, recentPage]);

  useEffect(() => {
    if (open && recentStatus === 'done' && recentSources.length === 0) setManualOpen(true);
  }, [open, recentStatus, recentSources.length]);

  useEffect(() => {
    if (!open || !selectedSourceId || selectedSource.status !== 'done' || prefilledSourceId.current === selectedSourceId) return;
    const source = selectedSource.response?.outcome === 'ok' ? selectedSource.response.data : null;
    if (!source || source.id !== selectedSourceId || source.origin !== 'standalone' || source.status !== 'open' || !source.sampleSet) {
      setSourceError(t('recentSourceError'));
      return;
    }
    prefilledSourceId.current = selectedSourceId;
    setOwner(source.sampleSet.sourceOwner);
    setText(source.sampleSet.files.slice().sort((a, b) => a.order - b.order).map(file => file.fileRef + '\t' + file.sha256).join('\n'));
    setSourceError('');
    setError('');
    setFieldErrors({});
    setAgain(null);
  }, [open, selectedSourceId, selectedSource.status, selectedSource.response, t]);

  function chooseRecentSource(id: string) {
    if (id === selectedSourceId) selectedSource.refetch();
    prefilledSourceId.current = null;
    setSelectedSourceId(id);
    setManualOpen(true);
    setSourceError('');
  }

  const edit = (set: (value: string) => void) => (value: string) => { set(value); setAgain(null); setError(''); setFieldErrors({}); };
  const editSource = (set: (value: string) => void) => (value: string) => { if (selectedSourceId) prefilledSourceId.current = selectedSourceId; edit(set)(value); };
  function settle(r: ActionResult<{ id: string }>) {
    if (r.outcome === 'ok' && r.data) { setAgain(null); setTitle(''); setOwner(''); setText(''); setError(''); setFieldErrors({}); setSelectedSourceId(null); setManualOpen(false); onOpenChange(false); navigate(linkTo('log-explorer-view', { params: { investigationId: r.data.id } })); return; }
    if ((r.outcome === 'unknown' || r.outcome === 'error') && r.retry) { setAgain(() => r.retry!); setError(r.outcome === 'unknown' ? '응답을 받지 못했습니다. 만들어졌는지 확인할 수 없어 같은 요청으로 다시 시도합니다.' : '조사를 만들지 못했습니다. 같은 요청으로 다시 시도하세요.'); return; }
    setAgain(null);
    const mapped = sampleFieldErrors(r.fieldErrors);
    setFieldErrors(mapped);
    if (Object.keys(mapped).some(key => key === 'sourceOwner' || key === 'files' || key.startsWith('file:'))) setManualOpen(true);
    setError(Object.keys(mapped).length ? '' : '조사를 만들지 못했습니다. 입력과 권한을 확인하세요.');
  }
  function submit() {
    setManualOpen(true);
    if (again) { void again().then(settle).catch(() => undefined); return; }
    const lines = text.trim() ? text.trim().split('\n') : [];
    const files = lines.map((line, i) => { const at = line.lastIndexOf('\t'); return { fileRef: at < 0 ? '' : line.slice(0, at).trim(), sha256: at < 0 ? '' : line.slice(at + 1).trim(), order: i + 1 }; });
    const localErrors: Record<string, string> = {};
    const titleValue = title.trim();
    const owner = sourceOwner.trim();
    if (!titleValue) localErrors.title = '조사 이름을 입력하세요.';
    else if ([...titleValue].length > SAMPLE_TEXT_MAX_LENGTH) localErrors.title = sampleFieldMessage('too_long', 'title');
    if (!owner) localErrors.sourceOwner = sampleFieldMessage('required', 'sourceOwner');
    else if (hasSampleControl(owner)) localErrors.sourceOwner = '제어 문자를 포함할 수 없습니다.';
    else if ([...owner].length > SAMPLE_OWNER_MAX_LENGTH) localErrors.sourceOwner = sampleFieldMessage('too_long', 'sourceOwner');
    if (!files.length) localErrors.files = sampleFieldMessage('required', 'files');
    else if (files.length > SAMPLE_SET_MAX_FILES) localErrors.files = sampleFieldMessage('too_many', 'files');
    else {
      const seen = new Set<string>();
      files.forEach((file, index) => {
        const lineNumber = index + SAMPLE_LINE_OFFSET;
        const fileRef = file.fileRef;
        if (!fileRef) localErrors[`file:${lineNumber}:fileRef`] = sampleFieldMessage('required', 'fileRef');
        else if (hasSampleControl(fileRef)) localErrors[`file:${lineNumber}:fileRef`] = '제어 문자를 포함할 수 없습니다.';
        else if ([...fileRef].length > SAMPLE_FILE_REF_MAX_LENGTH) localErrors[`file:${lineNumber}:fileRef`] = sampleFieldMessage('too_long', 'fileRef');
        else if (seen.has(fileRef)) localErrors[`file:${lineNumber}:fileRef`] = sampleFieldMessage('duplicate', 'fileRef');
        else seen.add(fileRef);
        if (!SHA256_HEX.test(file.sha256)) localErrors[`file:${lineNumber}:sha256`] = sampleFieldMessage('malformed', 'sha256');
      });
    }
    if (Object.keys(localErrors).length) { setFieldErrors(localErrors); setError(''); return; }
    setFieldErrors({});
    void create.run({ title: title.trim(), origin: 'standalone', sampleSet: { sourceOwner: sourceOwner.trim(), files } }).then(settle).catch(() => undefined);
  }
  const fileErrorKeys = Object.keys(fieldErrors).filter(key => key.startsWith('file:'));
  const filesDescribedBy = [fieldErrors.files ? 'explorer-files-error' : '', ...fileErrorKeys.map(key => `explorer-files-line-${key.split(':')[1]}-${key.split(':')[2]}-error`)].filter(Boolean).join(' ') || undefined;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>조사 만들기</DialogTitle><DialogDescription>Source 소유자가 제공한 파일 참조와 SHA-256을 읽을 순서대로 입력하세요. 참조만 저장합니다.</DialogDescription></DialogHeader>
    <section aria-labelledby="explorer-recent-heading" className="grid gap-2">
      <h3 id="explorer-recent-heading" className="text-sm font-semibold">{t('recentSources')}</h3>
      {recentLoading && <p role="status" className="text-xs text-text-secondary">{t('recentSourcesLoading')}</p>}
      {recentError && <p role="status" className="text-xs text-text-secondary">{t(recentRows.length ? 'recentSourcesPartialError' : 'recentSourcesError')}</p>}
      {!recentLoading && !recentError && recentSources.length === 0 && <p className="text-xs text-text-secondary">{t('recentSourcesEmpty')}</p>}
      {recentSources.length > 0 && <ul className="grid gap-1">{recentSources.map(source => <li key={source.id}>
        <Button type="button" variant={selectedSourceId === source.id ? 'secondary' : 'ghost'} size="sm" onClick={() => chooseRecentSource(source.id)}>{source.title}</Button>
      </li>)}</ul>}
      {selectedSourceId && (selectedSource.status === 'loading' || selectedSource.status === 'refreshing') && <p role="status" className="text-xs text-text-secondary">{t('recentSourceLoading')}</p>}
      {sourceError && <p role="alert" className="text-xs text-text-danger-label">{sourceError}</p>}
    </section>
    <Label htmlFor="explorer-title">조사 이름</Label><Input id="explorer-title" aria-invalid={!!fieldErrors.title || undefined} aria-describedby={fieldErrors.title ? 'explorer-title-error' : undefined} value={title} onChange={e => edit(setTitle)(e.target.value)} maxLength={SAMPLE_OWNER_MAX_LENGTH} />
    {fieldErrors.title && <p id="explorer-title-error" className="text-xs text-text-danger-label">{fieldErrors.title}</p>}
    <details open={manualOpen} onToggle={event => setManualOpen(event.currentTarget.open)} className="grid gap-2">
      <summary className="cursor-pointer text-sm font-medium">{t('directInput')}</summary>
    <Label htmlFor="explorer-owner">Source 소유자</Label><Input id="explorer-owner" aria-invalid={!!fieldErrors.sourceOwner || undefined} aria-describedby={fieldErrors.sourceOwner ? 'explorer-owner-error' : undefined} value={sourceOwner} onChange={e => editSource(setOwner)(e.target.value)} maxLength={SAMPLE_OWNER_MAX_LENGTH} />
    {fieldErrors.sourceOwner && <p id="explorer-owner-error" className="text-xs text-text-danger-label">{fieldErrors.sourceOwner}</p>}
    <Label htmlFor="explorer-files">파일 참조 · 탭 · SHA-256 · 한 줄에 한 파일</Label><Textarea id="explorer-files" aria-invalid={!!filesDescribedBy || undefined} aria-describedby={filesDescribedBy} value={text} onChange={e => editSource(setText)(e.target.value)} />
    </details>
    {fieldErrors.files && <p id="explorer-files-error" className="text-xs text-text-danger-label">{fieldErrors.files}</p>}
    {fileErrorKeys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(key => { const [, line, field] = key.split(':'); return <p key={key} id={`explorer-files-line-${line}-${field}-error`} className="text-xs text-text-danger-label">{line}행 {field === 'fileRef' ? '파일 참조' : 'SHA-256'}: {fieldErrors[key]}</p>; })}
    {error && <p role="alert" className="text-sm">{error}</p>}{!can(investigationCreate.permission) && <p className="text-xs text-text-secondary">조사 쓰기 권한이 없습니다.</p>}
    <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={create.pending || !can(investigationCreate.permission)} onClick={submit}>{again ? '같은 요청 다시 시도' : '조사 만들기'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
