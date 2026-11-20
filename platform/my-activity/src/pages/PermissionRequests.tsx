import { PlatformPage } from '@ap/components';
import { PermissionRequestsScreen } from '@ap/feature-screens/global-screens';
import { FeatureBridge } from '@ap/feature-bridge';
import { usePlatform } from '@ap/kernel';

/** 권한 요청 (ADR-0070 decision 8, ADR-0071): the feature screens' requester page through the bridge; the title is the manifest label. Approval stays the feature screens' admin screen. */
export default function PermissionRequests() {
  const { pageParam, absoluteUrl, linkTo, registry } = usePlatform();
  const permissionGroup = pageParam('permissionGroup');
  const capability = pageParam('capability');
  const managedSystem = pageParam('managedSystem');
  const returnTo = registry.safeReturnTo(pageParam('returnTo'));
  return <PlatformPage showReturnRow={false}>
    <FeatureBridge>
      <PermissionRequestsScreen
        {...(permissionGroup !== null ? { permissionGroup } : {})}
        {...(capability !== null ? { initialCapability: capability } : {})}
        {...(managedSystem !== null ? { initialManagedSystemId: managedSystem } : {})}
        {...(returnTo !== null ? { returnTo } : {})}
        groupLink={id => absoluteUrl(linkTo('permission-requests', { page: { permissionGroup: id } }))}
      />
    </FeatureBridge>
  </PlatformPage>;
}
