import { PlatformPage } from '@ap/components';
import { PermissionRequestsScreen } from '@ap/feature-screens/global-screens';
import { FoBridge } from '@ap/feature-bridge';

/** 권한 요청 (ADR-0070 decision 8, ADR-0071): FeedbackOps' requester page through the bridge; the title is the manifest label. Approval stays FeedbackOps' admin screen. */
export default function PermissionRequests() {
  return <PlatformPage>
    <FoBridge><PermissionRequestsScreen /></FoBridge>
  </PlatformPage>;
}
