import { OutcomeBanners, OutcomeScope } from './OutcomeScope';
import { ChevronRight, Loader2, MapPinOff, RotateCw, ServerCrash, Star } from 'lucide-react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { type MenuEntry, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { Button, cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
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
  const { route, favorites, toggleFavorite, scope, retryScope, setGlobal, lastScope, linkTo, registry, slots } = usePlatform();
  const { t, tx } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const stickyHeader = useRef<HTMLDivElement>(null);
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
  const menu = route!.menu;
  const favoriteTarget = menu.navHidden ? null : menu;
  const isFavorite = favoriteTarget ? favorites.includes(favoriteTarget.id) : false;
  const parent: MenuEntry | null = menu.parent ? registry.menuById(menu.parent) : null;

  let gate: ReactNode = null;
  if (menu.requiresScope && scope.status !== 'valid') {
    gate = scope.status === 'validating'
      ? <StateMessage icon={<Loader2 className="size-4 animate-spin" aria-hidden />} title={t('scopeValidating')} />
      : scope.status === 'none'
        ? <StateMessage icon={<MapPinOff className="size-4" aria-hidden />} title={t('selectScope')} body={t('selectScopeBody')}
            action={lastScope && <Button size="sm" onClick={() => setGlobal({ scopeId: lastScope })}>{t('applySuggested')}: {lastScope}</Button>} />
        : scope.status === 'error'
          ? <StateMessage tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={t('scopeErrorTitle')}
              body={<>{t('scopeErrorBody')} <span className="t-mono">scopeId={scope.scopeId}</span></>}
              action={<Button size="sm" variant="secondary" onClick={retryScope}><RotateCw className="size-3.5" />{t('retry')}</Button>} />
        : scope.status === 'unknown_scope'
          ? <StateMessage icon={<MapPinOff className="size-4" aria-hidden />} title={t('scopeUnknownTitle')}
              body={<>{t('scopeUnknownBody')} <span className="t-mono">scopeId={scope.scopeId}</span></>} />
          : <StateMessage tone="warning" icon={<MapPinOff className="size-4" aria-hidden />} title={t('stateForbidden')}
            body={<>{t('stateForbiddenBody')} <span className="t-mono">scopeId={scope.scopeId}</span></>} />;
  }

  const titleResolved = title ?? tx(menu.label);
  const descriptionResolved = description ?? tx(menu.description);
  const hasDescription = typeof descriptionResolved === 'string' ? descriptionResolved.trim().length > 0 : descriptionResolved != null && descriptionResolved !== false;

  return <div ref={root} className="flex min-h-full flex-col">
    <div ref={stickyHeader} className="sticky top-0 z-20 shrink-0 bg-surface-canvas">
      <header className="flex h-[50px] shrink-0 overflow-x-auto items-center justify-between gap-3 border-b border-border-subtle bg-surface-canvas px-4">
        <div className="flex min-w-6 flex-1 items-center gap-2">
          {(parent || crumbs.length > 0) && <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
            {parent && <><PlatformLink className="min-w-0 truncate hover:text-accent-primary" title={tx(parent.label)} href={linkTo(parent.id)}>{tx(parent.label)}</PlatformLink><ChevronRight className="size-3 shrink-0" aria-hidden /></>}
            {crumbs.map((crumb, index) => <span key={index} className="flex min-w-0 items-center gap-1">
              {crumb.href ? <PlatformLink className="min-w-0 truncate hover:text-accent-primary" title={typeof crumb.label === 'string' ? crumb.label : undefined} href={crumb.href}>{crumb.label}</PlatformLink> : <span className="truncate">{crumb.label}</span>}
              <ChevronRight className="size-3 shrink-0" aria-hidden />
            </span>)}
          </nav>}
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <h1 tabIndex={0} title={typeof titleResolved === 'string' ? titleResolved : undefined} className="min-w-0 shrink truncate text-sm font-semibold text-text-primary">{titleResolved}</h1>
          </TooltipTrigger><TooltipContent>{titleResolved}</TooltipContent></Tooltip></TooltipProvider>
          {favoriteTarget && <button type="button" onClick={() => toggleFavorite(favoriteTarget.id)} aria-pressed={isFavorite}
            aria-label={isFavorite ? t('removeFavorite') : t('addFavorite')} title={isFavorite ? t('removeFavorite') : t('addFavorite')}
            className="grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-accent-warn">
            <Star className={cn('size-3.5', isFavorite && 'fill-accent-warn text-accent-warn')} aria-hidden />
          </button>}
          {hasDescription && <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <div tabIndex={0} className="min-w-0 flex-1 basis-0 truncate text-xs text-text-muted" title={typeof descriptionResolved === 'string' ? descriptionResolved : undefined}>{descriptionResolved}</div>
          </TooltipTrigger><TooltipContent>{descriptionResolved}</TooltipContent></Tooltip></TooltipProvider>}
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap">
          {!gate && dataTrustSummary}
          {!gate && secondaryActions}
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
        {subtitle && <p className="text-[12px] text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>}
    <div className={cn('px-4 pb-4', !title && !actions && 'pt-4', bodyClassName)}>{children}</div>
  </section>;
}
