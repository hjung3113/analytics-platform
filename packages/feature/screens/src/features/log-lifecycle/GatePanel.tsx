import { useId, useState } from 'react';
import { FeatureTimestamp, useFeatureTime } from '../../components/FeatureTimestamp';
import { ChevronDown } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, DecisionReasonField, FieldList, FieldRow, FormField, Input, Label, RadioGroup, RadioGroupItem, Textarea, requiredDecisionReasonError, useImeEnterGuard, useValidatedSubmit, type ValidationErrors } from '@ap/ui';
import { GATE_LABEL, REASON_COPY, STATE_LABEL, type Attempt, type CursorPage, type Page, type ValidationIssueRow, type RequestDetail, type RuleResult, type RoundDetail, type ScreenProps, type WriteResult } from './contracts';
import { Disclosure, GateBadge, ReadView, writeFailure, WriteError } from './presentation';
import { decisiveReference } from './RoundExecution';
import { ISSUE_TOTAL_UNAVAILABLE } from './Discussion';
import { formCopy, pageCopy } from './messages';

const GATE_DECISIONS = ['approved', 'rejected', 'exception'] as const;
type GateFields = { reason: string; riskActor: string; scope: string };
/** Submit-time errors of the Gate decision form (#2574): the reason always, the exception fields for an exception. */
function validateGate(decision: GateDraft['decision'], values: GateFields): ValidationErrors<GateFields> {
  const errors: ValidationErrors<GateFields> = {};
  const reason = requiredDecisionReasonError(values.reason, pageCopy.decisionReasonRequired);
  if (reason) errors.reason = reason;
  if (decision === 'exception') {
    if (!values.riskActor.trim()) errors.riskActor = formCopy.riskActorRequired;
    if (!values.scope.trim()) errors.scope = formCopy.scopeRequired;
  }
  return errors;
}

export type GateDraft = { decision: 'approved' | 'rejected' | 'exception' | ''; reason: string; riskActor: string; scope: string; until: string; result: WriteResult | null };
export function emptyGateDraft(actorId: string): GateDraft { return { decision: '', reason: '', riskActor: actorId, scope: '', until: '', result: null }; }
type GateProps = Pick<ScreenProps, 'api' | 'ui' | 'actorId'> & { round: RoundDetail; completedAt?: number | null; selectedAttempt?: Pick<Attempt, 'id' | 'attemptNo'> };
/** Owned by the Round, so Kernel retries remain live when the detail slot is replaced. */
export function useGateController({ api, round, actorId }: Pick<GateProps, 'api' | 'round' | 'actorId'>) {
  const action = api.useAction('gateDecide');
  const [draft, setDraft] = useState(() => emptyGateDraft(actorId));
  const update = (patch: Partial<GateDraft>) => setDraft(previous => ({ ...previous, ...patch }));
  const receive = (result: WriteResult) => update({ result, ...(result.outcome === 'ok' ? { reason: '' } : {}) });
  const fail = (cause: unknown) => { const failure = writeFailure(cause); if (failure) update({ result: failure }); };
  async function submit() {
    const { decision, reason, riskActor, scope, until } = draft;
    const available = round.gateAvailability;
    if (action.pending || draft.result?.outcome === 'unknown' || draft.result?.outcome === 'error' || !decision || !available.decisions[decision].allowed) return;
    try {
      receive(await action.run({ roundId: round.id, targetStage: available.targetStage, decision, reason: reason.trim(), ...(decision === 'exception' ? { exception: { riskAcceptedBy: riskActor, scope: scope.trim(), ...(until ? { until } : {}) } } : {}) }, { expectedVersion: available.projectVersion }));
    } catch (cause) { fail(cause); }
  }
  async function retry() { try { const next = await draft.result?.retry?.(); if (next) receive(next); } catch (cause) { fail(cause); } }
  return { draft, update, pending: action.pending, submit, retry };
}
type GateController = ReturnType<typeof useGateController>;
const GATE_DIGEST_PREVIEW_LENGTH = 12;
const GATE_VALUE_UNAVAILABLE = '확인 불가';
type GateBasisAttempt = { attemptId: string; requestId?: string | undefined; attemptNo?: number | undefined; verdict?: string | null | undefined; ruleSetRevision?: string | null | undefined; endedAt?: string | null | undefined };
type GateBasisSummary = { attempts: GateBasisAttempt[]; decisiveAttemptId: string | null | undefined; decisiveAttempt: GateBasisAttempt | null; specPinRevision: string | null | undefined; sampleManifestDigest: string | undefined; evidenceLinkCount: number | undefined };
function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function readBasisAttempt(value: unknown): GateBasisAttempt | null {
  const attempt = recordOf(value);
  if (!attempt || typeof attempt.attemptId !== 'string' || !attempt.attemptId.trim()) return null;
  const requestId = typeof attempt.requestId === 'string' && attempt.requestId.trim() ? attempt.requestId : undefined;
  const attemptNo = typeof attempt.attemptNo === 'number' && Number.isSafeInteger(attempt.attemptNo) && attempt.attemptNo > 0 ? attempt.attemptNo : undefined;
  const verdict = typeof attempt.verdict === 'string' || attempt.verdict === null ? attempt.verdict : undefined;
  let ruleSetRevision: string | null | undefined = undefined;
  if (typeof attempt.ruleSetRevision === 'string' && attempt.ruleSetRevision.trim()) ruleSetRevision = attempt.ruleSetRevision;
  else if (attempt.ruleSetRevision === null) ruleSetRevision = null;
  const endedAt = typeof attempt.endedAt === 'string' || attempt.endedAt === null ? attempt.endedAt : undefined;
  return {
    attemptId: attempt.attemptId,
    requestId,
    attemptNo,
    verdict,
    ruleSetRevision,
    endedAt,
  };
}
function readGateBasis(value: unknown, reference: ReturnType<typeof decisiveReference>): GateBasisSummary | null {
  const basis = recordOf(value);
  if (!basis || !Array.isArray(basis.attempts)) return null;
  const attempts = basis.attempts.map(readBasisAttempt);
  if (attempts.some(attempt => attempt === null)) return null;
  const parsedAttempts = attempts as GateBasisAttempt[];
  let decisiveAttemptId: string | null | undefined = undefined;
  if (typeof basis.decisiveAttemptId === 'string') decisiveAttemptId = basis.decisiveAttemptId;
  else if (basis.decisiveAttemptId === null) decisiveAttemptId = null;
  const decisiveAttempt = reference
    ? parsedAttempts.find(attempt => attempt.attemptId === reference.attemptId && attempt.requestId === reference.requestId) ?? null
    : null;
  let specPinRevision: string | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(basis, 'specPin')) {
    if (basis.specPin === null) specPinRevision = null;
    else {
      const specPin = recordOf(basis.specPin);
      if (typeof specPin?.revisionId === 'string' && specPin.revisionId.trim()) specPinRevision = specPin.revisionId;
      else if (specPin?.revisionId === null) specPinRevision = null;
    }
  }
  const sampleManifestDigest = typeof basis.sampleManifestDigest === 'string' && basis.sampleManifestDigest.trim() ? basis.sampleManifestDigest : undefined;
  const evidenceLinks = Array.isArray(basis.evidenceLinks) ? basis.evidenceLinks : null;
  let evidenceLinkCount: number | undefined;
  if (evidenceLinks && evidenceLinks.every(value => {
    const link = recordOf(value);
    return !!link && typeof link.attachmentId === 'string' && !!link.attachmentId.trim() && typeof link.linkedAt === 'string' && !!link.linkedAt.trim();
  })) evidenceLinkCount = evidenceLinks.length;
  return {
    attempts: parsedAttempts,
    decisiveAttemptId,
    decisiveAttempt,
    specPinRevision,
    sampleManifestDigest,
    evidenceLinkCount,
  };
}
function countValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
function sparseCountValue(counts: Record<string, unknown> | null, key: string): number | undefined {
  if (!counts) return undefined;
  return Object.prototype.hasOwnProperty.call(counts, key) ? countValue(counts[key]) : 0;
}
function countSummary(label: string, count: number | undefined): string {
  if (count === undefined) return `${label} ${GATE_VALUE_UNAVAILABLE}`;
  return `${label} ${count}건`;
}
function gateResultSummary(decisive: Attempt | undefined, failureCount: number | undefined, uncheckedCount: number | undefined, ruleCount: number | undefined): string {
  if (!decisive) return GATE_VALUE_UNAVAILABLE;
  let rules = '전체 규칙 확인 불가';
  if (ruleCount !== undefined) rules = `전체 규칙 ${ruleCount}건`;
  return `${countSummary('실패', failureCount)} · ${countSummary('미검증', uncheckedCount)} / ${rules}`;
}
function digestPreview(value: string | undefined): string {
  return value ? `${value.slice(0, GATE_DIGEST_PREVIEW_LENGTH)}…` : GATE_VALUE_UNAVAILABLE;
}
function basisAttemptSummary(basis: GateBasisSummary | null, summaryTime: (at: string) => string, selectedAttempt?: Pick<Attempt, 'id' | 'attemptNo'>): string {
  if (!basis || basis.decisiveAttemptId === undefined) return GATE_VALUE_UNAVAILABLE;
  if (basis.decisiveAttemptId === null) return pageCopy.noCompletedAttempt;
  const attempt = basis.decisiveAttempt;
  if (!attempt) return GATE_VALUE_UNAVAILABLE;
  const attemptNumber = attempt.attemptNo === undefined ? GATE_VALUE_UNAVAILABLE : `#${attempt.attemptNo}`;
  const selectedAttemptNote = selectedAttempt && selectedAttempt.id !== attempt.attemptId ? ` (선택한 시도 #${selectedAttempt.attemptNo}와 다름)` : '';
  const verdict = typeof attempt.verdict === 'string' ? STATE_LABEL[attempt.verdict] ?? GATE_VALUE_UNAVAILABLE : GATE_VALUE_UNAVAILABLE;
  const endedAt = typeof attempt.endedAt === 'string' && Number.isFinite(Date.parse(attempt.endedAt)) ? summaryTime(attempt.endedAt) : GATE_VALUE_UNAVAILABLE;
  return `완료 시도 ${attemptNumber}${selectedAttemptNote} · ${verdict} · ${endedAt}`;
}
function ruleRevisionSummary(attempt: GateBasisAttempt | null | undefined): string {
  if (!attempt) return GATE_VALUE_UNAVAILABLE;
  if (attempt.ruleSetRevision === null) return '규칙 버전 없음';
  return attempt.ruleSetRevision ?? GATE_VALUE_UNAVAILABLE;
}
function specPinSummary(basis: GateBasisSummary | null): string {
  if (!basis || basis.specPinRevision === undefined) return GATE_VALUE_UNAVAILABLE;
  return basis.specPinRevision ?? '미고정';
}
// Standalone hosts retain the same entry; the workbench always supplies its Round-owned controller.
export function GatePanel(props: GateProps & { controller?: GateController }) {
  return props.controller ? <GatePanelView {...props} controller={props.controller} /> : <StandaloneGatePanel {...props} />;
}
function StandaloneGatePanel(props: GateProps) {
  const controller = useGateController(props);
  return <GatePanelView {...props} controller={controller} />;
}
function GatePanelView({ api, ui, round, completedAt, selectedAttempt, controller }: GateProps & { controller: GateController }) {
  const ime = useImeEnterGuard();
  const format = useFeatureTime();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rawBasisOpen, setRawBasisOpen] = useState(false);
  const rawBasisId = useId();
  const available = round.gateAvailability;
  const orderedGateDecisions = [...round.gateDecisions].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const latestGateDecision = orderedGateDecisions.at(-1);
  const { draft: { decision, reason, riskActor, scope, until, result }, update, pending, submit, retry } = controller;
  const reference = decisiveReference(round);
  const basis = readGateBasis(available.basis, reference);
  const basisAttempt = basis?.decisiveAttempt ?? null;
  const hasReference = reference !== null;
  const request = api.useRead<RequestDetail>('requestDetail', { requestId: reference?.requestId ?? '' }, hasReference);
  let decisive: Attempt | undefined;
  if (reference && basisAttempt && basisAttempt.requestId === reference.requestId && basisAttempt.attemptId === reference.attemptId && request.data && request.data.id === reference.requestId && request.data.roundId === round.id && Array.isArray(request.data.attempts)) {
    decisive = request.data.attempts.find(attempt => attempt.id === basisAttempt.attemptId);
  }
  const failing = api.useRead<Page<RuleResult>>('ruleResults', { attemptId: reference?.attemptId ?? '', results: ['FAIL'], page: 0, pageSize: 25 }, hasReference);
  const issues = api.useRead<CursorPage<ValidationIssueRow>>('validationIssues', { roundId: round.id, limit: 10 });
  const selected = decision ? available.decisions[decision] : undefined;
  const reasons = [...new Set([...available.reasons, ...(selected?.reasons ?? [])])];
  const locked = pending || result?.outcome === 'unknown' || result?.outcome === 'error';
  const { errors, handleSubmit, clearError } = useValidatedSubmit<GateFields>({
    validate: values => validateGate(decision, values),
    onValid: () => { if (!locked && selected?.allowed) setConfirmOpen(true); },
  });
  // Only the decision choice still disables the submit; it names why (a radio choice has no field error to focus).
  let submitBlockedReason: string | undefined;
  if (!selected?.allowed) submitBlockedReason = GATE_DECISIONS.some(d => available.decisions[d].allowed) ? formCopy.decisionRequired : formCopy.noDecisionAllowed;
  const counts = recordOf(decisive?.counts);
  const failureCount = sparseCountValue(counts, 'FAIL');
  const uncheckedCount = sparseCountValue(counts, 'NOT_CHECKED');
  const ruleCount = countValue(decisive?.ruleCount);
  const requiredCount = countValue(decisive?.requiredUnchecked);
  const resultSummary = gateResultSummary(decisive, failureCount, uncheckedCount, ruleCount);
  const requiredSummary = requiredCount === undefined ? GATE_VALUE_UNAVAILABLE : pageCopy.requiredUnchecked(requiredCount);
  const rawBasisText = JSON.stringify(available.basis, null, 2) ?? GATE_VALUE_UNAVAILABLE;
  const unavailableReferenceMessage = basis?.decisiveAttemptId === null
    ? 'Gate 기준 시도 없음 · 서버가 결정 근거로 삼은 완료 시도가 아직 없습니다.'
    : '결정 근거 시도를 확인할 수 없습니다.';
  return <section aria-label="Gate 결정" className="grid min-w-0 grid-cols-1 gap-4 break-keep">
    <div className="flex items-center justify-between gap-2"><GateBadge decision={latestGateDecision?.decision} /><span className="text-xs text-text-muted">사람의 업무 승인</span></div>
    {reasons.length > 0 ? <div className="grid gap-2">{ui.trust(reasons, completedAt)}{reasons.map(r => <p key={r} className="text-xs text-text-secondary">{REASON_COPY[r] ?? '결정 가능 여부를 확인하지 못했습니다.'}</p>)}</div> : null}
    <section aria-label="서버 결정 근거" className="grid gap-2 text-xs">
      <h3 className="font-semibold">서버 결정 근거</h3>
      <div className="grid min-w-0 gap-1">
        <FieldList layout="inline" className="min-w-0"><FieldRow label="기준 시도">{basisAttemptSummary(basis, format.summary, selectedAttempt)}</FieldRow></FieldList>
        <FieldList layout="inline" className="min-w-0"><FieldRow label="검증 결과">{resultSummary}</FieldRow><FieldRow label="필수 판정">{requiredSummary}</FieldRow></FieldList>
        <FieldList layout="inline" className="min-w-0"><FieldRow label="규칙">{ruleRevisionSummary(basisAttempt)}</FieldRow><FieldRow label="명세">{specPinSummary(basis)}</FieldRow><FieldRow label="샘플" mono>{digestPreview(basis?.sampleManifestDigest)}</FieldRow><FieldRow label="근거 링크">{basis?.evidenceLinkCount === undefined ? GATE_VALUE_UNAVAILABLE : `${basis.evidenceLinkCount}개`}</FieldRow><FieldRow label="시도 수">{basis ? `${basis.attempts.length}개` : GATE_VALUE_UNAVAILABLE}</FieldRow></FieldList>
      </div>
      {reference ? <ReadView query={request}>{detail => {
        const hasAttempt = Array.isArray(detail.attempts) && detail.attempts.some(attempt => attempt.id === reference.attemptId);
        if (detail.id === reference.requestId && detail.roundId === round.id && hasAttempt) return null;
        return <p>결정 근거 시도를 확인할 수 없습니다.</p>;
      }}</ReadView> : <p>{unavailableReferenceMessage}</p>}
      {decisive ? <ReadView query={failing}>{data => <><p>{data.rows.length ? data.rows.map(rule => rule.ruleId).join(' · ') : failureCount === 0 ? '실패 규칙 없음' : GATE_VALUE_UNAVAILABLE}</p>{data.total > data.rows.length ? <p>실패 규칙 {data.total}건 중 {data.rows.length}건 표시</p> : null}</>}</ReadView> : null}
      <p>{ISSUE_TOTAL_UNAVAILABLE} · 이 Round 전체 · 사람 기록이며 판정에 쓰이지 않음</p>
      {issues.status === 'done' && issues.data?.rows.length ? <><p className="text-text-secondary">최근 활동 검증 항목{issues.data.nextCursor ? ` ${issues.data.rows.length}건만 표시` : ''}</p>{issues.data.rows.map(row => <p key={row.id}>{row.title}</p>)}</> : null}
      <Button type="button" variant="secondary" size="toolbar" className="min-w-0 max-w-full justify-between" aria-expanded={rawBasisOpen} aria-controls={rawBasisId} onClick={() => setRawBasisOpen(open => !open)}>
        <span>원시 근거 JSON</span><ChevronDown aria-hidden className={`size-4 transition-transform${rawBasisOpen ? ' rotate-180' : ''}`} />
      </Button>
      <div id={rawBasisId} hidden={!rawBasisOpen} className="min-w-0"><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{rawBasisText}</pre></div>
    </section>
    <form onKeyDown={ime.onKeyDown} onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd} className="grid gap-3" onSubmit={handleSubmit({ reason, riskActor, scope })}>
      <fieldset disabled={locked}><legend className="mb-2 text-sm">결정</legend><RadioGroup aria-label="결정" value={selected?.allowed ? decision : ''} onValueChange={v => { update({ decision: v as typeof decision, result: null }); clearError('riskActor'); clearError('scope'); }} orientation="horizontal">
        {GATE_DECISIONS.map(d => <label key={d} className="flex items-center gap-2 text-sm"><RadioGroupItem value={d} disabled={!available.decisions[d].allowed} />{GATE_LABEL[d]}</label>)}
      </RadioGroup></fieldset>
      <DecisionReasonField
        kind="judgment"
        id={`gate-reason-${round.id}`}
        value={reason}
        error={errors.reason}
        disabled={locked}
        maxLength={2000}
        messages={{ reasonLabel: pageCopy.decisionReasonOneLine, requiredMark: pageCopy.decisionRequiredMark }}
        onChange={value => {
          update({ reason: value });
          clearError('reason');
        }}
      />
      {decision === 'exception' ? <><FormField id="gate-risk" label="위험 수용자 Actor ID" required requiredMark="text" error={errors.riskActor}>{control => <Input {...control} inputSize="toolbar" value={riskActor} onChange={e => { update({ riskActor: e.target.value }); clearError('riskActor'); }} disabled={locked} />}</FormField><FormField id="gate-scope" label="예외 범위" required requiredMark="text" error={errors.scope}>{control => <Textarea {...control} value={scope} onChange={e => { update({ scope: e.target.value }); clearError('scope'); }} disabled={locked} />}</FormField><Label htmlFor="gate-until">예외 기한</Label><Input inputSize="toolbar" id="gate-until" type="date" value={until} onChange={e => update({ until: e.target.value })} disabled={locked} /></> : null}
      <WriteError result={result} onRetry={() => { void retry(); }} />
      <Button type="submit" variant="primary" size="toolbar" disabled={locked || !selected?.allowed} disabledReason={locked ? undefined : submitBlockedReason}>{pending ? '기록 중…' : 'Gate 결정 기록'}</Button>
      {result?.outcome === 'ok' ? <p role="status" className="text-xs">Gate 결정을 기록했습니다.</p> : null}<p className="text-xs text-text-muted">검증 판정은 유지됩니다.</p>
    </form>
    <AlertDialog open={confirmOpen} onOpenChange={open => { if (!locked) setConfirmOpen(open); }}><AlertDialogContent onEscapeKeyDown={event => { if (locked) event.preventDefault(); }}><AlertDialogHeader className="space-y-2"><AlertDialogTitle>Gate 결정 기록</AlertDialogTitle><AlertDialogDescription className="grid break-keep">
      <span>{decision ? GATE_LABEL[decision] : ''}</span><span className="line-clamp-1 break-all" title={reason}>{reason}</span>
      {decision === 'exception' ? <span>예외 범위 {scope} · 위험 수용자 {riskActor}</span> : null}
      <span>기록하면 이력에 남고 지울 수 없습니다. 바꾸려면 새 결정을 기록합니다.</span>
    </AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={locked}>취소</AlertDialogCancel><Button disabled={locked || !selected?.allowed} onClick={() => { setConfirmOpen(false); void submit(); }}>기록</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <h3 className="text-sm font-semibold">Gate 결정 이력</h3>
    {orderedGateDecisions.length === 0 ? <p className="text-xs text-text-muted">아직 결정 없음</p> : orderedGateDecisions.map(d => <div key={d.id} className="grid gap-2 border-t border-border-subtle pt-3 text-xs"><GateBadge decision={d.decision} /><p>{d.decidedBy.displayName || '이름 확인 불가'} · <FeatureTimestamp at={d.at} notation="feed" />{d.selfApproved ? ' · 자기 승인' : ''}</p><p>{d.reason}</p>{d.exception ? <p>예외 범위: {d.exception.scope} · 위험 수용자 {d.exception.riskAcceptedBy}{d.exception.until ? ` · ${d.exception.until}까지` : ''}</p> : null}<Disclosure label="결정 시점 근거"><pre className="whitespace-pre-wrap break-all">{JSON.stringify(d.basis, null, 2)}</pre></Disclosure></div>)}
  </section>;
}
