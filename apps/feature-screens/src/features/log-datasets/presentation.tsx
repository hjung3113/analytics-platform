import type { ReactNode } from 'react';
import { formatDateTime } from '../../lib/format/datetime';
import { Button, Callout, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge } from '@ap/ui';
import type { ReadState, Stale, WriteResult } from './contracts';

export const TAG_LABEL: Record<string, string> = { normal: '정상', exception: '예외', boundary: '경계', regression: '회귀', file_boundary: '파일 경계', carryover: 'carryover', partial_support: '일부 Rule 미지원' };
const LABEL: Record<string, string> = { available: '원본 확인됨', unavailable: '원본 부재 · 열람 불가', hash_mismatch: '파일 해시 불일치', unverified: '원본 확인 불가', hash_unknown: '해시 확인 불가', match: '원본 확인됨', absent: '원본 부재', permission_denied: '열람 권한 없음', unsupported: '미지원', error: '확인 오류', queued: '대기', claimed: '시도 중', running: '시도 중', succeeded: '완료', failed: '실패', cancelled: '취소', expired: '만료', approved: '승인', draft: '초안', superseded: '이전 기준', active: '사용 중', archived: '보관', pass: '통과', fail: '실패', incomplete: '불완전' };
export const STALE_LABEL: Record<string, string> = { file_hash_changed: '파일 해시 변경', file_unavailable: '원본 열람 불가', spec_pin_changed: '명세 고정값 변경', files: '원본', spec_pin: '명세 고정값', rule_set: 'RuleSet', parser: 'Parser', engine_profile: '실행 프로파일' };
export const REVIEW_LABEL: Record<string, string> = { false_positive: 'false_positive · 오탐', false_negative: 'false_negative · 미탐', accepted_change: 'accepted_change · 변경 수용', needs_review: 'needs_review · 검토 필요' };
export const stateLabel = (value: string | null | undefined) => LABEL[value ?? ''] ?? value ?? '결과 없음';
export function DatasetBadge({ value }: { value: string | null | undefined }) {
  const success = ['PASS', 'fixed', 'available', 'match', 'pass'].includes(value ?? '');
  const danger = ['FAIL', 'regressed', 'failed', 'fail'].includes(value ?? '');
  const warning = ['WARN', 'hash_mismatch', 'expired', 'incomplete', 'ERROR'].includes(value ?? '');
  return <StatusBadge tone={success ? 'success' : danger ? 'danger' : warning ? 'warning' : 'neutral'}>{stateLabel(value)}</StatusBadge>;
}
export function StaleBadge({ stale }: { stale: Stale | null | undefined }) {
  if (!stale) return null;
  return <div className="flex flex-wrap items-center gap-2 text-xs break-keep"><StatusBadge tone={stale.state === 'stale' ? 'warning' : 'neutral'}>{stale.state === 'stale' ? '기준 낡음' : stale.state === 'unknown' ? '기준 확인 불가' : '기준 확인됨'}</StatusBadge>{stale.reasons.map(r => <span key={r}>{STALE_LABEL[r] ?? r}</span>)}{stale.unknown.length ? <span className="text-text-muted">확인 불가: {stale.unknown.map(r => STALE_LABEL[r] ?? r).join(' · ')}</span> : null}</div>;
}
export function ReadView<T>({ query, children, loading }: { query: ReadState<T>; children(data: T): ReactNode; loading?: ReactNode }) {
  if (query.status === 'loading') return loading ?? <p role="status" className="text-sm text-text-secondary">불러오는 중…</p>;
  if (query.status === 'error') return <Callout tone="red" title={query.denied ? '읽기 권한이 없습니다. 관리자에게 요청해 주세요.' : '데이터를 불러오지 못했습니다.'} action={<Button variant="secondary" size="toolbar" onClick={query.retry}>다시 시도</Button>}>{null}</Callout>;
  if (!query.data) return <p role="status" className="text-sm text-text-secondary">항목을 찾을 수 없거나 읽을 수 없습니다.</p>;
  return children(query.data);
}
export function Choice({ label, value, onChange, options, disabled = false, fullWidth = false, visibleLabel = false, filter = false }: { label: string; value: string; onChange(value: string): void; options: readonly (readonly [string, string])[]; disabled?: boolean; fullWidth?: boolean; visibleLabel?: boolean; filter?: boolean }) {
  return <div className={fullWidth ? 'w-full' : filter ? 'w-28 shrink-0' : 'w-48 max-w-full'}>{visibleLabel ? <span className="mb-2 block text-sm">{label}</span> : null}<Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger density="compact" className="text-left" aria-label={label}><SelectValue placeholder={label} /></SelectTrigger><SelectContent>{options.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>;
}
export function Pager({ page, total, size = 25, onChange, showCount = true }: { page: number; total: number; size?: number; onChange(page: number): void; showCount?: boolean }) {
  return <div className="flex items-center justify-end gap-2 text-xs">{showCount ? <span>{total}건 · {page + 1}페이지</span> : null}<Button variant="secondary" size="toolbar" disabled={page === 0} onClick={() => onChange(page - 1)}>이전</Button><Button variant="secondary" size="toolbar" disabled={(page + 1) * size >= total} onClick={() => onChange(page + 1)}>다음</Button></div>;
}
// eslint-disable-next-line shadcn/no-unknown-classes -- t-card-title is supplied by the platform host through @ap/ui/styles.css.
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <section aria-label={title} className="min-w-0 space-y-3 rounded-lg border border-border-subtle bg-surface-card p-3"><h2 className="t-card-title">{title}</h2>{children}</section>; }
export function WriteError({ result, onRetry }: { result: WriteResult | null; onRetry(): void }) {
  if (!result || result.outcome === 'ok') return null;
  const limit = result.fieldErrors.some(f => f.code === 'suite.run_limit');
  return <div role="alert" className="space-y-2 text-sm text-text-danger-label"><p>{limit ? '동시 실행 한도 3건에 도달했습니다. 진행 중인 요청이 끝난 뒤 다시 요청하세요.' : result.outcome === 'conflict' ? '다른 변경이 먼저 저장되었습니다. 최신 내용을 확인한 뒤 다시 기록해 주세요.' : result.outcome === 'forbidden' ? '이 동작의 권한이 없습니다. 관리자에게 요청해 주세요.' : result.outcome === 'unknown' ? '처리 결과를 확인하지 못했습니다. 같은 요청으로 결과를 확인해 주세요.' : '요청에 실패했습니다. 입력값과 대상의 현재 상태를 확인해 주세요.'}</p>{result.fieldErrors.filter(f => f.code !== 'suite.run_limit').map(f => <p key={f.path.join('.')}>{f.path.join('.')}: {f.code}</p>)}{result.retry ? <Button variant="secondary" size="toolbar" onClick={onRetry}>같은 요청 다시 확인</Button> : null}</div>;
}
export function writeFailure(cause: unknown): WriteResult | null { return typeof cause === 'object' && cause !== null && 'name' in cause && cause.name === 'AbortError' ? null : { outcome: 'error', data: null, version: null, fieldErrors: [] }; }
export const time = (value: string | null | undefined) => value ? formatDateTime(value, '2-digit') : '없음';

export const pageSummary = (total: number, page: number) => `${total}건 · ${page + 1}/${Math.max(1, Math.ceil(total / 25))} 페이지`;
