import { usePlatform } from '@ap/kernel';
import { usePageKeyRules, type PageKeyRule } from '@ap/components';
import { HW_TIME_MODULE_TYPES } from '../endpoints';
import { HW_TIME_OVERVIEW_MESSAGES } from '../messages';
import { useHwTimeFilterContext } from './HwTimeFilterContext';

/** One catalog-aware rule set for the four Views, including standalone legacy panes. Raw values survive until explicit recovery. */
export function useHwTimeDrillRules(extra: readonly PageKeyRule[] = []) {
  const { pageParam } = usePlatform();
  const filter = useHwTimeFilterContext();
  const type = filter?.moduleType ?? HW_TIME_MODULE_TYPES.find(type => type.id === pageParam('moduleType')) ?? HW_TIME_MODULE_TYPES[0];
  const moduleId = pageParam('drillModule');
  return usePageKeyRules([
    ...extra,
    { key: 'drillModule', label: HW_TIME_OVERVIEW_MESSAGES.modules, valid: raw => (type.modules as readonly string[]).includes(raw) },
    { key: 'drillMotion', label: HW_TIME_OVERVIEW_MESSAGES.motions, valid: raw => moduleId !== null && moduleId !== '' && (type.motions as readonly string[]).includes(raw) },
  ]);
}
