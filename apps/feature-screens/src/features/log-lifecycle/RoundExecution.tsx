import { ReadView, StateBadge } from './presentation';
import { IssueCount } from './Discussion';
import type { Attempt, LifecycleApi, Page, RequestDetail, RequestRow, RoundDetail } from './contracts';

/** The server's decisive attempt is Round-wide, including results from an older request. */
export function decisiveReference(round: RoundDetail): { requestId: string; attemptId: string } | null {
  const basis = round.gateAvailability.basis;
  if (!basis || typeof basis !== 'object' || !('decisiveAttemptId' in basis) || !('attempts' in basis) || !Array.isArray(basis.attempts)) return null;
  const attempt = basis.attempts.find((a: unknown) => a && typeof a === 'object' && 'attemptId' in a && a.attemptId === basis.decisiveAttemptId);
  return attempt && typeof attempt.requestId === 'string' && typeof attempt.attemptId === 'string' ? { requestId: attempt.requestId, attemptId: attempt.attemptId } : null;
}
export function useRoundExecution(api: LifecycleApi, round: RoundDetail, selectedRequest = '', selectedAttempt = '') {
  const latest = api.useRead<Page<RequestRow>>('requests', { roundId: round.id, page: 0, pageSize: 1 });
  const latestId = latest.data?.rows[0]?.id ?? '';
  const latestDetail = api.useRead<RequestDetail>('requestDetail', { requestId: latestId }, !!latestId);
  const reference = decisiveReference(round);
  const requestId = selectedRequest || reference?.requestId || latestId;
  const request = api.useRead<RequestDetail>('requestDetail', { requestId }, !!requestId);
  const attempts = request.data?.roundId === round.id ? request.data.attempts : [];
  const attempt = selectedAttempt ? attempts.find(a => a.id === selectedAttempt) : attempts.find(a => a.id === reference?.attemptId) ?? [...attempts].reverse().find(a => a.outcome === 'succeeded');
  const latestAttempt = latestDetail.data?.roundId === round.id ? latestDetail.data.attempts.at(-1) : undefined;
  return { latest, latestDetail, latestAttempt, request, requestId, attempt };
}
export function uncheckedCount(attempt: Attempt) { return ['NOT_CHECKED', 'ERROR', 'SKIPPED'].reduce((total, result) => total + (attempt.counts[result] ?? 0), 0); }

export function RoundSummaryCell({ api, roundId, field }: { api: LifecycleApi; roundId: string; field: 'execution' | 'verdict' | 'counts' }) {
  const round = api.useRead<RoundDetail>('roundDetail', { roundId });
  return <ReadView query={round}>{data => <RoundSummaryValue api={api} round={data} field={field} />}</ReadView>;
}
function RoundSummaryValue({ api, round, field }: { api: LifecycleApi; round: RoundDetail; field: 'execution' | 'verdict' | 'counts' }) {
  const { latest, latestAttempt, latestDetail, request, attempt } = useRoundExecution(api, round);
  if (field === 'execution') return <ReadView query={latest}>{data => data.rows.length ? <ReadView query={latestDetail}>{() => <span className="text-xs">{latestAttempt ? `시도 #${latestAttempt.attemptNo} · ` : ''}<StateBadge value={data.rows[0]?.state} /></span>}</ReadView> : <span className="text-xs">검증 전</span>}</ReadView>;
  return <ReadView query={latest}>{data => data.rows.length === 0 ? field === 'verdict' ? <span className="text-xs">완료 시도 없음</span> : <span className="text-xs">규칙 결과 없음 / <IssueCount /></span> : <ReadView query={request}>{() => field === 'verdict' ? attempt ? <span className="text-xs">시도 #{attempt.attemptNo} · <StateBadge value={attempt.verdict} /></span> : <span className="text-xs">완료 시도 없음</span> : <span className="text-xs">{attempt ? `시도 #${attempt.attemptNo} 전체 ${attempt.ruleCount}건 · 실패 ${attempt.counts.FAIL ?? 0} · 미검증 ${attempt.counts.NOT_CHECKED ?? 0}` : '규칙 결과 없음'} / <IssueCount /></span>}</ReadView>}</ReadView>;
}
