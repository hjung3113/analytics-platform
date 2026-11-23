import { DeclaredPageConditions, PageConditionTriggerSlot, type PageConditionLayerOptions } from '../filters/DeclaredPageConditions';
import { PageDensityProvider, pageInsetX, useCompactPageDensity } from '../pageDensity';
import { carriesReturnTo, pageConditionKeys } from '@ap/contracts';
import { formatQuerySummary, summaryPreset } from '../filters/querySummary';
import { QueryBarExtensionContext, usePublishQueryBarExtension, type QueryBarExtension } from '../filters/QueryBarExtension';
import { QueryBarStatusContext, type ContextEditorFocus, useQueryBarStatus, type QueryBarStatus } from '../filters/QueryBarStatus';
import { OutcomeBanners, OutcomeScope } from '../filters/OutcomeScope';
import { WorkspaceQueryBarContext } from './WorkspaceQueryBar';
import { PageContextHead, PageHeadBody } from './PageContextHead';
import { ChevronRight, Info, Loader2, MapPinOff, MoreHorizontal, RotateCw, ServerCrash, Star } from 'lucide-react';
import { cloneElement, createContext, isValidElement, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { errorGuidance, formatSummaryTime, type MenuEntry, PlatformLink, type QueryStatus, useConditionPreset, useI18n, useMessages } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import { useArrivalFocus, useHostPlatform } from '@ap/kernel/host';
import { Button, cn, DetailPanelFullscreenContext, PermissionBlockedPanel, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { DataTrustIndicator } from '../state/DataTrustIndicator';
import { AccessRequestEntry, accessRequestBody, useScopeAccessRequest } from '../state/AccessRequestEntry';
import { ReturnLink, ReturnRowShown, useReturnNavigation } from './DrillLayout';
import { type HeaderYield, nextHeaderYield, openHeaderYield } from './headerYield';
import { drillDestinationOf, focusPageFallback } from '../state/pageFocus';
import { PageBoundContext, PageFlowContext } from '../pageFlow';
import { stickyChromeHeight } from '../visibleArea';
import { StateMessage } from '../StateView';
import { ObjectLinkItems } from './ObjectLinkItems';
import { useInWorkspacePanel } from '../workspace/panelContext';

function withTrustYield(node: ReactNode, yieldState: HeaderYield): ReactNode {
  if (!isValidElement(node) || node.type !== DataTrustIndicator) return node;
  return cloneElement(node as ReactElement<{ compact?: boolean; hideProvisional?: boolean }>, {
    compact: yieldState.trust,
    hideProvisional: yieldState.badge,
  });
}

/** What `HeaderOverflow` hands a dialog it hosts: `close`, and the `onCloseAutoFocus` that returns focus to `더보기` unless the user navigated. */
export type HeaderOverflowDialogControl = { close: () => void; onCloseAutoFocus: (event: Event) => void };
type ShowHeaderDialog = (render: (control: HeaderOverflowDialogControl) => ReactNode) => void;
const HeaderOverflowDialogContext = createContext<ShowHeaderDialog | null>(null);

/**
 * For an item inside the `⋯` menu that opens a dialog: the menu closes on any click inside and unmounts its items, so the dialog is
 * handed to the header, which keeps it mounted outside the menu. Null outside a page header's `⋯` menu.
 */
export function useHeaderOverflowDialog(): ShowHeaderDialog | null {
  return useContext(HeaderOverflowDialogContext);
}

export { HeaderOverflowItem } from './HeaderOverflowItem';

function HeaderOverflowGroup({ title, children }: { title: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return <>
    <div role="separator" className="-mx-1 h-px bg-border-subtle" />
    <div role="group" aria-labelledby={headingId} className="grid gap-2">
      <div id={headingId} className="break-keep px-2 py-1.5 text-sm font-semibold text-text-primary">{title}</div>
      {children}
    </div>
  </>;
}

function HeaderOverflow({ actions }: { actions: ReactNode }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const label = m('chartMore');
  const group = m('pageOtherActions');
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<((control: HeaderOverflowDialogControl) => ReactNode) | null>(null);
  const { location } = useHostPlatform();
  const openingPath = useRef<string | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hostedDialogOpening = useRef(false);
  const show = useCallback<ShowHeaderDialog>(render => {
    // The menu is about to close because of this click; it must not pull focus back to the trigger over the dialog.
    hostedDialogOpening.current = true;
    setDialog(() => render);
  }, []);
  const control = useMemo<HeaderOverflowDialogControl>(() => ({
    close: () => setDialog(null),
    onCloseAutoFocus: event => {
      event.preventDefault();
      // A destination page owns focus after navigation (06 §26).
      if ((location.read()?.split('?')[0] ?? null) === openingPath.current) trigger.current?.focus({ preventScroll: true });
    },
  }), [location]);
  return <HeaderOverflowDialogContext.Provider value={show}>
    <Popover open={open} onOpenChange={next => {
      if (next) openingPath.current = location.read()?.split('?')[0] ?? null;
      setOpen(next);
    }}>
      <PopoverTrigger asChild>
        <Button ref={trigger} type="button" variant="ghost" size="icon-sm" aria-label={label} title={label}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
      </PopoverTrigger>
      <PopoverContent ref={content} align="end" role="group" aria-label={group} className="min-w-56" padding="compact"
        onOpenAutoFocus={event => {
          // Radix's default autofocus skips anchors; secondary actions can be links.
          const focusable = Array.from(content.current?.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]') ?? [])
            .filter(control => control.tabIndex >= 0 && !control.matches(':disabled, input[type="hidden"]')
              && !control.closest('[hidden], [inert]') && getComputedStyle(control).display !== 'none' && getComputedStyle(control).visibility !== 'hidden');
          // A blocked (`aria-disabled`) row is reachable by Tab, but the menu lands on an enabled row when there is one.
          const first = focusable.find(control => control.getAttribute('aria-disabled') !== 'true') ?? focusable[0];
          if (first) { event.preventDefault(); first.focus(); }
        }}
        onCloseAutoFocus={event => {
          if (hostedDialogOpening.current) { hostedDialogOpening.current = false; event.preventDefault(); return; }
          // A destination page owns focus after navigation (06 §26).
          if ((location.read()?.split('?')[0] ?? null) !== openingPath.current) event.preventDefault();
        }}>
        <div className="grid gap-2 p-1" onClick={() => setOpen(false)}>{actions}</div>
      </PopoverContent>
    </Popover>
    {dialog?.(control)}
  </HeaderOverflowDialogContext.Provider>;
}

export type PlatformPageProps = {
  /** Overrides the registry label (e.g. detail pages show the object ID). */
  title?: ReactNode;
  description?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  /** Page-owned controls rendered directly under the global Context bar (never a second global filter). */
  contextExtension?: ReactNode;
  /**
   * Explanatory notes shown above `contextExtension`, one array element per note (`null`/`false` elements are dropped). On a `fill`
   * page they sit at the top of the collapsible head and the collapsed line shows only their count.
   */
  contextNotes?: readonly ReactNode[];
  dataTrustSummary?: ReactNode;
  queryBarExtension?: QueryBarExtension;
  /** Optional S2 option adapter for declared page conditions; the SDK mounts the layer. */
  pageConditionOptions?: PageConditionLayerOptions;
  /** Completion of the consumer's authoritative summary query, including terminal error responses. */
  queryResult?: { completedAt: number | null; status: QueryStatus; /** Whether the completed summary response failed. */ failed?: boolean;
    /** The failed response's message, so a query the Kernel refused before sending reads as «not queried», not as a load failure (#2440). */ message?: string };
  /** Extra crumbs between the menu and the current object. */
  crumbs?: { label: ReactNode; href?: string }[];
  /**
   * `flow` (default): the page grows with its content. `fill`: the page takes its container's height (the main area, or a board pane's
   * body) and the body takes what the header leaves, so a `PanelWorkspace` child fills it; the body keeps at least 520 px (a 300 px plot plus the card chrome), so a tall chrome scrolls the page instead of crushing the workspace. Opt in only for a workspace page.
   */
  layout?: 'flow' | 'fill';
  /** Visual spacing inherited by SDK descendants; compact by default (#1217) — `comfortable` is the explicit developer option. Never persisted. */
  density?: 'comfortable' | 'compact';
  /**
   * `'none'` removes the content body's horizontal inset and top/bottom padding so an edge-to-edge child (a list shell, a board, a split pane) meets the page edges; for screens that draw their own full-bleed frame. A gate message and the outcome banners keep the inset. Visual only; `default` leaves the body as is (#1291).
   */
  bodyInset?: 'default' | 'none';
  /** Defaults to true. Disable when the menu uses `returnTo` as input without offering return navigation. */
  showReturnRow?: boolean;
  /** Where `page`/`return` arrival focus lands instead of the heading, while the returned element is connected (a `drill` arrival keeps the current step). */
  arrivalTarget?: () => HTMLElement | null;
  children: ReactNode;
};

/** §8 Shell Slots. Pages never insert global UI outside these slots. */
export function PlatformPage(props: PlatformPageProps) {
  const { route } = useHostPlatform();
  const declaration = route?.menu.pageConditions;
  if (!declaration) return <PlatformPageFrame {...props} />;
  return <DeclaredPageConditions declaration={declaration} options={props.pageConditionOptions} extension={props.queryBarExtension}>
    {binding => <PlatformPageFrame {...props} queryBarExtension={binding.extension} conditionTrigger={binding.trigger} conditionLayer={binding.layer} />}
  </DeclaredPageConditions>;
}

/** Host wrapper for the mounted content body, leaving the page chrome outside its error boundary. */
export const PlatformPageBodyBoundary = createContext<((body: ReactNode) => ReactNode) | null>(null);

function PlatformPageFrame({ title, description, primaryAction, secondaryActions, contextExtension, contextNotes, dataTrustSummary, queryBarExtension, queryResult, crumbs = [], layout = 'flow', density = 'compact', bodyInset = 'default', showReturnRow = true, arrivalTarget, children, conditionTrigger, conditionLayer }: PlatformPageProps & { conditionTrigger?: ReactNode; conditionLayer?: ReactNode }) {
  const wrapBody = useContext(PlatformPageBodyBoundary);
  const { global, equipmentAxes, route, objectLinks, favorites, toggleFavorite, scope, retryScope, setGlobal, lastScope, linkTo, registry, slots, url, currentSpace, screenMode, canOpen, queryDraft, pageParams, scopeSelector } = useHostPlatform();
  const detailFullscreen = useContext(DetailPanelFullscreenContext);
  const covered = detailFullscreen?.expanded === true;
  const conditionPreset = useConditionPreset();
  // A board pane draws content only: the board owns the pane head and the Context bar, and no arrival focus moves here (ADR-0049).
  const inPane = screenMode === 'pane';
  usePublishQueryBarExtension(queryBarExtension);
  // The query bar inside this page reports what it shows; a board pane's bar lives in another tree and arrives through the shared store.
  const [barStatus, setBarStatus] = useState<QueryBarStatus | null>(null);
  const [parameterTarget, setParameterTarget] = useState<HTMLDivElement | null>(null);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [editorFocus, setEditorFocus] = useState<ContextEditorFocus | null>(null);
  const localBarStatus = useMemo(() => ({ status: barStatus, report: setBarStatus, editorFocus, setEditorFocus }), [barStatus, editorFocus]);
  const paneBarStatus = useQueryBarStatus();
  const shownBarStatus = barStatus ?? paneBarStatus;
  const { t, tx, lang } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  const programmaticHeadingFocus = useRef(false);
  const [headingTooltipOpen, setHeadingTooltipOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // A workspace that shows its rows at their own heights (`PanelWorkspace` stack mode) registers here; the fill page then sizes to it and the main area scrolls.
  const [flowing, setFlowing] = useState(0);
  const registerFlow = useCallback(() => { setFlowing(count => count + 1); return () => { setFlowing(count => count - 1); }; }, []);
  const [bounding, setBounding] = useState(0);
  const registerBound = useCallback(() => { setBounding(count => count + 1); return () => { setBounding(count => count - 1); }; }, []);
  const stickyHeader = useRef<HTMLDivElement>(null);
  const pageHeader = useRef<HTMLElement>(null);
  const descriptionText = useRef<HTMLDivElement>(null);
  const descriptionButton = useRef<HTMLButtonElement>(null);
  const restoreDescriptionFocus = useRef(false);
  const programmaticDescriptionFocus = useRef(false);
  const [descriptionTooltipOpen, setDescriptionTooltipOpen] = useState(false);
  const yieldRef = useRef(openHeaderYield);
  const measureRef = useRef<() => void>(() => {});
  const [headerYield, setHeaderYield] = useState<HeaderYield>(openHeaderYield.yielded);
  useLayoutEffect(() => {
    const header = stickyHeader.current;
    if (!header) return;
    const measure = () => {
      root.current?.style.setProperty('--page-sticky-offset', `${stickyChromeHeight(root.current)}px`);
      const band = pageHeader.current;
      const width = band?.getBoundingClientRect().width ?? 0;
      if (!band || width <= 0) return;
      const prev = yieldRef.current;
      // The measured overflow, not the width alone, decides a stage the fixed widths missed (#398 UX-1).
      const next = nextHeaderYield(width, prev, band.scrollWidth > band.clientWidth);
      yieldRef.current = next;
      if (next.yielded.description === prev.yielded.description && next.yielded.trust === prev.yielded.trust && next.yielded.badge === prev.yielded.badge) return;
      if (next.yielded.description !== prev.yielded.description) {
        const trigger = prev.yielded.description ? descriptionButton.current : descriptionText.current;
        restoreDescriptionFocus.current = trigger != null && document.activeElement === trigger;
      }
      setHeaderYield(next.yielded);
    };
    measureRef.current = measure;
    // No direct measure() here: the [headerYield] layout effect below measures once on mount, after this assignment.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    // Data Trust text or actions arriving later widen the content without resizing the header.
    for (const child of Array.from(pageHeader.current?.children ?? [])) observer.observe(child);
    observer.observe(header);
    const inlineBar = root.current?.querySelector('[data-query-bar]');
    if (inlineBar) observer.observe(inlineBar);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!restoreDescriptionFocus.current) return;
    restoreDescriptionFocus.current = false;
    const target = headerYield.description ? descriptionButton.current : descriptionText.current;
    setDescriptionTooltipOpen(false);
    programmaticDescriptionFocus.current = true;
    try { target?.focus({ preventScroll: true }); }
    finally { programmaticDescriptionFocus.current = false; }
  }, [headerYield.description]);
  // A closed stage changes the content width but not the header's: measure again so the next stage can close
  // before paint. Each pass closes one of three stages, so this ends.
  useLayoutEffect(() => { measureRef.current(); }, [headerYield]);
  const arrivalTargetRef = useRef(arrivalTarget);
  useLayoutEffect(() => { arrivalTargetRef.current = arrivalTarget; });
  // A palette selection remains pending until Dialog's close autofocus completes; the hook reads it again then.
  useArrivalFocus(request => {
    // A pane takes no automatic arrival focus; its explicit drill/return requests still land inside the pane.
    if (inPane && request === 'page') return;
    const currentStep = request === 'drill' && root.current ? drillDestinationOf(root.current) : null;
    const registered = request === 'drill' ? null : arrivalTargetRef.current?.();
    const target = currentStep ?? (registered?.isConnected ? registered : null) ?? heading.current;
    if (!target) { if (inPane) focusPageFallback(root.current); return; }
    programmaticHeadingFocus.current = target === heading.current;
    if (programmaticHeadingFocus.current) setHeadingTooltipOpen(false);
    try { target.focus({ preventScroll: true }); }
    finally { programmaticHeadingFocus.current = false; }
  }, { rereadKey: url });
  const menu = route!.menu;
  // `분석 보드에 열기…` (docs/16 §6): the app's slot item, only on the main screen of a menu that declares board support and the user can open.
  const boardEntry = !inPane && menu.features.board === true && canOpen(menu.id) ? slots.boardEntry : null;
  // Items the app adds to every analysis screen's `⋯` (#1424): the same main-screen gate as the board entry; the page keys are the ones this menu declares.
  const analysisSlot = slots.analysisActions;
  const AnalysisActions = !inPane && (analysisSlot?.pageTypes ?? ['analysis']).includes(menu.pageType) && (analysisSlot?.appliesTo?.(menu.id) ?? true) ? analysisSlot?.Actions : undefined;
  const analysisPage = Object.fromEntries(menu.pageKeys.flatMap(key => { const values = pageParams(key); return values.length === 0 ? [] : [[key, menu.repeatedPageKeys?.includes(key) ? values : values[0]!]]; }));
  const analysisSubject = Object.fromEntries(Object.entries(menu.subjectPageKeys ?? {}).flatMap(([kind, key]) => { const value = analysisPage[key]; return typeof value === 'string' ? [[kind, value]] : []; }));
  const analysisActions = AnalysisActions ? <AnalysisActions menuId={menu.id} global={global} page={analysisPage} {...(Object.keys(analysisSubject).length ? { subject: analysisSubject } : {})} /> : null;
  // Match analysisActions: header additions are main-screen only; pane headers belong to their host.
  const objectGroups = !inPane ? Object.entries(menu.subjectLinks ?? {}).flatMap(([kind, source]) => {
    const id = source === true ? analysisSubject[kind] : route!.params[source.param];
    if (!id) return [];
    const links = objectLinks({ kind, id }, { returnTo: true });
    if (!links.length) return [];
    return [<HeaderOverflowGroup key={kind} title={<><span className="font-mono">{id}</span> {t('objectLinks')}</>}>
      <ObjectLinkItems links={links} />
    </HeaderOverflowGroup>];
  }) : [];
  const favoriteTarget = menu.navHidden ? null : menu;
  const isFavorite = favoriteTarget ? favorites.includes(favoriteTarget.id) : false;
  const parent: MenuEntry | null = menu.parent ? registry.menuById(menu.parent) : null;
  // <system> › <section> › <menu> (15 §3.2, same rule as the palette): a section name equal to the name drawn right before or after it is written once.
  const sectionName = tx(registry.groupById(menu.group).label);
  const sectionShown = currentSpace !== null && sectionName !== tx(currentSpace.label) && sectionName !== tx((parent ?? menu).label);
  // #353: a gate action button disappears with the state change it triggers, so keyboard focus must
  // move before that — §19 banner dismissal rule: main landmark, page content element outside a shell.

  // `Scope 선택` (#1938) only opens the shell's selector; it is drawn on the main screen while a selector is mounted to answer it (a pane has no selector that answers for it).
  const selectorAvailable = useSyncExternalStore(scopeSelector.subscribe, scopeSelector.available, scopeSelector.available) && screenMode === 'main';
  const gate: ReactNode = menu.requiresScope && scope.status !== 'valid' ? <ScopeGate root={root} selectorAvailable={selectorAvailable} /> : null;
  const notes = (contextNotes ?? []).filter(note => note != null && note !== false);
  const headVisible = (notes.length > 0 || Boolean(contextExtension)) && !gate;
  // Declared keys already have their own chips and polite region; legacy head metadata keeps only menu-published keys.
  const headSummary = (queryBarExtension?.appliedPageSummary ?? queryBarExtension?.pageSummary ?? []).filter(item => !conditionTrigger || !menu.pageConditions?.categories.some(category => pageConditionKeys(category).includes(item.key)));
  const titleResolved = title ?? tx(menu.label);
  const descriptionResolved = description ?? tx(menu.description);
  const hasDescription = typeof descriptionResolved === 'string' ? descriptionResolved.trim().length > 0 : descriptionResolved != null && descriptionResolved !== false;
  const m = useMessages(COMPONENTS_MESSAGES);
  const descriptionName = typeof descriptionResolved === 'string' && descriptionResolved.trim().length > 0
    ? descriptionResolved
    : m('pageDescription');

  // rem like the classes it mirrors: 7rem = h1 min-w-28, 1.5rem = size-6 controls, 0.5rem = gap-2; the breadcrumb and an un-yielded description shrink to 0.
  const leftGroupItems = 1 + (favoriteTarget ? 1 : 0) + (hasDescription ? 1 : 0) + (currentSpace || parent || crumbs.length > 0 ? 1 : 0);
  const leftGroupControls = (favoriteTarget ? 1 : 0) + (hasDescription && headerYield.description ? 1 : 0);
  const leftGroupMinWidth = `calc(7rem + ${leftGroupControls * 1.5}rem + ${(leftGroupItems - 1) * 0.5}rem)`;

  const fixedFill = layout === 'fill' && flowing === 0;
  // A folded bar that is not editing already prints the applied values in its summary (#1170): the strip keeps only the completion time.
  const appliedValuesShown = !(shownBarStatus?.folded && !shownBarStatus.editing);
  const workspaceQueryBar = !inPane && layout === 'fill' && menu.pageType === 'analysis' && menu.query?.mode === 'apply' && Boolean(slots.contextBar) && !gate && shownBarStatus?.folded === true;
  const workspaceQueryRowReady = workspaceQueryBar && parameterTarget !== null && toolbarTarget !== null;
  const failedKey = queryResult?.failed && errorGuidance(queryResult.message).blocked ? 'sharedOutcomeBlocked' : 'stateError';
  const workspaceStatus = queryResult && queryResult.status !== 'idle' ? <span role="status" className="max-w-56 text-xs text-text-secondary break-keep">
    {queryResult.status === 'loading' || queryResult.status === 'refreshing' ? t(queryResult.status) : queryResult.failed ? t(failedKey) : m('workspaceQueryCompleted')}
    {queryResult.completedAt !== null && <> {formatSummaryTime(queryResult.completedAt, lang)}</>}
  </span> : null;
  const completionShown = queryResult != null && queryResult.completedAt !== null && (queryResult.status === 'done' || queryResult.status === 'refreshing');
  const carriesOrigin = carriesReturnTo(registry.carrySetOf(menu));
  const navigation = useReturnNavigation({ announceReverted: !carriesOrigin });
  const showReturn = showReturnRow && !gate && navigation.origin.accepted;
  const headerActions = showReturn && isValidElement(secondaryActions) && secondaryActions.type === ReturnLink ? undefined : secondaryActions;
  const content = <OutcomeScope>
    {bodyInset === 'none'
      ? <div className={cn(pageInsetX(density === 'compact'), density === 'compact' ? 'has-[[data-outcome-banner]]:pt-3' : 'has-[[data-outcome-banner]]:pt-7')}><OutcomeBanners compact /></div>
      : <OutcomeBanners compact />}
    {layout === 'fill' ? <div data-platform-page-fill className={fixedFill ? 'flex min-h-[520px] flex-1 flex-col' : 'flex flex-1 flex-col'}>{children}</div> : children}
  </OutcomeScope>;
  return <WorkspaceQueryBarContext.Provider value={workspaceQueryBar ? { status: workspaceStatus, parameterTarget, setParameterTarget, toolbarTarget, setToolbarTarget } : null}><PageDensityProvider value={density}><QueryBarExtensionContext.Provider value={queryBarExtension}><QueryBarStatusContext.Provider value={localBarStatus}><PageFlowContext.Provider value={layout === 'fill' ? registerFlow : null}><PageBoundContext.Provider value={layout === 'fill' ? registerBound : null}><ReturnRowShown.Provider value={showReturn}><div ref={root} data-platform-page data-page-layout={layout === 'fill' ? 'fill' : undefined} className={fixedFill ? 'flex h-full min-h-0 flex-col' : 'flex min-h-full flex-col'}>
    {!inPane && <div ref={stickyHeader} data-page-sticky-header data-canvas-band className="sticky top-0 z-20 shrink-0 border-b border-border-chrome bg-surface-band">
      <header ref={pageHeader} onFocus={event => {
        const header = event.currentTarget;
        // Popover portals bubble through React but are outside this scroll container.
        if (!header.contains(event.target) || header.scrollWidth <= header.clientWidth) return;
        const headerRect = header.getBoundingClientRect();
        const targetRect = event.target.getBoundingClientRect();
        const left = headerRect.left + header.clientLeft;
        const right = left + header.clientWidth;
        // scrollLeft is whole pixels; round away from the edge so a fractional rect lands fully inside.
        if (targetRect.left < left) header.scrollLeft += Math.floor(targetRect.left - left);
        else if (targetRect.right > right) header.scrollLeft += Math.ceil(targetRect.right - right);
      }} className="flex h-[50px] shrink-0 overflow-x-auto items-center justify-between gap-3 border-b border-border-subtle bg-surface-canvas px-4">
        {/* Explicit min-width = only the parts that cannot shrink (title minimum 7rem + star 1.5rem + yielded description
            icon 1.5rem + gaps 0.5rem). The automatic minimum would be the nowrap text's min-content (min-w-0 does not lower
            that contribution), so an un-yielded header overflowed; a fixed 7rem let the shrink-0 controls spill
            into the right group (#398 AA2-1). */}
        <div style={{ '--header-left-min': leftGroupMinWidth } as CSSProperties} className="flex min-w-[var(--header-left-min)] flex-1 items-center gap-2">
          {(currentSpace || parent || crumbs.length > 0) && <nav aria-label={t('breadcrumb')} className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
            {currentSpace && <><span data-breadcrumb-system className="min-w-0 truncate" title={tx(currentSpace.label)}>{tx(currentSpace.label)}</span><ChevronRight className="size-3 shrink-0" aria-hidden /></>}
            {sectionShown && <><span data-breadcrumb-section className="min-w-0 truncate" title={sectionName}>{sectionName}</span><ChevronRight className="size-3 shrink-0" aria-hidden /></>}
            {parent && <><PlatformLink className="min-w-0 truncate hover:text-accent-primary" title={tx(parent.label)} href={linkTo(parent.id)}>{tx(parent.label)}</PlatformLink><ChevronRight className="size-3 shrink-0" aria-hidden /></>}
            {crumbs.map((crumb, index) => <span key={index} className="flex min-w-0 items-center gap-1">
              {crumb.href ? <PlatformLink className="min-w-0 truncate hover:text-accent-primary" title={typeof crumb.label === 'string' ? crumb.label : undefined} href={crumb.href}>{crumb.label}</PlatformLink> : <span className="truncate">{crumb.label}</span>}
              <ChevronRight className="size-3 shrink-0" aria-hidden />
            </span>)}
          </nav>}
          <TooltipProvider><Tooltip open={headingTooltipOpen} onOpenChange={open => {
            if (!open || !programmaticHeadingFocus.current) setHeadingTooltipOpen(open);
          }}><TooltipTrigger asChild>
            <h1 ref={heading} tabIndex={0} title={typeof titleResolved === 'string' ? titleResolved : undefined} className="min-w-28 shrink truncate t-section-title text-text-primary">{titleResolved}</h1>
          </TooltipTrigger><TooltipContent>{titleResolved}</TooltipContent></Tooltip></TooltipProvider>
          {favoriteTarget && <button type="button" onClick={() => toggleFavorite(favoriteTarget.id)} aria-pressed={isFavorite}
            aria-label={isFavorite ? t('removeFavorite') : t('addFavorite')} title={isFavorite ? t('removeFavorite') : t('addFavorite')}
            className="grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-accent-warn">
            <Star className={cn('size-3.5', isFavorite && 'fill-accent-warn text-accent-warn')} aria-hidden />
          </button>}
          {hasDescription && <TooltipProvider><Tooltip open={descriptionTooltipOpen} onOpenChange={open => {
            if (!open || !programmaticDescriptionFocus.current) setDescriptionTooltipOpen(open);
          }}><TooltipTrigger asChild>
            {headerYield.description ? <button ref={descriptionButton} type="button" aria-label={descriptionName} title={typeof descriptionResolved === 'string' ? descriptionResolved : undefined} className="grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover">
              <Info className="size-3.5" aria-hidden />
            </button> : <div ref={descriptionText} tabIndex={0} className="min-w-0 flex-1 basis-0 truncate text-xs text-text-muted" title={typeof descriptionResolved === 'string' ? descriptionResolved : undefined}>{descriptionResolved}</div>}
          </TooltipTrigger><TooltipContent>{descriptionResolved}</TooltipContent></Tooltip></TooltipProvider>}
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap">
          {!gate && dataTrustSummary && withTrustYield(dataTrustSummary, headerYield)}
          {!gate && (headerActions || boardEntry || analysisActions || objectGroups.length > 0) && <HeaderOverflow actions={<>{headerActions}{boardEntry}{analysisActions}{objectGroups}</>} />}
          {!gate && primaryAction}
        </div>
      </header>
      {menu.query?.mode !== 'apply' && <div className="contents" inert={covered || undefined}>{slots.contextBar}</div>}
    </div>}
    <div data-platform-page-body className="contents" inert={covered || undefined}>
    {showReturn && <ReturnRow navigation={navigation} />}
    {!inPane && menu.query?.mode === 'apply' && slots.contextBar}
    {!workspaceQueryRowReady && !gate && menu.query?.mode === 'apply' && queryResult && (appliedValuesShown || completionShown) && <section role="region" aria-label={m('pageAppliedQueryConditions')} className="flex flex-wrap gap-2 border-b border-border-subtle px-4 py-2 text-xs text-text-secondary">
      {appliedValuesShown && <span className="min-w-0 [overflow-wrap:anywhere]">{formatQuerySummary(global, { lang, axes: equipmentAxes, context: menu.context, pageSummary: queryBarExtension?.appliedPageSummary, preset: summaryPreset(conditionPreset, 'applied') })}</span>}
      {completionShown && <span>{queryResult!.failed ? t(failedKey) : m('workspaceQueryCompleted')} {formatSummaryTime(queryResult!.completedAt!, lang)}</span>}
    </section>}
    {!gate && conditionTrigger && <PageConditionTriggerSlot>{conditionTrigger}</PageConditionTriggerSlot>}
    {headVisible && (layout === 'fill'
      ? <PageContextHead key={menu.id} menuId={menu.id} notes={notes} extension={contextExtension}
          summary={headSummary}
          pendingChanges={queryDraft.dirty.some(key => menu.pageKeys.includes(key))} issueCount={queryBarExtension?.issues?.length ?? 0} />
      : <div className={cn(pageInsetX(density === 'compact'), 'pt-3')}><PageHeadBody notes={notes} extension={contextExtension} /></div>)}
    {!gate && conditionLayer}
    <div data-platform-page-content tabIndex={-1} data-body-inset={bodyInset === 'none' ? 'none' : undefined} className={cn(conditionLayer && 'isolate', layout === 'fill' ? 'flex flex-1 flex-col' : 'flex-1', fixedFill && bounding > 0 && 'min-h-0', bodyInset === 'none' ? undefined : [pageInsetX(density === 'compact'), density === 'compact' ? 'pb-4 pt-3' : 'pb-9 pt-7'])}>{gate
      ? bodyInset === 'none' ? <div className={cn(pageInsetX(density === 'compact'), density === 'compact' ? 'pb-4 pt-3' : 'pb-9 pt-7')}>{gate}</div> : gate
      : wrapBody ? wrapBody(content) : content}</div>
    </div>
  </div></ReturnRowShown.Provider></PageBoundContext.Provider></PageFlowContext.Provider></QueryBarStatusContext.Provider></QueryBarExtensionContext.Provider></PageDensityProvider></WorkspaceQueryBarContext.Provider>;
}

/** The screen standing in for a page whose Scope is not usable: one branch per `scope.status` (everything but `valid`; `forbidden` is the default branch and carries the request entry, place (c)). */
function ScopeGate({ root, selectorAvailable }: { root: React.RefObject<HTMLDivElement | null>; selectorAvailable: boolean }) {
  const { scope, retryScope, setGlobal, lastScope, scopeSelector, registry, resolveLink, sidebarSpace } = useHostPlatform();
  const accessRequest = useScopeAccessRequest();
  const { t, lang } = useI18n();
  switch (scope.status) {
    case 'validating':
      return <StateMessage icon={<Loader2 className="size-4 animate-spin" aria-hidden />} title={t('scopeValidating')} />;
    case 'none':
      return <StateMessage icon={<MapPinOff className="size-4" aria-hidden />} title={t('selectScope')} body={t('selectScopeBody')}
        action={(lastScope || selectorAvailable) && <>
          {lastScope && <Button size="sm" onClick={() => { focusPageFallback(root.current); setGlobal({ scopeId: lastScope }); }}>{t('applySuggested')}: {lastScope}</Button>}
          {selectorAvailable && <Button size="sm" variant={lastScope ? 'secondary' : 'default'} aria-haspopup="menu" onClick={() => scopeSelector.open()}>{t('scopeNone')}</Button>}
        </>} />;
    case 'error':
      return <StateMessage tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={t('scopeErrorTitle')}
        body={t('scopeErrorBody')}
        action={<Button size="sm" variant="secondary" onClick={() => { focusPageFallback(root.current); retryScope(); }}><RotateCw className="size-3.5" />{t('retry')}</Button>} />;
    case 'unknown_scope':
      return <StateMessage icon={<MapPinOff className="size-4" aria-hidden />} title={t('scopeUnknownTitle')} body={t('scopeUnknownBody')} />;
    default: {
      let homeLink: string | null = null;
      for (const id of [registry.platformHome?.id, sidebarSpace?.homeMenuId]) {
        if (id === undefined || registry.menuById(id).requiresScope) continue;
        const link = resolveLink(id, { global: { scopeId: null } });
        if (link.allowed) {
          homeLink = link.href;
          break;
        }
      }
      const homeHref = homeLink;
      const exit = homeHref ? <Button asChild size="sm" variant="secondary"><PlatformLink href={homeHref}>{t('goToHome')}</PlatformLink></Button> : null;
      const category = t('stateForbidden');
      return accessRequest && scope.scopeId !== null
        ? <AccessRequestEntry slot={accessRequest} emphasis="primary" target={{ kind: 'site', site: scope.scopeId }}
          renderPendingAction={href => href === null ? null : <Button asChild size="sm" variant="secondary"><PlatformLink href={href}>{t('accessRequestViewMine')}</PlatformLink></Button>}>
          {(state, action) => {
            const unavailable = state.requestHref === null && !state.pending;
            let description: string | undefined;
            if (unavailable) description = t('scopeAccessDeniedBody');
            else if (!state.pending) description = accessRequestBody(t, state, true);
            const availableStatus = state.pending ? 'pending' : 'none';
            return <PermissionBlockedPanel layout="card" headingLevel={2} announceBody lang={lang} category={category}
              state={unavailable ? 'blocked_not_requestable' : 'request_access'}
              description={description} missing={state.missing}
              requestStatus={unavailable ? 'not-requestable' : availableStatus}
              requestAction={unavailable ? null : action} exitAction={exit} />;
          }}
        </AccessRequestEntry>
        : <PermissionBlockedPanel layout="card" headingLevel={2} announceBody lang={lang} category={category} state="blocked_not_requestable"
          description={t('scopeAccessDeniedBody')} requestStatus="not-requestable" exitAction={exit} />;
    }
  }
}

/** The return row uses only an accepted origin (ADR-0081 UX-10). */
function ReturnRow({ navigation: { origin, displayTrail, onNavigate } }: { navigation: ReturnType<typeof useReturnNavigation> }) {
  const { t, tx } = useI18n();
  const compact = useCompactPageDensity();
  return <div data-return-row className={cn('flex min-h-8 shrink-0 flex-wrap items-center gap-x-3 border-b border-border-subtle py-1 text-xs break-keep', pageInsetX(compact))}>
    <PlatformLink via="return" href={origin.href} onNavigate={onNavigate} className="font-medium text-accent-primary hover:underline [overflow-wrap:anywhere]">{t('returnRowBack', { menu: tx(origin.menuLabel) })}{displayTrail && ` (${displayTrail})`}</PlatformLink>
    {origin.spaceLabel !== null && !origin.sameSpace && <span className="text-text-muted">{t('returnRowFrom', { system: tx(origin.spaceLabel) })}</span>}
  </div>;
}

/** panel-card: hairline border, shared radius and one top-level shadow. */
export function Panel({ title, subtitle, actions, children, className, bodyClassName, id }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string;
}) {
  // The workspace tab already shows this title.
  const inPanel = useInWorkspacePanel();
  return <section aria-labelledby={title && id ? id : undefined} className={cn('rounded-lg border border-border-subtle bg-surface-card', inPanel ? 'elevation-flat' : 'elevation-panel', className)}>
    {(title || actions) && <header className="flex flex-wrap items-start justify-between gap-2 px-4 pb-2 pt-3">
      <div>
        {title && <h2 id={id} className={cn('t-card-title', inPanel && 'sr-only')}>{title}</h2>}
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>}
    <div className={cn('px-4 pb-4', !title && !actions && 'pt-4', bodyClassName)}>{children}</div>
  </section>;
}
