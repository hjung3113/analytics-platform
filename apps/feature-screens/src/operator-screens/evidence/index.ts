// The platform bridge's entry for the operator Evidence inventory (platform ADR-0071; #762 node e). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// The host renders the detail parts it gets through `renderDetail`; the standalone `EvidenceRoute` composes the screen under
// the default host and never reaches this entry.
export {
  EvidenceScreen,
  type EvidenceScreenProps,
} from '@/features/integration/routes/EvidenceScreen';
