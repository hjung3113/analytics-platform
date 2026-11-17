import { FeatureDetailDrawer, FeatureScreenPage, permissionGroupsRoute, usePermissionGroupsHere, usePermissionGroupsSearch } from '@ap/feature-bridge';
import { PermissionGroupsScreen, isPermissionGroupsSearchValueValid } from '@ap/feature-screens/operator-screens/permission-groups';

export default function FeaturePermissionGroups() {
  return <FeatureScreenPage route={permissionGroupsRoute} isValid={isPermissionGroupsSearchValueValid} useSearch={usePermissionGroupsSearch} useHere={usePermissionGroupsHere}>
    <PermissionGroupsScreen renderDetail={parts => <FeatureDetailDrawer parts={parts} onClose={parts.requestClose} />} />
  </FeatureScreenPage>;
}
