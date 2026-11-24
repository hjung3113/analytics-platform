import { useDrill } from '@ap/kernel';
import { Button } from '@ap/ui';
import type { DrillSiblings } from '@ap/components';
import { EQUIPMENT, PROCESSES } from '../equipment';
import { platformDecorator } from '../platform';

// The mock menu's drill (ADR-0025): 공장 → 공정 → 설비 → 챔버, one page key per level. `returnTo` is declared for ReturnLink.
const t = (ko: string, en: string) => ({ ko, en });
const LEVELS = [{ key: 'drillFab', label: t('공장', 'Fab') }, { key: 'drillProcess', label: t('공정', 'Process') },
  { key: 'drillEquipment', label: t('설비', 'Equipment') }, { key: 'drillChamber', label: t('챔버', 'Chamber') }];
export const DRILL = { pageKeys: [...LEVELS.map(level => level.key), 'returnTo'], contextResetKeys: LEVELS.map(level => level.key), drill: { levels: LEVELS } };
export const drillPage = (query = '') => platformDecorator({ address: encodeURI(`/${query}`), menu: DRILL });
export const STEP2 = '?drillFab=1공장&drillProcess=식각';
export const STEP4 = `${STEP2}&drillEquipment=EQ-0142&drillChamber=CH-B`;

export const SIBLINGS: DrillSiblings = {
  drillProcess: PROCESSES.map(p => ({ value: p, hint: `설비 ${EQUIPMENT.filter(e => e.process === p).length}대` })),
  drillEquipment: EQUIPMENT.filter(e => e.process === '식각').map(e => ({ value: e.id, hint: `가동 ${e.util}%` })),
};

const childrenAt = (depth: number, process?: string) => [['1공장'], PROCESSES, EQUIPMENT.filter(e => e.process === process).map(e => e.id), ['CH-A', 'CH-B']][depth] ?? [];

/** The menu's step body: the next level's values, each entered by a visible «들어가기» button (never a whole-row click). */
export function StepBody() {
  const drill = useDrill();
  const next = drill.levels[drill.depth];
  return <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle text-sm">
    {next
      ? childrenAt(drill.depth, drill.trail[1]?.value).map(value => <li key={value} className="flex items-center justify-between px-3 py-1.5">
        <span>{value}</span>
        <Button size="sm" variant="ghost" aria-label={`${value} 들어가기`} onClick={() => drill.enter(next.key, value)}>들어가기</Button>
      </li>)
      : <li className="px-3 py-2">{drill.trail.at(-1)?.value} 상세(마지막 단계)</li>}
  </ul>;
}
