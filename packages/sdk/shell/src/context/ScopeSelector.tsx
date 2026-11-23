import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, MapPin, RotateCw, ShieldAlert } from 'lucide-react';
import { useI18n, useMessages, type AccessRequestSlot, type AccessRequestState } from '@ap/kernel';
import { useAccessRequestRead, useScopeAccessRequest } from '@ap/components';
import { useHostPlatform } from '@ap/kernel/host';
import { ShellBoundary } from '../frame/ShellBoundary';
import { SHELL_MESSAGES } from '../messages';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@ap/ui';

/**
 * Single requested Scope; validation and retries belong to the Kernel. `layout="chip"` (default) is the compact chip at the start of the
 * page title row (#2727); its status line is read by assistive technology only. `layout="bar"` is the analysis board's Context bar: it edits
 * the selected pane's Scope and is the only Scope selector on that screen (06 §7).
 */
export function ScopeSelector({ layout = 'chip' }: { layout?: 'chip' | 'bar' }) {
  const bar = layout === 'bar';
  const { global, setGlobal, scope, retryScope, session, url, navigate, scopeSelector } = useHostPlatform();
  const { t } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const accessRequest = useScopeAccessRequest();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Place (b) (ADR-0154 decision 6): the item only records the site; the dialog opens after the menu has closed and lives outside it,
  // so it is not unmounted with the menu content. Closing it returns focus to the Scope trigger.
  const chosenSite = useRef<string | null>(null);
  const [requestSite, setRequestSite] = useState<string | null>(null);
  const [closedDialogs, setClosedDialogs] = useState(0);
  // A page's `Scope 선택` (host request, #1938) opens the list; only the title-row chip answers, because a minimized board keeps its
  // bar selector mounted but hidden. Closing without a pick returns focus to the element that asked (the gate button).
  const [open, setOpen] = useState(false);
  const requester = useRef<HTMLElement | null>(null);
  const picked = useRef(false);
  useEffect(() => {
    if (bar) return;
    return scopeSelector.answer(() => {
      requester.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // A controlled Root does not call onOpenChange(true) for this, so clear the previous pick here.
      picked.current = false;
      setOpen(true);
    });
  }, [bar, scopeSelector]);
  useEffect(() => {
    if (closedDialogs === 0) return;
    // After the dialog's own close autofocus, which is scheduled the same way and runs first.
    const timer = setTimeout(() => triggerRef.current?.focus());
    return () => clearTimeout(timer);
  }, [closedDialogs]);
  const requestSites = accessRequest ? [
    ...session.scopes.filter(s => s.grantedRooms < s.totalRooms).map(s => ({ id: s.id, label: s.label, missing: s.totalRooms - s.grantedRooms })),
    ...(session.requestableScopes ?? []).map(s => ({ id: s.id, label: s.label, missing: s.totalRooms })),
  ] : [];
  const current = session.scopes.find(s => s.id === global.scopeId);
  const name = current?.label ?? global.scopeId ?? t('scopeNone');
  const descriptionId = useId();
  const status = scope.status === 'none' ? t('scopeNone') : scope.status === 'valid' ? t('scopeValid')
    : scope.status === 'validating' ? t('scopeValidating') : scope.status === 'unknown_scope' ? t('scopeUnknown')
      : scope.status === 'error' ? t('scopeCheckFailed') : t('scopeForbidden');
  const warn = !['none', 'valid', 'validating'].includes(scope.status);
  const trigger = <DropdownMenuTrigger asChild>
    <button ref={triggerRef} type="button" aria-label={`${t('scope')}: ${current?.label ?? global.scopeId ?? t('scopeNone')}`}
      aria-describedby={descriptionId}
      className={cn('flex h-8 items-center rounded-md border border-border-control px-2 text-left text-sm hover:bg-surface-row-hover', bar ? 'w-52 gap-2' : 'w-full min-w-0 max-w-56 gap-1.5')}>
      <span className={cn('grid size-5 shrink-0 place-items-center rounded text-xs font-semibold', warn ? 'bg-accent-warn-soft text-text-warning-label' : 'bg-accent-primary-soft text-accent-primary')}>
        {scope.status === 'validating' ? <Loader2 className="size-3 animate-spin" aria-hidden />
          : scope.status === 'none' ? <MapPin className="size-3" aria-hidden />
            : warn ? <ShieldAlert className="size-3" aria-hidden /> : <span aria-hidden>{name.slice(0, 1)}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span id={descriptionId} className="sr-only">{/* The chip sits in every main title row: a polite live span without role="status", so main gains no extra status landmark (#2727). */}<span data-scope-status role={bar ? 'status' : undefined} aria-live="polite">{status}</span>{current && ` · ${t('roomNames')} ${current.grantedRooms}/${current.totalRooms}`}</span>
      </span>
      <ChevronDown className="size-3 shrink-0 text-text-muted" aria-hidden />
    </button>
  </DropdownMenuTrigger>;
  return <div className={bar ? 'shrink-0' : 'flex min-w-0'}>
    <DropdownMenu open={open} onOpenChange={next => { if (next) picked.current = false; setOpen(next); }}>
      {trigger}
      <DropdownMenuContent align="start" className="w-72" onCloseAutoFocus={event => {
        const from = requester.current;
        requester.current = null;
        const site = chosenSite.current;
        if (site === null) {
          // A pick removes the gate button with the state change, so focus stays with the trigger (the default) then.
          if (from?.isConnected && !picked.current) { event.preventDefault(); from.focus(); }
          return;
        }
        chosenSite.current = null;
        event.preventDefault();
        setRequestSite(site);
      }}>
        <DropdownMenuLabel>{m('requestedScopeLabel')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={global.scopeId ?? ''} onValueChange={v => {
          picked.current = true;
          // Re-picking the current Scope from a failed check retries the validation — setGlobal(same) is a
          // no-op and the check would never re-run (#183). Any other pick navigates as before.
          if (v === global.scopeId && scope.status === 'error') retryScope(); else setGlobal({ scopeId: v });
        }}>
          {session.scopes.map(s => <DropdownMenuRadioItem key={s.id} value={s.id} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
            <span className="flex-1">{s.label}</span>
            <span className="text-tiny text-text-secondary">{t('roomNames')} {s.grantedRooms}/{s.totalRooms}</span>
          </DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        {scope.status === 'error' && <DropdownMenuItem onSelect={() => retryScope()} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
          <RotateCw className="mr-2 size-3.5" aria-hidden />{t('scopeRetryCheck')}
        </DropdownMenuItem>}
        {accessRequest && requestSites.length > 0 && <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('accessRequest')}</DropdownMenuLabel>
          {requestSites.map(site => <SiteRequestItem key={site.id} slot={accessRequest} site={site}
            onRequest={() => { chosenSite.current = site.id; }} onStatus={href => navigate(href)} />)}
        </>}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-tiny leading-4 text-text-secondary">{m('scopeBoundaryNote')}</p>
      </DropdownMenuContent>
    </DropdownMenu>
    {accessRequest && requestSite !== null && <ShellBoundary fallback={null}><accessRequest.Dialog target={{ kind: 'site', site: requestSite }} returnTo={url} open onOpenChange={open => {
      if (open) return;
      setRequestSite(null);
      setClosedDialogs(n => n + 1);
    }} /></ShellBoundary>}
  </div>;
}

/** One `권한 요청` row: a site with ungranted rooms. A pending request (the app's server read) turns it into a link to the request status. */
function SiteRequestItem({ slot, site, onRequest, onStatus }: { slot: AccessRequestSlot; site: { id: string; label: string; missing: number }; onRequest: () => void; onStatus: (href: string) => void }) {
  const { t } = useI18n();
  const { Pending } = slot;
  return <ShellBoundary fallback={null}><Pending target={{ kind: 'site', site: site.id }}>{state => <SiteRows state={state} site={site} onRequest={onRequest} onStatus={onStatus} />}</Pending></ShellBoundary>;
}

/** One site's rows by the request state (#1933). While a retry runs the rows keep their failure look; the focus the retry row held goes to the request row. */
function SiteRows({ state, site, onRequest, onStatus }: { state: AccessRequestState; site: { id: string; label: string; missing: number }; onRequest: () => void; onStatus: (href: string) => void }) {
  const { t } = useI18n();
  const { shown, retrying, canRetry, run } = useAccessRequestRead(state);
  const requestRow = useRef<HTMLDivElement>(null);
  const retryFocus = useRef(false);
  useLayoutEffect(() => {
    if (shown.read === 'error' || !retryFocus.current) return;
    retryFocus.current = false;
    if (document.activeElement === null || document.activeElement === document.body) requestRow.current?.focus();
  }, [shown.read, shown.pending]);
  if (shown.pending) {
    return <DropdownMenuItem data-access-request="pending" disabled={shown.statusHref === null} onSelect={() => { if (shown.statusHref !== null) onStatus(shown.statusHref); }} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
      {t('accessRequestSitePending', { site: site.label })}
    </DropdownMenuItem>;
  }
  const { requestHref } = shown;
  if (requestHref === null) return null;
  if (shown.read === 'checking') {
    // The row keeps its place and stays focusable; selecting it does nothing until the read answers.
    return <DropdownMenuItem data-access-request="checking" aria-disabled="true" aria-busy="true" onSelect={event => event.preventDefault()} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
      <Loader2 className="mr-2 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />{t('accessRequestSiteChecking', { site: site.label })}
    </DropdownMenuItem>;
  }
  return <>
    <DropdownMenuItem ref={requestRow} data-access-request={shown.read === 'error' ? 'error' : 'request'}
      onSelect={() => { if (requestHref === undefined) onRequest(); else onStatus(requestHref); }} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
      {t('accessRequestSiteRooms', { site: site.label, count: site.missing })}
    </DropdownMenuItem>
    {shown.read === 'error' && canRetry && <DropdownMenuItem aria-disabled={retrying || undefined} aria-busy={retrying || undefined}
      onSelect={event => { event.preventDefault(); if (retrying) return; retryFocus.current = true; run(); }} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
      {retrying ? <Loader2 className="mr-2 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <RotateCw className="mr-2 size-3.5" aria-hidden />}{t('accessRequestRecheck')}
    </DropdownMenuItem>}
  </>;
}
