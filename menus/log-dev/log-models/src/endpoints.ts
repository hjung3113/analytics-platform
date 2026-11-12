/** logLifecycle menu-dispatch mirror. Stable IDs only; no sample locations or excerpts enter URL state. */
import { defineAction, defineEndpoint, menuPermission, type ActionSpec, type EndpointSpec } from '@ap/contracts';

export const PROJECT_MANAGE = menuPermission('lifecycle:project-manage');
export const ROUND_MANAGE = menuPermission('lifecycle:round-manage');
export const GATE_DECIDE = menuPermission('lifecycle:gate-decide');
/** Human validation records (#1808): explicit session-only grants; neither widens Round management or Source rights. */
export const ISSUE_CONTRIBUTE = menuPermission('lifecycle:issue-contribute');
export const ISSUE_LINK = menuPermission('lifecycle:issue-link');
export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
type Params = Record<string, unknown>;
const keys = (names: string[]) => Object.fromEntries(names.map(n => [n, true as const]));
const reads = {
  validationIssues: ['projectId', 'roundId', 'cursor', 'limit'], validationIssueDetail: ['issueId', 'cursor', 'limit'], validationIssueThread: ['issueId', 'cursor', 'limit'], validationIssueHistory: ['issueId', 'cursor', 'limit'], roundDiscussion: ['roundId', 'cursor', 'limit'],
  hierarchy: ['op', 'parentId', 'nodeId', 'query', 'cursor', 'limit'],
  models: ['q', 'page', 'pageSize', 'sorting', 'filters', 'includeClosedProjects'], projectDetail: ['projectId'], projectEvents: ['projectId', 'page', 'pageSize'], rounds: ['projectId'], roundDetail: ['roundId'], roundEvidence: ['roundId'],
  requests: ['page', 'pageSize', 'states', 'priority', 'immediate', 'roundId', 'modelId', 'from', 'to'], requestDetail: ['requestId'], ruleResults: ['attemptId', 'page', 'pageSize', 'results', 'required', 'sorting', 'opinionGrade'], excerpt: ['ruleResultId', 'evidenceIndex'], evidenceStates: ['ruleResultId'], queueStatus: [], opinionScale: [], opinions: ['attemptId', 'ruleResultId', 'itemKey', 'unlinked', 'page', 'pageSize'],
};
const queue = new Set(['requests', 'requestDetail', 'ruleResults', 'excerpt', 'evidenceStates', 'queueStatus', 'opinionScale', 'opinions']);
export const endpoints: Record<string, EndpointSpec<Params, unknown>> = Object.fromEntries(Object.entries(reads).map(([name, params]) => [name, defineEndpoint<Params, unknown>({ id: `logLifecycle.${name}`, menuId: queue.has(name) ? 'log-validation-requests' : 'log-models', permission: 'platform:view', requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false, paramKeys: keys(params) })]));
const actionInputs: Record<string, string[]> = {
  projectCreate: ['modelId', 'softwareId', 'kind', 'ownerActorId', 'targetDate'], projectSetStage: ['id', 'toStage', 'reason'], projectReopen: ['id', 'reason'], projectUpdate: ['id', 'ownerActorId', 'targetDate', 'softwareId'], roundOpen: ['projectId', 'sampleSet', 'note'], roundClose: ['id'], requestCreate: ['roundId', 'priority', 'immediate', 'engineProfileRef', 'maxAttempts'], requestCancel: ['id', 'reason'], gateDecide: ['roundId', 'targetStage', 'decision', 'reason', 'exception'],
};
export const actions: Record<string, ActionSpec<Params, Record<string, unknown>>> = Object.fromEntries(Object.entries(actionInputs).map(([name, input]) => [name, defineAction<Params, Record<string, unknown>>({ id: `logLifecycle.${name}`, menuId: name.startsWith('request') ? 'log-validation-requests' : 'log-models', permission: name === 'gateDecide' ? GATE_DECIDE : name.startsWith('project') ? PROJECT_MANAGE : ROUND_MANAGE, requiresScope: false, inputKeys: keys(input), concurrency: ['projectCreate', 'roundOpen', 'requestCreate'].includes(name) ? 'none' : 'version', invalidates: Object.values(endpoints).filter(e => e.id !== 'logLifecycle.excerpt' && e.menuId === (name.startsWith('request') ? 'log-validation-requests' : 'log-models')) })]));
/** Human validation record writes (#1808 N2): concurrency `none`, invalidating only the five discussion reads. */
const issueInputs: Record<string, string[]> = {
  validationIssueRegister: ['projectId', 'firstRoundId', 'title', 'body', 'expected', 'actual', 'repro'], validationIssueComment: ['issueId', 'body', 'correctsCommentId'], validationIssueCorrect: ['issueId', 'field', 'body', 'correctsEventId'],
  validationIssueLinkOccurrence: ['issueId', 'roundId', 'attemptId', 'ruleResultId'], validationIssueLinkEvidence: ['occurrenceId', 'refs'], roundDiscussionComment: ['roundId', 'body', 'correctsCommentId'],
};
const issueReads = ['validationIssues', 'validationIssueDetail', 'validationIssueThread', 'validationIssueHistory', 'roundDiscussion'].map(name => endpoints[name]!);
for (const [name, input] of Object.entries(issueInputs)) actions[name] = defineAction<Params, Record<string, unknown>>({ id: `logLifecycle.${name}`, menuId: 'log-models', permission: name.startsWith('validationIssueLink') ? ISSUE_LINK : ISSUE_CONTRIBUTE, requiresScope: false, inputKeys: keys(input), concurrency: 'none', invalidates: issueReads });
export const endpointSpecs = Object.values(endpoints);

export type { Model, Project, ProjectEvent, Round, RoundDetail, RequestRow, RequestDetail, RuleResult, Opinion, OpinionListRow, QueueStatus, GateDecision, CursorPage, ValidationIssueRow, ValidationIssueDetail, IssueOccurrence, DiscussionComment, IssueHistoryEvent } from '@ap/feature-screens/operator-screens/log-lifecycle';

