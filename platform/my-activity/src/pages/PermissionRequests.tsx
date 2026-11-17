import { PlatformPage } from '@ap/components';
import { PermissionRequestsScreen } from '@ap/feature-screens/global-screens';
import { FeatureBridge } from '@ap/feature-bridge';
import { usePlatform } from '@ap/kernel';

/** 권한 요청 (ADR-0070 decision 8, ADR-0071): the feature screens' requester page through the bridge; the title is the manifest label. Approval stays the feature screens' admin screen. */
export default function PermissionRequests() {
  const { pageParam, absoluteUrl, linkTo } = usePlatform();
  const permissionGroup = pageParam('permissionGroup');
  return <PlatformPage>
    <FeatureBridge><PermissionRequestsScreen {...(permissionGroup !== null ? { permissionGroup } : {})} groupLink={id => absoluteUrl(linkTo('permission-requests', { page: { permissionGroup: id } }))} /></FeatureBridge>
  </PlatformPage>;
}
