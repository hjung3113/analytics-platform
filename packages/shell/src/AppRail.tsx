import { CircleHelp, LogOut, Search } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';

/** Space navigation and global tools; the app keeps ownership of topBarTools. */
export function AppRail() {
  const { sidebarSpace, accessibleSpaces, switchSpace, slots, user, setPaletteOpen, registry } = usePlatform();
  const { t, tx, lang, setLang } = useI18n();
  const languageLabel = lang === 'ko' ? '언어: 한국어 — English로 전환' : 'Language: English — 한국어로 전환';
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return <TooltipProvider delayDuration={200}>
    <nav aria-label={lang === 'ko' ? '앱 레일' : 'App rail'} className="flex h-full w-(--rail-width) shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-border-subtle bg-surface-sidebar py-3">
      <div title={t('appName')} className="mb-1 grid size-8 shrink-0 place-items-center rounded-md bg-accent-primary text-text-on-accent"><span aria-hidden className="text-sm font-semibold">A</span><span className="sr-only">{t('appName')}</span></div>
      {accessibleSpaces.length >= 2 && accessibleSpaces.map(space => {
        const Icon = registry.groupById(registry.menuById(space.homeMenuId).group).icon;
        const active = sidebarSpace.id === space.id;
        return <Tooltip key={space.id}><TooltipTrigger asChild>
          <button type="button" aria-label={`${lang === 'ko' ? '공간' : 'Space'}: ${tx(space.label)}`} aria-current={active ? 'page' : undefined}
            onClick={() => switchSpace(space.id)} className={cn('relative grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover', active && 'bg-surface-row-selected text-accent-primary')}>
            {active && <span data-current-marker aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent-primary" />}
            <Icon className="size-4" aria-hidden />
          </button>
        </TooltipTrigger><TooltipContent side="right">{tx(space.label)}</TooltipContent></Tooltip>;
      })}
      <div className="my-1 w-6 border-t border-border-subtle" aria-hidden />
      <Tooltip><TooltipTrigger asChild>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-label={t('searchPlaceholder')} aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K"
          className="grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover"><Search className="size-4" aria-hidden /></button>
      </TooltipTrigger><TooltipContent side="right">{t('searchPlaceholder')} · {isMac ? '⌘' : 'Ctrl'} K</TooltipContent></Tooltip>
      <div className="min-h-3 flex-1" />
      <div className="flex shrink-0 flex-col items-center gap-1">{slots.topBarTools}</div>
      <Popover>
        <PopoverTrigger asChild><button type="button" aria-label="Help" title="Help" className="grid size-8 place-items-center rounded-md text-text-secondary hover:bg-surface-sunken"><CircleHelp className="size-4" aria-hidden /></button></PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-72">
          <p className="t-card-title mb-2">{lang === 'ko' ? '단축키' : 'Shortcuts'}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt><kbd className="rounded-xs border border-border-strong px-1">{isMac ? '⌘' : 'Ctrl'} K</kbd></dt><dd>{lang === 'ko' ? '메뉴 이동 팔레트' : 'Menu palette'}</dd>
            <dt><kbd className="rounded-xs border border-border-strong px-1">[</kbd></dt><dd>{lang === 'ko' ? '사이드바 접기/펼치기' : 'Toggle sidebar'}</dd>
            <dt><kbd className="rounded-xs border border-border-strong px-1">Esc</kbd></dt><dd>{lang === 'ko' ? '상세·팝오버 닫기' : 'Close detail/popover'}</dd>
          </dl>
        </PopoverContent>
      </Popover>

      <Tooltip><TooltipTrigger asChild>
        <button type="button" aria-label={languageLabel} onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
          className="grid size-8 place-items-center rounded-md text-caption font-semibold text-text-secondary hover:bg-surface-row-hover">{lang === 'ko' ? '한' : 'EN'}</button>
      </TooltipTrigger><TooltipContent side="right">{languageLabel}</TooltipContent></Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('profile')} title={user.name} className="grid size-8 place-items-center rounded-pill hover:bg-surface-row-hover">
            <span aria-hidden className="grid size-8 place-items-center rounded-pill bg-accent-primary-soft text-xs font-semibold text-accent-primary">{user.name.split(' ').map(w => w[0]).join('')}</span>

          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-64">
          <DropdownMenuLabel>{user.name} · {tx(user.title)}</DropdownMenuLabel>
          <DropdownMenuItem disabled><LogOut className="size-3.5" aria-hidden />{t('signOut')} <span className="ml-auto text-caption">SSO Open</span></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  </TooltipProvider>;
}
