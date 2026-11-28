import { useMessages } from '@ap/kernel';
import { useHostPlatform, type SelectOutcome } from '@ap/kernel/host';
import { SHELL_MESSAGES } from '../messages';

export function useSavedViewPickWarning() {
  const m = useMessages(SHELL_MESSAGES);
  const { toast } = useHostPlatform();
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
