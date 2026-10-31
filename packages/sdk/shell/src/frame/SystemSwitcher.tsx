import { Check, ChevronDown, ChevronsUpDown, CircleDashed, Grip, House, Layers, LayoutGrid } from 'lucide-react';
import { useEffect, useId, useRef, type MouseEvent } from 'react';
import { badgeCountText } from '@ap/components';
import { PlatformLink, useI18n } from '@ap/kernel';
import { useHostPlatform, useOverlayState } from '@ap/kernel/host';
import { usePlatformMenu } from './platformMenu';
import { MenuUnread } from './unread';
import { cn, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger } from '@ap/ui';
import { PROTO_1189, PROTO_ICON, PROTO_SHORT, protoLatinInitial } from './proto1189';
import { useSystemSections } from './systemSections';

const CARD = 'flex w-full items-start gap-2 rounded-md border px-3 py-2.5 text-left hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

/**
 * Business-system switcher at the top of the rail (15 §3.2, ADR-0042). Cards come from `accessibleSpaces`
 * with a `spaceEntry`; planned rows are display-only slots. A real move closes the popover first and runs
 * from `onCloseAutoFocus`, after the focus trap is gone, so the Kernel arrival focus (ADR-0032) lands on the new title.
 */
export function SystemSwitcher({ placement = 'rail', subline }: { placement?: 'rail' | 'head'; subline?: string | null } = {}) {
  const { currentSpace, accessibleSpaces, spaceEntry, switchSpace, registry, resolveLink, navigate, pathname, route, slots, setSwitcherOpen } = useHostPlatform();
  const { switcherOpen: open, switcherSession } = useOverlayState();
  const { t, tx } = useI18n();
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Set per selection and cleared on every open, so one open never inherits another's choice. It belongs to the
  // Kernel focus session it was chosen in and dies with the component, so a late close-autofocus timer cannot run it.
  const pendingMove = useRef<{ move: () => void; session: NonNullable<ReturnType<typeof useOverlayState>['switcherSession']> } | null>(null);
  const owner = useRef(Symbol('SystemSwitcher'));
  const disposalTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const own = owner.current;
    clearTimeout(disposalTimer.current);
    return () => {
      pendingMove.current = null;
      // Defer until FocusScope's passive cleanup has removed its trap listeners (as CommandPalette does).
      if (switcherSession) disposalTimer.current = setTimeout(() => switcherSession.release(own), 0);
    };
  }, [switcherSession]);
  // An arrival while open (Back/Forward, a link elsewhere) closes the switcher without taking focus back: the
  // Kernel holds the title focus until the trap is released (06 §26, ADR-0032).
  const openedAt = useRef(pathname);
  useEffect(() => {
    if (open && pathname !== openedAt.current) {
      switcherSession?.select();
      setSwitcherOpen(false);
    }
  }, [open, pathname, switcherSession, setSwitcherOpen]);

  const spaceIcon = (homeMenuId: string) => registry.groupById(registry.menuById(homeMenuId).group).icon;
  const cards = accessibleSpaces.flatMap(space => {
    const entry = spaceEntry(space.id);
    return entry === null ? [] : [{ space, entry }];
  });
  const platform = usePlatformMenu();
  const platformItems = platform.sections.flatMap(section => section.items);
  const planned = slots.plannedSpaces ?? [];
  const label = currentSpace === null ? t('switcherTitle') : t('switcherCurrent', { space: tx(currentSpace.label) });
  const TriggerIcon = currentSpace === null ? LayoutGrid : spaceIcon(currentSpace.homeMenuId);

  const onOpenChange = (next: boolean) => {
    if (next) { pendingMove.current = null; openedAt.current = pathname; }
    setSwitcherOpen(next);
  };
  const close = (move: (() => void) | null) => {
    pendingMove.current = move && switcherSession ? { move, session: switcherSession } : null;
    setSwitcherOpen(false);
  };
  const goPlatform = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const changesPage = href.split('?')[0] !== pathname;
    close(() => {
      if (!navigate(href, changesPage ? { focus: 'page', via: 'switcher' } : { via: 'switcher' }) || !changesPage) triggerRef.current?.focus({ preventScroll: true });
    });
  };

  // #1189 throwaway prototype (?variant=A|B|C) — trigger and popover body; focus, close and move logic are shared with today's switcher.
  const proto = PROTO_1189;
  const currentName = currentSpace === null ? t('platformName') : tx(currentSpace.label);
  const railSections = useSystemSections();
  const systemIcon = (space: { id: string; homeMenuId: string }) => PROTO_ICON[space.id] ?? spaceIcon(space.homeMenuId);
  // Closed trigger mark: Latin name → letter; Hangul name → the system icon, unless a rail section of that system uses
  // the same icon (도구's Map is its only section, 운영 콘솔's list is its 대시보드 section) — then the neutral Layers mark. No system (home): House in A; C uses
  // Layers because its rail top already is a House link.
  const triggerMark = (() => {
    if (currentSpace === null) return { letter: null, Icon: placement === 'head' ? Layers : House };
    const letter = protoLatinInitial(currentName);
    if (letter) return { letter, Icon: null };
    const Icon = systemIcon(currentSpace);
    return { letter: null, Icon: railSections?.sections.some(section => section.group.icon === Icon) ? Layers : Icon };
  })();
  const markOf = (sizeClass: string) => triggerMark.letter
    ? <span aria-hidden className={cn('font-semibold leading-none', sizeClass)}>{triggerMark.letter}</span>
    : triggerMark.Icon && <triggerMark.Icon className="size-4 text-text-secondary" aria-hidden />;
  const shortOf = (spaceId: string, fallback: string | undefined) => { const short = PROTO_SHORT[spaceId]; return short ? tx(short) : fallback; };
  const protoTrigger = proto === null ? null : placement === 'head'
    ? <button ref={triggerRef} type="button" data-proto-switcher-trigger aria-label={label} aria-haspopup="dialog" aria-expanded={open}
        className="group flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 text-left hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring data-[state=open]:bg-surface-row-selected">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md border border-border-subtle bg-surface-card text-text-primary">{markOf('text-sm')}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-text-primary">{currentName}</span>
          {subline && <span className="block truncate text-xs text-text-secondary">{subline}</span>}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-text-muted" aria-hidden />
      </button>
    : <button ref={triggerRef} type="button" data-proto-switcher-trigger aria-label={label} aria-haspopup="dialog" aria-expanded={open}
        className="group grid size-10 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        {proto === 'B'
          ? <span className="grid size-8 place-items-center rounded-md text-text-muted group-hover:bg-surface-row-hover group-data-[state=open]:bg-surface-row-selected group-data-[state=open]:text-accent-primary"><Grip className="size-4" aria-hidden /></span>
          : <span className="flex size-8 items-center justify-center gap-px rounded-md border border-border-subtle bg-surface-card text-text-primary group-hover:bg-surface-row-hover group-data-[state=open]:bg-surface-row-selected">
              {markOf('text-sm')}
              <ChevronsUpDown className="size-3 text-text-muted" aria-hidden />
            </span>}
      </button>;
  const protoPlatformNav = platformItems.length > 0 && <nav aria-label={t('platformMenu')} className={cn('border-t border-border-subtle pb-1.5 pt-2', proto === 'B' ? 'px-3' : 'px-1.5')}>
    <p className={cn('pb-1 text-xs font-semibold text-text-muted', proto === 'B' ? '' : 'px-2')}>{t('platformMenu')}</p>
    <ul className={cn('grid grid-cols-3', proto === 'B' && 'gap-x-1')}>{platformItems.map(menu => {
      const link = resolveLink(menu.id);
      return <li key={menu.id}><MenuUnread menuId={menu.id}>{count => {
        const name = platform.labelOf(menu);
        const unread = count !== null && count > 0 ? count : 0;
        return <PlatformLink data-switcher-platform href={link.href} aria-current={route?.menu.id === menu.id ? 'page' : undefined} onClick={event => goPlatform(event, link.href)}
          {...(unread > 0 ? { 'aria-label': t('unreadNamed', { label: name, count: unread }) } : {})}
          className={cn('flex h-8 items-center rounded-md px-2 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring aria-[current=page]:font-semibold aria-[current=page]:text-text-primary', proto === 'B' && 'justify-center')}>
          {name}
          {unread > 0 && <span aria-hidden className="ml-1 rounded-pill bg-surface-row-selected px-1.5 text-caption font-semibold text-text-secondary">{badgeCountText(unread)}</span>}
        </PlatformLink>;
      }}</MenuUnread></li>;
    })}</ul>
  </nav>;
  const protoBody = proto === null ? null : <>
    <h2 id={titleId} className="sr-only">{t('switcherTitle')}</h2>
    <p className={cn('pb-1 pt-3 text-xs font-semibold text-text-muted', proto === 'B' ? 'px-3' : 'px-3.5')}>{t('switcherSystemsHeading')}</p>
    {cards.length === 0
      ? <p data-switcher-empty tabIndex={-1} className="px-4 py-6 text-center text-sm text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{t('switcherEmpty')}</p>
      : proto === 'B'
        ? <ul className="grid grid-cols-3 gap-1 px-3 pb-2">{cards.map(({ space, entry }) => {
            const Icon = systemIcon(space);
            const current = currentSpace?.id === space.id;
            const menuName = tx(registry.menuById(entry.menuId).label);
            return <li key={space.id}>
              <button type="button" {...(current ? { 'data-switcher-current': true, 'aria-current': 'true' as const } : {})} data-switcher-card title={entry.resumed ? t('switcherResume', { menu: menuName }) : undefined}
                onClick={() => close(current ? null : () => switchSpace(space.id))}
                className="flex h-[84px] w-full flex-col items-center justify-center gap-2 rounded-md px-1 text-center hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring aria-[current=true]:bg-surface-row-selected">
                <span aria-hidden className="grid size-9 place-items-center rounded-md border border-border-subtle bg-surface-card text-text-secondary"><Icon className="size-[18px]" strokeWidth={1.75} /></span>
                <span className="line-clamp-1 w-full break-keep text-sm font-medium text-text-primary">{tx(space.label)}</span>
                {current && <span className="sr-only">{t('switcherCurrentBadge')}</span>}
              </button>
            </li>;
          })}</ul>
        : <ul className="px-1.5 pb-1.5">{cards.map(({ space, entry }) => {
            const current = currentSpace?.id === space.id;
            const menuName = tx(registry.menuById(entry.menuId).label);
            const short = shortOf(space.id, space.subtitle ? tx(space.subtitle) : undefined);
            const Icon = systemIcon(space);
            return <li key={space.id}>
              <button type="button" {...(current ? { 'data-switcher-current': true, 'aria-current': 'true' as const } : {})} data-switcher-card title={entry.resumed ? t('switcherResume', { menu: menuName }) : undefined}
                onClick={() => close(current ? null : () => switchSpace(space.id))}
                className="flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
                <Icon className="size-4 shrink-0 text-text-secondary" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-sm font-semibold text-text-primary">{tx(space.label)}</span>
                  {short && <span className="ml-2 text-sm text-text-secondary">{short}</span>}
                </span>
                {current && <><Check className="size-4 shrink-0 text-accent-primary" aria-hidden /><span className="sr-only">{t('switcherCurrentBadge')}</span></>}
              </button>
            </li>;
          })}</ul>}
    {planned.length > 0 && <div className="border-t border-border-subtle px-1.5 py-1.5">
      <p className="px-2 pb-1 pt-0.5 text-caption font-semibold text-text-muted">{t('switcherPlannedHeading')}</p>
      <ul>{planned.map(item => <li key={item.id}>
        <button type="button" data-switcher-planned aria-disabled="true" className="flex h-9 w-full cursor-default items-center gap-2.5 rounded-md px-2 text-left text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          <CircleDashed className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm">{tx(item.label)}</span>
          <span className="text-caption">{t('switcherPlannedBody')}</span>
        </button>
      </li>)}</ul>
    </div>}
    {protoPlatformNav}
  </>;

  return <div className={placement === 'head' ? 'mr-1 flex min-w-0 flex-1 items-center' : 'flex h-[50px] w-full shrink-0 items-center justify-center'}>
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild>
        {protoTrigger ?? <button ref={triggerRef} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
          className="grid size-10 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          <span className="relative grid size-8 place-items-center rounded-md bg-accent-primary-soft text-accent-primary hover:bg-surface-row-hover">
            <TriggerIcon className="size-4" aria-hidden /><ChevronDown className="absolute bottom-0.5 right-0.5 size-2.5" aria-hidden />
          </span>
        </button>}
      </PopoverTrigger></TooltipTrigger><TooltipContent side={placement === 'head' ? 'bottom' : 'right'}>{label}</TooltipContent></Tooltip>
      <PopoverContent ref={contentRef} side={placement === 'head' ? 'bottom' : 'right'} align="start" padding="none" className={proto === null ? 'w-[520px]' : proto === 'B' ? 'w-[312px]' : 'w-[320px]'} aria-labelledby={titleId}
        onOpenAutoFocus={event => {
          event.preventDefault();
          switcherSession?.claim(owner.current);
          const root = contentRef.current;
          const target = root?.querySelector<HTMLElement>('[data-switcher-current]')
            ?? root?.querySelector<HTMLElement>('[data-switcher-card]')
            ?? root?.querySelector<HTMLElement>('[data-switcher-platform]')
            ?? root?.querySelector<HTMLElement>('[data-switcher-empty]');
          target?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const queued = pendingMove.current;
          pendingMove.current = null;
          if (!switcherSession) return;
          // Only this instance may release its rendered block; the Kernel then hands any arrival its title focus.
          switcherSession.release(owner.current);
          if (!switcherSession.isCurrent()) return;
          if (queued) {
            if (queued.session === switcherSession) queued.move();
            return;
          }
          if (switcherSession.isSelecting()) return;
          const active = document.activeElement;
          if (active && document.getElementById('platform-main')?.contains(active)) return;
          triggerRef.current?.focus({ preventScroll: true });
        }}>
        {protoBody ?? <>
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold">{t('switcherTitle')}</h2>
        </div>
        {platformItems.length > 0 && <nav aria-label={t('platformMenu')} className="border-b border-border-subtle px-4 py-3">
          <p className="mb-1.5 text-caption font-semibold text-text-muted">{t('platformMenu')} <span className="font-normal">· {t('platformMenuShared')}</span></p>
          <ul className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">{platformItems.map((menu, at) => {
            const link = resolveLink(menu.id);
            return <li key={menu.id} className="flex items-center gap-1.5">
              {at > 0 && <span aria-hidden className="text-text-muted">·</span>}
              <MenuUnread menuId={menu.id}>{count => {
                const name = platform.labelOf(menu);
                const unread = count !== null && count > 0 ? count : 0;
                return <PlatformLink data-switcher-platform href={link.href} aria-current={route?.menu.id === menu.id ? 'page' : undefined} onClick={event => goPlatform(event, link.href)}
                  {...(unread > 0 ? { 'aria-label': t('unreadNamed', { label: name, count: unread }) } : {})}
                  className="rounded-md px-1.5 py-0.5 text-text-secondary hover:bg-surface-row-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring aria-[current=page]:font-semibold aria-[current=page]:text-text-primary">
                  {name}
                  {unread > 0 && <span aria-hidden className="ml-1 rounded-pill bg-surface-row-selected px-1.5 text-caption font-semibold text-text-secondary">{badgeCountText(unread)}</span>}
                </PlatformLink>;
              }}</MenuUnread>
            </li>;
          })}</ul>
        </nav>}
        <p className="px-4 pt-3 text-caption font-semibold text-text-muted">{t('switcherSystemsHeading')}</p>
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
                  {space.subtitle && <span className="block truncate text-caption text-text-muted">{tx(space.subtitle)}</span>}
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
                  {item.subtitle && <span className="block truncate text-caption">{tx(item.subtitle)}</span>}
                  <span className="block truncate text-caption">{t('switcherPlannedBody')}</span>
                </span>
              </button>
            </li>;
          })}</ul>
        </div>}
        </>}
      </PopoverContent>
    </Popover>
  </div>;
}
