// The platform bridge's entry for the operator Milestones list (platform ADR-0071, ADR-0081). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// The host frames the detail and create parts it gets through `renderDetail`. `MilestonesScreen` needs a `HostSeamProvider`
// (the bridge supplies it); the standalone `MilestonesRoute` composes it under the default host.
export {
  MilestonesScreen,
  type MilestonePanelParts,
  type MilestonesScreenProps,
} from '@/features/tasks/routes/MilestonesScreen';
