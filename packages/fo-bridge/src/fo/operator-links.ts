import { hostLinks } from './links';
import { surveyTarget } from './survey-links';
import { myTasksRoute, taskBoardRoute, taskListBareAlias, taskListInboxAlias, taskListRoute } from './task-routes';
import { vocListTarget, vocTarget } from './voc-links';
import { clustersRoute, inboxRoute, triageRoute } from './voc-routes';

/**
 * The FeedbackOps paths the operator pages and the dashboard can reach: the three VOC tables, the Task board, list and 내 Task (with the two list aliases), 내 VOC and the survey menus.
 * Other routes stay unlinked (ADR-0071 decision 10); Task Requests and Milestones join in #763 p2, Findings in #762.
 */
export const operatorHostLinks = hostLinks(
  inboxRoute.target, triageRoute.target, clustersRoute.target,
  taskBoardRoute.target, taskListRoute.target, myTasksRoute.target, taskListInboxAlias.target, taskListBareAlias.target,
  vocTarget, vocListTarget, surveyTarget,
);
