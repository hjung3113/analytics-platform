// The platform bridge's entry for the operator 엔티티 링크 list (platform ADR-0071, ADR-0081). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// `LinksScreen` takes no props and owns its `ListShell`; it reads and writes its URL through the `HostSeamProvider`
// (the bridge supplies it); the standalone `LinksRoute` composes it under the default host.
export { LinksScreen } from '@/features/integration/routes/LinksScreen';
