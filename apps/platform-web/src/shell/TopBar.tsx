import { ChevronDown, CircleHelp, Loader2, LogOut, MapPin, Search, ShieldAlert } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';

export function TopBar() {
  const { global, setGlobal, scope, session, user, devTools, setPaletteOpen } = usePlatform();
  const { t, tx, lang, setLang } = useI18n();
  const current = session.scopes.find(s => s.id === global.scopeId);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  const scopeTone = scope.status === 'valid' ? 'bg-accent-success-soft text-text-success border-transparent'
    : scope.status === 'validating' ? 'bg-surface-sunken text-text-secondary border-transparent'
      : scope.status === 'none' ? 'bg-surface-card text-text-secondary border-border-strong border-dashed'
        : 'bg-accent-warn-soft text-text-warning border-transparent';

  return <header className="flex h-[54px] shrink-0 items-center gap-3 border-b border-border-subtle bg-surface-card px-4">
    <button type="button" onClick={() => setPaletteOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K"
      className="flex h-8 w-full max-w-[500px] items-center gap-2 rounded-md bg-surface-sunken px-3 text-left text-[13px] text-text-muted hover:ring-1 hover:ring-border-control">
      <Search className="size-4" aria-hidden />
      <span className="flex-1 truncate">{t('searchPlaceholder')}</span>
      <kbd className="rounded-xs border border-border-strong bg-surface-card px-1.5 text-[11px] font-medium text-text-secondary">{isMac ? '⌘' : 'Ctrl'} K</kbd>
    </button>

    <div className="ml-auto flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`${t('scope')}: ${current?.label ?? global.scopeId ?? t('scopeNone')}`}
            className={cn('flex h-8 items-center gap-2 rounded-pill border px-3 text-[13px] font-medium', scopeTone)}>
            {scope.status === 'validating' ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
              : scope.status === 'valid' ? <span aria-hidden className="size-2 rounded-pill bg-accent-success" />
                : scope.status === 'none' ? <MapPin className="size-3.5" aria-hidden /> : <ShieldAlert className="size-3.5" aria-hidden />}
            <span>{current?.label ?? global.scopeId ?? t('scopeNone')}</span>
            {scope.status !== 'none' && <span className="text-[11px] font-normal opacity-80">· {scope.status === 'valid' ? t('scopeValid') : scope.status === 'validating' ? t('scopeValidating') : scope.status === 'unknown_scope' ? t('scopeUnknown') : t('scopeForbidden')}</span>}
            <ChevronDown className="size-3.5 opacity-70" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 rounded-md border border-border-strong bg-surface-card p-1 shadow-md">
          <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{lang === 'ko' ? '요청 Scope (단일 선택, 서버 재검증)' : 'Requested scope (single, server re-validated)'}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={global.scopeId ?? ''} onValueChange={v => setGlobal({ scopeId: v })}>
            {session.scopes.map(s => <DropdownMenuRadioItem key={s.id} value={s.id} className="text-[13px]">
              <span className="flex-1">{s.label}</span>
              <span className="text-[11px] text-text-muted">room {s.grantedRooms}/{s.totalRooms}</span>
            </DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-[11px] leading-4 text-text-muted">{lang === 'ko' ? '권한 축은 Site 안의 room_name입니다. Scope를 바꾸면 Site 경계를 넘는 room·설비 조건/선택은 초기화됩니다.' : 'Grants are room_name within a Site. Changing scope clears site-bound room/equipment context.'}</p>
        </DropdownMenuContent>
      </DropdownMenu>

      {devTools}

      <Popover>
        <PopoverTrigger asChild><button type="button" aria-label="Help" className="grid size-8 place-items-center rounded-xs text-text-secondary hover:bg-surface-sunken"><CircleHelp className="size-4" aria-hidden /></button></PopoverTrigger>
        <PopoverContent align="end" className="w-72 rounded-md border border-border-strong bg-surface-card p-3 text-[12px] shadow-md">
          <p className="t-card-title mb-2">{lang === 'ko' ? '단축키' : 'Shortcuts'}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt><kbd className="rounded-xs border border-border-strong px-1">{isMac ? '⌘' : 'Ctrl'} K</kbd></dt><dd>{lang === 'ko' ? '메뉴 이동 팔레트' : 'Menu palette'}</dd>
            <dt><kbd className="rounded-xs border border-border-strong px-1">[</kbd></dt><dd>{lang === 'ko' ? '사이드바 접기/펼치기' : 'Toggle sidebar'}</dd>
            <dt><kbd className="rounded-xs border border-border-strong px-1">Esc</kbd></dt><dd>{lang === 'ko' ? '상세·팝오버 닫기' : 'Close detail/popover'}</dd>
          </dl>
        </PopoverContent>
      </Popover>

      <div role="group" aria-label={t('language')} className="flex h-8 items-center rounded-sm border border-border-subtle p-0.5">
        {(['ko', 'en'] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
          className={cn('h-full rounded-xs px-2 text-[11px] font-semibold uppercase', lang === l ? 'bg-accent-primary text-text-on-accent' : 'text-text-secondary hover:bg-surface-sunken')}>{l === 'ko' ? '한' : 'EN'}</button>)}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('profile')} className="flex min-h-9 items-center gap-2 rounded-sm pl-1 pr-1.5 hover:bg-surface-sunken">
            <span aria-hidden className="grid size-8 place-items-center rounded-pill bg-accent-primary-soft text-[12px] font-semibold text-accent-primary">{user.name.split(' ').map(w => w[0]).join('')}</span>
            <span className="hidden text-left leading-tight wide:block">
              <span className="block text-[13px] font-semibold">{user.name}</span>
              <span className="block text-[11px] text-text-muted">{tx(user.title)}</span>
            </span>
            <ChevronDown className="size-3.5 text-text-muted" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-md border border-border-strong bg-surface-card p-1 shadow-md">
          <DropdownMenuItem disabled className="text-[13px]"><LogOut className="size-3.5" aria-hidden />{t('signOut')} <span className="ml-auto text-[10px]">SSO Open</span></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>;
}
