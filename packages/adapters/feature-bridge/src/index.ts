/**
 * @ap/feature-bridge — the feature session runtime shared by every bridge menu (platform ADR-0071, ADR-0081, #759).
 * Imports `@ap/feature-screens/global-screens/core` only, so the eagerly loaded app code stays off the feature screen barrel.
 */
export { RejectedPage } from './feature/RejectedPage';
export { FeatureScreenPage } from './feature/FeatureScreenPage';
export { UUID_PATTERN, isUuid } from './feature/uuid';
export { featureApi, setFeatureApi, type FeatureApi } from './feature-api';
export { FeatureBridge, UnlinkedLink } from './feature/FeatureBridge';
export { operatorRoute, routeHere, routeSearch, type OperatorRoute, type OperatorRouteSpec } from './feature/operator-route';
export { hostLinks, permissionRequestsTarget, type PlatformTarget, type TargetOf } from './feature/links';
export { featureQueryClient, useFeatureSession } from './feature/session';
export { canSurveyLink, SURVEY_ID, SurveyLink, surveyTarget } from './feature/survey-links';
export { canVocLink, VOC_ID, VocLink, vocListTarget, vocTarget } from './feature/voc-links';
export { ListScope } from './feature/ListScope';
export { FeatureDetailDrawer } from './feature/FeatureDetailDrawer';
export { operatorHostLinks } from './feature/operator-links';
export {
  milestonesRoute, myTasksRoute, taskBoardRoute, taskListRoute, taskRequestsRoute, useMilestonesHere, useMilestonesSearch, useMyTasksHere, useMyTasksSearch,
  useTaskBoardHere, useTaskBoardSearch, useTaskListHere, useTaskListSearch, useTaskRequestsHere, useTaskRequestsSearch,
} from './feature/task-routes';
export { findingsRoute, useFindingsHere, useFindingsSearch } from './feature/finding-routes';
export { clustersRoute, inboxRoute, triageRoute, useClustersHere, useClustersSearch, useInboxHere, useInboxSearch, useTriageHere, useTriageSearch } from './feature/voc-routes';
export {
  coverageRoute, entityLinksRoute, evidenceRoute, integrationDashboardRoute, useCoverageHere, useCoverageSearch, useEntityLinksHere, useEntityLinksSearch,
  useEvidenceHere, useEvidenceSearch, useIntegrationDashboardHere, useIntegrationDashboardSearch,
} from './feature/integration-routes';
export {
  analyticsAreasRoute, managedSystemsRoute, permissionGrantsRoute, permissionRequestsRoute, settingsRoute, useAnalyticsAreasHere, useAnalyticsAreasSearch, useManagedSystemsHere,
  useManagedSystemsSearch, usePermissionGrantsHere, usePermissionGrantsSearch, usePermissionRequestsHere, usePermissionRequestsSearch, useSettingsHere, useSettingsSearch,
} from './feature/admin-routes';
export {
  surveyBuilderRoute, surveyFollowUpRoute, surveyOperatorTargets, surveyResultsRoute, surveysRoute, useSurveyBuilderHere, useSurveyBuilderSearch, useSurveyFollowUpHere,
  useSurveyFollowUpSearch, useSurveyResultsHere, useSurveyResultsSearch, useSurveysHere, useSurveysSearch,
} from './feature/survey-routes';
