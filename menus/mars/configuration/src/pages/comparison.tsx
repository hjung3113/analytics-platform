import { StatusBadge, StatusBadgeFrame } from '@ap/ui';
import type { MatrixCellTone } from '@ap/components';
import type { useMessages } from '@ap/kernel';
import type { CompareParams, ConfigRow, ConfigValue } from '../endpoints';
import type { MESSAGES } from '../messages';
import type { ReactNode } from 'react';

export type Message = ReturnType<typeof useMessages<keyof typeof MESSAGES>>;
export function PrimaryChip({ children }: { children: ReactNode }) {
  return <StatusBadge tone="info" className="whitespace-nowrap break-keep">{children}</StatusBadge>;
}
export function distribution(row: ConfigRow, equipment = Object.keys(row.values)) {
  const groups = new Map<ConfigValue['value'], string[]>();
  for (const eq of equipment) {
    const value = row.values[eq].value;
    groups.set(value, [...(groups.get(value) ?? []), eq]);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length).map(([value, equipment], index) => ({ value, equipment, showMembers: index > 0 || value === null }));
}
export function distributionText(row: ConfigRow, m: Message) {
  return distribution(row).map(({ value, equipment, showMembers }) => `${value ?? `— ${m('missing')}`} ×${equipment.length}${showMembers ? ` (${equipment.join(', ')})` : ''}`).join(' · ');
}
export function valueMeaning(row: ConfigRow, eq: string, params: CompareParams): ConfigValue['state'] {
  const cell = row.values[eq];
  if (cell.value === null) return 'missing';
  if (cell.state === 'violation') return 'violation';
  if (params.mode === 'reference') {
    const reference = row.values[params.ref].value;
    if (reference === null) return 'not-comparable';
    return cell.value === reference ? 'equal' : 'diff';
  }
  const [largest, second] = distribution(row, params.eq).filter(group => group.value !== null);
  if (!second || largest.equipment.length === second.equipment.length) return 'equal';
  return cell.value === largest.value ? 'equal' : 'diff';
}
export function valueTone(meaning: ConfigValue['state'] | undefined): MatrixCellTone | undefined {
  if (meaning === 'diff') return 'info';
  if (meaning === 'violation') return 'danger';
  if (meaning === 'missing' || meaning === 'not-comparable') return 'missing';
  return undefined;
}

export function RowStatus({ row, m }: { row: ConfigRow; m: Message }) {
  if (row.violation) return <StatusBadgeFrame appearance="compact" tone="danger" className="whitespace-nowrap break-keep">{m(row.diff ? 'combinedStatus' : 'violationChip')}</StatusBadgeFrame>;
  if (row.missing) return <StatusBadgeFrame appearance="compact" tone="muted" className="whitespace-nowrap break-keep">{m('missing')}</StatusBadgeFrame>;
  if (row.notComparable) return <StatusBadgeFrame appearance="compact" tone="muted" className="whitespace-nowrap break-keep">{m('not-comparable')}</StatusBadgeFrame>;
  if (row.diff) return <PrimaryChip>{m('diff')}</PrimaryChip>;
  return <StatusBadgeFrame appearance="compact" tone="success" className="whitespace-nowrap break-keep">{m('equal')}</StatusBadgeFrame>;
}

