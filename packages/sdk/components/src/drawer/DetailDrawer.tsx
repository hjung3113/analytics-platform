import { detailFocusFallback, paneRootById } from '../state/pageFocus';
import { OutcomeBanners, OutcomeScope } from '../filters/OutcomeScope';
import { SearchX } from 'lucide-react';
import { Fragment, useContext, useEffect, useId, useState, useInsertionEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { buildQuery } from '@ap/contracts';
import { invalidValueSentence, PlatformLink, useI18n, useMessages } from '@ap/kernel';
import { RecoverButton } from '../state/RecoverButton';
import { buildShareLink, useHostPlatformOptional } from '@ap/kernel/host';
import { Button, DetailPanelFullscreenContext, DetailPanelHeader, DetailPanelHeaderActions, DetailPanelReadingColumn, useDetailPanelEscape, Tabs, TabsContent, TabsList, TabsTrigger, TransientOverlayScope, useDetailPanelSlot, useSurfacePaused, cn } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { StateMessage } from '../StateView';

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

type DetailDrawerProps = {
  /** For consumers with a detail identity other than focus=: false preserves arrival focus; true claims a user-opened detail. Default follows Kernel navigation. */
  focusOnOpen?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Settled membership in the applied list. While unknown, omit it. False closes the drawer. */
  isInList?: boolean;
  /** The focusable list destination for automatic closure, separate from the manual opener. */
  listFocusRef?: RefObject<HTMLElement | null>;
  /** Optional list-driven close action. Manual close and Escape still use onClose. */
  onListLeave?: () => void;
  /**
   * Which target the drawer shows (a row id, a record key). When it changes while the drawer stays open, the tab content restarts:
   * scroll returns to the top, an uncontrolled tab returns to the first one and the tab content mounts afresh. The drawer itself
   * (header, expansion, focus claim, footer) is not remounted. Omit it and a changed target keeps scroll and tab as before.
   */
  identity?: string | number;
  /** Copy the applied page with these registered page keys replaced. An empty patch opts in without focus=; null hides copy. */
  copyPage?: Readonly<Record<string, string | null>> | null | undefined;
  fullPageHref?: string;
  subtitle?: ReactNode; headerActions?: ReactNode; context?: ReactNode; footer?: ReactNode;
  onClose: () => void; tab?: string; onTabChange?: (tab: string) => void; onTabRecover?: () => void;
} & (
  | { missing?: false; id?: string; title?: ReactNode; tabs: DetailDrawerTab[] }
  | { missing: true; id: string; title?: never; tabs?: never }
);

/** §13: URL-controlled detail content rendered into the shell-owned docked slot. */
export function DetailDrawer(props: DetailDrawerProps) {
  const { onClose } = props;
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
  return host ? createPortal(<TransientOverlayScope active={!paused} detached><OutcomeScope><DetailContent {...props} superseded={superseded} /></OutcomeScope></TransientOverlayScope>, host) : null;
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

function DetailContent({ identity, focusOnOpen, superseded, id: recordId, title, fullPageHref, copyPage, missing, subtitle, headerActions, context, footer, tabs = [], onClose, tab, onTabChange, onTabRecover, returnFocusRef, isInList, listFocusRef, onListLeave = onClose }: DetailDrawerProps & { superseded: MutableRefObject<boolean> }) {
  const { lang, t } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const onKeyDown = useDetailPanelEscape(onClose);
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // #353: whether focus lives inside the panel. Unmount blur has no relatedTarget, so it must not
  // clear this; only a real move to an outside element or an outside pointerdown does (06 §13, §26).
  const focusInside = useRef(false);
  const id = useId();
  const platform = useHostPlatformOptional();
  const autoClosed = useRef(false);
  const listClosedMessage = m('drawerListClosed');
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
  useEffect(() => {
    if (isInList !== false || missing || pausedNow || superseded.current || autoClosed.current) return;
    autoClosed.current = true;
    const previousFocus = document.activeElement;
    onListLeave();
    platform?.toast(listClosedMessage);
    // An expanded drawer's list is inert until the closing commit.
    setTimeout(() => {
      if (document.activeElement !== previousFocus && document.activeElement !== document.body) return;
      const target = listFocusRef?.current;
      if (target?.isConnected && !target.closest('[hidden], [inert], [aria-hidden="true"]')) {
        target.focus({ preventScroll: true });
      }
    }, 0);
  }, [isInList, listClosedMessage, listFocusRef, missing, onListLeave, pausedNow, platform, superseded]);
  useLayoutEffect(() => {
    const opener = returnFocusRef?.current ?? document.activeElement as HTMLElement | null;
    // Arrival with focus= leaves the title focused (§26). Same-screen open still moves here.
    // No provider means a locally mounted drawer, which still claims the close button.
    const claim = (focusOnOpen ?? pageNavigation?.claimsDetailFocus() ?? true) && !paused.current;
    const closeButton = close.current;
    if (claim && closeButton) {
      // An automatically focused icon must not open a tooltip that takes the first Escape.
      closeButton.setAttribute('data-detail-initial-focus', '');
      closeButton.focus({ preventScroll: true });
      closeButton.removeAttribute('data-detail-initial-focus');
    }
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the cleanup must read the latest flag; a copy taken at mount would never see the supersession
      if (superseded.current) return;
      if (paused.current) return;
      if (autoClosed.current && listFocusRef) return;
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
  }, [pageNavigation, paneId, superseded, paused, focusOnOpen, returnFocusRef, listFocusRef]);
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
  const heading = fullPageHref && title != null
    ? <PlatformLink href={fullPageHref} className="block truncate rounded-sm hover:underline focus-visible:-outline-offset-2">{title}</PlatformLink>
    : title;
  const shared = platform && !missing && copyPage !== null && (copyPage !== undefined || platform.pageParam('focus'))
    ? buildShareLink({ kind: 'conditions', route: platform.route, global: platform.global, page: platform.page, pageOverride: copyPage, absoluteUrl: platform.absoluteUrl })
    : null;
  const copyError = shared && !shared.ok
    ? m(shared.reason === 'too-long' ? 'drawerShareTooLong' : 'drawerShareInvalid')
    : m('copyLinkFailed');
  const copyAction = shared && platform && <DetailPanelHeaderActions copyUrl={shared.ok ? shared.href : null}
    notify={{ success: message => platform.toast(message), error: message => platform.toast(message, 'warning') }}
    messages={{ copy: m('drawerCopyLink'), success: m('drawerLinkCopied'), error: copyError }} />;
  return <div ref={panel} role="dialog" tabIndex={-1} aria-modal="false" aria-labelledby={`${id}-t`}
    onFocus={() => { focusInside.current = true; }}
    onPointerDownCapture={() => { focusInside.current = true; }}
    onBlur={e => { const to = e.relatedTarget as Node | null; if (to && !panel.current?.contains(to)) focusInside.current = false; }}
    onKeyDown={onKeyDown}
    className={cn('flex h-full min-h-0 w-full flex-col bg-surface-detail', tabs.some(tb => tb.regions !== undefined) && '@container/detail-panel')}>
    {!missing && paneLabel && <p data-detail-pane-label className="truncate px-5 pt-2 text-xs text-text-muted">{paneLabel}</p>}
    <DetailPanelHeader id={recordId} title={missing ? undefined : heading} headingId={`${id}-t`}
      onClose={onClose} closeRef={close} closeLabel={m('drawerCloseDetails')} showExpand={!missing}
      expandLabel={t('detailExpand')} collapseLabel={t('detailCollapse')}
      extras={!missing && <>{copyAction}{headerActions}</>}
      metadata={!missing && subtitle && <div className="truncate text-xs text-text-muted">{subtitle}</div>} />
    {missing ? <div className="px-5 py-3 break-keep">
      <StateMessage compact icon={<SearchX className="size-4" aria-hidden />} title={m('drawerMissingItem')}
        action={<Button type="button" size="sm" variant="secondary" onClick={onClose}>{m('drawerClearSelection')}</Button>} />
    </div> : <>
    {context && <div className="border-b border-border-subtle bg-surface-sunken px-5 py-2 text-xs text-text-secondary">{context}</div>}
    <OutcomeBanners />
    {/* One tab draws no tab row (06 §13, #886 UX-8); the content stays a focusable, named scroll region like a tabpanel. */}
    <Fragment key={identity}>
    {tabs.length > 0 && (tab !== undefined && !tabs.some(candidate => candidate.id === tab)
      ? <div role="alert" className="grid gap-2 px-5 py-3"><p>{invalidValueSentence(lang, 'value', COMPONENTS_MESSAGES.drawerDetailTabField, tab)}</p><RecoverButton onRecover={onTabRecover ?? (() => onTabChange?.(tabs[0].id))} label={m('drawerClearTabValue')} /></div>
      : tabs.length === 1
      ? tabs[0].regions !== undefined ? <DeclaredRegions regions={tabs[0].regions} /> : <div role="region" tabIndex={0} aria-labelledby={`${id}-t`} className="min-h-0 flex-1 scrollbar-panel overflow-auto px-5 py-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring focus-visible:ring-offset-0"><DetailPanelReadingColumn>{tabs[0].content}</DetailPanelReadingColumn></div>
      : <Tabs value={tab} defaultValue={tab ? undefined : tabs[0].id} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label={m('drawerDetailTabs')} className="mx-5 mt-3 w-auto">
          {tabs.map(tb => <TabsTrigger key={tb.id} value={tb.id}>{tb.label}</TabsTrigger>)}
        </TabsList>
        {tabs.map(tb => (
          // eslint-disable-next-line shadcn/no-restyle -- the aside clips overflow, so the focus ring must sit inside the panel (#914 A1)
          <TabsContent key={tb.id} value={tb.id} className={tb.regions !== undefined ? 'flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:ring-inset focus-visible:ring-offset-0' : 'min-h-0 flex-1 scrollbar-panel overflow-auto px-5 py-3 focus-visible:ring-inset focus-visible:ring-offset-0'}>{tb.regions !== undefined ? <DeclaredRegions regions={tb.regions} /> : <DetailPanelReadingColumn>{tb.content}</DetailPanelReadingColumn>}</TabsContent>
        ))}
      </Tabs>)}
    </Fragment>
    {footer !== undefined && <DetailPanelReadingColumn asChild><div className="shrink-0 border-t border-border-subtle px-5 py-3">{footer}</div></DetailPanelReadingColumn>}
    </>}
    </div>;
}


/**
 * Keep DOM/keyboard order body → properties → activity at every width. The main
 * scrollport carries the left track; the properties track sticks inside it and
 * scrolls independently. Size containment supplies its available block size in
 * cqh without geometry observers, reparenting or a second copy of the content.
 */
function DeclaredNavigation({ render, scrollRoot }: { render: NonNullable<DetailDrawerRegions['navigation']>; scrollRoot: RefObject<HTMLElement | null> }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [generation, setGeneration] = useState(0);
  // CSS hides this at two columns, but a menu it opened lives in a portal. Remounting closes it.
  useEffect(() => {
    const element = wrapper.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let shown = true;
    const observer = new ResizeObserver(entries => {
      const nowShown = (entries[0]?.contentRect.width ?? 0) > 0;
      if (shown && !nowShown) setGeneration(value => value + 1);
      shown = nowShown;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={wrapper} data-detail-navigation className="@[60rem]/detail-panel:hidden"><Fragment key={generation}>{render(scrollRoot)}</Fragment></div>;
}

function DeclaredRegions({ regions }: { regions: DetailDrawerRegions }) {
  const { t } = useI18n();
  const hasProperties = regions.properties !== undefined && regions.properties !== null && regions.properties !== false;
  const hasActivity = regions.activity !== undefined && regions.activity !== null && regions.activity !== false;
  const scrollRoot = useRef<HTMLDivElement | null>(null);
  // No token covers size containment or a 100cqh cap: properties use this scrollport's height, not the viewport's.
  return <>
    {regions.navigation && <DeclaredNavigation render={regions.navigation} scrollRoot={scrollRoot} />}
    <div className="min-h-0 flex-1 [container-type:size]">
    <div ref={scrollRoot} role="region" aria-label={t('detailBodyActivity')} tabIndex={0} data-detail-main-scroll
      className="h-full scrollbar-panel overflow-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring focus-visible:ring-offset-0">
      <div data-detail-regions className={cn('grid min-h-full grid-cols-1 content-start', hasProperties && '@[60rem]/detail-panel:grid-cols-[minmax(0,1fr)_18rem] @[60rem]/detail-panel:grid-rows-[auto_1fr]')}>
        <section aria-label={t('detailBody')} data-detail-region="body" className="min-w-0 px-5 py-3 @[60rem]/detail-panel:col-start-1 @[60rem]/detail-panel:row-start-1">{regions.body}</section>
        {hasProperties && <section role="region" aria-label={t('detailProperties')} tabIndex={0} data-detail-region="properties"
          className="min-h-0 min-w-0 px-5 py-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring focus-visible:ring-offset-0 @[60rem]/detail-panel:sticky @[60rem]/detail-panel:top-0 @[60rem]/detail-panel:col-start-2 @[60rem]/detail-panel:row-start-1 @[60rem]/detail-panel:row-span-2 @[60rem]/detail-panel:max-h-[100cqh] @[60rem]/detail-panel:self-start scrollbar-panel @[60rem]/detail-panel:overflow-y-auto @[60rem]/detail-panel:overscroll-contain">{regions.properties}</section>}
        {hasActivity && <section aria-label={t('detailActivity')} data-detail-region="activity" className="min-w-0 px-5 py-3 @[60rem]/detail-panel:col-start-1 @[60rem]/detail-panel:row-start-2">{regions.activity}</section>}
      </div>
    </div>
    </div>
  </>;
}
