import { hostLinksCarrying } from './links';
import { surveyCarry, surveyOperatorTargets } from './survey-routes';
import { findingsRoute } from './finding-routes';
import { integrationOperatorTargets } from './integration-routes';
import { milestonesRoute, myTasksRoute, taskBoardRoute, taskListBareAlias, taskListInboxAlias, taskListRoute, taskRequestsRoute } from './task-routes';
import { vocListTarget, vocTarget } from './voc-links';
import { clustersRoute, inboxRoute, triageRoute } from './voc-routes';

/**
 * The FeedbackOps paths the operator pages and the dashboard can reach: the three VOC tables, the Findings table, the four 연동 tables (대시보드·Evidence·커버리지·엔티티 링크), the seven Task tables (Task Requests, board, Milestones, list, 내 Task and the two list aliases), 내 VOC and the survey menus (the reporter `설문` targets first, then the four Survey 관리 tables, #764 p1; `surveyCarry` adds the current list context to links between those menus).
 * Other routes stay unlinked (ADR-0071 decision 10), including `/admin/*` and `/admin/settings#coverage` (#764 p2).
 */
export const operatorHostLinks = hostLinksCarrying(
  surveyCarry,
  inboxRoute.target, triageRoute.target, clustersRoute.target, findingsRoute.target,
  taskRequestsRoute.target, taskBoardRoute.target, milestonesRoute.target, taskListRoute.target, myTasksRoute.target, taskListInboxAlias.target, taskListBareAlias.target,
  ...integrationOperatorTargets,
  vocTarget, vocListTarget,
  ...surveyOperatorTargets,
);
