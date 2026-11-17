import { useMessages, useI18n, usePlatform } from '@ap/kernel';
import { PanelCatalog } from './PanelCatalog';
import { ColumnGroupsExample } from './ColumnGroupsExample';
import { DEV_MESSAGES } from './messages';
import { Check, FlaskConical, UserCog } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { getRole, getScenario, setRole, setScenario, subscribeServer, type Scenario } from '@ap/mock-server';
import { USERS, type RoleId } from '@ap/mock-server';
import { SegmentedRadio } from '@ap/components';
import { EditSimulationSection, useEditSimulation } from './EditSimulation';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';

/**
 * Mock-server controls: response scenario and signed-in role (a stand-in for SSO). They change server state only;
 * the kernel hears it through the adapter's subscribe (docs/integration/platform-packages.md §4). Rendered in the
 * the topBarTools slot at the bottom of the app rail by the mock assembly (mock-assembly.tsx); a production build never bundles it (ADR-0009).
 */
const SCENARIOS: { id: Scenario; ko: string; en: string }[] = [
  { ...DEV_MESSAGES.devToolsNormal, id: 'normal' },
  { ...DEV_MESSAGES.devToolsSlow22s, id: 'slow' },
  { ...DEV_MESSAGES.devToolsZeroRowsEmpty, id: 'empty' },
  { ...DEV_MESSAGES.devToolsStatusSourceUnknown, id: 'unknown_status' },
  { ...DEV_MESSAGES.devToolsPartialWidgetFailure, id: 'partial' },
  { ...DEV_MESSAGES.devToolsForbidden, id: 'forbidden' },
  { ...DEV_MESSAGES.devToolsTooLarge, id: 'too_large' },
  { ...DEV_MESSAGES.devToolsTimeout, id: 'timeout' },
  { ...DEV_MESSAGES.devToolsServerError, id: 'error' },
  { ...DEV_MESSAGES.devToolsMalformedResponse, id: 'malformed' },
  { ...DEV_MESSAGES.devToolsScopeCheckFailed, id: 'scope_error' },
];

export function DevTools() {
  const m = useMessages(DEV_MESSAGES);
  const { navigate, toast } = usePlatform();
  const { t, tx, lang } = useI18n();
  const scenario = useSyncExternalStore(subscribeServer, getScenario);
  const role = useSyncExternalStore(subscribeServer, getRole);
  const editSim = useEditSimulation();
  const switchRole = (next: RoleId) => {
    setRole(next);
    toast(m('devToolsRoleSwitchedPermissionsAndScopeReValidated', { roleKo: USERS[next].title.ko, roleEn: USERS[next].title.en }), 'info');
  };

  return <>
    <PanelCatalog />
    <ColumnGroupsExample />
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={t('scenario')} title={t('scenario')}
          className={cn('relative grid size-8 place-items-center rounded-xs text-text-secondary hover:bg-surface-sunken', scenario !== 'normal' && 'bg-accent-warn-soft text-text-warning')}>
          <FlaskConical className="size-4" aria-hidden />
          {scenario !== 'normal' && <span aria-hidden className="absolute right-1 top-1 size-1.5 rounded-pill bg-accent-warn" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="t-card-title">{t('scenario')}</p>
        <p className="mb-2 text-tiny text-text-secondary">{t('scenarioHint')}</p>
        <SegmentedRadio
          label={t('scenario')}
          value={scenario}
          onChange={setScenario}
          className="grid grid-cols-2"
          options={SCENARIOS.map(s => ({ value: s.id, label: <>{scenario === s.id && <Check className="size-3" aria-hidden />}{s[lang]}</> }))}
        />
        <p className="mb-1 mt-3 text-tiny font-semibold uppercase tracking-wide text-text-secondary">{m('devToolsContractTestLinks')}</p>
        <ul className="space-y-0.5 text-xs">
          {[
            { ...DEV_MESSAGES.devToolsForbiddenScopeXIA, url: '/analytics/productivity?v=1&scopeId=XIA&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00' },
            { ...DEV_MESSAGES.devToolsUnsupportedVersionV2, url: '/equipment?v=2&scopeId=MEM' },
            { ...DEV_MESSAGES.devToolsPartialPeriodFromOnly, url: '/analytics/cycle-time?v=1&scopeId=MEM&from=2026-09-25T09:00:00' },
            { ...DEV_MESSAGES.devToolsUnsupportedLotContext, url: '/equipment?v=1&scopeId=MEM&lotIds=LOT-A1023&lotIds=LOT-A1024' },
            { ...DEV_MESSAGES.devToolsExplicitEmptySelection, url: '/analytics/productivity?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&equipmentSelection=none' },
            { ...DEV_MESSAGES.devTools90DayQueryTooLarge, url: '/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-06-28T09:00:00&to=2026-09-26T09:00:00' },
            { ...DEV_MESSAGES.devTools7DayMultiEquipmentTimeDomainUnverified, url: '/analytics/productivity?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00' },
          ].map(l => <li key={l.url}><button type="button" className="w-full rounded-sm px-2 py-1 text-left text-accent-primary hover:bg-surface-sunken hover:underline" onClick={() => navigate(l.url)}>{l[lang]}</button></li>)}
        </ul>
        <EditSimulationSection sim={editSim} />
      </PopoverContent>
    </Popover>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('role')} title={t('role')} className="grid size-8 place-items-center rounded-xs text-text-secondary hover:bg-surface-sunken">
          <UserCog className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t('role')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={role} onValueChange={v => switchRole(v as RoleId)}>
          {(Object.keys(USERS) as RoleId[]).map(r => <DropdownMenuRadioItem key={r} value={r} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
            <span className="flex-1">{tx(USERS[r].title)}</span>
            <span className="text-tiny text-text-secondary">{USERS[r].permissions.length} perms</span>
          </DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </>;
}
