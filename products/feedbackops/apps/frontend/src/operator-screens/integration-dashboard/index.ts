// The platform bridge's entry for the 연동 액션 대시보드 and its recovery queue (platform ADR-0071; #762 node i). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// The host frames the recovery item's parts it gets through `renderDetail`. `IntegrationDashboardScreen` needs a `HostSeamProvider`
// (the bridge supplies it); the standalone `IntegrationDashboardRoute` composes it under the default host. The screen may not import
// the admin feature, so the host passes `renderRequestAccess`; `renderRecoveryRequestAccess` is the standalone app's renderer.
export {
  IntegrationDashboardScreen,
  type IntegrationDashboardScreenProps,
} from '@/features/integration/routes/IntegrationDashboardScreen';
export type {
  RecoveryPanelParts,
  RenderRecoveryAccess,
} from '@/features/integration/recovery/RecoveryPanel';
export { renderRecoveryRequestAccess } from './renderRecoveryRequestAccess';
