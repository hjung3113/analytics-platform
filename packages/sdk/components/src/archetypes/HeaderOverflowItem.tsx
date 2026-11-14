import { useId, type ReactNode } from 'react';
import { Button } from '@ap/ui';

/**
 * One row of a page's `⋯` menu, the shape of `분석 보드에 열기…`. `allowed: false` keeps the row, disabled, with `reason` read as its description
 * (06 §22: a link the user may not follow is shown disabled with the reason, not hidden). The menu closes after `onSelect` runs.
 * A blocked row is `aria-disabled`, not native `disabled`, so Tab still reaches it and its reason is read (DESIGN.md accessibility
 * exception, #2186); a click or Enter on it does nothing and leaves the menu open.
 */
export function HeaderOverflowItem({ label, onSelect, allowed = true, reason }: { label: ReactNode; onSelect: () => void; allowed?: boolean; reason?: ReactNode }) {
  const reasonId = useId();
  const blocked = !allowed;
  return <div className="grid gap-0.5">
    <Button type="button" variant="ghost" size="sm" className="w-full justify-start aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      aria-disabled={blocked || undefined} aria-describedby={blocked && reason ? reasonId : undefined}
      onClick={event => {
        // The menu closes on any click that bubbles to it; a blocked row must not act or close it.
        if (blocked) { event.preventDefault(); event.stopPropagation(); return; }
        onSelect();
      }}>{label}</Button>
    {blocked && reason && <span id={reasonId} className="px-2 text-tiny text-text-muted">{reason}</span>}
  </div>;
}
