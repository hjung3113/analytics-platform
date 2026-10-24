import { useMenuQuery } from '@ap/kernel';
import { hwTime, type HwTimeDrill } from '../endpoints';

/** Both hooks go through the Kernel's menu query: applied-Context identity, Scope/period gates, kind check, refresh epochs (ADR-0019). */
export function useHwTimeLevel(drill: HwTimeDrill, enabled = true) {
  return useMenuQuery(hwTime.levelRows, drill, enabled);
}

export function useHwTimeTrend(rowIds: string[], enabled = true) {
  return useMenuQuery(hwTime.trend, { rowIds }, enabled);
}
