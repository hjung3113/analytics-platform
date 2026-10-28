import { FoDetailDrawer, FoScreenPage, permissionRequestsRoute, usePermissionRequestsHere, usePermissionRequestsSearch } from '@ap/feature-bridge';
import { PermissionRequestsScreen, type PermissionRequestsScreenProps } from '@ap/feature-screens/operator-screens/permission-requests';
import { isPermissionRequestsSearchValueValid } from '@ap/feature-screens/operator-screens/admin-search';

/** The review owns the selected request and its close (`focus` is its `selected`), so the drawer's close is `requestClose`. */
const renderDetail: NonNullable<PermissionRequestsScreenProps['renderDetail']> = parts => <FoDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** 권한 요청 검토 (ADR-0081, #764 p2): the permission request console through the bridge; nothing auto-selects, `focus` (a request id) opens the detail in the shell slot, `tab` is the status tab. */
export default function FoPermissionRequests() {
  return <FoScreenPage route={permissionRequestsRoute} isValid={isPermissionRequestsSearchValueValid} useSearch={usePermissionRequestsSearch} useHere={usePermissionRequestsHere}>
    <PermissionRequestsScreen autoSelect={false} renderDetail={renderDetail} />
  </FoScreenPage>;
}
