import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../ui/utils/cn';

export type Delta = { value: string; direction: 'up' | 'down'; /** Whether this direction is good for the metric. */ good: boolean };

/** stat-card: icon chip + label + one primary number + delta + caption. One metric per tile. */
export function StatCard({ icon: Icon, label, value, unit, delta, caption, chip = 'blue', onClick, active, footnote, secondary }: {
  icon: LucideIcon; label: ReactNode; value: ReactNode; unit?: ReactNode; delta?: Delta; caption?: ReactNode;
  chip?: 'blue' | 'teal' | 'purple' | 'amber'; onClick?: () => void; active?: boolean; footnote?: ReactNode;
  /** Paired secondary number in the same tile (e.g. P95 beside P50), rendered at Secondary KPI scale. */
  secondary?: ReactNode;
}) {
  const chipClass = { blue: 'bg-icon-blue-soft text-accent-primary', teal: 'bg-icon-teal-soft text-cat-teal', purple: 'bg-cat-purple/10 text-cat-purple', amber: 'bg-accent-warn-soft text-cat-amber' }[chip];
  const Tag = onClick ? 'button' : 'div';
  return <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? !!active : undefined}
    className={cn('flex min-h-[100px] w-full items-start gap-3 rounded-lg border bg-surface-card p-4 text-left',
      active ? 'border-accent-primary ring-1 ring-accent-primary' : 'border-border-subtle',
      onClick && 'transition-colors hover:border-border-strong')}>
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-md', chipClass)}><Icon className="size-6" strokeWidth={1.75} aria-hidden /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-[13px] font-medium text-text-secondary">{label}</span>
      <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="t-stat">{value}</span>
        {secondary && <span className="t-stat-2 text-text-secondary">{secondary}</span>}
        {unit && <span className="text-[13px] font-medium text-text-muted">{unit}</span>}
        {delta && <span className={cn('t-delta inline-flex items-center', delta.good ? 'text-text-success' : 'text-text-danger')}>
          {delta.direction === 'up' ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}{delta.value}
        </span>}
      </span>
      {caption && <span className="t-caption mt-1 block text-text-muted tabular">{caption}</span>}
      {footnote && <span className="t-caption mt-0.5 block text-text-muted">{footnote}</span>}
    </span>
  </Tag>;
}
