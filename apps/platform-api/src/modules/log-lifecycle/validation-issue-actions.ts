import type { Capability } from '@ap/feature-shared';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/tx.js';
import { currentAuthContext } from '../../lib/auth-context.js';
import { HttpError } from '../../lib/errors.js';
import { viewerOf } from '../log-knowledge/index.js';
import { MenuActionForbiddenError, MenuActionInvalidError, type MenuActionDeclaration } from '../menu-dispatch/types.js';
import { holdsMenuPermission, type PlatformActor } from '../platform-port/permissions.js';
import type { LogLifecycleDeps } from './deps.js';
import { parseValidationIssueInput, type ValidationIssueAction } from './domain/validation-issue-input.js';
import { LOG_MODELS_MENU_ID } from './menu.js';
import { isIssueState, transitionPolicy } from './domain/validation-issue-states.js';
import { actorIsHuman } from './repositories/gate.js';
import { issueOwner, lastTransition, occurrenceOwner, roundOwner, missing } from './repositories/validation-issue-write.js';
import { projectVisibleSql } from './repositories/access-visibility.js';
import { createValidationIssueService, lockValidationIssueTarget } from './validation-issue-service.js';

export const VALIDATION_ISSUE_PERMISSIONS = [
  { permission: 'lifecycle:issue-contribute', capability: 'lifecycle.issue.contribute' },
  { permission: 'lifecycle:issue-link', capability: 'lifecycle.issue.link' },
  { permission: 'lifecycle:issue-triage', capability: 'lifecycle.issue.triage' },
] as const;
const INVALIDATES = ['logLifecycle.validationIssues', 'logLifecycle.validationIssueDetail', 'logLifecycle.validationIssueThread', 'logLifecycle.validationIssueHistory', 'logLifecycle.roundDiscussion'];
const operations = {
  validationIssueRegister: 'create', validationIssueComment: 'commentIssue', validationIssueCorrect: 'correctField',
  validationIssueLinkOccurrence: 'linkOccurrence', validationIssueLinkEvidence: 'linkEvidence', roundDiscussionComment: 'commentRound',
} as const satisfies Record<string, ValidationIssueAction>;
const inputKeys: Record<ValidationIssueAction, string[]> = {
  create: ['projectId', 'firstRoundId', 'title', 'body', 'expected', 'actual', 'repro'],
  commentIssue: ['issueId', 'body', 'correctsCommentId'], correctField: ['issueId', 'field', 'body', 'correctsEventId'],
  linkOccurrence: ['issueId', 'roundId', 'attemptId', 'ruleResultId'], linkEvidence: ['occurrenceId', 'refs'], commentRound: ['roundId', 'body', 'correctsCommentId'],
  changeState: ['issueId', 'toState', 'reason', 'assigneeActorId', 'basisCommentId', 'occurrenceId', 'duplicateOfIssueId'],
};
/** Safe target lookup before the capability refusal, including replay: hidden ids are missing for every human. */
async function visibleTarget(tx: Tx, actor: PlatformActor, op: ValidationIssueAction, input: unknown) {
  const p = parseValidationIssueInput(op, input);
  if (!p.success) return;
  const v = p.data;
  const viewer = viewerOf(actor);
  if ('issueId' in v) await issueOwner(tx, viewer, v.issueId);
  if ('occurrenceId' in v && v.occurrenceId) await occurrenceOwner(tx, viewer, v.occurrenceId);
  if ('roundId' in v) await roundOwner(tx, viewer, v.roundId);
  if ('firstRoundId' in v) {
    if (await roundOwner(tx, viewer, v.firstRoundId) !== v.projectId.toLowerCase()) missing();
    const result = await tx.execute(sql`select ${projectVisibleSql(viewer, sql`${v.projectId}::uuid`)} as visible`);
    if (result.rows[0]?.visible !== true) missing();
  }
}
/** Append-only correction grants apply to one's own text, never another reporter's or author's. */
async function ownCorrection(tx: Tx, actor: PlatformActor, op: ValidationIssueAction, input: unknown) {
  const p = parseValidationIssueInput(op, input);
  if (!p.success) return;
  const v = p.data;
  let owner: unknown;
  if ('field' in v) {
    owner = (await tx.execute(sql`select reporter_actor_id as owner from log_lifecycle.validation_issue where workspace_id=${actor.workspace_id}::uuid and id=${v.issueId}::uuid`)).rows[0]?.owner;
    if (owner !== actor.actor_id) throw new MenuActionForbiddenError();
  }
  if ('correctsCommentId' in v && v.correctsCommentId) {
    const table = 'issueId' in v ? sql`log_lifecycle.validation_issue_comment` : sql`log_lifecycle.round_comment`;
    const target = 'issueId' in v ? sql`issue_id=${v.issueId}::uuid` : sql`round_id=${v.roundId}::uuid`;
    owner = (await tx.execute(sql`select author_actor_id as owner from ${table} where workspace_id=${actor.workspace_id}::uuid and id=${v.correctsCommentId}::uuid and ${target}`)).rows[0]?.owner;
    // Let the storage service return its existing safe validation error for invalid provenance.
    if (owner && owner !== actor.actor_id) throw new MenuActionForbiddenError();
  }
}

const notFound = (e: unknown) => e instanceof HttpError && e.code === 'not_found.record';
function fieldErrors(e: unknown): never {
  if (e instanceof HttpError && e.code === 'validation.failed' && e.detail && 'fields' in e.detail) {
    throw new MenuActionInvalidError(e.detail.fields.map(f => ({ path: f.path.map(String), code: f.code })));
  }
  throw e;
}

/** #1808 H3: the state change. Rights come from `transitionPolicy` only (triage; waived adds the Gate right and a human). */
function changeStateAction(deps: LogLifecycleDeps, service: ReturnType<typeof createValidationIssueService>): MenuActionDeclaration {
  // An unknown target state is judged with the triage rule; `validate` refuses it right after.
  const allowed = async (actor: PlatformActor, tx: Tx, input: unknown) => {
    if (currentAuthContext().kind !== 'session') return false;
    const to = (input as { toState?: unknown } | undefined)?.toState;
    const policy = transitionPolicy(isIssueState(to) ? to : 'investigating');
    for (const capability of policy.capabilities) if (!await holdsMenuPermission(deps.checkService, actor, capability, { tx })) return false;
    return !policy.humanOnly || actorIsHuman(tx, actor.workspace_id, actor.actor_id);
  };
  return {
    spec: { id: 'logLifecycle.validationIssueChangeState', menuId: LOG_MODELS_MENU_ID, inputKeys: inputKeys.changeState, permission: 'lifecycle:issue-triage', requiresScope: false, concurrency: 'version', invalidates: INVALIDATES },
    async authorize(actor, tx, input) {
      // Every token is refused before any statement.
      if (currentAuthContext().kind !== 'session') return false;
      await visibleTarget(tx, actor, 'changeState', input);
      return allowed(actor, tx, input);
    },
    validate(input) {
      const p = parseValidationIssueInput('changeState', input);
      return p.success ? [] : p.error.issues.map(e => ({ path: e.path.map(String), code: e.code === 'custom' ? e.message : 'malformed' }));
    },
    async canReplay(tx, actor, input) {
      try { await lockValidationIssueTarget(tx, viewerOf(actor), 'changeState', input); return true; }
      catch (e) { if (notFound(e)) return false; throw e; }
    },
    // The version is the issue's last transition seq ("0" before the first one); a stale one answers `conflict`.
    async currentVersion(tx, actor, input) {
      const p = parseValidationIssueInput('changeState', input);
      if (!p.success) return null;
      try { await lockValidationIssueTarget(tx, viewerOf(actor), 'changeState', input); }
      catch (e) { if (notFound(e)) return null; throw e; }
      return String((await lastTransition(tx, actor.workspace_id, p.data.issueId))?.seq ?? 0);
    },
    async handle(tx, actor, input) {
      await lockValidationIssueTarget(tx, viewerOf(actor), 'changeState', input);
      if (!await allowed(actor, tx, input)) throw new MenuActionForbiddenError();
      try {
        const data = await service.handle(tx, actor, 'changeState', input);
        return { data, version: String(data.seq) };
      } catch (e) { return fieldErrors(e); }
    },
  };
}

export function validationIssueActions(deps: LogLifecycleDeps): MenuActionDeclaration[] {
  const service = createValidationIssueService(deps);
  return Object.entries(operations).map(([name, op]): MenuActionDeclaration => {
    const linking = op === 'linkOccurrence' || op === 'linkEvidence';
    const capability: Capability = linking ? 'lifecycle.issue.link' : 'lifecycle.issue.contribute';
    const allowed = (actor: PlatformActor, tx: Tx) => currentAuthContext().kind === 'session' && holdsMenuPermission(deps.checkService, actor, capability, { tx });
    return {
      spec: { id: `logLifecycle.${name}`, menuId: LOG_MODELS_MENU_ID, inputKeys: inputKeys[op], permission: linking ? 'lifecycle:issue-link' : 'lifecycle:issue-contribute', requiresScope: false, concurrency: 'none', invalidates: INVALIDATES },
      async authorize(actor, tx, input) {
        if (currentAuthContext().kind !== 'session') return false;
        await visibleTarget(tx, actor, op, input);
        return allowed(actor, tx);
      },
      validate(input) {
        const p = parseValidationIssueInput(op, input);
        return p.success ? [] : p.error.issues.map(e => ({ path: e.path.map(String), code: e.code === 'custom' ? e.message : 'malformed' }));
      },
      async canReplay(tx, actor, input) {
        try { await lockValidationIssueTarget(tx, viewerOf(actor), op, input); await ownCorrection(tx, actor, op, input); return true; }
        catch (e) { if (e instanceof HttpError && e.code === 'not_found.record') return false; throw e; }
      },
      async handle(tx, actor, input) {
        // Stabilize project -> Round -> owner ACL before the last permission judgment.
        await lockValidationIssueTarget(tx, viewerOf(actor), op, input);
        if (!await allowed(actor, tx)) throw new MenuActionForbiddenError();
        await ownCorrection(tx, actor, op, input);
        try { return { data: await service.handle(tx, actor, op, input), version: null }; }
        catch (e) { return fieldErrors(e); }
      },
    };
  }).concat(changeStateAction(deps, service));
}
