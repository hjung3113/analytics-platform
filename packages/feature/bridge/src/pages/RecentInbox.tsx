import { InboxPanel } from '@ap/feature-screens/global-screens/inbox-panel';
import { FeatureBridge } from '../feature/FeatureBridge';
import { notificationHostLinks } from '../feature/operator-links';

/** The rail bell's recent popover body: the feature screens' `InboxPanel` (`recent` variant). Loaded lazily by `notifications-slot.tsx`, so none of the panel is in the start chunk. */
export default function RecentInbox() {
  return (
    <FeatureBridge
      canLink={notificationHostLinks.canLink}
      Link={notificationHostLinks.Link}
      targetOf={notificationHostLinks.targetOf}
      useNavigate={notificationHostLinks.useNavigate}
    >
      <InboxPanel variant="recent" />
    </FeatureBridge>
  );
}
