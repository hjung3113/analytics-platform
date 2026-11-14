import { Link2, MoreVertical } from 'lucide-react';
import type * as React from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../components/shadcn/dropdown-menu.js';
import { cn } from '../utils/cn.js';
import { copyText } from '../utils/copyText.js';
import type { DetailPanelKind } from './DetailPanelHeader.js';

export interface DetailPanelHeaderActionsProps {
  /** @deprecated Unused; removed next SDK minor. */
  entityKind?: DetailPanelKind;
  /** @deprecated Unused; removed next SDK minor. */
  entityId?: string;
  copyUrl: string;
  extraMore?: React.ReactNode;
  /** Where the copy result is reported; default is the sonner toast. A host without a sonner Toaster passes its own notice (06 §15). */
  notify?: { success: (message: string) => void; error: (message: string) => void };
}

const iconButtonCls = cn(
  'flex items-center justify-center rounded p-1',
  'text-text-muted hover:text-text-primary hover:bg-surface-canvas',
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
);

export function DetailPanelHeaderActions({
  copyUrl,
  extraMore,
  notify = toast,
}: DetailPanelHeaderActionsProps) {
  async function handleCopyLink() {
    // Callers pass either an absolute URL or a route path; resolving against
    // the current document makes both produce something pasteable.
    const absolute =
      typeof window !== 'undefined' ? new URL(copyUrl, window.location.href).href : copyUrl;

    // One success rule for every link copy (06 §15, #673): feature-detected path, success only when the text landed.
    if (await copyText(absolute)) {
      notify.success('링크가 복사되었습니다.');
    } else {
      // Saying "복사되었습니다" after copying nothing is worse than failing:
      // the actor pastes stale content and never learns why.
      notify.error('링크를 복사하지 못했습니다. 주소창의 URL을 직접 복사해 주세요.');
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Copy link */}
      <button
        type="button"
        aria-label="링크 복사"
        title="링크 복사"
        className={iconButtonCls}
        onClick={() => {
          void handleCopyLink();
        }}
      >
        <Link2 size={16} />
      </button>

      {/* Kebab dropdown */}
      {extraMore != null && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="더 보기" title="더 보기" className={iconButtonCls}>
            <MoreVertical size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {extraMore}
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>
  );
}
