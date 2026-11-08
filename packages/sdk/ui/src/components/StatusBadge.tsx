import type { ReactNode } from 'react';
import { cn } from '../utils/cn.js';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const tones: Record<Tone, string> = {
  success: 'bg-accent-success-soft text-text-success-label',
  warning: 'bg-accent-warn-soft text-text-warning-label',
  danger: 'bg-accent-danger-soft text-text-danger-label',
  neutral: 'bg-accent-neutral-soft text-text-secondary',
  info: 'bg-accent-primary-soft text-text-info-label',
};
const dots: Record<Tone, string> = {
  success: 'bg-accent-success', warning: 'bg-accent-warn', danger: 'bg-accent-danger', neutral: 'bg-accent-neutral', info: 'bg-accent-primary',
};
const outlineTones: Record<Tone, string> = {
  success: 'text-text-success-label', warning: 'text-text-warning-label', danger: 'text-text-danger-label', neutral: 'text-text-secondary', info: 'text-text-info-label',
};

/** The only four-plus-info semantic badge vocabulary (DESIGN.md Status & Badges); never invent per-screen colors. */
export function StatusBadge({ tone, children, dot = false, variant = 'soft', className }: { tone: Tone; children: ReactNode; dot?: boolean; variant?: 'soft' | 'outline'; className?: string }) {
  return <span className={cn('t-badge inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2 py-0.5', variant === 'outline' ? cn('border border-border-subtle', outlineTones[tone]) : tones[tone], className)}>
    {dot && <span aria-hidden className={cn('size-1.5 rounded-pill', dots[tone])} />}
    {children}
  </span>;
}

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-pill', dots[tone], className)} />;
}
