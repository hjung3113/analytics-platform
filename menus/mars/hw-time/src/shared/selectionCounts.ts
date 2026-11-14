import { formatText } from '@ap/kernel';
import { HW_TIME_MESSAGES } from '../messages';
import type { HwTimeBlock } from '../endpoints';

/** `선택 N · 평가 M`: equipment drawn / equipment with at least one measured value (auxiliary rows are annotations, not data). */
export function selectionCounts(block: HwTimeBlock): { ko: string; en: string } {
  const rows = block.rows.filter(row => !row.auxiliary);
  const selected = new Set(rows.map(row => row.equipmentId)).size;
  const evaluated = new Set(rows.filter(row => Object.values(row.values).some(value => value !== null)).map(row => row.equipmentId)).size;
  return { ko: formatText(HW_TIME_MESSAGES.selectionCountsSelectedEvaluated, 'ko', { selected: String(selected), evaluated: String(evaluated) }), en: formatText(HW_TIME_MESSAGES.selectionCountsSelectedEvaluated, 'en', { selected: String(selected), evaluated: String(evaluated) }) };
}
