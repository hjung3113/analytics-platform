import type { ReactNode, RefObject } from 'react';

export const STAGES = ['registered', 'kickoff', 'alpha', 'beta', 'completed'] as const;
export const STAGE_LABEL: Record<string, string> = { registered: '등록', kickoff: '착수', alpha: '알파', beta: '베타', completed: '완료', cancelled: '취소' };
export const STATE_LABEL: Record<string, string> = { queued: '요청 대기', claimed: '실행 중', succeeded: '결과 저장 완료', failed: '실행 실패', cancelled: '취소됨', expired: '만료', running: '실행 중', lease_expired: 'lease 만료', pass: '통과', fail: '실패', incomplete: '불완전', none: '검증 전', PASS: '통과', FAIL: '실패', WARN: '경고', ERROR: '오류', NOT_CHECKED: '미검증', SKIPPED: '건너뜀', NOT_APPLICABLE: '해당 없음' };
export const GATE_LABEL: Record<string, string> = { approved: '승인', rejected: '거절', exception: '예외', none: '미결정' };
export const RESULT_ORDER = ['FAIL', 'ERROR', 'WARN', 'NOT_CHECKED', 'SKIPPED', 'PASS', 'NOT_APPLICABLE'] as const;
export const REASON_COPY: Record<string, string> = {
  session_required: 'Gate 결정은 로그인한 사람만 기록할 수 있습니다.', permission_denied: 'Gate 결정 권한이 없습니다. 관리자에게 요청해 주세요.',
  project_not_open: '개발 건이 완료되거나 취소되어 결정할 수 없습니다.', round_not_current: '최신 Round가 아니므로 결정할 수 없습니다.', round_stage_mismatch: 'Round를 연 단계와 현재 단계가 다릅니다. 현재 단계에서 새 Round를 열어 주세요.',
  verdict_not_pass: '필수 규칙 미검증 또는 실패로 승인할 수 없습니다. 결과를 확인하거나 예외를 기록해 주세요.', software_required: '완료 승인을 위해 개발 건에 SW를 지정해 주세요.', exception_not_needed: '통과 판정이 있어 예외 대신 승인을 기록합니다.',
};
export type Page<T> = { rows: T[]; total: number };
export type Model = { active?: boolean; id: string; code: string; name: string; vendorName: string; vendorId: string; processes: { id: string; name: string }[]; updatedAt: string; validation: string; pendingRequests: number; gateDecision: string | null; project: { projectId: string; stage: string; latestRound: { id: string; seq: number; status: string } | null } | null };
export type GateDecision = { id: string; decision: string; targetStage: string; reason: string; selfApproved: boolean; decidedBy: { id: string; displayName: string }; at: string; exception: { riskAcceptedBy: string; scope: string; until?: string } | null; basis: unknown; basisSummary: { attemptCount: number; decisiveVerdict: string | null; evidenceLinkCount: number } };
export type Project = { id: string; modelId: string; model: { code: string; name: string; vendorName: string } | null; softwareId: string | null; softwareLabel?: string | null; stage: string; kind: string; owner: { id: string; displayName: string }; targetDate: string | null; nextStages: string[]; reopenTo: string | null; openRound: { id: string; seq: number } | null; gateTarget: string | null; gate: { latest: GateDecision | null }; version: string };
export type ProjectEvent = { id: string; kind: string; actor: { id: string; displayName: string }; at: string; before: unknown; after: unknown; reason: string | null };
export type Round = { validation?: string; gateDecision?: string | null; id: string; projectId: string; seq: number; stage: string; status: string; sampleCount?: number; sampleManifestDigest: string; specPin: { revisionId: string; changeSetDigest: string } | null; note: string | null; version: string; createdAt: string };
export type RoundDetail = Round & { sampleSet: { sourceOwner: string; files: { fileRef: string; order: number; sha256: string }[] }; gateDecisions: GateDecision[]; gateAvailability: { targetStage: string | null; projectVersion: string; reasons: string[]; decisions: Record<'approved' | 'rejected' | 'exception', { allowed: boolean; reasons: string[] }>; basis: unknown } };
export type RequestRow = { id: string; roundId: string; roundSeq: number; projectId: string; modelId: string; modelCode: string; softwareLabel: string | null; priority: number; immediate: boolean; state: string; attemptCount: number; maxAttempts: number; leaseExpiresAt: string | null; lastHeartbeatAt: string | null; requestedBy: { id: string; displayName: string }; createdAt: string; endedAt: string | null; latestVerdict: string | null; version: string };
/** The attempt's revision string resolved against the rule catalog by the server (#1496): null = the attempt carries none; only `matched` names a RuleSet. */
export type AttemptRuleSet = null | { state: 'matched'; ruleSetKey: string; revision: string; isCurrent: boolean; status: 'active' | 'retired' } | { state: 'ambiguous' | 'unknown' | 'no_catalog' | 'unavailable' };
export type Attempt = { id: string; attemptNo: number; outcome: string; workerActorId: string; verdict: string | null; manifestMatches: boolean; counts: Record<string, number>; requiredUnchecked: number; ruleCount: number; startedAt: string; endedAt: string | null; ruleSetRevision: string | null; inputManifestDigest: string; ruleSet?: AttemptRuleSet };
export type RequestDetail = RequestRow & { attempts: Attempt[]; cancelReason: string | null };
export type RuleResult = { id: string; ruleId: string; result: string; required: boolean; expected: string | null; observed: string | null; evidence: { fileRef: string; line: number; fileSha256: string; hasExcerpt: boolean }[]; hasExcerpt: boolean };
export type QueueStatus = { runWindow: { timezone: string; weekday: { fromHour: number; toHour: number }; weekendAllDay: boolean }; immediateLimit: number; serverAt: string; withinWindow: boolean };
export type Params = Record<string, unknown>;
export type ReadState<T> = { completedAt?: number | null; status: 'loading' | 'done' | 'error'; data: T | null; denied?: boolean; retry(): void };
export type WriteResult = { outcome: string; data: Record<string, unknown> | null; version: string | null; fieldErrors: readonly { path: readonly string[]; code: string }[]; retry?: () => Promise<WriteResult> };
export type Action = { pending: boolean; run(input: Params, options?: { expectedVersion?: string }): Promise<WriteResult> };
/** Host supplies Kernel query/action hooks, so native menu dispatch owns session, idempotency and invalidation. */
export type LifecycleApi = { useRead<T>(name: string, params: Params, enabled?: boolean): ReadState<T>; useAction(name: string): Action };
export type Column<T> = { id: string; header: string; size?: number; cell: (row: T) => ReactNode; sortable: false; exportValue?: (row: T) => string | number | boolean | null };
export type TableParts<T extends { id: string }> = { title: string; rows: T[]; columns: Column<T>[]; rowAction?: (row: T) => ReactNode; activeRowId?: string | undefined; pagination?: ReactNode; summary?: ReactNode; preferenceKey: string };
export type DrawerParts = { title: ReactNode; subtitle?: ReactNode; body: ReactNode; requestClose(): void; returnFocusRef?: RefObject<HTMLElement | null> };
export type Presentation = { table<T extends { id: string }>(parts: TableParts<T>): ReactNode; drawer(parts: DrawerParts): ReactNode; timeline(events: ProjectEvent[], projectId: string): ReactNode; trust(reasons: string[], completedAt?: number | null): ReactNode };
export type ScreenProps = { RuleSetLink?(p: { ruleSetKey: string; children: ReactNode }): ReactNode; state?: Record<string, string>; setState?(patch: Record<string, string | undefined>): void; api: LifecycleApi; ui: Presentation; canProject: boolean; canRound: boolean; actorId: string; selection?: string; setSelection(id: string | undefined): void };
