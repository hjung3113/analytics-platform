import { usePlatform } from '@ap/kernel';
import type { OperatorRoute } from '@ap/fo-bridge';
import { isTasksSearchValueValid } from '@fops/frontend/operator-screens/tasks-search';

/**
 * The first address value of `route` that FeedbackOps' own Tasks search schema refuses (the single source for what a value may be; `focus` is its
 * `param`, any string; `managedSystem` a UUID or `all`). The page renders `RejectedPage` (`@ap/fo-bridge`) for it before mounting any FeedbackOps screen, so nothing is requested for it (06 §6.4).
 */
export function useRejectedValue(route: OperatorRoute) {
  const { pageParam } = usePlatform();
  return route.rejectedKey(pageParam, isTasksSearchValueValid);
}
