// The platform bridge's entry for the operator Finding detail (platform ADR-0071; #762 d). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel, `sonner` or `features/findings/public.ts`, or reach the network
// outside `lib/api/client.ts`. The hook needs a `HostSeamProvider` (the bridge supplies it) and returns the parts the host
// places in its own drawer; the standalone `FindingDetailPanel` frames the same parts.
export { useFindingDetailParts } from '@/features/findings/components/FindingDetail/FindingDetailParts';
export type {
  FindingDetailParts,
  FindingDetailView,
  UseFindingDetailPartsArgs,
} from '@/features/findings/components/FindingDetail/FindingDetailParts';
