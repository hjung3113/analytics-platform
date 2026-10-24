// The platform bridge's entry for the operator VOC clusters (platform ADR-0071, ADR-0081). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// Both need a `HostSeamProvider` (the bridge supplies it); the standalone routes compose them under the default host.
export { ClusterListScreen } from '@/features/voc-cluster/components/ClusterListScreen';
export { useClusterDetailParts } from '@/features/voc-cluster/components/detail/VocClusterDetailPanel';
