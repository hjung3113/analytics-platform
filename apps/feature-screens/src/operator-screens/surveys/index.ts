// The platform bridge's entry for the operator Surveys list (platform ADR-0071; #764 l). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// It also never reaches the Survey detail tree: the host passes `renderDetail`. `SurveysScreen` needs a `HostSeamProvider`
// (the bridge supplies it); the standalone route composes it with the Survey detail aside.
export {
  SurveysScreen,
  type SurveysDetailSlot,
  type SurveysScreenProps,
} from '@/features/surveys/routes/SurveysScreen';
