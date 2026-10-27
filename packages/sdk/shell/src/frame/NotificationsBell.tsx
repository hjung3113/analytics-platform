import { Bell } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { badgeCountText } from '@ap/components';
import { PlatformLink, useI18n, usePlatform, type NotificationsSlot } from '@ap/kernel';
import { Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger } from '@ap/ui';
import { MenuUnread } from './unread';

/**
 * Rail bell (ADR-0070 decision 4, 15 §3.2, #652). The shell draws the button, popover frame, pill and names; the slot gives the count
 * and the popover body. Focus: the dialog itself on open, the bell on Esc, the destination title after `모두 보기` (06 §26).
 */
export function NotificationsBell({ slot }: { slot: NotificationsSlot }) {
  const { registry, linkTo, location, pathname } = usePlatform();
  const { t, tx } = useI18n();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const openingPath = useRef<string | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const label = tx(registry.menuById(slot.menuId).label);
  // An arrival while open (Back/Forward, another link) closes the popover; the destination owns focus.
  useEffect(() => {
    if (open && pathname !== openingPath.current) setOpen(false);
  }, [open, pathname]);
  return <Popover open={open} onOpenChange={next => {
    if (next) openingPath.current = location.read()?.split('?')[0] ?? null;
    setOpen(next);
  }}>
    <slot.UnreadCount>{count => {
      const unread = count !== null && count > 0 ? count : 0;
      return <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild>
        <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={unread > 0 ? t('unreadNamed', { label, count: unread }) : label}
          className="relative grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          <Bell className="size-4" aria-hidden />
          {unread > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-pill bg-accent-danger px-1 text-micro font-semibold leading-4 text-text-on-accent">{badgeCountText(unread)}</span>}
        </button>
      </PopoverTrigger></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>;
    }}</slot.UnreadCount>
    <PopoverContent ref={content} side="right" align="end" padding="none" className="w-[400px]" aria-labelledby={titleId} tabIndex={-1}
      onOpenAutoFocus={event => {
        // The dialog itself, so Enter on the bell never lands on a row action.
        event.preventDefault();
        content.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={event => {
        // A destination page owns focus after navigation (06 §26); Radix would otherwise steal it back in a timeout.
        if ((location.read()?.split('?')[0] ?? null) !== openingPath.current) event.preventDefault();
      }}>
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <h2 id={titleId} className="text-sm font-semibold">{label}</h2>
        <MenuUnread menuId={slot.menuId}>{count => count !== null && count > 0 ? <span className="text-caption text-text-secondary">{t('unreadCount', { count })}</span> : null}</MenuUnread>
      </div>
      <div className="max-h-[min(480px,70vh)] overflow-y-auto"><slot.Recent /></div>
      <div className="border-t border-border-subtle px-4 py-2.5 text-sm">
        <PlatformLink via="sidebar" href={linkTo(slot.menuId)} onClick={() => setOpen(false)}
          className="rounded-md px-1.5 py-0.5 font-medium text-accent-primary hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{t('viewAll')}</PlatformLink>
      </div>
    </PopoverContent>
  </Popover>;
}
