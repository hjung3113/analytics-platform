import { OutcomeBanners, OutcomeScope } from './OutcomeScope';
import { ChevronRight, Info, Loader2, MapPinOff, MoreHorizontal, RotateCw, ServerCrash, Star } from 'lucide-react';
import { cloneElement, isValidElement, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { type MenuEntry, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { Button, cn, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { DataTrustIndicator } from './DataTrustIndicator';
import { consumePageFocus } from './pageFocus';
import { StateMessage } from './StateView';

// Header's own width, not the viewport (#303, ADR-0035). Collapsing frees no container width, so the
// slack is what stops a width sitting on the boundary from opening and closing on every measure.
const YIELD_DESCRIPTION_AT = 1000;
const YIELD_TRUST_AT = 840;
const YIELD_BADGE_AT = 760;
const YIELD_SLACK = 32;
type HeaderYield = { description: boolean; trust: boolean; badge: boolean };
const openHeader: HeaderYield = { description: false, trust: false, badge: false };

function nextHeaderYield(width: number, prev: HeaderYield): HeaderYield {
  const step = (on: boolean, at: number) => (on ? width < at + YIELD_SLACK : width < at);
  return {
    description: step(prev.description, YIELD_DESCRIPTION_AT),
    trust: step(prev.trust, YIELD_TRUST_AT),
    badge: step(prev.badge, YIELD_BADGE_AT),
  };
}

function withTrustYield(node: ReactNode, yieldState: HeaderYield): ReactNode {
  if (!isValidElement(node) || node.type !== DataTrustIndicator) return node;
  return cloneElement(node as ReactElement<{ compact?: boolean; hideProvisional?: boolean }>, {
    compact: yieldState.trust,
    hideProvisional: yieldState.badge,
  });
}

function HeaderOverflow({ actions }: { actions: ReactNode }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const label = ko ? '더보기' : 'More';
  const group = ko ? '기타 페이지 동작' : 'Other page actions';
  const [open, setOpen] = useState(false);
  const { location } = usePlatform();
  const openingPath = useRef<string | null>(null);
  const content = useRef<HTMLDivElement>(null);
  return <Popover open={open} onOpenChange={next => {
    if (next) openingPath.current = location.read()?.split('?')[0] ?? null;
    setOpen(next);
  }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
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
        // A destination page owns focus after navigation (06 §26).
        if ((location.read()?.split('?')[0] ?? null) !== openingPath.current) event.preventDefault();
      }}>
      <div className="grid gap-2 p-1" onClick={() => setOpen(false)}>{actions}</div>
    </PopoverContent>
  </Popover>;
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
  /** Extra crumbs between the menu and the current object. */
  crumbs?: { label: ReactNode; href?: string }[];
  children: ReactNode;
};

/** §8 Shell Slots. Pages never insert global UI outside these slots. */
export function PlatformPage({ title, description, primaryAction, secondaryActions, contextExtension, dataTrustSummary, crumbs = [], children }: PlatformPageProps) {
  const { route, favorites, toggleFavorite, scope, retryScope, setGlobal, lastScope, linkTo, registry, slots, url, pathname, pageNavigation } = usePlatform();
  const { t, tx, lang } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  const programmaticHeadingFocus = useRef(false);
  const [headingTooltipOpen, setHeadingTooltipOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const stickyHeader = useRef<HTMLDivElement>(null);
  const pageHeader = useRef<HTMLElement>(null);
  const yieldRef = useRef<HeaderYield>(openHeader);
  const [headerYield, setHeaderYield] = useState<HeaderYield>(openHeader);
  useLayoutEffect(() => {
    const header = stickyHeader.current;
    if (!header) return;
    const measure = () => {
      root.current?.style.setProperty('--page-sticky-offset', `${header.getBoundingClientRect().height}px`);
      const width = pageHeader.current?.getBoundingClientRect().width ?? 0;
      if (width <= 0) return;
      const next = nextHeaderYield(width, yieldRef.current);
      if (next.description === yieldRef.current.description && next.trust === yieldRef.current.trust && next.badge === yieldRef.current.badge) return;
      yieldRef.current = next;
      setHeaderYield(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const focusDestination = () => {
      const request = consumePageFocus(pageNavigation, pathname);
      if (!request) return;
      const currentStep = request === 'drill' ? root.current?.querySelector<HTMLElement>('[aria-current="step"]') : null;
      const target = currentStep ?? heading.current;
      programmaticHeadingFocus.current = target === heading.current;
      if (programmaticHeadingFocus.current) setHeadingTooltipOpen(false);
      try { target?.focus({ preventScroll: true }); }
      finally { programmaticHeadingFocus.current = false; }
    };
    focusDestination();
    // A palette selection remains pending until Dialog's close autofocus completes.
    return pageNavigation.subscribe(focusDestination);
  }, [url, pathname, pageNavigation]);
  const menu = route!.menu;
  const favoriteTarget = menu.navHidden ? null : menu;
  const isFavorite = favoriteTarget ? favorites.includes(favoriteTarget.id) : false;
  const parent: MenuEntry | null = menu.parent ? registry.menuById(menu.parent) : null;
  // #353: a gate action button disappears with the state change it triggers, so keyboard focus must
  // move before that — §19 banner dismissal rule: main landmark, page content element outside a shell.
  const focusPageFallback = () => {
    const target = root.current?.closest<HTMLElement>('main[tabindex]') ?? root.current?.querySelector<HTMLElement>('[data-platform-page-content]');
    target?.focus({ preventScroll: true });
  };

  let gate: ReactNode = null;
  if (menu.requiresScope && scope.status !== 'valid') {
    gate = scope.status === 'validating'
      ? <StateMessage icon={<Loader2 className="size-4 animate-spin" aria-hidden />} title={t('scopeValidating')} />
      : scope.status === 'none'
        ? <StateMessage icon={<MapPinOff className="size-4" aria-hidden />} title={t('selectScope')} body={t('selectScopeBody')}
            action={lastScope && <Button size="sm" onClick={() => { focusPageFallback(); setGlobal({ scopeId: lastScope }); }}>{t('applySuggested')}: {lastScope}</Button>} />
        : scope.status === 'error'
          ? <StateMessage tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={t('scopeErrorTitle')}
              body={t('scopeErrorBody')}
              action={<Button size="sm" variant="secondary" onClick={() => { focusPageFallback(); retryScope(); }}><RotateCw className="size-3.5" />{t('retry')}</Button>} />
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

  return <div ref={root} data-platform-page className="flex min-h-full flex-col">
    <div ref={stickyHeader} className="sticky top-0 z-20 shrink-0 bg-surface-canvas">
      <header ref={pageHeader} onFocus={event => {
        const header = event.currentTarget;
        // Popover portals bubble through React but are outside this scroll container.
        if (!header.contains(event.target) || header.scrollWidth <= header.clientWidth) return;
        const headerRect = header.getBoundingClientRect();
        const targetRect = event.target.getBoundingClientRect();
        const left = headerRect.left + header.clientLeft;
        const right = left + header.clientWidth;
        if (targetRect.left < left) header.scrollLeft += targetRect.left - left;
        else if (targetRect.right > right) header.scrollLeft += targetRect.right - right;
      }} className="flex h-[50px] shrink-0 overflow-x-auto items-center justify-between gap-3 border-b border-border-subtle bg-surface-canvas px-4">
        <div className="flex min-w-28 flex-1 items-center gap-2">
          {(parent || crumbs.length > 0) && <nav aria-label={t('breadcrumb')} className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
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
          {hasDescription && !headerYield.description && <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <div tabIndex={0} className="min-w-0 flex-1 basis-0 truncate text-xs text-text-muted" title={typeof descriptionResolved === 'string' ? descriptionResolved : undefined}>{descriptionResolved}</div>
          </TooltipTrigger><TooltipContent>{descriptionResolved}</TooltipContent></Tooltip></TooltipProvider>}
          {hasDescription && headerYield.description && <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <button type="button" aria-label={descriptionName} title={typeof descriptionResolved === 'string' ? descriptionResolved : undefined} className="grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover">
              <Info className="size-3.5" aria-hidden />
            </button>
          </TooltipTrigger><TooltipContent>{descriptionResolved}</TooltipContent></Tooltip></TooltipProvider>}
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap">
          {!gate && dataTrustSummary && withTrustYield(dataTrustSummary, headerYield)}
          {!gate && secondaryActions && <HeaderOverflow actions={secondaryActions} />}
          {!gate && primaryAction}
        </div>
      </header>
      {slots.contextBar}
    </div>
    {contextExtension && !gate && <div className="px-8 pt-3">{contextExtension}</div>}
    <div data-platform-page-content tabIndex={-1} className="flex-1 px-8 pb-9 pt-7">{gate ?? <OutcomeScope><OutcomeBanners />{children}</OutcomeScope>}</div>
  </div>;
}

/** panel-card: hairline border, 8px radius, no shadow. */
export function Panel({ title, subtitle, actions, children, className, bodyClassName, id }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string;
}) {
  return <section aria-labelledby={title && id ? id : undefined} className={cn('rounded-lg border border-border-subtle bg-surface-card', className)}>
    {(title || actions) && <header className="flex flex-wrap items-start justify-between gap-2 px-4 pb-2 pt-3">
      <div>
        {title && <h2 id={id} className="t-card-title">{title}</h2>}
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>}
    <div className={cn('px-4 pb-4', !title && !actions && 'pt-4', bodyClassName)}>{children}</div>
  </section>;
}
