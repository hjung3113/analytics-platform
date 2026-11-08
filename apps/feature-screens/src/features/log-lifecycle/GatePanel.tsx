import { useState } from 'react';
import { Button, Input, Label, RadioGroup, RadioGroupItem, Textarea } from '@ap/ui';
import { GATE_LABEL, REASON_COPY, STAGE_LABEL, type RoundDetail, type ScreenProps, type WriteResult } from './contracts';
import { Disclosure, GateBadge, time, writeFailure, WriteError } from './presentation';

export function GatePanel({ api, ui, round, actorId, completedAt }: Pick<ScreenProps, 'api' | 'ui' | 'actorId'> & { round: RoundDetail; completedAt?: number | null }) {
  const action = api.useAction('gateDecide');
  const available = round.gateAvailability;
  const firstAllowed = (['approved', 'rejected', 'exception'] as const).find(d => available.decisions[d].allowed) ?? '';
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'exception' | ''>(firstAllowed);
  if (decision && !available.decisions[decision].allowed) setDecision(firstAllowed);
  const [reason, setReason] = useState('');
  const [riskActor, setRiskActor] = useState(actorId);
  const [scope, setScope] = useState('');
  const [until, setUntil] = useState('');
  const [result, setResult] = useState<WriteResult | null>(null);
  const selected = decision ? available.decisions[decision] : undefined;
  const reasons = [...new Set([...available.reasons, ...(selected?.reasons ?? [])])];
  const locked = action.pending || result?.outcome === 'unknown' || result?.outcome === 'error';
  async function submit() {
    if (!decision || !selected?.allowed) return;
    try {
    const next = await action.run({ roundId: round.id, targetStage: available.targetStage, decision, reason: reason.trim(), ...(decision === 'exception' ? { exception: { riskAcceptedBy: riskActor, scope: scope.trim(), ...(until ? { until } : {}) } } : {}) }, { expectedVersion: available.projectVersion });
    setResult(next); if (next.outcome === 'ok') setReason('');
    } catch (cause) { const failure = writeFailure(cause); if (failure) setResult(failure); }
  }
  return <aside aria-label="Gate 결정" className="sticky top-toolbar grid w-72 min-w-0 shrink-0 grid-cols-1 gap-4 self-start border-l border-border-subtle pl-4 break-keep">
    <h2 className="text-sm font-semibold">Gate 결정</h2><div className="flex items-center justify-between gap-2"><GateBadge decision={round.gateDecisions.at(-1)?.decision} /><span className="text-xs text-text-muted">사람의 업무 승인</span></div>
    {reasons.length > 0 ? <div className="grid gap-2">{ui.trust(reasons, completedAt)}{reasons.map(r => <p key={r} className="text-xs text-text-secondary">{REASON_COPY[r] ?? '결정 가능 여부를 확인하지 못했습니다.'}</p>)}</div> : null}
    <Disclosure label="서버 결정 근거"><pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(available.basis, null, 2)}</pre></Disclosure>
    <form className="grid gap-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <fieldset disabled={locked}><legend className="mb-2 text-sm">결정</legend><RadioGroup aria-label="결정" value={decision} onValueChange={v => { setDecision(v as typeof decision); setResult(null); }} orientation="horizontal">
        {(['approved', 'rejected', 'exception'] as const).map(d => <label key={d} className="flex items-center gap-2 text-sm"><RadioGroupItem value={d} disabled={!available.decisions[d].allowed} />{GATE_LABEL[d]}</label>)}
      </RadioGroup></fieldset>
      <Label htmlFor={`gate-reason-${round.id}`}>결정 사유 (필수)</Label><Textarea id={`gate-reason-${round.id}`} required value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} disabled={locked} />
      {decision === 'exception' ? <><Label htmlFor="gate-risk">위험 수용자 Actor ID (필수)</Label><Input inputSize="toolbar" id="gate-risk" required value={riskActor} onChange={e => setRiskActor(e.target.value)} disabled={locked} /><Label htmlFor="gate-scope">예외 범위 (필수)</Label><Textarea id="gate-scope" required value={scope} onChange={e => setScope(e.target.value)} disabled={locked} /><Label htmlFor="gate-until">예외 기한</Label><Input inputSize="toolbar" id="gate-until" type="date" value={until} onChange={e => setUntil(e.target.value)} disabled={locked} /></> : null}
      <WriteError result={result} onRetry={() => { void result?.retry?.().then(setResult).catch(cause => { const failure = writeFailure(cause); if (failure) setResult(failure); }); }} />
      <Button type="submit" variant="primary" size="toolbar" disabled={locked || !selected?.allowed || !reason.trim() || (decision === 'exception' && (!riskActor.trim() || !scope.trim()))}>{action.pending ? '기록 중…' : `${STAGE_LABEL[available.targetStage ?? ''] ?? ''} 진입 결정 기록`}</Button>
      {result?.outcome === 'ok' ? <p role="status" className="text-xs">Gate 결정을 기록했습니다.</p> : null}<p className="text-xs text-text-muted">검증 판정은 유지됩니다.</p>
    </form>
    <h3 className="text-sm font-semibold">Gate 결정 이력</h3>
    {round.gateDecisions.length === 0 ? <p className="text-xs text-text-muted">아직 결정 없음</p> : [...round.gateDecisions].reverse().map(d => <div key={d.id} className="grid gap-2 border-t border-border-subtle pt-3 text-xs"><GateBadge decision={d.decision} /><p>{d.decidedBy.displayName || '이름 확인 불가'} · {time(d.at)} KST{d.selfApproved ? ' · 자기 승인' : ''}</p><p>{d.reason}</p>{d.exception ? <p>예외 범위: {d.exception.scope} · 위험 수용자 {d.exception.riskAcceptedBy}{d.exception.until ? ` · ${d.exception.until}까지` : ''}</p> : null}<Disclosure label="결정 시점 근거"><pre className="whitespace-pre-wrap break-all">{JSON.stringify(d.basis, null, 2)}</pre></Disclosure></div>)}
  </aside>;
}
