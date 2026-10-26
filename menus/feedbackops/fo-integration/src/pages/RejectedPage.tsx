import { usePlatform } from '@ap/kernel';
import type { OperatorRoute } from '@ap/fo-bridge';

type Validator = (key: string, value: string) => boolean;

/**
 * The first address value of `route` that FeedbackOps' own 연동 search schema for this screen (`isValid`) refuses (the single source for what a value may be; `focus` is
 * its `selected`; `managedSystem` a UUID or `all`, Links accepts any string). The page renders `RejectedPage` (`@ap/fo-bridge`) for it before mounting any FeedbackOps screen, so nothing is requested for it (06 §6.4).
 */
export function useRejectedValue(route: OperatorRoute, isValid: Validator) {
  const { pageParam } = usePlatform();
  return route.rejectedKey(pageParam, isValid);
}
