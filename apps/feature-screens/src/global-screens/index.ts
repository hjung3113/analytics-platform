// The platform bridge's only entry into feature (platform ADR-0071). Nothing
// reachable from here may import TanStack Router, `routes/**`, `lib/router/**`,
// `lib/layout/**`, `lib/auth/**`, `lib/api/auth.ts` or the `@/lib/api` barrel,
// or reach the network outside `lib/api/client.ts` (a test in the bridge menu walks this graph).
export * from './core';
export * from './inbox-panel';
export {
  RespondSurveyScreen,
  SurveyParticipationScreen,
} from '@/features/surveys/components/participation/SurveyParticipationScreens';
export { REPORTER_FACING_STATUS_ALL } from '@/lib/copy/reporter-status-labels';
export {
  PublicVocListScreen,
  type PublicVocInitialFocus,
} from '@/features/voc/components/public/PublicVocListScreen';
export { PublicVocDetail } from '@/features/voc/components/public/PublicVocDetail';
export { VocReadingPane } from '@/features/voc/components/public/VocReadingPane';
export {
  PUBLIC_VOC_QUERY_MAX,
  type PublicVocQuery,
} from '@/features/voc/components/public/public-voc-query';
export { ReporterVocDetail } from '@/features/voc/components/reporter/ReporterVocDetail';
export {
  VocComposeScreen,
  type VocComposeScreenProps,
} from '@/features/voc/components/compose/VocComposeScreen';
export { PermissionRequestsScreen } from '@/features/home/permission-requests/PermissionRequestsScreen';
export {
  RequestAccessButton,
  type RequestAccessScopeTarget,
} from '@/features/admin/permissions/request-access-button';
export { HomeTodoPanel } from '@/features/home/todo/HomeTodoPanel';
export { ApiTokensScreen, type ApiTokenDrawerParts, type ApiTokenTableParts } from '@/features/api-tokens/ApiTokensScreen';
