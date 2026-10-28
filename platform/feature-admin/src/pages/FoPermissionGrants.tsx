import { FeatureDetailDrawer, FeatureScreenPage, permissionGrantsRoute, usePermissionGrantsHere, usePermissionGrantsSearch } from '@ap/feature-bridge';
import { PermissionGrantsScreen, type PermissionGrantsScreenProps } from '@ap/feature-screens/operator-screens/permission-grants';
import { isPermissionGrantsSearchValueValid } from '@ap/feature-screens/operator-screens/admin-search';

/** The console owns the selected grant or deny and its close (`focus` is its `selected`), so the drawer's close is `requestClose`. */
const renderDetail: NonNullable<PermissionGrantsScreenProps['renderDetail']> = parts => <FeatureDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** 부여 목록 (ADR-0081, #764 p2): active grants and denies through the bridge; nothing auto-selects, `focus` opens the detail in the shell slot, `tab` is grants or denies. */
export default function FoPermissionGrants() {
  return <FeatureScreenPage route={permissionGrantsRoute} isValid={isPermissionGrantsSearchValueValid} useSearch={usePermissionGrantsSearch} useHere={usePermissionGrantsHere}>
    <PermissionGrantsScreen autoSelect={false} renderDetail={renderDetail} />
  </FeatureScreenPage>;
}
