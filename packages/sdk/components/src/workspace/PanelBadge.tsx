import { TriangleAlert } from 'lucide-react';
import { StatusBadge } from '@ap/ui';

export const BADGE_COUNT_MAX = 99;

/** `99+` above the cap. */
export const badgeCountText = (count: number) => (count > BADGE_COUNT_MAX ? `${BADGE_COUNT_MAX}+` : String(count));

/**
 * A panel's tab badge at tab scale: the `StatusBadge` vocabulary, never colour alone (`warning` carries the triangle). It is hidden from the
 * accessibility tree so the tab's name stays the panel title; the spoken text is the tab's `aria-description`. Never marked
 * `data-dock-tab-shrinkable`, so a compact background tab keeps it.
 */
export function PanelBadge({ count, tone = 'neutral', description }: { count?: number; tone?: 'neutral' | 'warning'; description: string }) {
  const warning = tone === 'warning';
  return <span data-panel-badge={tone} aria-hidden title={description} className="ml-1.5 inline-flex shrink-0 tabular">
    <StatusBadge tone={tone} dot={!warning && count === undefined}>
      {warning && <TriangleAlert className="size-3" aria-hidden />}
      {count !== undefined && <span>{badgeCountText(count)}</span>}
    </StatusBadge>
  </span>;
}
