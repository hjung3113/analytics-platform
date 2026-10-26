// The platform bridge's entry for the operator Coverage page (platform ADR-0071, ADR-0081). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// `CoverageScreen` takes no props; it reads and writes its URL and links through the `HostSeamProvider` (the bridge
// supplies it); the standalone `CoverageRoute` composes it under the default host with its `InternalLink` anchors.
export { CoverageScreen } from '@/features/integration/routes/CoverageScreen';
