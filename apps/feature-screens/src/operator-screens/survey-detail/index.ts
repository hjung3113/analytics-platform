// The platform bridge's entry for the operator Survey detail (platform ADR-0071; #764 l). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// The hook needs a `HostSeamProvider` (the bridge supplies it) and returns the parts the host places in its own drawer;
// the standalone `SurveyDetail` frames the same pieces.
export { useSurveyDetailParts } from '@/features/surveys/components/detail/SurveyDetailParts';
export type {
  SurveyDetailParts,
  SurveyDetailView,
  UseSurveyDetailPartsArgs,
} from '@/features/surveys/components/detail/SurveyDetailParts';
