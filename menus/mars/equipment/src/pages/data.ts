import { formatText } from '@ap/kernel';
import { EQUIPMENT_MESSAGES } from '../messages';
import { EQUIPMENT_STATUS_VALUES, equipmentFilterSpecs, type Equipment, type EquipmentExportFilter, type EquipmentFilter } from '../endpoints';
import { tableExportParams, type TableExportRequest } from '@ap/components';
import { formatWallClock, parseDateTime, shift, type ColumnFilterSpec } from '@ap/contracts';
export const statusText = {
  active: EQUIPMENT_MESSAGES.dataActive, idle: EQUIPMENT_MESSAGES.dataIdle,
  maintenance: EQUIPMENT_MESSAGES.dataMaintenance, retired: EQUIPMENT_MESSAGES.dataRetired,
};
export const statusTone = { active: 'success', idle: 'neutral', maintenance: 'warning', retired: 'neutral' } as const;
/** The text of one date-like field, shared by the table cell, its export and the detail view: the validity dates as `YYYY-MM-DD`, `updatedAt` with minutes, anything else as stored (#2229). */
export function equipmentDateText(key: keyof Equipment, value: string): string {
  if (key === 'validFrom' || key === 'validTo') return formatWallClock(value.length === 10 ? `${value}T00:00:00` : value).slice(0, 10);
  if (key === 'updatedAt' && value.length > 10) return formatWallClock(value, 'minute');
  return value;
}

export const fields: { key: keyof Equipment; ko: string; en: string }[] = [
  { key: 'equipmentId', ...EQUIPMENT_MESSAGES.dataEquipmentId,  },
  { key: 'room', ...EQUIPMENT_MESSAGES.dataProcess,  }, { key: 'line', ...EQUIPMENT_MESSAGES.dataLine,  },
  { key: 'stgroup', ...EQUIPMENT_MESSAGES.dataStgroup,  }, { key: 'team', ...EQUIPMENT_MESSAGES.dataTeam,  },
  { key: 'maker', ...EQUIPMENT_MESSAGES.dataMaker,  }, { key: 'model', ...EQUIPMENT_MESSAGES.dataModel,  },
  { key: 'chamberType', ...EQUIPMENT_MESSAGES.dataChamberType,  }, { key: 'status', ...EQUIPMENT_MESSAGES.dataStatus,  },
  { key: 'validFrom', ...EQUIPMENT_MESSAGES.dataValidFrom,  }, { key: 'validTo', ...EQUIPMENT_MESSAGES.dataValidTo,  },
  { key: 'updatedAt', ...EQUIPMENT_MESSAGES.dataUpdatedAt,  }, { key: 'updatedBy', ...EQUIPMENT_MESSAGES.dataUpdatedBy,  },
];
/** Pinned filter fields (ADR-0105, R2): their buttons sit on the filter line even before a condition is set. */
export const pinnedFilterKeys: readonly (keyof Equipment)[] = ['status', 'maker'];
/**
 * Filter fields EquipmentMaster declares (ADR-0104/0105): the wire kind and operators come from `equipmentFilterSpecs` (endpoints.ts), the
 * words from here — 상태 labels per language, Maker options from the makers endpoint (`makers`, the chosen values stay selectable while it loads).
 */
export function columnFilter(key: keyof Equipment, makers: readonly string[] = [], lang: 'ko' | 'en' = 'ko'): ColumnFilterSpec | undefined {
  const wire = equipmentFilterSpecs[key];
  if (!wire || wire.kind !== 'enum') return wire;
  if (key === 'status') return { ...wire, options: EQUIPMENT_STATUS_VALUES.map(value => ({ value, label: statusText[value][lang] })) };
  if (key === 'maker') return { ...wire, options: makers.map(value => ({ value, label: value })) };
  return wire;
}
/** §6.1: sortable columns are exactly the data fields; the synthetic _select/_action columns never join the allow-list. */
export const sortFields: readonly (keyof Equipment)[] = fields.map(f => f.key);
export function validity(e: Equipment) {
  const durationHours = e.validTo ? (parseDateTime(e.validTo, 'validTo').getTime() - parseDateTime(e.validFrom, 'validFrom').getTime()) / 3_600_000 : 24 * 60;
  const changedAt = shift(e.validFrom, Math.min(24 * 30, Math.floor(durationHours / 2)));
  return [
    { from: e.validFrom, to: changedAt, chamberType: `${e.chamberType}-V1` },
    { from: changedAt, to: e.validTo, chamberType: e.chamberType },
  ];
}

/** Table-owned export params (#173): the quick search, the selection ids (`null` = every filtered row) and the table's active sort. */
export function exportParams(
  { q }: EquipmentFilter,
  request: TableExportRequest,
): EquipmentExportFilter {
  return { q, ...tableExportParams(request, { selectAll: true }) };
}

/** Readable page filter for the XLSX 조회 정보 sheet (#173 review P2-3); an unset search is omitted. Conditions are listed by the table itself (`필터 · <label>`). */
export function exportFilterSummary({ q }: EquipmentFilter, lang: 'ko' | 'en'): [string, string][] {
  return q ? [[formatText(EQUIPMENT_MESSAGES.dataSearch, lang), q]] : [];
}
