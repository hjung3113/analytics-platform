import { useContext } from 'react';
import { CircleHelp, ExternalLink, LayoutGrid, Languages, LogOut, MessageSquarePlus, Search } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { BOARD_PATH, useHostPlatform } from '@ap/kernel/host';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, shortcutLabel, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { SystemSwitcher } from './SystemSwitcher';
import { placeableMenus } from './board/boardMenus';
import { NotificationsBell } from './NotificationsBell';
import { firstOpenableMenu, useSystemSections } from './systemSections';
import { VocDrawerContext } from './VocDrawer';

/** System switcher, the current system's section buttons and global tools; the app keeps ownership of topBarTools. */
export function AppRail() {
  const voc = useContext(VocDrawerContext);
  const { slots, user, setPaletteOpen, navigate, linkTo, can, canOpen, registry, platformScreen } = useHostPlatform();
  const { t, tx, lang, setLang } = useI18n();
  const overallLabel = lang === 'ko' ? 'FeedbackOps 전체 — 새 탭' : 'FeedbackOps overall — new tab';
  const systems = useSystemSections();
  const overall = slots.feedbackOps?.overall ?? null;
  // The board is offered only where something can be placed on it: the same menus the empty pane lists (docs/16 §4).
  const showBoard = placeableMenus(registry, canOpen).length > 0;
  const boardLabel = lang === 'ko' ? '분석 보드' : 'Analysis board';
  const vocLabel = lang === 'ko' ? 'VOC 등록' : 'File a VOC';
  return <TooltipProvider delayDuration={200}>
    <nav aria-label={lang === 'ko' ? '앱 레일' : 'App rail'} className="flex h-full w-(--rail-width) shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-r border-border-subtle bg-surface-sidebar pb-3">
      <SystemSwitcher />
      <div className="mb-1 w-6 shrink-0 border-t border-border-subtle" aria-hidden />
      {systems !== null && systems.sections.length > 0 && <div role="group" aria-label={t('railSections')} className="flex min-h-8 shrink flex-col items-center gap-1.5 overflow-y-auto">
        {systems.sections.map(({ group, items }) => {
          const Icon = group.icon;
          const active = group.id === systems.currentGroupId;
          const name = tx(group.label);
          return <Tooltip key={group.id}><TooltipTrigger asChild>
            <button type="button" aria-label={name} aria-current={active ? 'true' : undefined}
              onClick={() => { if (!active) navigate(linkTo(firstOpenableMenu(items).id), { focus: 'page', via: 'sidebar' }); }}
              className={cn('relative grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover', active && 'bg-surface-row-selected text-accent-primary')}>
              {active && <span data-current-marker aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent-primary" />}
              <Icon className="size-4" aria-hidden />
            </button>
          </TooltipTrigger><TooltipContent side="right">{name}</TooltipContent></Tooltip>;
        })}
      </div>}
      <div className="min-h-3 flex-1" />
      <Tooltip><TooltipTrigger asChild>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-label={t('searchPlaceholder')} aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K"
          className="grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover"><Search className="size-4" aria-hidden /></button>
      </TooltipTrigger><TooltipContent side="right">{t('searchPlaceholder')} · {shortcutLabel('K')}</TooltipContent></Tooltip>
      {showBoard && <Tooltip><TooltipTrigger asChild>
        <button type="button" onClick={() => { if (platformScreen !== 'board') navigate(BOARD_PATH, { focus: 'page', via: 'sidebar' }); }} aria-label={boardLabel} aria-current={platformScreen === 'board' ? 'page' : undefined}
          className={cn('grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover', platformScreen === 'board' && 'bg-surface-row-selected text-accent-primary')}><LayoutGrid className="size-4" aria-hidden /></button>
      </TooltipTrigger><TooltipContent side="right">{boardLabel}</TooltipContent></Tooltip>}
      {voc && <Tooltip><TooltipTrigger asChild>
        <button ref={voc.railButton} type="button" onClick={voc.toggle} aria-expanded={voc.visible} aria-controls={voc.panelId} aria-label={voc.draftHidden ? `${vocLabel} (${lang === 'ko' ? '작성 중' : 'draft'})` : vocLabel}
          className={cn('relative grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring', voc.visible && 'bg-surface-row-selected text-accent-primary')}>
          <MessageSquarePlus className="size-4" aria-hidden />
          {voc.draftHidden && <span data-draft-dot aria-hidden className="absolute right-0.5 top-0.5 size-2 rounded-pill bg-accent-primary" />}
        </button>
      </TooltipTrigger><TooltipContent side="right">{vocLabel}</TooltipContent></Tooltip>}
      {slots.notifications && canOpen(slots.notifications.menuId) && <NotificationsBell slot={slots.notifications} />}
      <div className="flex shrink-0 flex-col items-center gap-1">{slots.topBarTools}</div>
      <div className="my-1 w-6 shrink-0 border-t border-border-subtle" aria-hidden />
      <Popover>
        <PopoverTrigger asChild><button type="button" aria-label={lang === 'ko' ? '도움말' : 'Help'} title={lang === 'ko' ? '도움말' : 'Help'} className="grid size-8 place-items-center rounded-md text-text-secondary hover:bg-surface-sunken"><CircleHelp className="size-4" aria-hidden /></button></PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-72">
          <p className="t-card-title mb-2">{lang === 'ko' ? '단축키' : 'Shortcuts'}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt><kbd className="rounded-xs border border-border-strong px-1">{shortcutLabel('K')}</kbd></dt><dd>{lang === 'ko' ? '메뉴 이동 팔레트' : 'Menu palette'}</dd>
            <dt><kbd className="rounded-xs border border-border-strong px-1">[</kbd></dt><dd>{lang === 'ko' ? '사이드바 접기/펼치기' : 'Toggle sidebar'}</dd>
            <dt><kbd className="rounded-xs border border-border-strong px-1">Esc</kbd></dt><dd>{lang === 'ko' ? '상세·팝오버 닫기' : 'Close detail/popover'}</dd>
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
            <Languages className="mr-2 size-3.5" aria-hidden />{lang === 'ko' ? '언어' : 'Language'} <span className="ml-auto text-caption text-text-muted">{lang === 'ko' ? '한국어 → English' : 'English → 한국어'}</span>
          </DropdownMenuItem>
          {overall && can(overall.permission) && <DropdownMenuItem asChild>
            <a href={overall.href} target="_blank" rel="noopener noreferrer" aria-label={overallLabel}>
              <ExternalLink className="mr-2 size-3.5" aria-hidden />{lang === 'ko' ? 'FeedbackOps 전체' : 'FeedbackOps overall'} <span className="ml-auto text-caption text-text-muted">{lang === 'ko' ? '새 탭 · 담당자' : 'New tab · operators'}</span>
            </a>
          </DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled><LogOut className="mr-2 size-3.5" aria-hidden />{t('signOut')} <span className="ml-auto text-caption">{t('signOutUnavailable')}</span></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  </TooltipProvider>;
}
