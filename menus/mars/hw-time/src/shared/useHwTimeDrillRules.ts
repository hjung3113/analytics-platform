import { usePlatform } from '@ap/kernel';
import { usePageKeyRules, type PageKeyRule } from '@ap/components';
import { HW_TIME_MODULE_TYPES } from '../endpoints';
import { HW_TIME_OVERVIEW_MESSAGES } from '../messages';

/** One catalog-aware rule set for the linked screen, including legacy panes. Raw values survive until explicit recovery. */
export function useHwTimeDrillRules(extra: readonly PageKeyRule[] = []) {
  const { pageParam } = usePlatform();
  const type = HW_TIME_MODULE_TYPES.find(type => type.id === pageParam('moduleType'));
  const motionId = pageParam('drillMotion');
  return usePageKeyRules([
    ...extra,
    { key: 'drillMotion', label: HW_TIME_OVERVIEW_MESSAGES.motions, valid: raw => !!type && (type.motions as readonly string[]).includes(raw) },
    { key: 'drillModule', label: HW_TIME_OVERVIEW_MESSAGES.modules, valid: raw => !!type && !!motionId && (type.motions as readonly string[]).includes(motionId) && (type.modules as readonly string[]).includes(raw) },
  ]);
}
