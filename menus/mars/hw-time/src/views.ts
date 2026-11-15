import { parseTableSort } from '@ap/components';
import { type HwTimeView } from './viewIds';
import { SORT_FIELDS } from './pages/table/tableData';

export { HW_TIME_VIEWS, isHwTimeView, type HwTimeView } from './viewIds';
const OWNERS: Record<HwTimeView, readonly string[]> = {
  overview: ['row', 'trend', 'align', 'minmax'],
  steps: ['trend', 'align', 'minmax'],
  compare: ['row', 'scroll', 'trend', 'align', 'minmax'],
  table: ['page', 'focus'],
};
const VIEW_KEYS = ['row', 'scroll', 'page', 'focus', 'trend', 'align', 'minmax'];
/** The whole switch is one URL write; Context, drill and the shared filters never enter this patch. */
export function viewSwitchPage(view: HwTimeView, pageParam: (key: string) => string | null): Record<string, string | null> {
  const patch: Record<string, string | null> = { view };
  for (const key of VIEW_KEYS) if (!OWNERS[view].includes(key) && pageParam(key) !== null) patch[key] = null;
  const sort = pageParam('sort');
  const acceptsSort = view === 'table' ? parseTableSort(sort, SORT_FIELDS).ok
    : (view === 'steps' || view === 'compare') && (sort === null || ['total-desc', 'total-asc'].includes(sort));
  if (sort !== null && !acceptsSort) patch.sort = null;
  return patch;
}
