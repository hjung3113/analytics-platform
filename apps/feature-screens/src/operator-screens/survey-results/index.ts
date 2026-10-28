// The platform bridge's entry for the operator Survey results page (platform ADR-0071; #764 q). Same import-graph rules as
// `global-screens`: nothing reachable from here may import TanStack Router, `routes/**`, `lib/router/**`, `lib/layout/**`,
// `lib/auth/**`, `lib/api/auth.ts`, the `@/lib/api` barrel or `sonner`, or reach the network outside `lib/api/client.ts`.
// `SurveyResultsScreen` needs a `HostSeamProvider` (the bridge supplies it); the standalone route composes it with `Route.useParams()`.
export { SurveyResultsScreen } from '@/features/surveys/routes/SurveyResultsScreen';
