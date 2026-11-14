import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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
    <Pending target={target}>{state => <EntryView state={state} size={size} label={label} holder={holder} onRequest={() => changeOpen(true)}>{children}</EntryView>}</Pending>
    <span ref={anchor} className="contents" onFocus={() => { dialogFocus.current = true; }} onBlur={() => { dialogFocus.current = false; }}><Dialog target={target} returnTo={url} open={open} onOpenChange={changeOpen} /></span>
  </>;
}

const isFocusLost = () => document.activeElement === null || document.activeElement === document.body;
// After the dialog's own close autofocus, which Radix schedules in a timer from its unmount.
const later = (run: () => void) => { setTimeout(() => setTimeout(run)); };

/** The body sentence of a place that words its message by the request state (#1933). `full` is the full-screen place, which also says a repeated request is not filed twice. */
export function accessRequestBody(t: ReturnType<typeof useI18n>['t'], state: AccessRequestState, full: boolean): string {
  if (state.pending) return t('accessRequestPendingBody');
  if (state.read === 'checking') return t('accessRequestChecking');
  if (state.read === 'error') return t(full ? 'accessRequestReadErrorDup' : 'accessRequestReadError');
  return t('accessRequestBody');
}

/**
 * One state of the entry. Checking keeps the request button in its place, busy and inert (focus stays, no line moves); an error offers
 * 「다시 시도」 beside the request button, which still works (the server answers a repeated request, #1907). While a retry runs the error layout
 * stays and the pressed button is busy, so focus is not lost when the state flips to checking and back.
 */
function EntryView({ state, size, label, holder, onRequest, children }: {
  state: AccessRequestState;
  size: 'action' | 'field';
  label: string | undefined;
  holder: RefObject<HTMLSpanElement | null>;
  onRequest: () => void;
  children: ((state: AccessRequestState, action: ReactNode) => ReactNode) | undefined;
}) {
  const { t } = useI18n();
  const { shown, retrying, canRetry, run: retryNow } = useAccessRequestRetry(state);
  const phase = shown.pending ? 'pending' : shown.read ?? 'request';
  // The pressed retry button disappears when the read settles into pending or plain; focus it held goes to the surviving action.
  const retryFocus = useRef(false);
  useLayoutEffect(() => {
    if (phase === 'error' || !retryFocus.current) return;
    retryFocus.current = false;
    if (isFocusLost()) holder.current?.querySelector<HTMLElement>('a[href], button')?.focus({ preventScroll: true });
  }, [phase, holder]);
  const buttonSize = size === 'field' ? 'toolbar' : 'sm';
  const variant = size === 'field' ? 'ghost' : 'secondary';
  const checking = phase === 'checking';
  const action = <span ref={holder} data-access-request={phase} className="contents">{phase === 'pending'
    ? <span className="inline-flex flex-wrap items-center gap-2">
      <StatusBadge tone="neutral">{t('accessRequestPending')}</StatusBadge>
      {shown.statusHref !== null && <PlatformLink href={shown.statusHref} className="text-xs font-medium text-accent-primary hover:underline">{t('accessRequestStatus')}</PlatformLink>}
    </span>
    // One flat child list in every non-pending phase, so the request button is the same element while checking, failed and plain.
    : <span className={phase === 'error' ? 'inline-flex flex-wrap items-center gap-2' : 'contents'}>
      {phase === 'error' && size === 'field' && <span className="text-xs text-text-muted">{t('accessRequestReadErrorShort')}</span>}
      {phase === 'error' && canRetry && <Button type="button" size={buttonSize} variant="ghost" aria-disabled={retrying || undefined} aria-busy={retrying || undefined}
        onBlur={event => { if (event.relatedTarget) retryFocus.current = false; }}
        onClick={() => { if (retrying) return; retryFocus.current = true; retryNow(); }}>{retrying && <Loader2 className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}{t('retry')}</Button>}
      <Button type="button" size={buttonSize} variant={variant} aria-label={label} {...(checking ? { 'aria-disabled': true, 'aria-busy': true } : {})} onClick={checking ? event => event.preventDefault() : onRequest}>
        {checking && <Loader2 className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}{t('accessRequest')}
      </Button>
    </span>}</span>;
  return <>{children ? children(shown, action) : action}</>;
}

/**
 * The retry of a failed state read, shared by every place that offers 「다시 시도」 (#1933). The slot reports `checking` while the retry runs and gives no
 * `retry` then, so the hook keeps the last one, and `shown` keeps the failure look (body and action alike) until the read settles. `run` does nothing when
 * there is nothing to re-run (`canRetry` false) or one retry is already running.
 */
export function useAccessRequestRetry(state: AccessRequestState): { shown: AccessRequestState; retrying: boolean; canRetry: boolean; run: () => void } {
  const [retry, setRetry] = useState<null | 'pressed' | 'running'>(null);
  const retryAction = useRef(state.retry);
  if (state.retry) retryAction.current = state.retry;
  const action = state.retry ?? (retry !== null ? retryAction.current : undefined);
  useEffect(() => {
    if (retry === 'pressed' && state.read === 'checking') setRetry('running');
    else if (retry === 'running' && state.read !== 'checking') setRetry(null);
  }, [retry, state.read]);
  useEffect(() => {
    if (retry !== 'pressed') return;
    // A retry that never starts a read (nothing to re-run) must not leave a busy button behind.
    const timer = window.setTimeout(() => setRetry(null), 3000);
    return () => window.clearTimeout(timer);
  }, [retry]);
  const shown: AccessRequestState = retry !== null && state.read === 'checking' ? { ...state, read: 'error' } : state;
  const run = () => { if (action === undefined || retry !== null) return; setRetry('pressed'); action(); };
  return { shown, retrying: retry !== null, canRetry: action !== undefined, run };
}
