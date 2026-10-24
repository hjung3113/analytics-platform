import { PlatformPage } from '@ap/components';
import { InboxPanel } from '@fops/frontend/global-screens';
import { FoBridge, canVocLink, VocLink } from '@ap/fo-bridge';

/** 알림 (ADR-0070, ADR-0071): FeedbackOps' InboxPanel through the bridge; the title is the manifest label, the rest stays FeedbackOps'. Only `voc.public_update_posted` (a reporter's own VOC) links to a platform page (#654); the operator targets stay unlinked. */
export default function Notifications() {
  return <PlatformPage>
    <FoBridge canLink={canVocLink} Link={VocLink}><InboxPanel /></FoBridge>
  </PlatformPage>;
}
