import { cn } from '@ap/ui';

/** `칸 N`: shown on every pane, empty ones too, and repeated by the Context bar (ADR-0051). Selection is the filled badge plus the pane's left bar — never colour alone. */
export function PaneBadge({ label, selected }: { label: string; selected: boolean }) {
  return <span data-pane-badge data-selected={selected} className={cn('inline-flex h-5 shrink-0 items-center rounded-xs px-1.5 text-caption font-semibold tabular',
    selected ? 'bg-accent-primary text-text-on-accent' : 'bg-surface-sunken text-text-secondary')}>{label}</span>;
}
