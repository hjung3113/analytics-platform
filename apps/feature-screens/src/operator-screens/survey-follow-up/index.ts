// The platform bridge's entry for the operator Survey follow-up review (platform ADR-0071; #764 q). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// `SurveyFollowUpScreen` needs a `HostSeamProvider` (the bridge supplies it). The host passes `selection` (controlled, no
// auto-select) and `renderDetail` (the detail parts it places in its drawer); the standalone route passes neither.
export {
  SurveyFollowUpScreen,
  type SurveyFollowUpScreenProps,
  type SurveyFollowUpSelection,
} from '@/features/surveys/routes/SurveyFollowUpScreen';
