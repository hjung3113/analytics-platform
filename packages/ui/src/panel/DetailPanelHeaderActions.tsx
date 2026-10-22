import { Link2, MoreVertical } from 'lucide-react';
import type * as React from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/shadcn/dropdown-menu.js';
import { cn } from '../utils/cn.js';
import { copyText } from '../utils/copyText.js';
import type { DetailPanelKind } from './DetailPanelHeader.js';

export interface DetailPanelHeaderActionsProps {
  entityKind: DetailPanelKind;
  entityId: string;
  copyUrl: string;
  extraMore?: React.ReactNode;
}

const DEFERRED_ITEMS: Array<{ label: string; disabledReason: string }> = [
  { label: '읽음 표시', disabledReason: '이후 제공 예정입니다' },
  { label: '스누즈', disabledReason: '이후 제공 예정입니다' },
  { label: '구독', disabledReason: '이후 제공 예정입니다' },
  { label: '보관', disabledReason: '이후 제공 예정입니다' },
];

const iconButtonCls = cn(
  'flex items-center justify-center rounded p-1',
  'text-text-muted hover:text-text-primary hover:bg-surface-canvas',
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
);

export function DetailPanelHeaderActions({
  entityKind: _entityKind,
  entityId: _entityId,
  copyUrl,
  extraMore,
}: DetailPanelHeaderActionsProps) {
  async function handleCopyLink() {
    // Callers pass either an absolute URL or a route path; resolving against
    // the current document makes both produce something pasteable.
    const absolute =
      typeof window !== 'undefined' ? new URL(copyUrl, window.location.href).href : copyUrl;

    // One success rule for every link copy (06 §15, #673): feature-detected path, success only when the text landed.
    if (await copyText(absolute)) {
      toast.success('링크가 복사되었습니다.');
    } else {
      // Saying "복사되었습니다" after copying nothing is worse than failing:
      // the actor pastes stale content and never learns why.
      toast.error('링크를 복사하지 못했습니다. 주소창의 URL을 직접 복사해 주세요.');
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="더 보기" title="더 보기" className={iconButtonCls}>
            <MoreVertical size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {extraMore}
          {DEFERRED_ITEMS.map((item) => (
            <DropdownMenuItem key={item.label} disabled title={item.disabledReason}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
