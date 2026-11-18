import { PlatformPage } from '@ap/components';
import { InboxPanel } from '@ap/feature-screens/global-screens';
import { FeatureBridge, notificationHostLinks } from '@ap/feature-bridge';

// Module level: `FeatureBridge` memoizes its seam on these identities.
const NOTIFICATION_LINKS = notificationHostLinks;

export default function Notifications() {
  return <PlatformPage>
    <FeatureBridge
      canLink={NOTIFICATION_LINKS.canLink}
      Link={NOTIFICATION_LINKS.Link}
      targetOf={NOTIFICATION_LINKS.targetOf}
      useNavigate={NOTIFICATION_LINKS.useNavigate}
    >
      <InboxPanel />
    </FeatureBridge>
  </PlatformPage>;
}
