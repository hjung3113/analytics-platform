import { permissionRequestStatusText } from '../../../lib/copy/enum-labels';
import { PERMISSION_REVIEW_TEXT } from '../../../lib/copy/admin-permissions';
export {
  isPermissionRequestsSearchValueValid,
  permissionRequestsSearchSchema,
  validatePermissionRequestsSearch,
} from './permission-requests-schema';
export type { PermissionRequestsSearch } from './permission-requests-schema';

export type ReviewTab = 'pending' | 'needs_more_info' | 'approved' | 'rejected' | 'all';

export const permissionRequestTabs: Array<{ value: ReviewTab; label: { ko: string; en: string } }> = [
  { value: 'pending', label: permissionRequestStatusText.pending },
  { value: 'needs_more_info', label: permissionRequestStatusText.needs_more_info },
  { value: 'approved', label: permissionRequestStatusText.approved },
  { value: 'rejected', label: permissionRequestStatusText.rejected },
  { value: 'all', label: PERMISSION_REVIEW_TEXT.all },
];

export { permissionRequestStatusLabel } from '../../../lib/copy/enum-labels';
