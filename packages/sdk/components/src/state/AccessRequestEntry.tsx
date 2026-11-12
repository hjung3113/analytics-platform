import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { IdSet, PermissionRequestTarget } from '@ap/contracts';
import { PlatformLink, useI18n, type AccessRequestSlot, type AccessRequestState } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { Button, StatusBadge } from '@ap/ui';
import { pageFallbackTarget } from './pageFocus';

/**
 * The app's request slot for a site or room place (ADR-0154 decisions 1 and 6): only when it is injected and the session
 * comes from a platform grant-table source (`requestableScopes` present). Null → the place renders as without a slot.
 */
export function useScopeAccessRequest(): AccessRequestSlot | null {
  const { slots, session } = useHostPlatform();
  return slots.accessRequest && session.requestableScopes !== undefined ? slots.accessRequest : null;
}

/**
 * The request target of a room place in a partially granted site: the first chosen room the user does not hold
 * (a deep-linked room, for example) → `site_room`; otherwise the site, and the dialog's candidates read lists the rooms.
 * Room names come only from the field's own values: the shell never derives one (ADR-0154 decision 5).
 */
export function scopeRequestTarget(site: string, roomNames: IdSet, grantedRooms: readonly string[]): PermissionRequestTarget {
  const room = (roomNames ?? []).find(name => !grantedRooms.includes(name));
  return room === undefined ? { kind: 'site', site } : { kind: 'site_room', site, room };
}

/**
 * One blocked place's request entry: the plain `권한 요청` button, or `요청 대기 중` plus the status link when the app's
 * server read says a request is pending. The dialog opens in place (no URL key, no Context change). `children` lets the
 * place word its message by the same state; it gets the action to place. `size="field"` is the quiet button under a field.
 * When the entry leaves while it, or its open dialog (portaled, so outside the entry's DOM), holds focus (the grant arrived and
 * the gate closed), focus goes to the main landmark (06 §26), after the dialog's own deferred close autofocus. When the dialog
 * closes and the opener has been replaced by the pending state, focus goes to the surviving status action.
 */
export function AccessRequestEntry({ slot, target, size = 'action', label, children }: {
  slot: AccessRequestSlot;
  target: PermissionRequestTarget;
  size?: 'action' | 'field';
  /** Accessible name of the request button when the place needs a more specific one than `권한 요청`. */
  label?: string;
  children?: (state: AccessRequestState, action: ReactNode) => ReactNode;
}) {
  const { url } = useHostPlatform();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const holder = useRef<HTMLSpanElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const changeOpen = useCallback((next: boolean) => {
    openRef.current = next;
    setOpen(next);
    // The dialog's close autofocus returns to the opener only while it is still in the page; a pending replacement is gone,
    // so settle on the surviving status action once that autofocus has run (two timers: it is scheduled the same way).
    if (!next) later(() => {
      if (!isFocusLost()) return;
      const target = holder.current?.querySelector<HTMLElement>('a[href], button:not(:disabled)') ?? pageFallbackTarget(anchor.current);
      target?.focus({ preventScroll: true });
    });
  }, []);
  useLayoutEffect(() => {
    const element = holder.current;
    const marker = anchor.current;
    return () => {
      if (!openRef.current && !element?.contains(document.activeElement)) return;
      // Resolved now: the entry is detached by the time the deferred focus runs.
      const target = pageFallbackTarget(marker ?? element);
      target?.focus({ preventScroll: true });
      if (openRef.current) later(() => { if (isFocusLost()) target?.focus({ preventScroll: true }); });
    };
  }, []);
  const { Pending, Dialog } = slot;
  return <>
    <Pending target={target}>{state => {
      const action = <span ref={holder} data-access-request={state.pending ? 'pending' : 'request'} className="contents">{state.pending
        ? <span className="inline-flex flex-wrap items-center gap-2">
          <StatusBadge tone="neutral">{t('accessRequestPending')}</StatusBadge>
          {state.statusHref !== null && <PlatformLink href={state.statusHref} className="text-xs font-medium text-accent-primary hover:underline">{t('accessRequestStatus')}</PlatformLink>}
        </span>
        : <Button type="button" size={size === 'field' ? 'toolbar' : 'sm'} variant={size === 'field' ? 'ghost' : 'secondary'} aria-label={label} onClick={() => changeOpen(true)}>{t('accessRequest')}</Button>}</span>;
      return children ? children(state, action) : action;
    }}</Pending>
    <span ref={anchor} className="contents"><Dialog target={target} returnTo={url} open={open} onOpenChange={changeOpen} /></span>
  </>;
}

const isFocusLost = () => document.activeElement === null || document.activeElement === document.body;
// After the dialog's own close autofocus, which Radix schedules in a timer from its unmount.
const later = (run: () => void) => { setTimeout(() => setTimeout(run)); };
