/**
 * @ap/fo-bridge — the FeedbackOps session runtime shared by every bridge menu (platform ADR-0071, ADR-0081, #759).
 * Imports `@fops/frontend/global-screens/core` only, so the eagerly loaded app code stays off the FeedbackOps screen barrel.
 */
export { RejectedPage } from './fo/RejectedPage';
export { FoScreenPage } from './fo/FoScreenPage';
export { UUID_PATTERN, isUuid } from './fo/uuid';
export { foApi, setFoApi, type FoApi } from './fo-api';
export { FoBridge, UnlinkedLink } from './fo/FoBridge';
export { operatorRoute, routeHere, routeSearch, type OperatorRoute, type OperatorRouteSpec } from './fo/operator-route';
export { hostLinks, permissionRequestsTarget, type PlatformTarget, type TargetOf } from './fo/links';
export { foQueryClient, useFoSession } from './fo/session';
export { canSurveyLink, SURVEY_ID, SurveyLink, surveyTarget } from './fo/survey-links';
export { canVocLink, VOC_ID, VocLink, vocListTarget, vocTarget } from './fo/voc-links';
export { FoDetailDrawer } from './fo/FoDetailDrawer';
export { operatorHostLinks } from './fo/operator-links';
export {
  milestonesRoute, myTasksRoute, taskBoardRoute, taskListRoute, taskRequestsRoute, useMilestonesHere, useMilestonesSearch, useMyTasksHere, useMyTasksSearch,
  useTaskBoardHere, useTaskBoardSearch, useTaskListHere, useTaskListSearch, useTaskRequestsHere, useTaskRequestsSearch,
} from './fo/task-routes';
export { findingsRoute, useFindingsHere, useFindingsSearch } from './fo/finding-routes';
export { clustersRoute, inboxRoute, triageRoute, useClustersHere, useClustersSearch, useInboxHere, useInboxSearch, useTriageHere, useTriageSearch } from './fo/voc-routes';
export {
  coverageRoute, entityLinksRoute, evidenceRoute, integrationDashboardRoute, useCoverageHere, useCoverageSearch, useEntityLinksHere, useEntityLinksSearch,
  useEvidenceHere, useEvidenceSearch, useIntegrationDashboardHere, useIntegrationDashboardSearch,
} from './fo/integration-routes';
export {
  analyticsAreasRoute, managedSystemsRoute, permissionGrantsRoute, permissionRequestsRoute, settingsRoute, useAnalyticsAreasHere, useAnalyticsAreasSearch, useManagedSystemsHere,
  useManagedSystemsSearch, usePermissionGrantsHere, usePermissionGrantsSearch, usePermissionRequestsHere, usePermissionRequestsSearch, useSettingsHere, useSettingsSearch,
} from './fo/admin-routes';
export {
  surveyBuilderRoute, surveyFollowUpRoute, surveyOperatorTargets, surveyResultsRoute, surveysRoute, useSurveyBuilderHere, useSurveyBuilderSearch, useSurveyFollowUpHere,
  useSurveyFollowUpSearch, useSurveyResultsHere, useSurveyResultsSearch, useSurveysHere, useSurveysSearch,
} from './fo/survey-routes';
