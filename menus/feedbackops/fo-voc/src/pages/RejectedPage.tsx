import { usePlatform } from '@ap/kernel';
import type { OperatorRoute } from '@ap/fo-bridge';
import { isVocSearchValueValid } from '@fops/frontend/operator-screens/voc-search';

/**
 * The first address value of `route` that FeedbackOps' own VOC search schema refuses (the single source for what a value may be; `focus` is its
 * `selected`, a UUID). The page renders `RejectedPage` (`@ap/fo-bridge`) for it before mounting any FeedbackOps screen, so nothing is requested for it (06 §6.4).
 */
export function useRejectedValue(route: OperatorRoute) {
  const { pageParam } = usePlatform();
  return route.rejectedKey(pageParam, isVocSearchValueValid);
}
