import { Loader2 } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { IdSet, PermissionRequestTarget } from '@ap/contracts';
import { PlatformLink, useI18n, type AccessRequestSlot, type AccessRequestState } from '@ap/kernel';
import { useHostPlatform, useHostPlatformOptional } from '@ap/kernel/host';
import { Button, StatusBadge } from '@ap/ui';
import { pageFallbackTarget } from './pageFocus';
import { ACCESS_REQUEST_READ_KEYS, useAccessRequestState } from './useAccessRequestState';

/**
 * The app's request slot for a site or room place (ADR-0154 decisions 1 and 6): only when it is injected and the session
 * comes from a platform grant-table source (`requestableScopes` present). Null → the place renders as without a slot.
 */
export function useScopeAccessRequest(): AccessRequestSlot | null {
  const host = useHostPlatformOptional();
  return host?.session.requestableScopes === undefined ? null : host.slots.accessRequest ?? null;
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
 * One blocked place's request entry: the plain `권한 요청` button, or `검토 중` plus the status link when the app's
 * server read says a request is pending. The dialog opens in place (no URL key, no Context change). `children` lets the
 * place word its message by the same state; it gets the action to place. `size="field"` is the quiet button under a field.
 * When the slot supplies a request URL, the action opens that form instead.
 * When the entry leaves while it, or its open dialog (portaled, so outside the entry's DOM), holds focus (the grant arrived and
 * the gate closed), focus goes to the main landmark (06 §26), after the dialog's own deferred close autofocus. When the dialog
 * closes and the opener has been replaced by the pending state, focus goes to the surviving status action.
 */
export function AccessRequestEntry({ slot, target, size = 'action', label, emphasis, exactTarget, renderPendingAction, children }: {
  slot: AccessRequestSlot;
  target: PermissionRequestTarget;
  size?: 'action' | 'field';
  emphasis?: 'primary';
  exactTarget?: boolean;
  /** Accessible name of the request button when the place needs a more specific one than `권한 요청`. */
  label?: string;
  /** Replaces the pending badge and link when the containing card presents the status itself. */
  renderPendingAction?: (statusHref: string | null) => ReactNode;
  children?: (state: AccessRequestState, action: ReactNode) => ReactNode;
}) {
  const { url } = useHostPlatform();
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const holder = useRef<HTMLSpanElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  // Whether focus is inside this entry's own dialog. The dialog is portaled, but React focus events bubble through the
  // React tree, so the anchor below sees them; another dialog on the page never sets it.
  const dialogFocus = useRef(false);
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
      // Owned only while focus is really the entry's: on its action, or in its open (portaled) dialog. An open dialog alone is
      // not ownership: focus the user moved elsewhere stays where it is.
      const inDialog = openRef.current && (dialogFocus.current || isFocusLost());
      if (!element?.contains(document.activeElement) && !inDialog) return;
      // Resolved now: the entry is detached by the time the deferred focus runs.
      const target = pageFallbackTarget(marker ?? element);
      target?.focus({ preventScroll: true });
      if (inDialog) later(() => { if (isFocusLost()) target?.focus({ preventScroll: true }); });
    };
  }, []);
  const { Pending, Dialog } = slot;
  return <>
    <Pending target={target}>{state => <EntryView key={JSON.stringify(target)} state={state} size={size} label={label} emphasis={emphasis} holder={holder} anchor={anchor}
      onRequest={() => changeOpen(true)} renderPendingAction={renderPendingAction}>{children}</EntryView>}</Pending>
    <span ref={anchor} className="contents" onFocus={() => { dialogFocus.current = true; }} onBlur={() => { dialogFocus.current = false; }}><Dialog exactTarget={exactTarget} target={target} returnTo={url} open={open} onOpenChange={changeOpen} /></span>
  </>;
}

const isFocusLost = () => document.activeElement === null || document.activeElement === document.body;
// After the dialog's own close autofocus, which Radix schedules in a timer from its unmount.
const later = (run: () => void) => { setTimeout(() => setTimeout(run)); };

/** The body sentence of a place that words its message by the request state (#1933). `full` is the full-screen place, which also says a repeated request is not filed twice. */
export function accessRequestBody(t: ReturnType<typeof useI18n>['t'], state: AccessRequestState, full: boolean): string {
  if (state.pending) return t('accessRequestPendingBody');
  if (state.read === 'checking') return t(ACCESS_REQUEST_READ_KEYS.checking);
  if (state.read === 'error') return t(full ? 'accessRequestReadErrorDup' : ACCESS_REQUEST_READ_KEYS.error);
  return t('accessRequestBody');
}

/**
 * One state of the entry. Checking keeps the request button in its place, busy and inert (focus stays, no line moves); an error offers
 * 「다시 시도」 beside the request button, which still works (the server answers a repeated request, #1907). While a retry runs the error layout
 * stays and the pressed button is busy, so focus is not lost when the state flips to checking and back.
 */
function EntryView({ state, size, label, emphasis, holder, anchor, onRequest, renderPendingAction, children }: {
  state: AccessRequestState;
  size: 'action' | 'field';
  label: string | undefined;
  emphasis: 'primary' | undefined;
  holder: RefObject<HTMLSpanElement | null>;
  anchor: RefObject<HTMLSpanElement | null>;
  onRequest: () => void;
  renderPendingAction: ((statusHref: string | null) => ReactNode) | undefined;
  children: ((state: AccessRequestState, action: ReactNode) => ReactNode) | undefined;
}) {
  const { lang, t } = useI18n();
  const request = useAccessRequestState(state, { lang, kind: 'dialog', container: holder, fallback: anchor });
  const { shown, phase, checking } = request;
  const buttonSize = size === 'field' ? 'toolbar' : 'sm';
  const actionVariant = emphasis === 'primary' ? 'default' : 'secondary';
  const variant = size === 'field' ? 'ghost' : actionVariant;
  const requestHref = checking ? undefined : request.href;
  const button = requestHref
    ? <Button asChild size={buttonSize} variant={variant}><PlatformLink href={requestHref} aria-label={label}>{request.label}</PlatformLink></Button>
    : <Button type="button" size={buttonSize} variant={variant} aria-label={label} {...request.busyProps}
      onClick={checking ? request.busyProps.onClick : onRequest}>
      {checking && <Loader2 className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
      {request.label}
    </Button>;
  const pendingAction = phase === 'pending' && (renderPendingAction !== undefined
    ? renderPendingAction(shown.statusHref)
    : <span className="inline-flex flex-wrap items-center gap-2">
      <StatusBadge tone="neutral">{t('accessRequestPending')}</StatusBadge>
      {shown.statusHref !== null && <PlatformLink href={shown.statusHref} className="text-xs font-medium text-accent-primary hover:underline">{t('accessRequestStatus')}</PlatformLink>}
    </span>);
  const action = <span ref={holder} data-access-request={phase} className="contents" {...request.focusProps}>{phase === 'pending'
    ? pendingAction
    // Keep the native request button mounted across non-pending phases when it is not replaced by a form link.
    : <span className={phase === 'error' ? 'inline-flex flex-wrap items-center gap-2' : 'contents'}>
      {phase === 'error' && size === 'field' && <span className="text-xs text-text-muted">{t('accessRequestReadErrorShort')}</span>}
      {request.showRetry && <Button type="button" size={buttonSize} variant="ghost" {...request.retryProps}>
        {request.retrying && <Loader2 className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}{request.retryLabel}
      </Button>}
      {!request.unavailable && button}
    </span>}</span>;
  return <>{children ? children(shown, action) : action}</>;
}
