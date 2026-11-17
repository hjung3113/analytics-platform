import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useMessages } from '@ap/kernel';
import { PlatformDataTable, RowAction, SegmentedRadio, type PlatformColumn } from '@ap/components';
import { DEV_MESSAGES } from './messages';

type EquipmentRow = { id: string; equipment: string; note: string; index: number };
const ROWS: EquipmentRow[] = Array.from({ length: 30 }, (_, index) => ({ id: `equipment-${index + 1}`, equipment: String(index + 1).padStart(2, '0'), note: '—', index }));
const EQUIPMENT_IDS = ['A', 'B', 'C'] as const;
const MODES = [{ value: 'plain', message: 'columnGroupsPlain' }, { value: 'grouped', message: 'columnGroupsGrouped' }] as const;
type Mode = typeof MODES[number]['value'];
const persistKey = 'dev:column-groups-example';

export default function ColumnGroupsExampleBody() {
  const m = useMessages(DEV_MESSAGES);
  const [mode, setMode] = useState<Mode>('grouped');
  const [active, setActive] = useState<EquipmentRow | null>(null);
  const labels = useMemo(() => Object.fromEntries(EQUIPMENT_IDS.map(id => [id, m('columnGroupsEquipmentLabel', { id })])), [m]);
  const columns = useMemo<PlatformColumn<EquipmentRow>[]>(() => [
    { id: 'equipment', header: m('columnGroupsEquipment'), value: row => m('columnGroupsEquipmentLabel', { id: row.equipment }) },
    ...EQUIPMENT_IDS.flatMap((equipment, equipmentIndex) => {
      const group = mode === 'plain' ? undefined : [equipment];
      return [
        { id: `${equipment}.val`, header: m('columnGroupsValue'), value: (row: EquipmentRow) => 100 + equipmentIndex + row.index, align: 'right' as const },
        { id: `${equipment}.judgment`, header: m('columnGroupsJudgment'), value: () => m('columnGroupsPass') },
        { id: `${equipment}.reference`, header: m('columnGroupsReference'), value: () => 100, align: 'right' as const },
        { id: `${equipment}.dev`, header: m('columnGroupsDeviation'), value: (row: EquipmentRow) => equipmentIndex + row.index, align: 'right' as const },
        { id: `${equipment}.at`, header: m('columnGroupsMeasuredAt'), value: () => '2026-11-17 09:00:00', size: 190 },
      ].map(column => ({ ...column, columnGroup: group }));
    }),
    { id: 'note', header: m('columnGroupsNote'), size: 220 },
  ], [m, mode]);
  return <div className="min-w-0 space-y-3">
    <SegmentedRadio label={m('columnGroupsMode')} value={mode} onChange={setMode} options={MODES.map(option => ({ value: option.value, label: m(option.message) }))} />
    <p role="status" className="text-sm text-text-secondary">{active ? m('columnGroupsMarked', { id: active.equipment }) : m('columnGroupsMarkHint')}</p>
    <PlatformDataTable title={m('columnGroupsExample')} ariaLabel={m('columnGroupsExample')} columns={columns} columnGroups={mode === 'plain' ? undefined : labels}
      rows={ROWS} getRowId={row => row.id} preferenceKey={persistKey} pageSize={30} height={440} activeRowId={active?.id}
      rowAction={(row, { compact }) => <RowAction compact={compact} icon={Check} label={m('columnGroupsMarkRow', { id: row.equipment })} text={m('columnGroupsMark')} onClick={() => setActive(row)} />} />
  </div>;
}
