// PROTOTYPE (#52) — 버리는 코드, main 병합 금지.
// C안 셸: FeedbackOps AppFrame 구조(products/feedbackops/apps/frontend/src/lib/layout/AppRail·AppSidebar)를 플랫폼 Kernel 위에 그린다.
// 레일(52px) = 공간 전환, 밝은 사이드바(240/56px) = 그룹 섹션 + 메뉴, Scope 선택은 사이드바 머리(FeedbackOps Managed System 자리).
// 상단 바는 없다 — 팔레트·도움말·언어·프로필·개발 도구는 레일 아래로.
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, LayoutGrid, Loader2, MapPin, RotateCw, Search, ShieldAlert, ShieldCheck, Star } from 'lucide-react';
import { Suspense, useState, type ReactNode } from 'react';
import { type MenuEntry, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import type { SpaceId } from '@ap/contracts';
import { LoadingBlock } from '@ap/components';
import {
  cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@ap/ui';

const SPACE_ICON: Record<string, typeof BarChart3> = { analytics: BarChart3, operations: ShieldCheck };
const COLLAPSE_KEY = 'proto:fops-sidebar-collapsed';

export function FopsShell({ children, overlays }: { children: ReactNode; overlays: ReactNode }) {
  return <div className="flex h-full overflow-hidden bg-surface-canvas text-text-primary" data-proto-shell="fops">
    <a href="#platform-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface-card focus:px-3 focus:py-2">Skip to content</a>
    <Rail />
    <FopsSidebar />
    <main id="platform-main" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-hidden">
      <Suspense fallback={<div className="p-6"><LoadingBlock rows={6} height={320} /></div>}>{children}</Suspense>
    </main>
    {overlays}
  </div>;
}

function Rail() {
  const { accessibleSpaces, sidebarSpace, switchSpace, setPaletteOpen, slots, user } = usePlatform();
  const { tx, lang, setLang, t } = useI18n();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const railBtn = (active = false) => cn('flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary',
    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring', active && 'bg-surface-row-selected text-accent-primary');

  return <TooltipProvider delayDuration={400}>
    <nav aria-label={lang === 'ko' ? '공간 선택' : 'Spaces'} className="flex w-[52px] shrink-0 flex-col items-center gap-2 border-r border-border-subtle bg-surface-sidebar py-3">
      <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-md bg-accent-primary text-xs font-semibold text-white" title={t('appName')} aria-label={t('appName')}>A</div>
      {accessibleSpaces.map(s => {
        const Icon = SPACE_ICON[s.id] ?? LayoutGrid;
        const active = s.id === sidebarSpace.id;
        return <Tooltip key={s.id}><TooltipTrigger asChild>
          <button type="button" onClick={() => switchSpace(s.id as SpaceId)} aria-label={tx(s.label)} aria-current={active ? 'page' : undefined} className={railBtn(active)}>
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        </TooltipTrigger><TooltipContent side="right" className="text-xs">{tx(s.label)}</TooltipContent></Tooltip>;
      })}
      <div className="my-1 w-6 border-t border-border-subtle" aria-hidden />
      <Tooltip><TooltipTrigger asChild>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K" aria-label={t('searchPlaceholder')} className={railBtn()}>
          <Search className="h-4 w-4" aria-hidden />
        </button>
      </TooltipTrigger><TooltipContent side="right" className="text-xs">{t('searchPlaceholder')} · {isMac ? '⌘' : 'Ctrl'} K</TooltipContent></Tooltip>
      <div className="flex-1" />
      <div className="flex flex-col items-center gap-1 [&_button]:text-text-muted">{slots.topBarTools}</div>
      <Popover>
        <PopoverTrigger asChild><button type="button" aria-label="Help" className={railBtn()}><CircleHelp className="h-4 w-4" aria-hidden /></button></PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-72 rounded-md border border-border-subtle bg-surface-popover p-3 text-xs shadow-lg">
          <p className="mb-2 text-sm font-semibold">{lang === 'ko' ? '단축키' : 'Shortcuts'}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt><kbd className="rounded-sm border border-border-strong px-1">{isMac ? '⌘' : 'Ctrl'} K</kbd></dt><dd>{lang === 'ko' ? '메뉴 이동 팔레트' : 'Menu palette'}</dd>
            <dt><kbd className="rounded-sm border border-border-strong px-1">Esc</kbd></dt><dd>{lang === 'ko' ? '상세·팝오버 닫기' : 'Close detail/popover'}</dd>
          </dl>
        </PopoverContent>
      </Popover>
      <button type="button" onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')} aria-label={t('language')} className={cn(railBtn(), 'text-[10px] font-semibold')}>{lang === 'ko' ? '한' : 'EN'}</button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('profile')} title={user.name} className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary/15 text-[11px] font-semibold text-accent-primary">
            {user.name.split(' ').map(w => w[0]).join('')}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end">
          <DropdownMenuLabel>{user.name} · {tx(user.title)}</DropdownMenuLabel>
          <DropdownMenuItem disabled>{t('signOut')} <span className="ml-auto text-[10px]">SSO Open</span></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  </TooltipProvider>;
}

function FopsSidebar() {
  const { visibleMenus, route, favorites, recent, registry, sidebarSpace } = usePlatform();
  const { t, tx, lang } = useI18n();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } });
  const toggle = () => setCollapsed(c => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* ignore */ } return !c; });
  const activeId = route ? (route.menu.navHidden && route.menu.parent ? route.menu.parent : route.menu.id) : null;
  const navMenus = visibleMenus.filter(m => !m.navHidden);
  const grouped = registry.groups.filter(g => g.space === sidebarSpace.id)
    .map(g => ({ group: g, items: navMenus.filter(m => m.group === g.id) })).filter(x => x.items.length);
  const favoriteMenus = favorites.map(id => registry.menus.find(m => m.id === id)).filter((m): m is MenuEntry => !!m && visibleMenus.includes(m));
  const recentItems = recent.filter(r => visibleMenus.some(m => m.id === r.menuId)).slice(0, 5);

  return <aside aria-label={lang === 'ko' ? '주요 탐색' : 'Primary'} data-collapsed={collapsed}
    className="flex shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar transition-[width] duration-150" style={{ width: collapsed ? 56 : 240 }}>
    <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-border-subtle px-3">
      {!collapsed && <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-text-primary">{tx(sidebarSpace.label)}</div>
        <div className="truncate text-[10px] text-text-muted">{t('appName')}</div>
      </div>}
      <button type="button" onClick={toggle} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-text-primary" aria-label={collapsed ? t('expand') : t('collapse')}>
        {collapsed ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ChevronLeft className="h-4 w-4" aria-hidden />}
      </button>
    </div>
    {!collapsed && <ScopeSelector />}
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <div className="flex flex-col gap-0.5">
        {grouped.map(({ group, items }, index) => {
          const showSection = !collapsed && !(group.id === 'overview' && items.length === 1);
          return <div key={group.id} className="flex flex-col gap-0.5">
            {showSection && <div className={cn('mx-2 mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-disabled', index === 0 ? 'mt-1.5' : 'mt-3.5')}>{tx(group.label)}</div>}
            {collapsed && index > 0 && <div className="mx-3 my-1.5 border-t border-border-subtle" aria-hidden />}
            {items.map(m => <NavItem key={m.id} menu={m} active={m.id === activeId} collapsed={collapsed} />)}
          </div>;
        })}
        {!collapsed && favoriteMenus.length > 0 && <>
          <div className="mx-2 mb-1 mt-3.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-disabled"><Star className="h-3 w-3" aria-hidden />{t('favorites')}</div>
          {favoriteMenus.map(m => <NavItem key={`fav-${m.id}`} menu={m} active={false} collapsed={false} />)}
        </>}
        {!collapsed && recentItems.length > 0 && <>
          <div className="mx-2 mb-1 mt-3.5 text-[10px] font-semibold uppercase tracking-wide text-text-disabled">{t('recent')}</div>
          {recentItems.map(r => {
            const m = registry.menuById(r.menuId);
            return <PlatformLink key={`recent-${r.menuId}`} href={r.url} title={r.url} className="truncate rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary">{tx(m.label)}</PlatformLink>;
          })}
        </>}
      </div>
    </nav>
    {!collapsed && <div className="shrink-0 border-t border-border-subtle px-4 py-2.5 text-[10px] text-text-muted">
      {lang === 'ko' ? '통합 프로토타입 · 합성 데이터' : 'Integrated prototype · synthetic data'}
    </div>}
  </aside>;
}

function NavItem({ menu, active, collapsed }: { menu: MenuEntry; active: boolean; collapsed: boolean }) {
  const { linkTo } = usePlatform();
  const { tx, t } = useI18n();
  const Icon = menu.icon;
  const planned = !menu.component;
  return <PlatformLink href={linkTo(menu.id)} aria-current={active ? 'page' : undefined} title={collapsed ? tx(menu.label) : undefined} aria-label={collapsed ? tx(menu.label) : undefined}
    className={cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary',
      collapsed && 'justify-center px-0', active && 'bg-surface-row-selected text-text-primary')}>
    <Icon className="h-4 w-4 shrink-0" aria-hidden />
    {!collapsed && <span className="min-w-0 flex-1 truncate">{tx(menu.label)}</span>}
    {!collapsed && planned && <span className="rounded-full bg-surface-row-selected px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">{t('planned')}</span>}
  </PlatformLink>;
}

/** FeedbackOps Managed System 선택 자리에 플랫폼 Scope(단일 선택, 서버 재검증)를 그린다 — 동작은 TopBar와 같다. */
function ScopeSelector() {
  const { global, setGlobal, scope, retryScope, session } = usePlatform();
  const { t, lang } = useI18n();
  const current = session.scopes.find(s => s.id === global.scopeId);
  const name = current?.label ?? global.scopeId ?? t('scopeNone');
  const status = scope.status === 'valid' ? t('scopeValid') : scope.status === 'validating' ? t('scopeValidating') : scope.status === 'none' ? null
    : scope.status === 'unknown_scope' ? t('scopeUnknown') : scope.status === 'error' ? t('scopeCheckFailed') : t('scopeForbidden');
  const warn = scope.status !== 'valid' && scope.status !== 'validating' && scope.status !== 'none';
  return <div className="border-b border-border-subtle p-2">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`${t('scope')}: ${name}`} className="flex w-full items-center gap-2 rounded-md border border-border-subtle px-2 py-2 text-left text-sm hover:bg-surface-row-hover">
          <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-semibold', warn ? 'bg-accent-danger/15 text-accent-danger' : 'bg-accent-primary/15 text-accent-primary')}>
            {scope.status === 'validating' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : scope.status === 'none' ? <MapPin className="h-3 w-3" aria-hidden />
              : warn ? <ShieldAlert className="h-3 w-3" aria-hidden /> : name.slice(0, 1)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{name}</span>
            {status && <span className={cn('truncate text-[10px]', warn ? 'text-text-danger' : 'text-text-muted')}>{status}{current && ` · room ${current.grantedRooms}/${current.totalRooms}`}</span>}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-text-muted" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[224px]">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{lang === 'ko' ? '요청 Scope (단일 선택, 서버 재검증)' : 'Requested scope'}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={global.scopeId ?? ''} onValueChange={v => { if (v === global.scopeId && scope.status === 'error') retryScope(); else setGlobal({ scopeId: v }); }}>
          {session.scopes.map(s => <DropdownMenuRadioItem key={s.id} value={s.id} className="text-sm">
            <span className="flex-1">{s.label}</span><span className="text-[10px] text-text-muted">room {s.grantedRooms}/{s.totalRooms}</span>
          </DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        {scope.status === 'error' && <DropdownMenuItem onSelect={() => retryScope()}><RotateCw className="h-3.5 w-3.5" aria-hidden />{t('scopeRetryCheck')}</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[10px] leading-4 text-text-muted">{lang === 'ko' ? '권한 축은 Site 안의 room_name입니다. Scope를 바꾸면 Site 경계를 넘는 조건·선택은 초기화됩니다.' : 'Changing scope clears site-bound context.'}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
