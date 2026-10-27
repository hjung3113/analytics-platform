// The platform bridge's entry for the operator VOC inbox (platform ADR-0071, ADR-0081). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// It also never reaches the VOC detail tree: the host passes `renderDetail`. `InboxScreen` needs a `HostSeamProvider`
// (the bridge supplies it); the standalone `VocRouteShell` composes it under the default host.
export { InboxScreen, type InboxScreenProps } from '@/features/voc/routes/InboxScreen';
