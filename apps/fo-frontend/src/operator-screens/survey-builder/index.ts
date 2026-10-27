// The platform bridge's entry for the operator Survey builder (platform ADR-0071; #764 b). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// `SurveyBuilderScreen` needs a `HostSeamProvider` (the bridge supplies it) and a QueryClient; `onBack` is the host's.
export {
  SurveyBuilderScreen,
  type SurveyBuilderLeaveGuard,
  type SurveyBuilderScreenProps,
} from '@/features/surveys/routes/SurveyBuilderScreen';
