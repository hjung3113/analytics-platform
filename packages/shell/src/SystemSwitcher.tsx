import { Check, ChevronDown, House, LayoutGrid } from 'lucide-react';
import { useId, useRef, useState, type MouseEvent } from 'react';
import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { cn, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger } from '@ap/ui';

const CARD = 'flex w-full items-start gap-2 rounded-md border px-3 py-2.5 text-left hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

/**
 * Business-system switcher at the top of the rail (15 §3.2, ADR-0042). Cards come from `accessibleSpaces`
 * with a `spaceEntry`; planned rows are display-only slots. A real move closes the popover first and runs
 * from `onCloseAutoFocus`, after the focus trap is gone, so the Kernel arrival focus (ADR-0032) lands on the new title.
 */
export function SystemSwitcher() {
  const { currentSpace, accessibleSpaces, spaceEntry, switchSpace, registry, resolveLink, navigate, pathname, slots } = usePlatform();
  const { t, tx } = useI18n();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Set per selection and cleared on every open, so one open never inherits another's choice.
  const pendingMove = useRef<(() => void) | null>(null);

  const spaceIcon = (homeMenuId: string) => registry.groupById(registry.menuById(homeMenuId).group).icon;
  const cards = accessibleSpaces.flatMap(space => {
    const entry = spaceEntry(space.id);
    return entry === null ? [] : [{ space, entry }];
  });
  const homeMenu = registry.matchRoute('/')?.menu;
  const homeOpened = homeMenu !== undefined ? resolveLink(homeMenu.id) : null;
  const homeLink = homeOpened?.allowed === true ? homeOpened : null;
  const planned = slots.plannedSpaces ?? [];
  const label = currentSpace === null ? t('switcherTitle') : t('switcherCurrent', { space: tx(currentSpace.label) });
  const TriggerIcon = currentSpace === null ? LayoutGrid : spaceIcon(currentSpace.homeMenuId);

  const onOpenChange = (next: boolean) => {
    if (next) pendingMove.current = null;
    setOpen(next);
  };
  const close = (move: (() => void) | null) => {
    pendingMove.current = move;
    setOpen(false);
  };
  const goHome = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const changesPage = href.split('?')[0] !== pathname;
    close(() => {
      if (!navigate(href, changesPage ? { focus: 'page' } : undefined) || !changesPage) triggerRef.current?.focus({ preventScroll: true });
    });
  };

  return <div className="flex h-[50px] w-full shrink-0 items-center justify-center">
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild>
        <button ref={triggerRef} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
          className="grid size-10 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          <span className="relative grid size-8 place-items-center rounded-md bg-accent-primary-soft text-accent-primary hover:bg-surface-row-hover">
            <TriggerIcon className="size-4" aria-hidden /><ChevronDown className="absolute bottom-0.5 right-0.5 size-2.5" aria-hidden />
          </span>
        </button>
      </PopoverTrigger></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>
      <PopoverContent ref={contentRef} side="right" align="start" padding="none" className="w-[520px]" aria-labelledby={titleId}
        onOpenAutoFocus={event => {
          event.preventDefault();
          const root = contentRef.current;
          const target = root?.querySelector<HTMLElement>('[data-switcher-current]')
            ?? root?.querySelector<HTMLElement>('[data-switcher-card]')
            ?? root?.querySelector<HTMLElement>('[data-switcher-home]')
            ?? root?.querySelector<HTMLElement>('[data-switcher-empty]');
          target?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const move = pendingMove.current;
          pendingMove.current = null;
          if (move) move();
          else triggerRef.current?.focus({ preventScroll: true });
        }}>
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold">{t('switcherTitle')}</h2>
          {homeLink && <PlatformLink data-switcher-home href={homeLink.href} onClick={event => goHome(event, homeLink.href)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
            <House className="size-3.5" aria-hidden />{t('platformHome')}
          </PlatformLink>}
        </div>
        {cards.length === 0
          ? <p data-switcher-empty tabIndex={-1} className="px-4 py-6 text-center text-sm text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{t('switcherEmpty')}</p>
          : <ul className="grid grid-cols-2 gap-2 p-3">{cards.map(({ space, entry }) => {
            const Icon = spaceIcon(space.homeMenuId);
            const current = currentSpace?.id === space.id;
            const menuName = tx(registry.menuById(entry.menuId).label);
            return <li key={space.id}>
              <button type="button" {...(current ? { 'data-switcher-current': true, 'aria-current': 'true' as const } : {})} data-switcher-card
                onClick={() => close(current ? null : () => switchSpace(space.id))}
                className={cn(CARD, current ? 'border-accent-primary bg-accent-primary-soft' : 'border-border-subtle')}>
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{tx(space.label)}</span>
                  <span className="block truncate text-caption text-text-muted">{entry.resumed ? t('switcherResume', { menu: menuName }) : t('switcherStart', { menu: menuName })}</span>
                </span>
                {current && <span className="flex items-center gap-0.5 text-caption font-semibold text-accent-primary"><Check className="size-3" aria-hidden />{t('switcherCurrentBadge')}</span>}
              </button>
            </li>;
          })}</ul>}
        {planned.length > 0 && <div className="border-t border-border-subtle p-3">
          <p className="mb-2 text-caption font-semibold text-text-muted">{t('switcherPlannedHeading')}</p>
          <ul className="grid grid-cols-2 gap-2">{planned.map(item => {
            const Icon = item.icon;
            return <li key={item.id}>
              <button type="button" data-switcher-planned aria-disabled="true" className={cn(CARD, 'cursor-default border-border-subtle text-text-muted')}>
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{tx(item.label)}</span>
                  <span className="block truncate text-caption">{t('switcherPlannedBody')}</span>
                </span>
              </button>
            </li>;
          })}</ul>
        </div>}
      </PopoverContent>
    </Popover>
  </div>;
}
