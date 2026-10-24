/**
 * @ap/fo-bridge — the FeedbackOps session runtime shared by every bridge menu (platform ADR-0071, ADR-0081, #759).
 * Imports `@fops/frontend/global-screens/core` only, so the eagerly loaded app code stays off the FeedbackOps screen barrel.
 */
export { foApi, setFoApi, type FoApi } from './fo-api';
export { FoBridge, UnlinkedLink } from './fo/FoBridge';
export { hostLinks, permissionRequestsTarget, type PlatformTarget, type TargetOf } from './fo/links';
export { foQueryClient, useFoSession } from './fo/session';
export { canSurveyLink, SURVEY_ID, SurveyLink, surveyTarget } from './fo/survey-links';
export { canVocLink, VOC_ID, VocLink, vocTarget } from './fo/voc-links';
