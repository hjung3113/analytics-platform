// The platform bridge's entry for the operator VOC detail (platform ADR-0071; #761 v). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// The hook needs a `HostSeamProvider` (the bridge supplies it) and returns the parts the host places in its own drawer;
// the standalone `VocDetailPanel` frames the same parts.
export { useVocDetailParts } from '@/features/voc/components/detail/useVocDetailParts';
export type {
  UseVocDetailPartsArgs,
  VocDetailParts,
} from '@/features/voc/components/detail/useVocDetailParts';
