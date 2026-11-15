import { Info } from 'lucide-react';
import { Callout } from '@ap/ui';

/** All load or data notices in one compact, wrapping status line; placements own their spacing. */
export function NoticeList({ notices, className }: { notices: readonly string[]; className?: string }) {
  if (notices.length === 0) return null;
  return (
    <Callout tone="blue" size="compact" icon={<Info className="size-3.5" aria-hidden />} className={className}>
      <span role="status">{notices.join(' · ')}</span>
    </Callout>
  );
}
