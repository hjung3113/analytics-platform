import { PlatformPage } from '@ap/components';
import { InboxPanel } from '@ap/feature-screens/global-screens';
import { FeatureBridge, canVocLink, VocLink } from '@ap/feature-bridge';

/** 알림 (ADR-0070, ADR-0071): the feature screens' InboxPanel through the bridge; the title is the manifest label, the rest stays feature'. Only `voc.public_update_posted` (a reporter's own VOC) links to a platform page (#654); the operator targets stay unlinked. */
export default function Notifications() {
  return <PlatformPage>
    <FeatureBridge canLink={canVocLink} Link={VocLink}><InboxPanel /></FeatureBridge>
  </PlatformPage>;
}
