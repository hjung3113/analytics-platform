// The platform bridge's entry for the operator Findings list (platform ADR-0071; #762 l). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// It also never reaches the Finding detail tree: the host passes `renderDetail`. `FindingsScreen` needs a `HostSeamProvider`
// (the bridge supplies it); the standalone `FindingsListPage` composes it with the Finding detail panel.
export {
  FindingsScreen,
  type FindingsScreenProps,
} from '@/features/findings/routes/FindingsScreen';
