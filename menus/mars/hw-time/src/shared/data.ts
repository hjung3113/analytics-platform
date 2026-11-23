import { useMenuQuery } from '@ap/kernel';
import { useHwTimeFilterContext } from './HwTimeFilterContext';
import { filterLevel } from './filterData';
import { hwTime, type HwTimeTableFilter } from '../endpoints';

/** Both hooks go through the Kernel's menu query: applied-Context identity, Scope/period gates, kind check, refresh epochs (ADR-0019). */
export function useHwTimeLevel(drill: HwTimeTableFilter, enabled = true) {
  // keepPrevious ON (#1365, ADR-0114): a drill step or level pick reads the same period and Scope, so the previous level stays (refreshing) until the next one arrives.
  const filter = useHwTimeFilterContext();
  const params = filter ? { ...drill, moduleType: filter.moduleType.id } : drill;
  const query = useMenuQuery(hwTime.levelRows, params, enabled && !filter?.invalid, { keepPrevious: true });
  if (!filter || !query.response?.data) return query;
  return { ...query, response: { ...query.response, data: filterLevel(query.response.data, filter) } };
}

export function useHwTimeTrend(rowIds: string[], enabled = true) {
  // keepPrevious ON: another row selection redraws the same trend frame; the old lines stay (refreshing) until the new rows arrive.
  const filter = useHwTimeFilterContext();
  const params = filter ? { rowIds, moduleType: filter.moduleType.id } : { rowIds };
  return useMenuQuery(hwTime.trend, params, enabled && !filter?.invalid, { keepPrevious: true });
}
