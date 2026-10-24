// The platform bridge's entry for the operator dashboard (platform ADR-0071, ADR-0081). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// `DashboardScreen` needs a `HostSeamProvider` (the bridge supplies it); the standalone `HomeScreen` composes it.
export { DashboardScreen, refreshDashboard } from '@/features/home/DashboardScreen';
