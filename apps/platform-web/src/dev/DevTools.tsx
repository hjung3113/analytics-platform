import { Check, FlaskConical, UserCog } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useI18n } from '../kernel/i18n';
import { usePlatform } from '../kernel/platform';
import { getRole, getScenario, setRole, setScenario, subscribeServer, type Scenario } from '../mock/server';
import { USERS, type RoleId } from '../mock/world';
import { SegmentedRadio } from '../platform/RadioGroup';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';

/**
 * Mock-server controls: response scenario and signed-in role (a stand-in for SSO). They change server state only;
 * the kernel hears it through the adapter's subscribe (docs/integration/platform-packages.md §4). Rendered in the
 * shell's devTools slot by main.tsx; a real server build does not mount this.
 */
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

export function DevTools() {
  const { navigate, toast } = usePlatform();
  const { t, tx, lang } = useI18n();
  const scenario = useSyncExternalStore(subscribeServer, getScenario);
  const role = useSyncExternalStore(subscribeServer, getRole);
  const switchRole = (next: RoleId) => {
    setRole(next);
    toast(lang === 'ko' ? `역할 전환: ${USERS[next].title.ko} — 권한·Scope를 다시 검증합니다.` : `Role switched: ${USERS[next].title.en} — permissions and scope re-validated.`, 'info');
  };

  return <>
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
        <SegmentedRadio
          label={t('scenario')}
          value={scenario}
          onChange={setScenario}
          className="grid grid-cols-2 gap-1"
          optionClassName={selected => cn('flex items-center gap-1.5 rounded-sm border px-2 py-1.5 text-left text-[12px]', selected ? 'border-accent-primary bg-accent-primary-soft text-accent-primary' : 'border-border-subtle hover:bg-surface-sunken')}
          options={SCENARIOS.map(s => ({ value: s.id, label: <>{scenario === s.id && <Check className="size-3" aria-hidden />}{lang === 'ko' ? s.ko : s.en}</> }))}
        />
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('role')} title={t('role')} className="grid size-8 place-items-center rounded-xs text-text-secondary hover:bg-surface-sunken">
          <UserCog className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-md border border-border-strong bg-surface-card p-1 shadow-md">
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t('role')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={role} onValueChange={v => switchRole(v as RoleId)}>
          {(Object.keys(USERS) as RoleId[]).map(r => <DropdownMenuRadioItem key={r} value={r} className="text-[13px]">
            <span className="flex-1">{tx(USERS[r].title)}</span>
            <span className="text-[11px] text-text-muted">{USERS[r].permissions.length} perms</span>
          </DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </>;
}
