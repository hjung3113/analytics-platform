import { detailFocusFallback, paneRootById } from '../state/pageFocus';
import { OutcomeBanners, OutcomeScope } from '../filters/OutcomeScope';
import { X } from 'lucide-react';
import { useContext, useEffect, useId, useInsertionEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { buildQuery } from '@ap/contracts';
import { useI18n } from '@ap/kernel';
import { useHostPlatformOptional } from '@ap/kernel/host';
import { DetailPanelFullscreenContext, DetailPanelFullscreenToggle, DetailPanelReadingColumn, useDetailPanelEscape, Tabs, TabsContent, TabsList, TabsTrigger, TransientOverlayScope, useDetailPanelSlot, useSurfacePaused, cn } from '@ap/ui';

/** Menus declare content; the SDK owns its width-dependent placement. */
export interface DetailDrawerRegions {
  body: ReactNode;
  properties?: ReactNode;
  activity?: ReactNode;
  /**
   * Narrow-width section navigation. The drawer places it above the scroll root, hides it at the
   * two-column width, and passes the scroll root that holds every region's anchors.
   */
  navigation?: (scrollRoot: RefObject<HTMLElement | null>) => ReactNode;
}

export type DetailDrawerTab = { id: string; label: ReactNode } & (
  | { content: ReactNode; regions?: never }
  | { regions: DetailDrawerRegions; content?: never }
);

/** §13: URL-controlled detail content rendered into the shell-owned docked slot. */
export function DetailDrawer({ title, subtitle, headerActions, context, footer, tabs, onClose, tab, onTabChange, focusOnOpen, returnFocusRef }: {
  /** For consumers with a detail identity other than focus=: false preserves arrival focus; true claims a user-opened detail. Default follows Kernel navigation. */
  focusOnOpen?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  title: ReactNode; subtitle?: ReactNode; headerActions?: ReactNode; context?: ReactNode; footer?: ReactNode;
  tabs: DetailDrawerTab[];
  onClose: () => void; tab?: string; onTabChange?: (tab: string) => void;
}) {
  const paneId = useHostPlatformOptional()?.paneId;
  const closeLatest = useRef(onClose);
  useInsertionEffect(() => { closeLatest.current = onClose; });
  // A terminal reason for this drawer lifetime, including every outgoing content cleanup/replay.
  const superseded = useRef(false);
  const host = useDetailPanelSlot(paneId != null ? { localExpansion: true, onSuperseded: () => {
    superseded.current = true;
    closeLatest.current();
  } } : undefined);
  useCloseOnPaneChange(onClose);
  // A drawer whose owning surface is covered stays mounted in the hidden host; its own transient UI is dismissed, as a docked detail owns its visibility.
  const paused = useSurfacePaused();
  return host ? createPortal(<TransientOverlayScope active={!paused} detached><OutcomeScope><DetailContent focusOnOpen={focusOnOpen} superseded={superseded} title={title} subtitle={subtitle} headerActions={headerActions} context={context} footer={footer} tabs={tabs} onClose={onClose} tab={tab} onTabChange={onTabChange} returnFocusRef={returnFocusRef} /></OutcomeScope></TransientOverlayScope>, host) : null;
}

/**
 * Docs/16 §5: a panel opened from a board pane belongs to the screen and Context that pane had then; when either changes it closes.
 * Runs in the drawer itself, not its portaled content, so changes are noticed even before a host is attached.
 */
function useCloseOnPaneChange(onClose: () => void) {
  const platform = useHostPlatformOptional();
  const identity = platform?.paneId == null ? null : `${platform.pathname}\0${buildQuery(platform.global)}`;
  const openedAs = useRef(identity);
  const closeLatest = useRef(onClose);
  useLayoutEffect(() => { closeLatest.current = onClose; });
  const closedByChange = useRef(false);
  useEffect(() => {
    // Once: a menu that fills in its default period right after a screen change would otherwise ask twice.
    if (identity === openedAs.current || closedByChange.current) return;
    closedByChange.current = true;
    closeLatest.current();
  }, [identity]);
}

function DetailContent({ focusOnOpen, superseded, title, subtitle, headerActions, context, footer, tabs, onClose, tab, onTabChange, returnFocusRef }: Parameters<typeof DetailDrawer>[0] & { superseded: MutableRefObject<boolean> }) {
  const { lang, t } = useI18n();
  const onKeyDown = useDetailPanelEscape(onClose);
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // #353: whether focus lives inside the panel. Unmount blur has no relatedTarget, so it must not
  // clear this; only a real move to an outside element or an outside pointerdown does (06 §13, §26).
  const focusInside = useRef(false);
  const id = useId();
  const platform = useHostPlatformOptional();
  const pageNavigation = platform?.pageNavigation;
  // Read live by the mount claim and the close cleanup: a covered surface's drawer must not move or restore focus on the screen in front.
  const pausedNow = useSurfacePaused();
  const paused = useRef(pausedNow);
  useInsertionEffect(() => { paused.current = pausedNow; });
  // Read live by the close cleanup: an expanded panel's covered body (its opener) is inert until the slot collapses right after the close.
  const expandedValue = useContext(DetailPanelFullscreenContext)?.expanded === true;
  const expandedNow = useRef(expandedValue);
  useInsertionEffect(() => { expandedNow.current = expandedValue; });
  const paneId = platform?.paneId ?? null;
  const paneLabel = platform?.paneLabel ?? null;
  useLayoutEffect(() => {
    const opener = returnFocusRef?.current ?? document.activeElement as HTMLElement | null;
    // Arrival with focus= leaves the title focused (§26). Same-screen open still moves here.
    // No provider means a locally mounted drawer, which still claims the close button.
    const claim = (focusOnOpen ?? pageNavigation?.claimsDetailFocus() ?? true) && !paused.current;
    if (claim) close.current?.focus({ preventScroll: true });
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the cleanup must read the latest flag; a copy taken at mount would never see the supersession
      if (superseded.current) return;
      if (paused.current) return;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the cleanup asks the live panel node whether focus is inside, not a mount-time copy
      const inside = panel.current?.contains(document.activeElement) ?? false;
      // A panel that never took focus must not treat the untouched body as its own.
      // `focusInside` follows React's tree, so a dialog the panel opened (portaled to body, e.g. a discard confirm) counts: closing through it still returns focus.
      const restore = inside || focusInside.current || (claim && (document.activeElement === document.body || returnFocusRef !== undefined));
      if (!restore) return;
      // The panel is portaled out of its pane, so a pane's fallback is found by id (compared, not interpolated into a selector).
      const paneRoot = paneId === null ? null : paneRootById(paneId);
      const available = (element: HTMLElement | null): element is HTMLElement => !!element?.isConnected
        && element !== document.body && !element.closest('[hidden], [inert], [aria-hidden="true"]');
      const restoreFocus = () => detailFocusFallback(opener, paneRoot, available)?.focus({ preventScroll: true });
      // A modal dialog the panel opened (a discard confirm) hides everything else with aria-hidden until it unmounts, which is after this cleanup;
      // the opener is unavailable only because of it (not hidden or inert), so wait one task and restore only if focus has landed nowhere.
      // Closing an expanded panel: the opener is inert only until the slot collapses in this same commit, so restore one task later, once the body is usable again.
      if (opener?.isConnected && !opener.closest('[hidden]') && ((!opener.closest('[inert]') && opener.closest('[aria-hidden="true"]')) || (expandedNow.current && opener.closest('[inert]')))) {
        setTimeout(() => { if (document.activeElement === document.body || document.activeElement === null) restoreFocus(); }, 0);
        return;
      }
      // An explicit trigger can still be disabled until the same closing commit finishes.
      if (returnFocusRef) {
        setTimeout(() => { if (document.activeElement === document.body || document.activeElement === null) restoreFocus(); }, 0);
      } else restoreFocus();
    };
  }, [pageNavigation, paneId, superseded, paused, focusOnOpen, returnFocusRef]);
  useLayoutEffect(() => {
    // A pointerdown outside the panel is the user choosing a focus destination (often body).
    const onPointerDown = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node)) focusInside.current = false; };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);
  useLayoutEffect(() => {
    // The focused control can disappear in any commit: history Back rewrites the controlled tab while
    // the tab list stays, and Radix Presence drops the inactive content one commit AFTER the value
    // change — no [tab] effect runs on that later commit. Watch the panel subtree for its lifetime
    // instead; the callback only checks the #353 condition (06 §13, §26).
    const restore = () => {
      if (!focusInside.current || document.activeElement !== document.body) return;
      const target = panel.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? panel.current;
      target?.focus({ preventScroll: true });
    };
    const observer = new MutationObserver(restore);
    if (panel.current) observer.observe(panel.current, { childList: true, subtree: true });
    return () => { observer.disconnect(); };
  }, []);
  return <div ref={panel} role="dialog" tabIndex={-1} aria-modal="false" aria-labelledby={`${id}-t`}
    onFocus={() => { focusInside.current = true; }}
    onPointerDownCapture={() => { focusInside.current = true; }}
    onBlur={e => { const to = e.relatedTarget as Node | null; if (to && !panel.current?.contains(to)) focusInside.current = false; }}
    onKeyDown={onKeyDown}
    className={cn('flex h-full min-h-0 w-full flex-col bg-surface-detail', tabs.some(tb => tb.regions !== undefined) && '@container/detail-panel')}>
    <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
      <div className="min-w-0">
        {paneLabel && <p data-detail-pane-label className="truncate text-xs text-text-muted">{paneLabel}</p>}
        <h2 id={`${id}-t`} className="t-section-title truncate">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1">
        {headerActions}
        <DetailPanelFullscreenToggle expandLabel={t('detailExpand')} collapseLabel={t('detailCollapse')} />
        <button ref={close} type="button" onClick={onClose} aria-label={lang === 'ko' ? '상세 닫기' : 'Close details'} className="grid size-8 place-items-center rounded-sm text-text-muted hover:bg-surface-sunken hover:text-text-primary"><X className="size-4" aria-hidden /></button>
      </div>
    </header>
    {context && <div className="border-b border-border-subtle bg-surface-sunken px-5 py-2 text-xs text-text-secondary">{context}</div>}
    <OutcomeBanners />
    {/* One tab draws no tab row (06 §13, #886 UX-8); the content stays a focusable, named scroll region like a tabpanel. */}
    {tabs.length === 1
      ? tabs[0].regions !== undefined ? <DeclaredRegions regions={tabs[0].regions} /> : <div role="region" tabIndex={0} aria-labelledby={`${id}-t`} className="min-h-0 flex-1 overflow-auto px-5 py-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring focus-visible:ring-offset-0"><DetailPanelReadingColumn>{tabs[0].content}</DetailPanelReadingColumn></div>
      : <Tabs value={tab} defaultValue={tab ? undefined : tabs[0].id} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label={lang === 'ko' ? '상세 탭' : 'Detail tabs'} className="mx-5 mt-3 w-auto">
          {tabs.map(tb => <TabsTrigger key={tb.id} value={tb.id}>{tb.label}</TabsTrigger>)}
        </TabsList>
        {tabs.map(tb => (
          // eslint-disable-next-line shadcn/no-restyle -- the aside clips overflow, so the focus ring must sit inside the panel (#914 A1)
          <TabsContent key={tb.id} value={tb.id} className={tb.regions !== undefined ? 'flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:ring-inset focus-visible:ring-offset-0' : 'min-h-0 flex-1 overflow-auto px-5 py-3 focus-visible:ring-inset focus-visible:ring-offset-0'}>{tb.regions !== undefined ? <DeclaredRegions regions={tb.regions} /> : <DetailPanelReadingColumn>{tb.content}</DetailPanelReadingColumn>}</TabsContent>
        ))}
      </Tabs>}
    {footer !== undefined && <DetailPanelReadingColumn asChild><div className="shrink-0 border-t border-border-subtle px-5 py-3">{footer}</div></DetailPanelReadingColumn>}
    </div>;
}


/**
 * Keep DOM/keyboard order body → properties → activity at every width. The main
 * scrollport carries the left track; the properties track sticks inside it and
 * scrolls independently. Size containment supplies its available block size in
 * cqh without geometry observers, reparenting or a second copy of the content.
 */
function DeclaredRegions({ regions }: { regions: DetailDrawerRegions }) {
  const { t } = useI18n();
  const hasProperties = regions.properties !== undefined && regions.properties !== null && regions.properties !== false;
  const hasActivity = regions.activity !== undefined && regions.activity !== null && regions.activity !== false;
  const scrollRoot = useRef<HTMLElement | null>(null);
  // No token covers size containment or a 100cqh cap: properties use this scrollport's height, not the viewport's.
  return <>
    {regions.navigation && <div data-detail-navigation className="@[60rem]/detail-panel:hidden">{regions.navigation(scrollRoot)}</div>}
    <div className="min-h-0 flex-1 [container-type:size]">
    <div ref={scrollRoot as RefObject<HTMLDivElement | null>} role="region" aria-label={t('detailBodyActivity')} tabIndex={0} data-detail-main-scroll
      className="h-full overflow-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring focus-visible:ring-offset-0">
      <div data-detail-regions className={cn('grid min-h-full grid-cols-1 content-start', hasProperties && '@[60rem]/detail-panel:grid-cols-[minmax(0,1fr)_18rem] @[60rem]/detail-panel:grid-rows-[auto_1fr]')}>
        <section aria-label={t('detailBody')} data-detail-region="body" className="min-w-0 px-5 py-3 @[60rem]/detail-panel:col-start-1 @[60rem]/detail-panel:row-start-1">{regions.body}</section>
        {hasProperties && <section role="region" aria-label={t('detailProperties')} tabIndex={0} data-detail-region="properties"
          className="min-h-0 min-w-0 px-5 py-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring focus-visible:ring-offset-0 @[60rem]/detail-panel:sticky @[60rem]/detail-panel:top-0 @[60rem]/detail-panel:col-start-2 @[60rem]/detail-panel:row-start-1 @[60rem]/detail-panel:row-span-2 @[60rem]/detail-panel:max-h-[100cqh] @[60rem]/detail-panel:self-start @[60rem]/detail-panel:overflow-y-auto @[60rem]/detail-panel:overscroll-contain">{regions.properties}</section>}
        {hasActivity && <section aria-label={t('detailActivity')} data-detail-region="activity" className="min-w-0 px-5 py-3 @[60rem]/detail-panel:col-start-1 @[60rem]/detail-panel:row-start-2">{regions.activity}</section>}
      </div>
    </div>
    </div>
  </>;
}
