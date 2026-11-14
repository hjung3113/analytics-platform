import { useContext } from 'react';
import { CircleHelp, LayoutGrid, Languages, LogOut, MessageSquarePlus, Search } from 'lucide-react';
import { type MenuEntry, useI18n, useMessages } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, shortcutLabel, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { SystemSwitcher } from './SystemSwitcher';
import { undeclaredOnlySections, UndeclaredBoundary } from './undeclared';
import { placeableMenus } from '../board/boardMenus';
import { useBoardPresentation } from '../board/boardPresentation';
import { boardText } from '../board/text';
import { SHELL_MESSAGES } from '../messages';
import { NotificationsBell } from './NotificationsBell';
import { ShellBoundary } from './ShellBoundary';
import { firstOpenableMenu, useSystemSections } from './systemSections';
import { VocDrawerContext } from '../voc/VocDrawer';

/** System switcher, the current system's section buttons and global tools; the app keeps ownership of topBarTools. */
export function AppRail() {
  const voc = useContext(VocDrawerContext);
  const { slots, user, setPaletteOpen, navigate, linkTo, canOpen, registry, visibleMenus, currentSpace } = useHostPlatform();
  const { t, tx, lang, setLang } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const systems = useSystemSections();
  // The board is offered only where something can be placed on it: the same menus the empty pane lists (docs/16 §4).
  const showBoard = placeableMenus(registry, canOpen).length > 0;
  const board = useBoardPresentation();
  const boardCopy = boardText(lang);
  // Three states told by words, not by colour: closed, open (this screen), minimized (a shape on the icon too).
  const boardLabel = board.maximized ? boardCopy.railOpen : board.floating ? (board.windowFill ? boardCopy.railOpen : boardCopy.railFloating) : board.minimized ? boardCopy.railMinimized : boardCopy.railClosed;
  const vocLabel = m('railVoc');
  return <TooltipProvider delayDuration={200}>
    <nav aria-label={m('railNav')} className="flex h-full w-(--rail-width) shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-r border-border-subtle bg-surface-sidebar pb-3">
      <SystemSwitcher />
      <div className="mb-1 w-6 shrink-0 border-t border-border-subtle" aria-hidden />
      {systems !== null && currentSpace !== null && <UndeclaredBoundary>{undeclared => {
        // Operator only (#2201): a section whose menus are all undeclared is drawn dimmed and not navigable, in its Registry place among the real ones.
        const dimmed = undeclaredOnlySections(currentSpace.id, registry.groups, registry.menus, visibleMenus, undeclared);
        const order = new Map(registry.groups.map((group, at) => [group.id, at]));
        const entries = [...systems.sections.map(section => ({ ...section, permissions: null as string | null })), ...dimmed.map(({ group, permissions }) => ({ group, items: [] as MenuEntry[], permissions }))]
          .sort((a, b) => (order.get(a.group.id) ?? 0) - (order.get(b.group.id) ?? 0));
        return entries.length > 0 && <div role="group" aria-label={t('railSections')} className="flex min-h-8 shrink flex-col items-center gap-1.5 overflow-y-auto">
          {entries.map(({ group, items, permissions }) => {
            const Icon = group.icon;
            if (permissions !== null) {
              const dimmedName = t('undeclaredMenuNamed', { label: tx(group.label), permission: permissions });
              return <Tooltip key={group.id}><TooltipTrigger asChild>
                <button type="button" aria-label={dimmedName} aria-disabled="true" data-section-undeclared={group.id}
                  className="grid size-8 shrink-0 cursor-default place-items-center rounded-md text-text-disabled focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
                  <Icon className="size-4" aria-hidden />
                </button>
              </TooltipTrigger><TooltipContent side="right">{dimmedName}</TooltipContent></Tooltip>;
            }
            const active = group.id === systems.currentGroupId;
            // A section whose menus are all registered without a screen looks dimmed and says so; the words are in the name and tooltip (#1944).
            const planned = items.every(menu => !menu.component && !menu.moduleScreen);
            const name = planned ? `${tx(group.label)} · ${t('planned')}` : tx(group.label);
            return <Tooltip key={group.id}><TooltipTrigger asChild>
              <button type="button" aria-label={name} data-section-planned={planned ? 'true' : undefined} aria-current={active ? 'true' : undefined}
                onClick={() => { if (!active) navigate(linkTo(firstOpenableMenu(items).id), { focus: 'page', via: 'sidebar' }); }}
                className={cn('relative grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover', planned && 'opacity-50', active && 'bg-surface-row-selected text-accent-primary')}>
                {active && <span data-current-marker aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent-primary" />}
                <Icon className="size-4" aria-hidden />
              </button>
            </TooltipTrigger><TooltipContent side="right">{name}</TooltipContent></Tooltip>;
          })}
        </div>;
      }}</UndeclaredBoundary>}
      <div className="min-h-3 flex-1" />
      <Tooltip><TooltipTrigger asChild>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-label={t('searchPlaceholder')} aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K"
          className="grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover"><Search className="size-4" aria-hidden /></button>
      </TooltipTrigger><TooltipContent side="right">{t('searchPlaceholder')} · {shortcutLabel('K')}</TooltipContent></Tooltip>
      {showBoard && <Tooltip><TooltipTrigger asChild>
        <button type="button" data-board-state={board.maximized ? 'open' : board.floating ? 'floating' : board.minimized ? 'minimized' : 'closed'} aria-label={boardLabel} aria-current={board.maximized ? 'page' : undefined}
          onClick={() => { if (board.floating) board.focusWindow(); else if (board.minimized) board.restore(boardCopy.announceRestored); else if (!board.maximized) board.open(); }}
          className={cn('relative grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover', board.maximized && 'bg-surface-row-selected text-accent-primary', (board.minimized || board.floating) && 'text-accent-primary')}>
          <LayoutGrid className="size-4" aria-hidden />
          {board.floating && <span data-board-floating-mark aria-hidden className="absolute bottom-0.5 right-0.5 size-2 rounded-xs bg-accent-primary" />}
          {board.minimized && <span data-board-minimized-mark aria-hidden className="absolute bottom-0.5 right-0.5 size-2 rounded-xs border border-accent-primary bg-surface-sidebar" />}
        </button>
      </TooltipTrigger><TooltipContent side="right">{boardLabel}</TooltipContent></Tooltip>}
      {voc && <Tooltip><TooltipTrigger asChild>
        <button ref={voc.railButton} type="button" onClick={voc.toggle} aria-expanded={voc.visible} aria-controls={voc.panelId} aria-label={voc.draftHidden ? m('railVocDraft') : vocLabel}
          className={cn('relative grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring', voc.visible && 'bg-surface-row-selected text-accent-primary')}>
          <MessageSquarePlus className="size-4" aria-hidden />
          {voc.draftHidden && <span data-draft-dot aria-hidden className="absolute right-0.5 top-0.5 size-2 rounded-pill bg-accent-primary" />}
        </button>
      </TooltipTrigger><TooltipContent side="right">{vocLabel}</TooltipContent></Tooltip>}
      {/* Menu code (count, recent list): a throw drops only the bell (#1876). */}
      {slots.notifications && canOpen(slots.notifications.menuId) && <ShellBoundary fallback={null}><NotificationsBell slot={slots.notifications} /></ShellBoundary>}
      <div className="flex shrink-0 flex-col items-center gap-1"><ShellBoundary fallback={null}>{slots.topBarTools}</ShellBoundary></div>
      <div className="my-1 w-6 shrink-0 border-t border-border-subtle" aria-hidden />
      <Popover>
        <PopoverTrigger asChild><button type="button" aria-label={m('railHelp')} title={m('railHelp')} className="grid size-8 place-items-center rounded-md text-text-secondary hover:bg-surface-sunken"><CircleHelp className="size-4" aria-hidden /></button></PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-72">
          <p className="t-card-title mb-2">{m('railShortcuts')}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt><kbd className="rounded-xs border border-border-strong px-1">{shortcutLabel('K')}</kbd></dt><dd>{m('shortcutMenuPalette')}</dd>
            <dt><kbd className="rounded-xs border border-border-strong px-1">[</kbd></dt><dd>{m('shortcutToggleSidebar')}</dd>
            <dt><kbd className="rounded-xs border border-border-strong px-1">Esc</kbd></dt><dd>{m('shortcutCloseOverlay')}</dd>
          </dl>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('profile')} title={user.name} className="grid size-8 place-items-center rounded-pill hover:bg-surface-row-hover">
            <span aria-hidden className="grid size-8 place-items-center rounded-pill bg-accent-primary-soft text-xs font-semibold text-accent-primary">{user.name.split(' ').map(w => w[0]).join('')}</span>

          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-64">
          <DropdownMenuLabel>{user.name} · {tx(user.title)}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={event => { event.preventDefault(); setLang(lang === 'ko' ? 'en' : 'ko'); }}>
            <Languages className="mr-2 size-3.5" aria-hidden />{t('language')} <span className="ml-auto text-caption text-text-muted">{m('languageSwitchLabel')}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled><LogOut className="mr-2 size-3.5" aria-hidden />{t('signOut')} <span className="ml-auto text-caption">{t('signOutUnavailable')}</span></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  </TooltipProvider>;
}
