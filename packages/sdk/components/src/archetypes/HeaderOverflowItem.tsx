import { useId, type ReactNode } from 'react';
import { Button } from '@ap/ui';

/**
 * One row of a page's `⋯` menu, the shape of `분석 보드에 열기…`. `allowed: false` keeps the row, disabled, with `reason` read as its description
 * (06 §22: a link the user may not follow is shown disabled with the reason, not hidden). The menu closes after `onSelect` runs.
 */
export function HeaderOverflowItem({ label, onSelect, allowed = true, reason }: { label: ReactNode; onSelect: () => void; allowed?: boolean; reason?: ReactNode }) {
  const reasonId = useId();
  const blocked = !allowed;
  return <div className="grid gap-0.5">
    <Button type="button" variant="ghost" size="sm" className="w-full justify-start" disabled={blocked} aria-describedby={blocked && reason ? reasonId : undefined} onClick={onSelect}>{label}</Button>
    {blocked && reason && <span id={reasonId} className="px-2 text-tiny text-text-muted">{reason}</span>}
  </div>;
}

