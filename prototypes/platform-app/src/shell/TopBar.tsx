import { Check, ChevronDown, CircleHelp, FlaskConical, Loader2, LogOut, MapPin, Search, ShieldAlert } from 'lucide-react';
import { useI18n } from '../kernel/i18n';
import { usePlatform } from '../kernel/platform';
import type { Scenario } from '../mock/server';
import { SITES, USERS, type RoleId } from '../mock/world';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/components/shadcn/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/components/shadcn/popover';
import { cn } from '../ui/utils/cn';

const SCENARIOS: { id: Scenario; ko: string; en: string }[] = [
  { id: 'normal', ko: '정상', en: 'Normal' },
  { id: 'slow', ko: '느린 응답 (+2.2s)', en: 'Slow (+2.2s)' },
  { id: 'empty', ko: '0건 (empty)', en: 'Zero rows (empty)' },
  { id: 'unknown_status', ko: '상태 원천 미확인', en: 'Status source unknown' },
  { id: 'partial', ko: '일부 위젯 실패', en: 'Partial widget failure' },
  { id: 'forbidden', ko: '권한 거부 (forbidden)', en: 'Forbidden' },
  { id: 'too_large', ko: '조회 과대 (too_large)', en: 'Too large' },
  { id: 'timeout', ko: '시간 초과 (timeout)', en: 'Timeout' },
  { id: 'error', ko: '서버 오류 (error)', en: 'Server error' },
];

export function TopBar() {
  const { global, setGlobal, scope, user, role, setRole, scenario, setScenario, setPaletteOpen, navigate } = usePlatform();
  const { t, tx, lang, setLang } = useI18n();
  const grantedSites = SITES.filter(s => user.grants[s.id]?.length);
  const current = SITES.find(s => s.id === global.scopeId);
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
            {scope.status !== 'none' && <span className="text-[11px] font-normal opacity-80">· {scope.status === 'valid' ? t('scopeValid') : scope.status === 'validating' ? t('scopeValidating') : t('scopeForbidden')}</span>}
            <ChevronDown className="size-3.5 opacity-70" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 rounded-md border border-border-strong bg-surface-card p-1 shadow-md">
          <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{lang === 'ko' ? '요청 Scope (단일 선택, 서버 재검증)' : 'Requested scope (single, server re-validated)'}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={global.scopeId ?? ''} onValueChange={v => setGlobal({ scopeId: v })}>
            {grantedSites.map(s => <DropdownMenuRadioItem key={s.id} value={s.id} className="text-[13px]">
              <span className="flex-1">{s.label}</span>
              <span className="text-[11px] text-text-muted">room {user.grants[s.id].length}/{s.rooms.length}</span>
            </DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-[11px] leading-4 text-text-muted">{lang === 'ko' ? '권한 축은 Site 안의 room_name입니다. Scope를 바꾸면 Site 경계를 넘는 room·설비 조건/선택은 초기화됩니다.' : 'Grants are room_name within a Site. Changing scope clears site-bound room/equipment context.'}</p>
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label={t('scenario')} title={t('scenario')}
            className={cn('relative grid size-8 place-items-center rounded-xs text-text-secondary hover:bg-surface-sunken', scenario !== 'normal' && 'bg-accent-warn-soft text-text-warning')}>
            <FlaskConical className="size-4" aria-hidden />
            {scenario !== 'normal' && <span aria-hidden className="absolute right-1 top-1 size-1.5 rounded-pill bg-accent-warn" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 rounded-md border border-border-strong bg-surface-card p-3 shadow-md">
          <p className="t-card-title">{t('scenario')}</p>
          <p className="mb-2 text-[11px] text-text-muted">{t('scenarioHint')}</p>
          <div role="radiogroup" aria-label={t('scenario')} className="grid grid-cols-2 gap-1">
            {SCENARIOS.map(s => <button key={s.id} type="button" role="radio" aria-checked={scenario === s.id} onClick={() => setScenario(s.id)}
              className={cn('flex items-center gap-1.5 rounded-sm border px-2 py-1.5 text-left text-[12px]', scenario === s.id ? 'border-accent-primary bg-accent-primary-soft text-accent-primary' : 'border-border-subtle hover:bg-surface-sunken')}>
              {scenario === s.id && <Check className="size-3" aria-hidden />}{lang === 'ko' ? s.ko : s.en}
            </button>)}
          </div>
          <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{lang === 'ko' ? '계약 검증 링크' : 'Contract test links'}</p>
          <ul className="space-y-0.5 text-[12px]">
            {[
              { ko: '권한 없는 Scope (XIA)', en: 'Forbidden scope (XIA)', url: '/analytics/productivity?v=1&scopeId=XIA&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00' },
              { ko: '미지원 URL 버전 (v=2)', en: 'Unsupported version (v=2)', url: '/equipment?v=2&scopeId=ICH' },
              { ko: '기간 한쪽만 (from만)', en: 'Partial period (from only)', url: '/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-25T09:00:00' },
              { ko: '미지원 Lot Context 전달', en: 'Unsupported Lot context', url: '/equipment?v=1&scopeId=ICH&lotIds=LOT-A1023&lotIds=LOT-A1024' },
              { ko: '명시적 빈 설비 선택', en: 'Explicit empty selection', url: '/analytics/productivity?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&equipmentSelection=none' },
              { ko: '90일 조회 (too_large)', en: '90-day query (too_large)', url: '/analytics/cycle-time?v=1&scopeId=ICH&from=2026-06-28T09:00:00&to=2026-09-26T09:00:00' },
              { ko: '7일 복수 설비 (time_domain_unverified)', en: '7-day multi-equipment (time_domain_unverified)', url: '/analytics/productivity?v=1&scopeId=ICH&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00' },
            ].map(l => <li key={l.url}><button type="button" className="w-full rounded-sm px-2 py-1 text-left text-accent-primary hover:bg-surface-sunken hover:underline" onClick={() => navigate(l.url)}>{lang === 'ko' ? l.ko : l.en}</button></li>)}
          </ul>
        </PopoverContent>
      </Popover>

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
          <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t('role')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={role} onValueChange={v => setRole(v as RoleId)}>
            {(Object.keys(USERS) as RoleId[]).map(r => <DropdownMenuRadioItem key={r} value={r} className="text-[13px]">
              <span className="flex-1">{tx(USERS[r].title)}</span>
              <span className="text-[11px] text-text-muted">{USERS[r].permissions.length} perms</span>
            </DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="text-[13px]"><LogOut className="size-3.5" aria-hidden />{t('signOut')} <span className="ml-auto text-[10px]">SSO Open</span></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>;
}
