import { useMessages } from '@ap/kernel';
import type { useHostPlatform, SelectOutcome } from '@ap/kernel/host';
import { SHELL_MESSAGES } from '../messages';

export function useSavedViewPickWarning(toast: (...args: Parameters<ReturnType<typeof useHostPlatform>['toast']>) => void) {
  const m = useMessages(SHELL_MESSAGES);
  return (outcome: SelectOutcome) => {
    if (outcome.ok || outcome.reason === 'held' || outcome.reason === 'cancelled') return;
    const keys = {
      'wrong-menu': 'savedViewWrongMenu',
      'stale-schema': 'savedViewStaleSchema',
      unavailable: 'savedViewUnavailable',
      denied: 'savedViewDenied',
    } as const;
    toast(m(keys[outcome.reason]), { tone: 'warning' });
  };
}
