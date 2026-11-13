import { Ban, FileQuestion, Link2Off } from 'lucide-react';
import { lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { CONTEXT_LABELS, PAGE_TYPE_LABELS, PlatformLink, contractErrorSentence, useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { LoadingBlock, Panel, PlatformPage, StateMessage, focusPageFallback } from '@ap/components';
import { Button, StatusBadge, shortcutLabel } from '@ap/ui';
import { menuPermissions, type Capability, type ContextKey, type Permission } from '@ap/contracts';
import { contextBarVisible } from '../context/GlobalContextBar';
import { HomeLink } from '../frame/HomeLink';
import { ShellBoundary } from '../frame/ShellBoundary';
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
    {!maximized && <Suspense fallback={fallback}><ScreenOutlet /></Suspense>}
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
  const { t, tx, lang } = useI18n();
  if (!route) return <KernelMessage icon={<FileQuestion className="size-4" aria-hidden />} title={t('notFound')} body={<span className="t-mono">{url}</span>} extra={<OpenPaletteButton />} />;
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
    return <div className="p-6"><StateMessage icon={<Link2Off className="size-4" aria-hidden />} title={lang === 'ko' ? '발행 버전 확인 중' : 'Confirming the released version'}
      body={lang === 'ko' ? '서버가 확인한 버전을 URL에 기록하기 전에는 조회하지 않습니다.' : 'Nothing is queried until the server-confirmed version is written into the URL.'} action={<HomeLink />} /></div>;
  }
  if (metricInit.phase === 'blocked') {
    const id = global.metricId;
    const blockedBody = metricInit.reason === 'unknown_metric'
      ? (id
        ? (lang === 'ko' ? `${id} 지표를 열 수 없습니다. 지우고 다시 고르세요.` : `${id} cannot be opened. Clear it and choose again.`)
        : (lang === 'ko' ? '이 지표를 열 수 없습니다. 지우고 다시 고르세요.' : 'This metric cannot be opened. Clear it and choose again.'))
      : (lang === 'ko' ? '발행된 버전이 없습니다. 다른 지표를 고르세요.' : 'There is no released version. Choose another metric.');
    return <div className="p-6"><StateMessage tone="warning" icon={<Link2Off className="size-4" aria-hidden />}
      title={metricInit.reason === 'unknown_metric'
        ? (lang === 'ko' ? '지표를 확인하지 못했습니다' : 'The metric could not be confirmed')
        : (lang === 'ko' ? '발행 버전이 없습니다' : 'No released version')}
      body={blockedBody}
      action={<Button size="sm" variant="secondary" onClick={event => { focusPageFallback(event.currentTarget); setGlobal({ metricId: null, metricVersion: null }, { replace: true }); }}>{lang === 'ko' ? '이 지표 쌍 지우기' : 'Clear this metric pair'}</Button>} /></div>;
  }
  // Direct URL to a menu hidden by permission: the server check still answers (§17), distinct from "no data".
  const missing = menuPermissions(route.menu).find(permission => !can(permission));
  if (missing !== undefined) return <KernelMessage heading={tx(route.menu.label)} tone="warning" icon={<Ban className="size-4" aria-hidden />} title={t('menuDenied')}
    body={<>{tx(route.menu.label)}. {t('askAccessOwner')}</>} extra={<RequestPermissionLink permission={missing} />} />;
  const Page = route.menu.component;
  // Every screen is a different instance per session generation (#2075): a session change notice (revision), another user or an adapter
  // swap (its revision count restarts at 0, even for the same user) remounts it and drops its local state; URL state survives because it comes from the URL.
  const instanceKey = `${route.menu.id}${JSON.stringify(route.params)}|${sessionKey}`;
  if (route.menu.moduleScreen) return <RouteErrorBoundary onError={reportError} resetKey={instanceKey}>
    <ModuleScreen key={instanceKey} entry={route.menu} params={route.params} />
  </RouteErrorBoundary>;
  if (!Page) return <PlannedPage />;
  return <RouteErrorBoundary onError={reportError} resetKey={instanceKey}>
    <Page key={instanceKey} params={route.params} />
  </RouteErrorBoundary>;
}

/** No menu chrome or Scope/query slots: these screens can have no route or no permission to mount menu content. */
function KernelStatePage({ title, children }: { title: string; children: React.ReactNode }) {
  const { pageNavigation, pathname, screenMode } = useHostPlatform();
  const heading = useRef<HTMLHeadingElement>(null);
  // This screen instance owns a kept arrival across its own re-subscriptions (StrictMode replay, pathname-equal rewrites).
  const owner = useRef(Symbol('kernel state page'));
  useLayoutEffect(() => {
    // The board owns a pane's heading and automatic arrival focus (ADR-0049).
    if (screenMode === 'pane') return;
    // The same Kernel handoff as PlatformPage and BoardSurface: explicit arrival only, including delayed dialog release.
    const focus = () => { if (pageNavigation.consume(pathname)) heading.current?.focus({ preventScroll: true }); };
    focus();
    return pageNavigation.subscribe(focus, owner.current);
  }, [pathname, pageNavigation, screenMode]);
  return <div data-platform-page className="flex min-h-full flex-col">
    {screenMode !== 'pane' && <header className="flex h-[50px] shrink-0 items-center border-b border-border-subtle bg-surface-canvas px-4">
      <h1 ref={heading} tabIndex={0} title={title} className="min-w-0 truncate text-sm font-semibold text-text-primary">{title}</h1>
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

/**
 * `권한 요청` for a menu the user may not open. The Shell does not know the request page: the app's `accessRequest` slot gives its address for the
 * missing permission (`statusHref`). No slot, or no address → no button. It names only the missing permission the screen already denies.
 */
function RequestPermissionLink({ permission }: { permission: Permission }) {
  const { t } = useI18n();
  const { slots } = useHostPlatform();
  const Pending = slots.accessRequest?.Pending;
  if (!Pending) return null;
  // An injected slot is outside the menu's `RouteErrorBoundary`: its failure leaves the denial and the home link, and is reported like any shell region.
  return <ShellBoundary fallback={null}><Pending target={{ kind: 'permission', permission }}>{state => state.statusHref === null ? null
    : <Button asChild size="sm" variant="secondary"><PlatformLink href={state.statusHref}>{t('accessRequest')}</PlatformLink></Button>}</Pending></ShellBoundary>;
}

function ContractErrorView() {
  const { contractError, resetContext, url } = useHostPlatform();
  const { t, lang } = useI18n();
  return <KernelStatePage title={t('contractError')}><StateMessage tone="danger" icon={<Link2Off className="size-4" aria-hidden />} title={t('contractError')}
    body={<><p>{contractErrorSentence(lang, contractError!)}</p><p className="t-mono mt-2 break-all">{url}</p></>}
    action={<Button size="sm" variant="secondary" onClick={event => { focusPageFallback(event.currentTarget); resetContext(); }}>{t('resetContext')}</Button>} /></KernelStatePage>;
}

/** Registry-only menu: proves shell, permissions and Context transfer work before the screen exists. */
function capabilityLabel(cap: Capability, t: (key: 'applied' | 'referenceOnly' | 'notUsed') => string) {
  if (cap === 'apply') return t('applied');
  if (cap === 'reference') return t('referenceOnly');
  return t('notUsed');
}

function PlannedPage() {
  const { route, registry, global } = useHostPlatform();
  const { t, tx, lang } = useI18n();
  const menu = route!.menu;
  const keys = Object.keys(menu.context) as ContextKey[];
  const tone = { apply: 'success', reference: 'info', unsupported: 'neutral' } as const;
  const barVisible = contextBarVisible(menu.context, global);
  return <PlatformPage>
    <div className="grid gap-3 wide:grid-cols-[1fr_1fr]">
      <Panel title={t('plannedTitle')} subtitle={t('plannedBody')}>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-text-muted">{lang === 'ko' ? '그룹' : 'Group'}</dt><dd>{tx(registry.groupById(menu.group).label)}</dd>
          <dt className="text-text-muted">{t('pageType')}</dt><dd>{tx(PAGE_TYPE_LABELS[menu.pageType])}</dd>
        </dl>
      </Panel>
      <Panel title={t('capability')} subtitle={barVisible ? (lang === 'ko' ? '지원하지 않는 조건은 위 막대에 이 화면에서 미사용으로 표시됩니다.' : 'Conditions this page does not use stay on the bar above.') : undefined}>
        <ul className="grid grid-cols-2 gap-1.5 text-sm">
          {keys.map(k => <li key={k} className="flex items-center justify-between rounded-sm bg-surface-sunken px-2 py-1">
            <span>{tx(CONTEXT_LABELS[k])}</span><StatusBadge tone={tone[menu.context[k]]}>{capabilityLabel(menu.context[k], t)}</StatusBadge>
          </li>)}
        </ul>
      </Panel>
    </div>
  </PlatformPage>;
}
