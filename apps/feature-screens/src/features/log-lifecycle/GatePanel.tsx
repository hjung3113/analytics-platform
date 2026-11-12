import { useState } from 'react';
import { Button, Input, Label, RadioGroup, RadioGroupItem, Textarea } from '@ap/ui';
import { GATE_LABEL, REASON_COPY, type CursorPage, type Page, type ValidationIssueRow, type RequestDetail, type RuleResult, type RoundDetail, type ScreenProps, type WriteResult } from './contracts';
import { Disclosure, GateBadge, ReadView, time, writeFailure, WriteError } from './presentation';
import { decisiveReference } from './RoundExecution';
import { ISSUE_TOTAL_UNAVAILABLE } from './Discussion';

export type GateDraft = { decision: 'approved' | 'rejected' | 'exception' | ''; reason: string; riskActor: string; scope: string; until: string; result: WriteResult | null };
export function emptyGateDraft(actorId: string): GateDraft { return { decision: '', reason: '', riskActor: actorId, scope: '', until: '', result: null }; }
type GateProps = Pick<ScreenProps, 'api' | 'ui' | 'actorId'> & { round: RoundDetail; completedAt?: number | null };
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
// Standalone hosts retain the same entry; the workbench always supplies its Round-owned controller.
export function GatePanel(props: GateProps & { controller?: GateController }) {
  return props.controller ? <GatePanelView {...props} controller={props.controller} /> : <StandaloneGatePanel {...props} />;
}
function StandaloneGatePanel(props: GateProps) {
  const controller = useGateController(props);
  return <GatePanelView {...props} controller={controller} />;
}
function GatePanelView({ api, ui, round, completedAt, controller }: GateProps & { controller: GateController }) {
  const available = round.gateAvailability;
  const { draft: { decision, reason, riskActor, scope, until, result }, update, pending, submit, retry } = controller;
  const reference = decisiveReference(round);
  const request = api.useRead<RequestDetail>('requestDetail', { requestId: reference?.requestId ?? '' }, !!reference);
  const decisive = request.data?.roundId === round.id ? request.data.attempts.find(a => a.id === reference?.attemptId) : undefined;
  const failing = api.useRead<Page<RuleResult>>('ruleResults', { attemptId: reference?.attemptId ?? '', results: ['FAIL'], page: 0, pageSize: 25 }, !!reference);
  const issues = api.useRead<CursorPage<ValidationIssueRow>>('validationIssues', { roundId: round.id, limit: 10 });
  const selected = decision ? available.decisions[decision] : undefined;
  const reasons = [...new Set([...available.reasons, ...(selected?.reasons ?? [])])];
  const locked = pending || result?.outcome === 'unknown' || result?.outcome === 'error';
  return <section aria-label="Gate 결정" className="grid min-w-0 grid-cols-1 gap-4 break-keep">
    <div className="flex items-center justify-between gap-2"><GateBadge decision={round.gateDecisions.at(-1)?.decision} /><span className="text-xs text-text-muted">사람의 업무 승인</span></div>
    {reasons.length > 0 ? <div className="grid gap-2">{ui.trust(reasons, completedAt)}{reasons.map(r => <p key={r} className="text-xs text-text-secondary">{REASON_COPY[r] ?? '결정 가능 여부를 확인하지 못했습니다.'}</p>)}</div> : null}
    <section aria-label="서버 결정 근거" className="grid gap-2 text-xs"><h3 className="font-semibold">서버 결정 근거</h3>
      {reference ? <ReadView query={request}>{() => decisive ? <><p>완료 시도 #{decisive.attemptNo} · 실패 {decisive.counts.FAIL ?? 0} · 미검증 {decisive.counts.NOT_CHECKED ?? 0} / 전체 규칙 {decisive.ruleCount}건</p><ReadView query={failing}>{data => <><p>{data.rows.length ? data.rows.map(rule => rule.ruleId).join(' · ') : '실패 규칙 없음'}</p>{data.total > data.rows.length ? <p>실패 규칙 {data.total}건 중 {data.rows.length}건 표시</p> : null}</>}</ReadView></> : <p>결정 근거 시도를 확인할 수 없습니다.</p>}</ReadView> : <p>Gate 기준 시도 없음 · 서버가 결정 근거로 삼은 완료 시도가 아직 없습니다.</p>}
      <p>{ISSUE_TOTAL_UNAVAILABLE} · 이 Round 전체 · 사람 기록이며 판정에 쓰이지 않음</p>
      {issues.status === 'done' && issues.data?.rows.length ? <><p className="text-text-secondary">최근 활동 검증 항목{issues.data.nextCursor ? ` ${issues.data.rows.length}건만 표시` : ''}</p>{issues.data.rows.map(row => <p key={row.id}>{row.title}</p>)}</> : null}
    </section>
    <Disclosure label="근거 스냅샷"><pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(available.basis, null, 2)}</pre></Disclosure>
    <form className="grid gap-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <fieldset disabled={locked}><legend className="mb-2 text-sm">결정</legend><RadioGroup aria-label="결정" value={selected?.allowed ? decision : ''} onValueChange={v => { update({ decision: v as typeof decision, result: null }); }} orientation="horizontal">
        {(['approved', 'rejected', 'exception'] as const).map(d => <label key={d} className="flex items-center gap-2 text-sm"><RadioGroupItem value={d} disabled={!available.decisions[d].allowed} />{GATE_LABEL[d]}</label>)}
      </RadioGroup></fieldset>
      <Label htmlFor={`gate-reason-${round.id}`}>결정 사유 (필수)</Label><Textarea id={`gate-reason-${round.id}`} required value={reason} onChange={e => update({ reason: e.target.value })} maxLength={2000} disabled={locked} />
      {decision === 'exception' ? <><Label htmlFor="gate-risk">위험 수용자 Actor ID (필수)</Label><Input inputSize="toolbar" id="gate-risk" required value={riskActor} onChange={e => update({ riskActor: e.target.value })} disabled={locked} /><Label htmlFor="gate-scope">예외 범위 (필수)</Label><Textarea id="gate-scope" required value={scope} onChange={e => update({ scope: e.target.value })} disabled={locked} /><Label htmlFor="gate-until">예외 기한</Label><Input inputSize="toolbar" id="gate-until" type="date" value={until} onChange={e => update({ until: e.target.value })} disabled={locked} /></> : null}
      <WriteError result={result} onRetry={() => { void retry(); }} />
      <Button type="submit" variant="primary" size="toolbar" disabled={locked || !selected?.allowed || !reason.trim() || (decision === 'exception' && (!riskActor.trim() || !scope.trim()))}>{pending ? '기록 중…' : 'Gate 결정 기록'}</Button>
      {result?.outcome === 'ok' ? <p role="status" className="text-xs">Gate 결정을 기록했습니다.</p> : null}<p className="text-xs text-text-muted">검증 판정은 유지됩니다.</p>
    </form>
    <h3 className="text-sm font-semibold">Gate 결정 이력</h3>
    {round.gateDecisions.length === 0 ? <p className="text-xs text-text-muted">아직 결정 없음</p> : [...round.gateDecisions].reverse().map(d => <div key={d.id} className="grid gap-2 border-t border-border-subtle pt-3 text-xs"><GateBadge decision={d.decision} /><p>{d.decidedBy.displayName || '이름 확인 불가'} · {time(d.at)} KST{d.selfApproved ? ' · 자기 승인' : ''}</p><p>{d.reason}</p>{d.exception ? <p>예외 범위: {d.exception.scope} · 위험 수용자 {d.exception.riskAcceptedBy}{d.exception.until ? ` · ${d.exception.until}까지` : ''}</p> : null}<Disclosure label="결정 시점 근거"><pre className="whitespace-pre-wrap break-all">{JSON.stringify(d.basis, null, 2)}</pre></Disclosure></div>)}
  </section>;
}
