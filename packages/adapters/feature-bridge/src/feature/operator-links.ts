import { hostLinksCarrying } from './links';
import { adminOperatorTargets } from './admin-routes';
import { surveyCarry, surveyOperatorTargets } from './survey-routes';
import { findingsRoute } from './finding-routes';
import { integrationOperatorTargets } from './integration-routes';
import { milestonesRoute, myTasksRoute, taskBoardRoute, taskListBareAlias, taskListInboxAlias, taskListRoute, taskRequestsRoute } from './task-routes';
import { vocListTarget, vocTarget } from './voc-links';
import { clustersRoute, inboxRoute, triageRoute } from './voc-routes';

/**
 * The feature paths the operator pages and the dashboard can reach: the three VOC tables, the Findings table, the four 연동 tables (대시보드·Evidence·커버리지·엔티티 링크), the seven Task tables (Task Requests, board, Milestones, list, 내 Task and the two list aliases), 내 VOC, the survey menus (the reporter `설문` targets first, then the four Survey 관리 tables, #764 p1; `surveyCarry` adds the current list context to links between those menus) and the five 관리자 tables (#764 p2; `/admin/settings#coverage` is the 설정 menu at its coverage section).
 * Other routes stay unlinked (ADR-0071 decision 10), including an unmapped `/admin/…` path.
 */
export const operatorHostLinks = hostLinksCarrying(
  surveyCarry,
  inboxRoute.target, triageRoute.target, clustersRoute.target, findingsRoute.target,
  taskRequestsRoute.target, taskBoardRoute.target, milestonesRoute.target, taskListRoute.target, myTasksRoute.target, taskListInboxAlias.target, taskListBareAlias.target,
  ...integrationOperatorTargets,
  vocTarget, vocListTarget,
  ...surveyOperatorTargets,
  ...adminOperatorTargets,
);
