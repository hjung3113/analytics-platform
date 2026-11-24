import { PanelOptionChips, PanelOptions, usePanelOptions, type PanelAddItem, type PanelOption } from '@ap/components';
import { EQUIPMENT, PROCESSES } from '../equipment';
import { platformDecorator } from '../platform';

const t = (ko: string, en: string) => ({ ko, en });

// Display options of one alarm panel; each keeps its value in one of the menu's page keys (default = key absent).
export const OPTIONS: PanelOption[] = [
  { id: 'sort', kind: 'choice', pageKey: 'barsSort', label: t('정렬', 'Sort'), default: 'sum',
    choices: [{ value: 'sum', label: t('합 큰 순', 'Largest total') }, { value: 'name', label: t('이름순', 'By name') }, { value: 'small', label: t('합 작은 순', 'Smallest total') }] },
  { id: 'group', kind: 'choice', pageKey: 'barsGroup', label: t('묶음', 'Group by'), default: 'equipment',
    choices: [{ value: 'equipment', label: t('설비', 'Equipment') }, { value: 'process', label: t('공정', 'Process'), chip: t('공정별', 'By process') }] },
  { id: 'labels', kind: 'toggle', pageKey: 'barsLabels', label: t('값 표시', 'Value labels'), on: t('켬', 'On'), off: t('끔', 'Off') },
];
export const optionsPage = (query = '') => platformDecorator({ address: `/${query}`, menu: { pageKeys: OPTIONS.map(option => option.pageKey) } });

/** A menu panel: options inline in its header, a chip per changed option beside the title. */
export function AlarmPanel({ collapsed }: { collapsed?: boolean }) {
  const { values, setValue, reset } = usePanelOptions(OPTIONS);
  const rows = values.group === 'process'
    ? PROCESSES.map(p => ({ id: p, alarms: EQUIPMENT.filter(e => e.process === p).reduce((sum, e) => sum + e.alarms, 0) }))
    : EQUIPMENT;
  const sorted = [...rows].sort(values.sort === 'name' ? (a, b) => a.id.localeCompare(b.id) : (a, b) => (values.sort === 'small' ? 1 : -1) * (a.alarms - b.alarms));
  return <section aria-label="설비별 알람" className="rounded-md border border-border-subtle bg-surface-card">
    <header className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
      <h3 className="text-sm font-medium">설비별 알람</h3>
      <PanelOptionChips options={OPTIONS} values={values} onReset={reset} />
      <PanelOptions options={OPTIONS} values={values} onChange={setValue} collapsed={collapsed} className="ml-auto" />
    </header>
    <ul className="grid gap-1 p-3 text-sm">{sorted.map(row => <li key={row.id} className="flex justify-between"><span>{row.id}</span>{values.labels === true && <span className="tabular">{row.alarms}건</span>}</li>)}</ul>
  </section>;
}

export const ADD_ITEMS: PanelAddItem[] = [
  { id: 'trend', title: t('가동률 추세', 'Utilization trend') }, { id: 'alarms', title: t('설비별 알람', 'Alarms by equipment'), description: t('알람 코드별 건수', 'Count by alarm code') },
  { id: 'downtime', title: t('정지 사유', 'Downtime reasons') }, { id: 'chambers', title: t('챔버 비교', 'Chamber comparison'), disabledReason: t('설비 단계에서만 쓸 수 있음', 'Only at the equipment step') },
];
