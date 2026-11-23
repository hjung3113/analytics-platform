import { Ban, FileQuestion, Link2Off, Loader2 } from 'lucide-react';
import { lazy, Suspense, useRef } from 'react';
import { PlatformLink, contractErrorSentence, routeParamNames, useI18n, useMessages, type AccessRequestState } from '@ap/kernel';
import { isImplementedMenu, ScreenContentLoading, useArrivalFocus, useHostPlatform } from '@ap/kernel/host';
import { LoadingBlock, Panel, PlatformPage, PlatformPageBodyBoundary, StateMessage, focusPageFallback, useAccessRequestState } from '@ap/components';
import { Button, PermissionBlockedPanel, shortcutLabel } from '@ap/ui';
import { menuPermissions, type Permission } from '@ap/contracts';
import { HomeLink, useHomeHref } from '../frame/HomeLink';
import { ShellBoundary } from '../frame/ShellBoundary';
import { SHELL_MESSAGES } from '../messages';
import { ModuleScreen } from './ModuleScreen';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { useBoardPresentationSync } from '../board/boardPresentation';
import { useSessionKey } from '../frame/sessionKey';

// The board is a lazy chunk: only `/board` needs it, and the start-up chunk stays without it (#821, `pnpm check:lazy-chunks`).
const BoardHost = lazy(() => import('../board/BoardHost').then(module => ({ default: module.BoardHost })));

/**
 * The main screen's outlet: `ScreenOutlet` for the URL-bound screen, and the analysis board (a platform screen, docs/16) beside it. The board is mounted
 * from the first time it is opened and stays mounted — the same React instance — while an ordinary screen is shown (minimized): its container is only
 * `hidden` and `inert`, never re-keyed or moved, so sheet, selection, drafts and results are still there when the user comes back. Before the first
 * open nothing of the board is loaded (ADR-0087). The board's container is the child of `FloatingWindow` (ADR-0091): `off` while maximized or minimized,
 * `window` or `fill` while it is a window — the same React place in every display, so the mode changes the frame, never the board's instance.
 */
export function RouteOutlet() {
  const { mounted, maximized, floating } = useBoardPresentationSync();
  // Own boundaries, so the outlet works without the shell's (tests, other hosts); the fallback matches the shell's page fallback. The ordinary screen
  // has its own: a lazy screen that suspends under a shared boundary makes React hide the mounted board sibling and re-run its layout effects (ECharts disposed).
  const fallback = <div className="p-5"><LoadingBlock rows={6} height={320} /></div>;
  return <>
    {!maximized && <Suspense fallback={<>{fallback}<ScreenContentLoading /></>}><ScreenOutlet /></Suspense>}
    {/* A stale board chunk (or a board render throw) shows a retry in place of the open or windowed board; only a really minimized board draws nothing. The rail and the screen stay (#1876). */}
    {mounted && <ShellBoundary fallback={maximized || floating ? undefined : null}><Suspense fallback={maximized ? fallback : null}><BoardHost Outlet={ScreenOutlet} display={maximized ? 'maximized' : floating ? 'window' : 'minimized'} /></Suspense></ShellBoundary>}
  </>;
}

/**
 * Renders whatever the nearest screen state points at — the matched menu page, or the kernel's not-found / contract-error /
 * permission / planned states (docs/06 §17, §19). Inside a board pane (`PaneScreenProvider`, ADR-0049) it runs the same gate
 * chain for that pane's menu, so a denied pane shows its own permission state.
 */
export function ScreenOutlet() {
  const { route, contractError, can, url, global, metricInit, setGlobal, currentSpace, reportError } = useHostPlatform();
  const sessionKey = useSessionKey();
  const { t, tx } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  if (!route) return <KernelMessage heading={t('notFoundTitle')} icon={<FileQuestion className="size-4" aria-hidden />} title={t('notFound')} body={<span className="t-mono">{url}</span>} extra={<OpenPaletteButton />} />;
  // An alias address is replaced by the canonical one right after this render (ADR-0093): the screen waits, so nothing queries on the legacy path.
  if (route.viaAlias) return null;
  if (contractError) return <ContractErrorView />;
  // Space entry is checked before the menu permission (06 §9.1/§2): the route still matches, but the page never mounts and nothing redirects.
  if (currentSpace !== null && currentSpace.permission !== undefined && !can(currentSpace.permission)) {
    return <KernelMessage heading={tx(currentSpace.label)} tone="warning" icon={<Ban className="size-4" aria-hidden />} title={t('spaceDenied')}
      body={<>{tx(currentSpace.label)}. {t('askAccessOwner')}</>} />;
  }
  if (metricInit.phase === 'confirm') {
    // This is a transient URL-stamping step; the final menu owns the pending arrival focus.
    return <div className="p-6"><StateMessage icon={<Link2Off className="size-4" aria-hidden />} title={m('metricConfirmingTitle')}
      body={m('metricConfirmingBody')} action={<HomeLink />} /></div>;
  }
  if (metricInit.phase === 'blocked') {
    const id = global.metricId;
    const blockedBody = metricInit.reason === 'unknown_metric'
      ? (id ? m('metricUnknownWithId', { id }) : m('metricUnknownGeneric'))
      : m('metricNoReleasedVersionBody');
    return <div className="p-6"><StateMessage tone="warning" icon={<Link2Off className="size-4" aria-hidden />}
      title={metricInit.reason === 'unknown_metric' ? m('metricUnknownTitle') : m('metricNoReleasedVersionTitle')}
      body={blockedBody}
      action={<Button size="sm" variant="secondary" onClick={event => { focusPageFallback(event.currentTarget); setGlobal({ metricId: null, metricVersion: null }, { replace: true }); }}>{m('metricClearPair')}</Button>} /></div>;
  }
  // Direct URL to a menu hidden by permission: the server check still answers (§17), distinct from "no data".
  const missing = menuPermissions(route.menu).find(permission => !can(permission));
  if (missing !== undefined) return <KernelStatePage title={tx(route.menu.label)}>
    <MenuPermissionBlocked key={`${route.menu.id}|${sessionKey}`} permission={missing} heading={tx(route.menu.label)} />
  </KernelStatePage>;
  const Page = route.menu.component;
  // Every screen is a different instance per session generation (#2075): a session change notice (revision), another user or an adapter
  // swap (its revision count restarts at 0, even for the same user) remounts it and drops its local state; URL state survives because it comes from the URL.
  const instanceKey = `${route.menu.id}${JSON.stringify(route.params)}|${sessionKey}`;
  if (!isImplementedMenu(route.menu)) return <PlannedPage />;
  const screen = route.menu.moduleScreen
    ? <ModuleScreen key={instanceKey} entry={route.menu} params={route.params} />
    : Page && <Page key={instanceKey} params={route.params} />;
  return <RouteErrorBoundary onError={reportError} resetKey={instanceKey}>
    <PlatformPageBodyBoundary.Provider value={body => <RouteErrorBoundary body onError={reportError} resetKey={instanceKey + url}>{body}</RouteErrorBoundary>}>
      {screen}
    </PlatformPageBodyBoundary.Provider>
  </RouteErrorBoundary>;
}

/** No menu chrome or Scope/query slots: these screens can have no route or no permission to mount menu content. */
function KernelStatePage({ title, children }: { title: string; children: React.ReactNode }) {
  const { screenMode } = useHostPlatform();
  const heading = useRef<HTMLHeadingElement>(null);
  // Explicit arrival only, including delayed dialog release; the board owns a pane's heading and automatic arrival focus (ADR-0049).
  useArrivalFocus(() => heading.current?.focus({ preventScroll: true }), { enabled: screenMode !== 'pane' });
  return <div data-platform-page className="flex min-h-full flex-col">
    {screenMode !== 'pane' && <header data-canvas-band className="flex h-[50px] shrink-0 items-center border-b border-border-chrome bg-surface-band px-4">
      <h1 ref={heading} tabIndex={0} title={title} className="min-w-0 truncate t-section-title text-text-primary">{title}</h1>
    </header>}
    <div data-platform-page-content tabIndex={-1} className="p-6">{children}</div>
  </div>;
}

function KernelMessage({ heading, icon, title, body, tone, extra }: { heading?: string; icon: React.ReactNode; title: string; body: React.ReactNode; tone?: 'warning' | 'danger'; extra?: React.ReactNode }) {
  return <KernelStatePage title={heading ?? title}><StateMessage tone={tone} icon={icon} title={title} body={body} action={<><HomeLink />{extra}</>} /></KernelStatePage>;
}

/** `메뉴 검색 (⌘K)`: the way out of an address nothing answers to; it opens the same palette the rail and the shortcut open. */
function OpenPaletteButton() {
  const { t } = useI18n();
  const { setPaletteOpen } = useHostPlatform();
  return <Button type="button" size="sm" variant="secondary" aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K" onClick={() => setPaletteOpen(true)}>{t('paletteName')} ({shortcutLabel('K')})</Button>;
}

function MenuPermissionBlocked({ permission, heading }: { permission: Permission; heading: string }) {
  const { slots } = useHostPlatform();
  const Pending = slots.accessRequest?.Pending;
  const fallback = <MenuPermissionCard heading={heading} state={{ pending: null, statusHref: null }} />;
  if (!Pending) return fallback;
  return <ShellBoundary fallback={fallback}><Pending target={{ kind: 'permission', permission }}>
    {state => <MenuPermissionCard key={permission} heading={heading} state={state} />}
  </Pending></ShellBoundary>;
}

function MenuPermissionCard({ heading, state }: { heading: string; state: AccessRequestState }) {
  const { t, lang } = useI18n();
  const homeHref = useHomeHref();
  const card = useRef<HTMLDivElement>(null);
  const request = useAccessRequestState(state, { lang, kind: 'link', container: card });
  const { href, shown, checking } = request;
  const requestAction = href ? <Button asChild size="sm" variant={shown.pending ? 'secondary' : 'primary'}>
    <PlatformLink href={href} {...request.focusProps}>{request.label}</PlatformLink>
  </Button> : null;
  const exitAction = homeHref ? <Button asChild size="sm" variant="secondary"><PlatformLink href={homeHref}>{t('goToHome')}</PlatformLink></Button> : null;
  const explanation = shown.pending || href || checking ? undefined : t('askAccessOwner');
  const action = checking ? <Button type="button" size="sm" variant="primary" {...request.focusProps} {...request.busyProps}>
    <Loader2 className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />{request.label}
  </Button> : requestAction;
  const retryAction = request.showRetry
    ? <Button type="button" size="sm" variant="secondary" {...request.focusProps} {...request.retryProps}>{request.retryLabel}</Button>
    : null;
  return <div ref={card} className="contents"><PermissionBlockedPanel layout="card" headingLevel={2} announceBody lang={lang} state={href || checking ? 'request_access' : 'blocked_not_requestable'} category={t('menuDenied')}
    description={request.readMessage ?? explanation}
    reason={request.readMessage && explanation}
    missing={shown.missing}
    requestStatus={request.requestStatus}
    requestAction={retryAction ? <>{action}{retryAction}</> : action}
    exitAction={exitAction}
  /></div>;
}

function ContractErrorView() {
  const { contractError, resetContext, url } = useHostPlatform();
  const { t, lang } = useI18n();
  return <KernelStatePage title={t('contractError')}><StateMessage tone="danger" icon={<Link2Off className="size-4" aria-hidden />} title={t('contractError')}
    body={<><p>{contractErrorSentence(lang, contractError!)}</p><p className="t-mono mt-2 break-all">{url}</p></>}
    action={<Button size="sm" variant="secondary" onClick={event => { focusPageFallback(event.currentTarget); resetContext(); }}>{t('resetContext')}</Button>} /></KernelStatePage>;
}

/** Registry-only menu: proves shell, permissions and Context transfer work before the screen exists. */
function PlannedPage() {
  const { route, registry, canOpen, linkTo } = useHostPlatform();
  const { tx } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const menu = route!.menu;
  const space = registry.spaceOf(menu);
  const siblings = registry.menus.filter(candidate =>
    (candidate.group === menu.group || (space !== null && registry.spaceOf(candidate) === space))
    && isImplementedMenu(candidate) && !candidate.navHidden
    && routeParamNames(candidate.path).length === 0 && canOpen(candidate.id));
  return <PlatformPage>
    <Panel title={m('plannedScreen', { menu: tx(menu.label) })} subtitle={tx(menu.description)} className="break-keep">
      {siblings.length > 0 && <>
        <h3 className="mb-2 text-xs font-medium text-text-secondary">{m('plannedLinks')}</h3>
        <div className="flex flex-wrap items-center gap-3">
          {siblings.map(candidate => <Button key={candidate.id} size="sm" variant="secondary" asChild>
            <PlatformLink className="break-keep" href={linkTo(candidate.id)}>{tx(candidate.label)}</PlatformLink>
          </Button>)}
        </div>
      </>}
    </Panel>
  </PlatformPage>;
}
