export {
  isPermissionRequestsSearchValueValid,
  permissionRequestsSearchSchema,
  validatePermissionRequestsSearch,
} from '@/features/admin/permissions/permission-requests-schema';
export type { PermissionRequestsSearch } from '@/features/admin/permissions/permission-requests-schema';

export type ReviewTab = 'pending' | 'needs_more_info' | 'approved' | 'rejected' | 'all';

export const permissionRequestTabs: Array<{ value: ReviewTab; label: string }> = [
  { value: 'pending', label: '대기 중' },
  { value: 'needs_more_info', label: '추가 정보 필요' },
  { value: 'approved', label: '승인됨' },
  { value: 'rejected', label: '거절됨' },
  { value: 'all', label: '전체' },
];

export { permissionRequestStatusLabel } from '@/lib/copy/enum-labels';
