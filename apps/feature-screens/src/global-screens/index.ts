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
export {
  MyVocListScreen,
  type MyVocInitialFocus,
} from '@/features/voc/components/reporter/MyVocListScreen';
export {
  MY_VOC_DEFAULT_SORT,
  MY_VOC_QUERY_MAX,
  MY_VOC_SORTS,
  REPORTER_FACING_STATUS_ALL,
  type MyVocQuery,
  type MyVocSort,
} from '@/features/voc/components/reporter/my-voc-query';
export { ReporterVocDetail } from '@/features/voc/components/reporter/ReporterVocDetail';
export {
  VocComposeScreen,
  type VocComposeScreenProps,
} from '@/features/voc/components/compose/VocComposeScreen';
export { PermissionRequestsScreen } from '@/features/home/permission-requests/PermissionRequestsScreen';
export { HomeTodoPanel } from '@/features/home/todo/HomeTodoPanel';
