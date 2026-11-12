import { formatCompactDateTime } from '../../lib/format/datetime';
import type { ReactNode } from 'react';
import { AlertTriangle, Check, Clock3, Minus, UserRound, X } from 'lucide-react';
import { Button, Callout, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { GATE_LABEL, REASON_COPY, STAGES, STAGE_LABEL, STATE_LABEL, type ReadState, type WriteResult } from './contracts';

export function StateBadge({ value }: { value: string | null | undefined }) {
  const good = value === 'pass' || value === 'PASS' || value === 'succeeded';
  const bad = value === 'fail' || value === 'FAIL' || value === 'failed';
  const warning = ['incomplete', 'ERROR', 'WARN', 'expired', 'lease_expired'].includes(value ?? '');
  const Icon = good ? Check : bad ? X : warning ? AlertTriangle : value === 'claimed' || value === 'queued' || value === 'running' ? Clock3 : Minus;
  return <StatusBadge tone={good ? 'success' : bad ? 'danger' : warning ? 'warning' : 'neutral'}><Icon className="size-3" aria-hidden />{STATE_LABEL[value ?? 'none'] ?? value ?? '판정 없음'}</StatusBadge>;
}
export function GateBadge({ decision }: { decision?: string | null | undefined }) { return <StatusBadge tone="neutral" variant="outline"><UserRound className="size-3" aria-hidden />{GATE_LABEL[decision ?? 'none'] ?? '미결정'}</StatusBadge>; }
export function StageBadge({ stage }: { stage: string }) { const index = STAGES.indexOf(stage as typeof STAGES[number]); return stage === 'cancelled' ? <StatusBadge tone="neutral"><X className="size-3" aria-hidden />취소</StatusBadge> : <span className="text-sm">{STAGE_LABEL[stage]} <span className="text-xs text-text-muted">· {index + 1}/5</span></span>; }
export function StageStepper({ stage }: { stage: string }) { return <ol aria-label="개발 단계" className="flex items-center gap-3 py-4">{STAGES.map((s, i) => <li key={s} aria-current={stage === s ? 'step' : undefined} className="flex flex-1 items-center gap-2 text-xs"><span className={stage === s ? 'flex size-6 shrink-0 items-center justify-center rounded-full border border-accent-primary text-accent-primary' : 'flex size-6 shrink-0 items-center justify-center rounded-full border border-border-subtle text-text-muted'}>{STAGES.indexOf(stage as typeof STAGES[number]) > i ? <><Check className="size-3" aria-hidden /><span className="sr-only">완료</span></> : i + 1}</span><span className={stage === s ? 'font-semibold text-accent-primary' : 'text-text-secondary'}>{STAGE_LABEL[s]}</span>{i < 4 ? <span className="h-px flex-1 bg-border-subtle" /> : null}</li>)}</ol>; }
export function ReadView<T>({ query, empty, children }: { query: ReadState<T>; empty?: string; children(data: T): ReactNode }) {
  if (query.status === 'loading') return <p role="status" className="text-sm text-text-secondary">불러오는 중…</p>;
  if (query.status === 'error') return <Callout tone="red" title={query.denied ? '읽기 권한이 없습니다. 관리자에게 요청해 주세요.' : '데이터를 불러오지 못했습니다.'} action={<Button variant="secondary" size="toolbar" onClick={query.retry}>다시 시도</Button>}>{null}</Callout>;
  if (!query.data) return <p role="status" className="text-sm text-text-secondary">{empty ?? '항목을 찾을 수 없거나 읽을 수 없습니다.'}</p>;
  return children(query.data);
}
export function Choice({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange(value: string): void; options: readonly (readonly [string, string])[]; disabled?: boolean }) { return <div className="grid min-w-0 gap-2"><span className="text-xs text-text-secondary">{label}</span><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}</SelectContent></Select></div>; }
export function Pager({ page, total, size = 25, onChange }: { page: number; total: number; size?: number; onChange(page: number): void }) { return <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-xs"><span>{total}건 · {page + 1}페이지</span><Button variant="secondary" size="toolbar" disabled={page === 0} onClick={() => onChange(page - 1)}>이전</Button><Button variant="secondary" size="toolbar" disabled={(page + 1) * size >= total} onClick={() => onChange(page + 1)}>다음</Button></div>; }
export function WriteError({ result, onRetry, retryDisabled = false }: { result: WriteResult | null; onRetry?: () => void; /** A request of the same action is in flight; the retry waits for it. */ retryDisabled?: boolean }) {
  if (!result || result.outcome === 'ok') return null;
  const message = result.outcome === 'conflict' ? '다른 변경이 먼저 저장되었습니다. 최신 내용을 확인한 뒤 다시 기록해 주세요.' : result.outcome === 'forbidden' ? '이 동작의 권한이 없습니다. 관리자에게 요청해 주세요.' : result.outcome === 'unknown' ? '처리 결과를 확인하지 못했습니다. 같은 요청으로 결과를 확인해 주세요.' : '저장하지 못했습니다. 입력값을 확인해 주세요.';
  return <div role="alert" className="space-y-2 text-sm text-text-danger-label"><p>{message}</p>{result.fieldErrors.map(f => <p key={f.path.join('.')}>{{ modelId: '모델', softwareId: 'SW', ownerActorId: '담당', targetDate: '목표일', reason: '사유', sourceOwner: '원본 소유자', priority: '우선순위', roundId: 'Round', sampleSet: '샘플 목록', exception: '예외', decision: '결정', title: '제목', body: '내용', expected: '기대', actual: '실제', repro: '재현 절차', issueId: '검증 항목', occurrenceId: '연결', refs: '근거 위치', firstRoundId: 'Round', attemptId: '시도', ruleResultId: '규칙 결과' }[f.path[0] ?? ''] ?? '입력값'}: {REASON_COPY[f.code] ?? ({ required: '필수 항목입니다.', malformed: '형식을 확인해 주세요.', not_found: '대상을 찾을 수 없습니다.', inactive: '비활성 대상입니다.', too_long: '입력값이 너무 깁니다.', illegal_transition: '현재 상태에서는 변경할 수 없습니다.', open_project_exists: '이미 열린 개발 건이 있습니다.', open_round_exists: '이미 열린 Round가 있습니다.', round_closed: '종료된 Round에는 요청을 등록할 수 없습니다.', 'queue.immediate_limit': '즉시 요청 한도에 도달했습니다.', secret_detected: '비밀 정보로 보이는 값은 저장할 수 없습니다.' }[f.code] ?? '현재 상태와 입력값을 확인해 주세요.')}</p>)}{result.retry && onRetry ? <Button type="button" variant="secondary" size="toolbar" disabled={retryDisabled} onClick={onRetry}>같은 요청 다시 확인</Button> : null}</div>;
}
export const time = (value: string | null | undefined) => value ? formatCompactDateTime(value) : '없음';
export function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="grid min-w-0 grid-cols-1 gap-3"><h2 className="text-sm font-semibold">{title}</h2>{children}</section>; }


/** Kernel rejects delivery on unmount/session change; that is supersession, not a failed server write. */
export function writeFailure(cause: unknown): WriteResult | null {
  return typeof cause === 'object' && cause !== null && 'name' in cause && cause.name === 'AbortError' ? null : { outcome: 'error', data: null, version: null, fieldErrors: [] };
}

/** Compact disclosure for filters and read-only metadata, using the shared overlay/focus lifecycle. */
export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return <Popover><PopoverTrigger asChild><Button variant="secondary" size="toolbar" className="min-w-0 max-w-full"><span className="min-w-0 truncate">{label}</span></Button></PopoverTrigger><PopoverContent align="start" className="max-h-96 overflow-y-auto"><div className="grid min-w-0 grid-cols-1 gap-3 break-keep">{children}</div></PopoverContent></Popover>;
}
