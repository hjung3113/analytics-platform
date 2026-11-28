import { useMessages } from '@ap/kernel';
import type { useHostPlatform, SelectOutcome } from '@ap/kernel/host';
import { SHELL_MESSAGES } from '../messages';

/** The warning message for each reason a saved-view pick can fail. */
export const PICK_FAILURE_KEYS = {
  'wrong-menu': 'savedViewWrongMenu',
  'stale-schema': 'savedViewStaleSchema',
  unavailable: 'savedViewUnavailable',
  denied: 'savedViewDenied',
} as const;
export type PickFailure = keyof typeof PICK_FAILURE_KEYS;

export function useSavedViewPickWarning(toast: (...args: Parameters<ReturnType<typeof useHostPlatform>['toast']>) => void) {
  const m = useMessages(SHELL_MESSAGES);
  return (outcome: SelectOutcome) => {
    if (outcome.ok || outcome.reason === 'held' || outcome.reason === 'cancelled') return;
    toast(m(PICK_FAILURE_KEYS[outcome.reason]), { tone: 'warning' });
  };
}
