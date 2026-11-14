import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Loader2, MapPin, RotateCw, ShieldAlert } from 'lucide-react';
import { useI18n, useMessages, type AccessRequestSlot } from '@ap/kernel';
import { useScopeAccessRequest } from '@ap/components';
import { useHostPlatform } from '@ap/kernel/host';
import { ShellBoundary } from '../frame/ShellBoundary';
import { SHELL_MESSAGES } from '../messages';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';

/**
 * Single requested Scope; validation and retries belong to the Kernel. `layout="bar"` is the analysis board's Context bar: it edits the
 * selected pane's Scope and is the only Scope selector on that screen (06 §7), so it drops the sidebar's frame and status line.
 */
export function ScopeSelector({ collapsed = false, layout = 'sidebar', onExpand }: { collapsed?: boolean; layout?: 'sidebar' | 'bar'; /** Expands a collapsed sidebar before a page's `Scope 선택` request opens the list (#1938). */ onExpand?: () => void }) {
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
  // A page's `Scope 선택` (host request, #1938) opens the list; only the sidebar selector answers, because a minimized board keeps its
  // bar selector mounted but hidden. Closing without a pick returns focus to the element that asked (the gate button).
  const [open, setOpen] = useState(false);
  const requester = useRef<HTMLElement | null>(null);
  const picked = useRef(false);
  const latest = useRef({ collapsed, onExpand });
  useEffect(() => { latest.current = { collapsed, onExpand }; });
  useEffect(() => {
    if (bar) return;
    return scopeSelector.answer(() => {
      requester.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (latest.current.collapsed) latest.current.onExpand?.();
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
      className={cn('flex items-center gap-2 rounded-md border border-border-control px-2 text-left text-sm hover:bg-surface-row-hover', bar ? 'h-8 w-52' : 'min-h-10 w-full py-2')}>
      <span className={cn('grid size-5 shrink-0 place-items-center rounded text-xs font-semibold', warn ? 'bg-accent-warn-soft text-text-warning-label' : 'bg-accent-primary-soft text-accent-primary')}>
        {scope.status === 'validating' ? <Loader2 className="size-3 animate-spin" aria-hidden />
          : scope.status === 'none' ? <MapPin className="size-3" aria-hidden />
            : warn ? <ShieldAlert className="size-3" aria-hidden /> : <span aria-hidden>{name.slice(0, 1)}</span>}
      </span>
      <span className={cn('min-w-0 flex-1', collapsed && 'sr-only')}>
        <span className="block truncate font-medium">{name}</span>
        <span id={descriptionId} className={cn('block truncate text-caption', (bar || scope.status === 'none') && 'sr-only', warn ? 'text-text-warning-label' : 'text-text-secondary')}><span role="status" aria-live="polite">{status}</span>{current && ` · ${t('roomNames')} ${current.grantedRooms}/${current.totalRooms}`}</span>
      </span>
      {!collapsed && <ChevronDown className="size-3 shrink-0 text-text-muted" aria-hidden />}
    </button>
  </DropdownMenuTrigger>;
  return <TooltipProvider><div className={bar ? 'shrink-0' : 'shrink-0 border-b border-border-subtle p-2'}>
    <DropdownMenu open={open} onOpenChange={next => { if (next) picked.current = false; setOpen(next); }}>
      {collapsed ? <Tooltip><TooltipTrigger asChild>{trigger}</TooltipTrigger><TooltipContent side="right">{name} · {status}{current && ` · ${t('roomNames')} ${current.grantedRooms}/${current.totalRooms}`}</TooltipContent></Tooltip> : trigger}
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
  </div></TooltipProvider>;
}

/** One `권한 요청` row: a site with ungranted rooms. A pending request (the app's server read) turns it into a link to the request status. */
function SiteRequestItem({ slot, site, onRequest, onStatus }: { slot: AccessRequestSlot; site: { id: string; label: string; missing: number }; onRequest: () => void; onStatus: (href: string) => void }) {
  const { t } = useI18n();
  const { Pending } = slot;
  return <ShellBoundary fallback={null}><Pending target={{ kind: 'site', site: site.id }}>{state => state.pending
    ? <DropdownMenuItem data-access-request="pending" disabled={state.statusHref === null} onSelect={() => { if (state.statusHref !== null) onStatus(state.statusHref); }} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
      {t('accessRequestSitePending', { site: site.label })}
    </DropdownMenuItem>
    : <DropdownMenuItem data-access-request="request" onSelect={onRequest} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
      {t('accessRequestSiteRooms', { site: site.label, count: site.missing })}
    </DropdownMenuItem>}</Pending></ShellBoundary>;
}
