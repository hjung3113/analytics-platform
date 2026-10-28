// The platform bridge's entry for the admin permission request review (platform ADR-0071; #764 g). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// The screen needs a `HostSeamProvider` (the bridge supplies it). It does not draw the admin gate (the bridge menu's permission
// and the backend decide). The bridge passes `autoSelect={false}` (selection from the URL only) and `renderDetail` (the host draws
// the detail parts in its drawer); the standalone route composes it with the defaults inside `PermissionGate`.
export {
  PermissionRequestsScreen,
  type PermissionRequestsScreenProps,
} from '@/features/admin/permissions/permission-requests-screen';
