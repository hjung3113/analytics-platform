import { Loader2 } from 'lucide-react';

/** A normal content row: never overlaps the result or sticky/workspace headers. */
export function QueryRefreshNotice({ label }: { label: string }) {
  // Leave the archetype collapse button clear without inspecting or positioning around controls.
  return <div role="status" aria-label={label} className="pointer-events-none m-0 flex h-6 w-full min-w-0 shrink-0 items-center gap-1.5 overflow-hidden bg-surface-sunken px-3 pr-12 text-xs font-medium leading-4 text-text-secondary">
    <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden /><span className="truncate">{label}</span>
  </div>;
}
