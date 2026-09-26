import type { ReactNode } from 'react';
import { cn } from '../ui/utils/cn';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const tones: Record<Tone, string> = {
  success: 'bg-accent-success-soft text-text-success',
  warning: 'bg-accent-warn-soft text-text-warning',
  danger: 'bg-accent-danger-soft text-text-danger',
  neutral: 'bg-accent-neutral-soft text-text-secondary',
  info: 'bg-accent-primary-soft text-text-info',
};
const dots: Record<Tone, string> = {
  success: 'bg-accent-success', warning: 'bg-accent-warn', danger: 'bg-accent-danger', neutral: 'bg-accent-neutral', info: 'bg-accent-primary',
};

/** The only four-plus-info semantic badge vocabulary (DESIGN.md Status & Badges); never invent per-screen colors. */
export function StatusBadge({ tone, children, dot = false, className }: { tone: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return <span className={cn('t-badge inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2 py-0.5', tones[tone], className)}>
    {dot && <span aria-hidden className={cn('size-1.5 rounded-pill', dots[tone])} />}
    {children}
  </span>;
}

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-pill', dots[tone], className)} />;
}
