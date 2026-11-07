import { AlertTriangle, Check, HelpCircle, Inbox, Minus } from 'lucide-react';
import { StateMessage } from '@ap/components';
import { StatusBadge, type Tone } from '@ap/ui';
import { COVERAGE_LABEL, SUPPORT_LABEL, REASON_COPY, type CoverageReason, type CoverageState, type Scope, type Support } from '../endpoints';

const SUPPORT_TONE: Record<Support, Tone> = { supported: 'success', partial: 'warning', unsupported: 'danger', unknown: 'neutral' };
export function SupportBadge({ value }: { value: Support }) { return <StatusBadge tone={SUPPORT_TONE[value]}>{SUPPORT_LABEL[value]}</StatusBadge>; }
export function CoverageBadge({ value }: { value: CoverageState }) {
  const Icon = value === 'covered' ? Check : value === 'partial' ? Minus : value === 'unknown' ? HelpCircle : AlertTriangle;
  return <StatusBadge tone={value === 'covered' ? 'success' : value === 'unsupported' ? 'danger' : value === 'unknown' ? 'neutral' : 'warning'}><Icon className="size-3" aria-hidden />{COVERAGE_LABEL[value]}</StatusBadge>;
}
export function EmptyNote({ title, body }: { title: string; body?: string }) {
  return <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={title} body={body} />;
}
export function ReasonState({ reason }: { reason: CoverageReason }) { return <EmptyNote title="계산할 수 없음" body={REASON_COPY[reason]} />; }
export function scopeSummary(scope: Scope | null): string {
  if (!scope) return 'Validator가 지원 범위를 보고하지 않았습니다';
  return Object.entries(scope).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join(' · ') || '지원 범위 선언 없음';
}
/** Code-like originals must wrap even without whitespace; prose keeps Korean word boundaries on the enclosing screen. */
export function Original({ children }: { children: React.ReactNode }) { return <span className="t-mono block min-w-0 max-w-full whitespace-normal break-all">{children}</span>; }
export function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="grid min-w-0 gap-2"><h3 className="text-xs font-semibold text-text-secondary">{title}</h3>{children}</section>; }
