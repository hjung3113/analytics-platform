import type { TableFilterField } from '@ap/components';
import { filterRows, validateFilters, type ColumnFilter, type FilterValidation } from '@ap/contracts';
import { formatText } from '@ap/kernel';
import type { HtmJudgement } from '../../endpoints';
import { HW_TIME_OVERVIEW_MESSAGES } from '../../messages';

export function runPanelFilterFields(equipment: readonly string[], lang: 'ko' | 'en'): TableFilterField[] {
  const label = (key: keyof typeof HW_TIME_OVERVIEW_MESSAGES) => formatText(HW_TIME_OVERVIEW_MESSAGES[key], lang);
  const fields: TableFilterField[] = [
    { id: 'equipment', label: HW_TIME_OVERVIEW_MESSAGES.equipment, spec: { kind: 'enum', ops: ['in'], options: equipment.map(id => ({ value: id, label: id })) } },
    { id: 'status', label: HW_TIME_OVERVIEW_MESSAGES.status, spec: { kind: 'enum', ops: ['in'], options: [{ value: 'outside', label: label('outsideOnly') }] } },
    { id: 'value', label: HW_TIME_OVERVIEW_MESSAGES.value, spec: { kind: 'number', ops: ['between'] } },
    { id: 'date', label: HW_TIME_OVERVIEW_MESSAGES.period, spec: { kind: 'date', ops: ['between'] } },
  ];
  return fields;
}
export function validatePanelFilters(filters: readonly ColumnFilter[], fields: readonly TableFilterField[]): FilterValidation {
  const validation = validateFilters(filters, Object.fromEntries(fields.map(field => [field.id, field.spec])));
  if (!validation.ok) return validation;
  // validateFilters guards grammar; enum membership must also stay inside the inherited menu population.
  for (const filter of filters) {
    const spec = fields.find(field => field.id === filter.id)!.spec;
    if (spec.kind === 'enum' && filter.op === 'in' && filter.value.some(value => !spec.options.some(option => option.value === value))) return { ok: false, reason: 'bad-value', filter };
  }
  return validation;
}
/** Matches FilterLine onChange(next): invalid edits retain the current narrowed state. Clearing uses next = []. */
export function changeRunPanelFilters(filters: readonly ColumnFilter[], next: ColumnFilter[], fields: readonly TableFilterField[]) {
  const validation = validatePanelFilters(next, fields);
  return { filters: validation.ok ? next : [...filters], validation };
}

/** Always intersects fetched rows; invalid filters fail closed, never restore a broader population. */
export function applyRunPanelFilters<T extends { equipmentId: string; at: string; value: number | null; judgement: Pick<HtmJudgement, 'status'> }>(rows: readonly T[], filters: readonly ColumnFilter[], fields: readonly TableFilterField[]) {
  const validation = validatePanelFilters(filters, fields);
  if (!validation.ok) return { rows: [] as T[], validation };
  const specs = Object.fromEntries(fields.map(field => [field.id, field.spec]));
  return { validation, rows: filterRows(rows, filters, (row, id) => {
    switch (id) {
      case 'equipment': return row.equipmentId;
      case 'status': return row.judgement.status === 'over' || row.judgement.status === 'under' ? 'outside' : 'within';
      case 'value': return row.value;
      case 'date': return row.at.slice(0, 10);
    }
  }, { specs }) };
}
