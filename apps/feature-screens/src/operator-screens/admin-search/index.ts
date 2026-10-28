// The platform bridge's entry for FeedbackOps' own Admin search rules (Analytics Areas, Permission Requests, Permission Grants; platform ADR-0071
// decision 9, ADR-0081). Same import-graph rules as `findings-search`: no router, `routes/**`, `lib/router/**`, `lib/layout/**`, `lib/auth/**` or `sonner`.
export { isAnalyticsAreasSearchValueValid } from '@/features/admin/analytics-areas/search';
export { isPermissionGrantsSearchValueValid } from '@/features/admin/permissions/permission-grants-search';
export { isPermissionRequestsSearchValueValid } from '@/features/admin/permissions/permission-requests-schema';
