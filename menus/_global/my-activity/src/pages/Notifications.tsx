import { PlatformPage } from '@ap/components';
import { InboxPanel } from '@fops/frontend/global-screens';
import { FoBridge } from '../fo/FoBridge';

/** 알림 (ADR-0070, ADR-0071): FeedbackOps' InboxPanel through the bridge; the title is the manifest label, the rest stays FeedbackOps'. */
export default function Notifications() {
  return <PlatformPage>
    <FoBridge><InboxPanel /></FoBridge>
  </PlatformPage>;
}
