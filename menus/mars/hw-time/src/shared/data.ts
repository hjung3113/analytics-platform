import { useMenuQuery } from '@ap/kernel';
import { hwTime, type HwTimeDrill } from '../endpoints';

/** Both hooks go through the Kernel's menu query: applied-Context identity, Scope/period gates, kind check, refresh epochs (ADR-0019). */
export function useHwTimeLevel(drill: HwTimeDrill, enabled = true) {
  // keepPrevious ON (#1365, ADR-0114): a drill step or level pick reads the same period and Scope, so the previous level stays (refreshing) until the next one arrives.
  return useMenuQuery(hwTime.levelRows, drill, enabled, { keepPrevious: true });
}

export function useHwTimeTrend(rowIds: string[], enabled = true) {
  // keepPrevious ON: another row selection redraws the same trend frame; the old lines stay (refreshing) until the new rows arrive.
  return useMenuQuery(hwTime.trend, { rowIds }, enabled, { keepPrevious: true });
}
