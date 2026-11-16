import { Loader2 } from 'lucide-react';

/**
 * The refresh band (#2381): laid over the result's bottom edge only while it refreshes, so it never takes or reserves
 * layout space and the result, chart size and toolbars stay put. Non-interactive: clicks reach the result below.
 */
export function QueryRefreshNotice({ label }: { label: string }) {
  return <div role="status" aria-label={label} data-query-refresh-band className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] m-0 flex h-6 min-w-0 items-center gap-1.5 overflow-hidden border-t border-border-subtle bg-surface-sunken px-3 text-xs font-medium leading-4 text-text-secondary">
    <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden /><span className="truncate">{label}</span>
  </div>;
}
