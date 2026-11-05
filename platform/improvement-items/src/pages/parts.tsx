import type { ReactNode } from 'react';
import { StatusBadge, Label } from '@ap/ui';
import type { Status } from '../endpoints';
import { useCopy } from '../copy';
export function ItemStatus({ status }: { status: Status }) {
  const c = useCopy();
  return <StatusBadge tone={status === 'verified' ? 'success' : status === 'done' ? 'warning' : status === 'in_progress' ? 'info' : 'neutral'}>{c.statuses[status]}</StatusBadge>;
}
export function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}{error && <p id={`${id}-error`} role="alert" className="text-xs text-text-danger-label">{error}</p>}</div>;
}
export function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="space-y-3 border-t border-border-subtle py-4"><h2 className="text-sm font-semibold">{title}</h2>{children}</section>; }
