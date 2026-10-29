import { InboxPanel } from '@ap/feature-screens/global-screens/inbox-panel';
import { FeatureBridge } from '../feature/FeatureBridge';

/** The rail bell's recent popover body: the feature screens' `InboxPanel` (`recent` variant). Loaded lazily by `notifications-slot.tsx`, so none of the panel is in the start chunk. */
export default function RecentInbox() {
  return <FeatureBridge><InboxPanel variant="recent" /></FeatureBridge>;
}
