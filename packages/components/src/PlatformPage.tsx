// THROWAWAY #303/#307 — never merge.
import { OutcomeBanners, OutcomeScope } from './OutcomeScope';
import { ChevronRight, Info, Loader2, MapPinOff, MoreHorizontal, RotateCw, ServerCrash, Star } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { type MenuEntry, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { Button, cn, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, usePrototype } from '@ap/ui';
import { consumePageFocus } from './pageFocus';
import { StateMessage } from './StateView';

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
  // THROWAWAY #303/#307 — never merge.
  const pageHeader = useRef<HTMLElement>(null);
  const prototype = usePrototype();
  const headerVariant = prototype.question === 'header' ? prototype.variant : null;
  const [headerWidth, setHeaderWidth] = useState<number | null>(null);
  const [infoRowOpen, setInfoRowOpen] = useState(true);
  useLayoutEffect(() => {
    const header = stickyHeader.current;
    if (!header) return;
    const measure = () => root.current?.style.setProperty('--page-sticky-offset', `${header.getBoundingClientRect().height}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  // THROWAWAY #303/#307 — never merge.
  useLayoutEffect(() => {
    if (headerVariant !== 'A') return;
    const header = pageHeader.current;
    if (!header) return;
    const measure = () => setHeaderWidth(header.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [headerVariant]);
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
              body={<>{t('scopeErrorBody')} <span className="t-mono">scopeId={scope.scopeId}</span></>}
              action={<Button size="sm" variant="secondary" onClick={() => { focusPageFallback(); retryScope(); }}><RotateCw className="size-3.5" />{t('retry')}</Button>} />
        : scope.status === 'unknown_scope'
          ? <StateMessage icon={<MapPinOff className="size-4" aria-hidden />} title={t('scopeUnknownTitle')}
              body={<>{t('scopeUnknownBody')} <span className="t-mono">scopeId={scope.scopeId}</span></>} />
          : <StateMessage tone="warning" icon={<MapPinOff className="size-4" aria-hidden />} title={t('stateForbidden')}
            body={<>{t('stateForbiddenBody')} <span className="t-mono">scopeId={scope.scopeId}</span></>} />;
  }

  const titleResolved = title ?? tx(menu.label);
  const descriptionResolved = description ?? tx(menu.description);
  const hasDescription = typeof descriptionResolved === 'string' ? descriptionResolved.trim().length > 0 : descriptionResolved != null && descriptionResolved !== false;
  // THROWAWAY #303/#307 — never merge.
  const headerDensity = headerWidth === null ? 0 : headerWidth < 760 ? 3 : headerWidth < 840 ? 2 : headerWidth < 1000 ? 1 : 0;
  const compactTrust = headerVariant === 'A' && headerDensity >= 2;
  const hideProvisional = headerVariant === 'A' && headerDensity >= 3;
  const moreLabel = lang === 'ko' ? '더보기' : 'More';
  const renderOverflow = (actions: ReactNode, extra?: ReactNode) => <Popover>
    <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={moreLabel} title={moreLabel}><MoreHorizontal className="size-4" aria-hidden /></Button></PopoverTrigger>
    <PopoverContent align="end" className="w-72">
      {actions && <div role="group" aria-label={lang === 'ko' ? '기타 페이지 동작' : 'Other page actions'} className="grid gap-2">{actions}</div>}
      {extra && <div className={cn('grid gap-2', actions && 'mt-2 border-t border-border-subtle pt-2')}>{extra}</div>}
    </PopoverContent>
  </Popover>;
  const compactTrustClass = cn(
    'shrink-0',
    compactTrust && 'max-w-10 overflow-hidden [&>button]:size-10 [&>button]:justify-center [&>button]:gap-0 [&>button]:px-0 [&_[data-trust-summary-details]]:sr-only',
    hideProvisional && '[&_[data-trust-provisional]]:hidden',
  );

  return <div ref={root} data-platform-page className="flex min-h-full flex-col">
    <div ref={stickyHeader} className="sticky top-0 z-20 shrink-0 bg-surface-canvas">
      {/* THROWAWAY #303/#307 — never merge. */}
      <header ref={pageHeader} className="flex h-[50px] shrink-0 overflow-x-auto items-center justify-between gap-3 border-b border-border-subtle bg-surface-canvas px-4">
        <div className="flex min-w-6 flex-1 items-center gap-2">
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
            <h1 ref={heading} tabIndex={0} title={typeof titleResolved === 'string' ? titleResolved : undefined} className={cn('min-w-0 shrink truncate text-sm font-semibold text-text-primary', headerVariant && 'min-w-28')}>{titleResolved}</h1>
          </TooltipTrigger><TooltipContent>{titleResolved}</TooltipContent></Tooltip></TooltipProvider>
          {favoriteTarget && <button type="button" onClick={() => toggleFavorite(favoriteTarget.id)} aria-pressed={isFavorite}
            aria-label={isFavorite ? t('removeFavorite') : t('addFavorite')} title={isFavorite ? t('removeFavorite') : t('addFavorite')}
            className="grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-accent-warn">
            <Star className={cn('size-3.5', isFavorite && 'fill-accent-warn text-accent-warn')} aria-hidden />
          </button>}
          {headerVariant === null && hasDescription && <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <div tabIndex={0} className="min-w-0 flex-1 basis-0 truncate text-xs text-text-muted" title={typeof descriptionResolved === 'string' ? descriptionResolved : undefined}>{descriptionResolved}</div>
          </TooltipTrigger><TooltipContent>{descriptionResolved}</TooltipContent></Tooltip></TooltipProvider>}
          {headerVariant === 'A' && headerDensity === 0 && hasDescription && <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <div tabIndex={0} className="min-w-0 flex-1 basis-0 truncate text-xs text-text-muted" title={typeof descriptionResolved === 'string' ? descriptionResolved : undefined}>{descriptionResolved}</div>
          </TooltipTrigger><TooltipContent>{descriptionResolved}</TooltipContent></Tooltip></TooltipProvider>}
        </div>
        {headerVariant === null && <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap">
          {!gate && dataTrustSummary}
          {!gate && secondaryActions}
          {!gate && primaryAction}
        </div>}
        {headerVariant === 'A' && <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap">
          {!gate && dataTrustSummary && <div className={compactTrustClass}>{dataTrustSummary}</div>}
          {!gate && secondaryActions && renderOverflow(secondaryActions)}
          {!gate && primaryAction}
        </div>}
        {headerVariant === 'B' && <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap">
          {renderOverflow(!gate ? secondaryActions : undefined, <Button type="button" variant="ghost" size="toolbar" aria-expanded={infoRowOpen} onClick={() => setInfoRowOpen(open => !open)}>{infoRowOpen ? (lang === 'ko' ? '정보 줄 숨기기' : 'Hide information row') : (lang === 'ko' ? '정보 줄 표시' : 'Show information row')}</Button>)}
          {!gate && primaryAction}
        </div>}
        {headerVariant === 'C' && <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap">
          <Popover>
            <PopoverTrigger asChild><Button type="button" variant="ghost" size="toolbar"><Info className="size-3.5" aria-hidden />{lang === 'ko' ? '정보' : 'Info'}</Button></PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              {hasDescription && <p className="mb-3 text-xs text-text-secondary">{descriptionResolved}</p>}
              {!gate && dataTrustSummary}
            </PopoverContent>
          </Popover>
          {!gate && secondaryActions && renderOverflow(secondaryActions)}
          {!gate && primaryAction}
        </div>}
      </header>
      {/* THROWAWAY #303/#307 — never merge. */}
      {headerVariant === 'B' && infoRowOpen && <div className="flex min-h-9 items-center gap-3 border-b border-border-subtle bg-surface-canvas px-4 py-1.5">
        {hasDescription && <TooltipProvider><Tooltip><TooltipTrigger asChild><span tabIndex={0} title={typeof descriptionResolved === 'string' ? descriptionResolved : undefined} className="min-w-0 flex-1 truncate text-xs text-text-muted">{descriptionResolved}</span></TooltipTrigger><TooltipContent>{descriptionResolved}</TooltipContent></Tooltip></TooltipProvider>}
        {!gate && dataTrustSummary && <div className="shrink-0">{dataTrustSummary}</div>}
        <Button type="button" variant="ghost" size="icon-sm" aria-label={lang === 'ko' ? '정보 줄 숨기기' : 'Hide information row'} title={lang === 'ko' ? '정보 줄 숨기기' : 'Hide information row'} onClick={() => setInfoRowOpen(false)}>×</Button>
      </div>}
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
