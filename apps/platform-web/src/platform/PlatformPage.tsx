import { ChevronRight, Loader2, MapPinOff, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../kernel/i18n';
import { PlatformLink, usePlatform } from '../kernel/platform';
import { GROUPS, menuById, type MenuEntry } from '../kernel/registry';
import { Button } from '../ui/components/Button';
import { cn } from '../ui/utils/cn';
import { GlobalContextBar } from '../shell/GlobalContextBar';
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
  const { route, favorites, toggleFavorite, scope, setGlobal, lastScope, linkTo } = usePlatform();
  const { t, tx } = useI18n();
  const menu = route!.menu;
  const group = GROUPS.find(g => g.id === menu.group)!;
  const favoriteTarget = menu.navHidden ? null : menu;
  const isFavorite = favoriteTarget ? favorites.includes(favoriteTarget.id) : false;
  const parent: MenuEntry | null = menu.parent ? menuById(menu.parent) : null;

  let gate: ReactNode = null;
  if (menu.requiresScope && scope.status !== 'valid') {
    gate = scope.status === 'validating'
      ? <StateMessage icon={<Loader2 className="size-4 animate-spin" aria-hidden />} title={t('scopeValidating')} />
      : scope.status === 'none'
        ? <StateMessage icon={<MapPinOff className="size-4" aria-hidden />} title={t('selectScope')} body={t('selectScopeBody')}
            action={lastScope && <Button size="sm" onClick={() => setGlobal({ scopeId: lastScope })}>{t('applySuggested')}: {lastScope}</Button>} />
        : scope.status === 'unknown_scope'
          ? <StateMessage icon={<MapPinOff className="size-4" aria-hidden />} title={t('scopeUnknownTitle')}
              body={<>{t('scopeUnknownBody')} <span className="t-mono">scopeId={scope.scopeId}</span></>} />
          : <StateMessage tone="warning" icon={<MapPinOff className="size-4" aria-hidden />} title={t('stateForbidden')}
            body={<>{t('stateForbiddenBody')} <span className="t-mono">scopeId={scope.scopeId}</span></>} />;
  }

  return <div className="flex min-h-full flex-col">
    <header className="flex flex-wrap items-end justify-between gap-3 px-5 pb-3 pt-4">
      <div className="min-w-0 space-y-1">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-[12px] text-text-secondary">
            <li>{tx(group.label)}</li>
            {parent && <><ChevronRight className="size-3 text-text-disabled" aria-hidden /><li><PlatformLink className="hover:text-accent-primary hover:underline" href={linkTo(parent.id)}>{tx(parent.label)}</PlatformLink></li></>}
            {crumbs.map((c, i) => <li key={i} className="flex items-center gap-1"><ChevronRight className="size-3 text-text-disabled" aria-hidden />{c.href ? <PlatformLink className="hover:text-accent-primary hover:underline" href={c.href}>{c.label}</PlatformLink> : c.label}</li>)}
            <ChevronRight className="size-3 text-text-disabled" aria-hidden />
            <li aria-current="page" className="text-text-primary">{tx(menu.label)}</li>
          </ol>
        </nav>
        <div className="flex items-center gap-2">
          <h1 className="t-page-title truncate">{title ?? tx(menu.label)}</h1>
          {favoriteTarget && <button type="button" onClick={() => toggleFavorite(favoriteTarget.id)} aria-pressed={isFavorite}
            aria-label={isFavorite ? t('removeFavorite') : t('addFavorite')} title={isFavorite ? t('removeFavorite') : t('addFavorite')}
            className="grid size-8 place-items-center rounded-sm text-text-muted hover:bg-surface-sunken hover:text-accent-warn">
            <Star className={cn('size-4', isFavorite && 'fill-accent-warn text-accent-warn')} aria-hidden />
          </button>}
        </div>
        <p className="max-w-3xl text-[13px] text-text-secondary">{description ?? tx(menu.description)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!gate && dataTrustSummary}
        {!gate && secondaryActions}
        {!gate && primaryAction}
      </div>
    </header>
    <GlobalContextBar />
    {contextExtension && !gate && <div className="px-5 pt-3">{contextExtension}</div>}
    <div className="flex-1 px-5 pb-6 pt-3">{gate ?? children}</div>
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
