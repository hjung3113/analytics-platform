import type { HwTimeBlock, HwTimeLevelData, HwTimeRow } from '../endpoints';
import type { HwTimeFilter } from './useHwTimeFilter';
const completeSum = (values: readonly (number | null)[]) => values.length === 0 || values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
export function filterRow<T extends HwTimeRow>(row: T, ids: readonly string[]): T {
  if (row.auxiliary) return row;
  const values = Object.fromEntries(Object.entries(row.values).filter(([id]) => ids.includes(id)));
  return { ...row, values, total: completeSum(Object.values(values)),
    ...(row.judgements ? { judgements: Object.fromEntries(Object.entries(row.judgements).filter(([id]) => ids.includes(id))) } : {}),
  };
}
export function filterBlock<T extends HwTimeBlock>(block: T, ids: readonly string[]): T {
  const series = block.series.filter(item => ids.includes(item.id));
  const rows = block.rows.map(row => filterRow(row, ids));
  const values = Object.fromEntries(series.map(({ id }) => [id, completeSum(rows.filter(row => !row.auxiliary).map(row => row.values[id] ?? null))]));
  return { ...block, series, rows, totals: { values, total: completeSum(Object.values(values)) } };
}
export function filterLevel(data: HwTimeLevelData, filter: HwTimeFilter): HwTimeLevelData {
  const ids = data.level === 0 ? filter.modules : filter.motions;
  return { ...filterBlock(data, ids),
    ...(data.context ? { context: filterBlock(data.context, filter.motions) } : {}),
    ...(data.detail ? { detail: filterBlock(data.detail, filter.motions) } : {}),
  };
}
