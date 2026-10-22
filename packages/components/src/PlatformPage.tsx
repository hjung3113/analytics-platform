import { formatInstant } from '@ap/contracts';
import { formatQuerySummary } from './querySummary';
import { QueryBarExtensionContext, usePublishQueryBarExtension, type QueryBarExtension } from './QueryBarExtension';
import { OutcomeBanners, OutcomeScope } from './OutcomeScope';
import { ChevronRight, Info, Loader2, MapPinOff, MoreHorizontal, RotateCw, ServerCrash, Star } from 'lucide-react';
import { cloneElement, createContext, isValidElement, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { type MenuEntry, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { Button, cn, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { DataTrustIndicator } from './DataTrustIndicator';
import { type HeaderYield, nextHeaderYield, openHeaderYield } from './headerYield';
import { consumePageFocus, drillDestinationOf, focusPageFallback } from './pageFocus';
import { StateMessage } from './StateView';
import { useInWorkspacePanel } from './workspace/panelContext';

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

function HeaderOverflow({ actions }: { actions: ReactNode }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const label = ko ? '더보기' : 'More';
  const group = ko ? '기타 페이지 동작' : 'Other page actions';
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<((control: HeaderOverflowDialogControl) => ReactNode) | null>(null);
  const { location } = usePlatform();
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
          const first = Array.from(content.current?.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]') ?? [])
            .find(control => control.tabIndex >= 0 && !control.matches(':disabled, input[type="hidden"]')
              && !control.closest('[hidden], [inert]') && getComputedStyle(control).display !== 'none' && getComputedStyle(control).visibility !== 'hidden');
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
  dataTrustSummary?: ReactNode;
  queryBarExtension?: QueryBarExtension;
  /** Completion of the consumer's authoritative summary query, including terminal error responses. */
  queryResult?: { completedAt: number | null; status: 'idle' | 'loading' | 'refreshing' | 'done' };
  /** Extra crumbs between the menu and the current object. */
  crumbs?: { label: ReactNode; href?: string }[];
  /**
   * `flow` (default): the page grows with its content. `fill`: the page takes its container's height (the main area, or a board pane's
   * body) and the body takes what the header leaves, so a `PanelWorkspace` child fills it; the body keeps at least 560 px, so a tall chrome scrolls the page instead of crushing the workspace. Opt in only for a workspace page.
   */
  layout?: 'flow' | 'fill';
  children: ReactNode;
};

/** §8 Shell Slots. Pages never insert global UI outside these slots. */
export function PlatformPage({ title, description, primaryAction, secondaryActions, contextExtension, dataTrustSummary, queryBarExtension, queryResult, crumbs = [], layout = 'flow', children }: PlatformPageProps) {
  const { global, page, equipmentAxes, route, favorites, toggleFavorite, scope, retryScope, setGlobal, lastScope, linkTo, registry, slots, url, pathname, pageNavigation, currentSpace, screenMode, canOpen } = usePlatform();
  // A board pane draws content only: the board owns the pane head and the Context bar, and no arrival focus moves here (ADR-0049).
  const inPane = screenMode === 'pane';
  usePublishQueryBarExtension(queryBarExtension);
  const { t, tx, lang } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  const programmaticHeadingFocus = useRef(false);
  const [headingTooltipOpen, setHeadingTooltipOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
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
      const compactBar = root.current?.querySelector<HTMLElement>('[data-query-bar-collapsed]');
      root.current?.style.setProperty('--page-sticky-offset', `${header.getBoundingClientRect().height + (compactBar?.getBoundingClientRect().height ?? 0)}px`);
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
  useLayoutEffect(() => {
    const focusDestination = () => {
      const request = consumePageFocus(pageNavigation, pathname);
      // A pane takes no automatic arrival focus; its explicit drill/return requests still land inside the pane.
      if (!request || (inPane && request === 'page')) return;
      const currentStep = request === 'drill' && root.current ? drillDestinationOf(root.current) : null;
      const target = currentStep ?? heading.current;
      if (!target) { if (inPane) focusPageFallback(root.current); return; }
      programmaticHeadingFocus.current = target === heading.current;
      if (programmaticHeadingFocus.current) setHeadingTooltipOpen(false);
      try { target.focus({ preventScroll: true }); }
      finally { programmaticHeadingFocus.current = false; }
    };
    focusDestination();
    // A palette selection remains pending until Dialog's close autofocus completes.
    return pageNavigation.subscribe(focusDestination);
  }, [url, pathname, pageNavigation, inPane]);
  const menu = route!.menu;
  // `분석 보드에 열기…` (docs/16 §6): the app's slot item, only on the main screen of a menu that declares board support and the user can open.
  const boardEntry = !inPane && menu.features.board === true && canOpen(menu.id) ? slots.boardEntry : null;
  const favoriteTarget = menu.navHidden ? null : menu;
  const isFavorite = favoriteTarget ? favorites.includes(favoriteTarget.id) : false;
  const parent: MenuEntry | null = menu.parent ? registry.menuById(menu.parent) : null;
  // #353: a gate action button disappears with the state change it triggers, so keyboard focus must
  // move before that — §19 banner dismissal rule: main landmark, page content element outside a shell.

  let gate: ReactNode = null;
  if (menu.requiresScope && scope.status !== 'valid') {
    gate = scope.status === 'validating'
      ? <StateMessage icon={<Loader2 className="size-4 animate-spin" aria-hidden />} title={t('scopeValidating')} />
      : scope.status === 'none'
        ? <StateMessage icon={<MapPinOff className="size-4" aria-hidden />} title={t('selectScope')} body={t('selectScopeBody')}
            action={lastScope && <Button size="sm" onClick={() => { focusPageFallback(root.current); setGlobal({ scopeId: lastScope }); }}>{t('applySuggested')}: {lastScope}</Button>} />
        : scope.status === 'error'
          ? <StateMessage tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={t('scopeErrorTitle')}
              body={t('scopeErrorBody')}
              action={<Button size="sm" variant="secondary" onClick={() => { focusPageFallback(root.current); retryScope(); }}><RotateCw className="size-3.5" />{t('retry')}</Button>} />
        : scope.status === 'unknown_scope'
          ? <StateMessage icon={<MapPinOff className="size-4" aria-hidden />} title={t('scopeUnknownTitle')}
              body={t('scopeUnknownBody')} />
          : <StateMessage tone="warning" icon={<MapPinOff className="size-4" aria-hidden />} title={t('stateForbidden')}
            body={t('stateForbiddenBody')} />;
  }

  const titleResolved = title ?? tx(menu.label);
  const descriptionResolved = description ?? tx(menu.description);
  const hasDescription = typeof descriptionResolved === 'string' ? descriptionResolved.trim().length > 0 : descriptionResolved != null && descriptionResolved !== false;
  const descriptionName = typeof descriptionResolved === 'string' && descriptionResolved.trim().length > 0
    ? descriptionResolved
    : (lang === 'ko' ? '설명' : 'Description');

  // rem like the classes it mirrors: 7rem = h1 min-w-28, 1.5rem = size-6 controls, 0.5rem = gap-2; the breadcrumb and an un-yielded description shrink to 0.
  const leftGroupItems = 1 + (favoriteTarget ? 1 : 0) + (hasDescription ? 1 : 0) + (currentSpace || parent || crumbs.length > 0 ? 1 : 0);
  const leftGroupControls = (favoriteTarget ? 1 : 0) + (hasDescription && headerYield.description ? 1 : 0);
  const leftGroupMinWidth = `calc(7rem + ${leftGroupControls * 1.5}rem + ${(leftGroupItems - 1) * 0.5}rem)`;

  return <QueryBarExtensionContext.Provider value={queryBarExtension}><div ref={root} data-platform-page data-page-layout={layout === 'fill' ? 'fill' : undefined} className={layout === 'fill' ? 'flex h-full min-h-0 flex-col' : 'flex min-h-full flex-col'}>
    {!inPane && <div ref={stickyHeader} data-page-sticky-header className="sticky top-0 z-20 shrink-0 bg-surface-canvas">
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
            {parent && <><PlatformLink className="min-w-0 truncate hover:text-accent-primary" title={tx(parent.label)} href={linkTo(parent.id)}>{tx(parent.label)}</PlatformLink><ChevronRight className="size-3 shrink-0" aria-hidden /></>}
            {crumbs.map((crumb, index) => <span key={index} className="flex min-w-0 items-center gap-1">
              {crumb.href ? <PlatformLink className="min-w-0 truncate hover:text-accent-primary" title={typeof crumb.label === 'string' ? crumb.label : undefined} href={crumb.href}>{crumb.label}</PlatformLink> : <span className="truncate">{crumb.label}</span>}
              <ChevronRight className="size-3 shrink-0" aria-hidden />
            </span>)}
          </nav>}
          <TooltipProvider><Tooltip open={headingTooltipOpen} onOpenChange={open => {
            if (!open || !programmaticHeadingFocus.current) setHeadingTooltipOpen(open);
          }}><TooltipTrigger asChild>
            <h1 ref={heading} tabIndex={0} title={typeof titleResolved === 'string' ? titleResolved : undefined} className="min-w-28 shrink truncate text-sm font-semibold text-text-primary">{titleResolved}</h1>
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
          {!gate && (secondaryActions || boardEntry) && <HeaderOverflow actions={<>{secondaryActions}{boardEntry}</>} />}
          {!gate && primaryAction}
        </div>
      </header>
      {menu.query?.mode !== 'apply' && slots.contextBar}
    </div>}
    {!inPane && menu.query?.mode === 'apply' && slots.contextBar}
    {!gate && menu.query?.mode === 'apply' && queryResult && <section role="region" aria-label={lang === 'ko' ? '적용된 조회 조건' : 'Applied query conditions'} className="flex flex-wrap gap-2 border-b border-border-subtle px-4 py-2 text-xs text-text-secondary">
      <span className="min-w-0 [overflow-wrap:anywhere]">{formatQuerySummary(global, page, { lang, axes: equipmentAxes, context: menu.context, pageSummary: queryBarExtension?.appliedPageSummary })}</span>
      {queryResult.completedAt !== null && (queryResult.status === 'done' || queryResult.status === 'refreshing') && <span>{lang === 'ko' ? '요약 조회 완료' : 'Summary response completed'} {formatInstant(queryResult.completedAt, lang)}</span>}
    </section>}
    {contextExtension && !gate && <div className="px-8 pt-3">{contextExtension}</div>}
    <div data-platform-page-content tabIndex={-1} className={layout === 'fill' ? 'flex min-h-0 flex-1 flex-col px-8 pb-9 pt-7' : 'flex-1 px-8 pb-9 pt-7'}>{gate ?? <OutcomeScope><OutcomeBanners />{layout === 'fill' ? <div data-platform-page-fill className="min-h-[560px] flex-1">{children}</div> : children}</OutcomeScope>}</div>
  </div></QueryBarExtensionContext.Provider>;
}

/** panel-card: hairline border, 8px radius, no shadow. */
export function Panel({ title, subtitle, actions, children, className, bodyClassName, id }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string;
}) {
  // The workspace tab already shows this title.
  const inPanel = useInWorkspacePanel();
  return <section aria-labelledby={title && id ? id : undefined} className={cn('rounded-lg border border-border-subtle bg-surface-card', className)}>
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
