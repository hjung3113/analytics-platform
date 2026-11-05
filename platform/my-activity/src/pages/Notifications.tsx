import { PlatformPage } from '@ap/components';
import { InboxPanel } from '@ap/feature-screens/global-screens';
import { FeatureBridge, hostLinks, improvementItemTarget, vocTarget } from '@ap/feature-bridge';

// Module level: `FeatureBridge` memoizes its seam on these two identities.
// 알림 (ADR-0070, ADR-0071): the feature screens' InboxPanel through the bridge; the title is the manifest label, the rest stays feature'.
// A reporter's own VOC (#654) and an assigned improvement item deep link (#1328 e1) link to platform pages; the operator targets stay unlinked.
const NOTIFICATION_LINKS = hostLinks(vocTarget, improvementItemTarget);

export default function Notifications() {
  return <PlatformPage>
    <FeatureBridge canLink={NOTIFICATION_LINKS.canLink} Link={NOTIFICATION_LINKS.Link}><InboxPanel /></FeatureBridge>
  </PlatformPage>;
}
