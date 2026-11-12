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
import { issueOwner, occurrenceOwner, roundOwner, missing } from './repositories/validation-issue-write.js';
import { projectVisibleSql } from './repositories/access-visibility.js';
import { createValidationIssueService, lockValidationIssueTarget } from './validation-issue-service.js';

export const VALIDATION_ISSUE_PERMISSIONS = [
  { permission: 'lifecycle:issue-contribute', capability: 'lifecycle.issue.contribute' },
  { permission: 'lifecycle:issue-link', capability: 'lifecycle.issue.link' },
] as const;
const operations = {
  validationIssueRegister: 'create', validationIssueComment: 'commentIssue', validationIssueCorrect: 'correctField',
  validationIssueLinkOccurrence: 'linkOccurrence', validationIssueLinkEvidence: 'linkEvidence', roundDiscussionComment: 'commentRound',
} as const satisfies Record<string, ValidationIssueAction>;
const inputKeys: Record<ValidationIssueAction, string[]> = {
  create: ['projectId', 'firstRoundId', 'title', 'body', 'expected', 'actual', 'repro'],
  commentIssue: ['issueId', 'body', 'correctsCommentId'], correctField: ['issueId', 'field', 'body', 'correctsEventId'],
  linkOccurrence: ['issueId', 'roundId', 'attemptId', 'ruleResultId'], linkEvidence: ['occurrenceId', 'refs'], commentRound: ['roundId', 'body', 'correctsCommentId'],
};
/** Safe target lookup before the capability refusal, including replay: hidden ids are missing for every human. */
async function visibleTarget(tx: Tx, actor: PlatformActor, op: ValidationIssueAction, input: unknown) {
  const p = parseValidationIssueInput(op, input);
  if (!p.success) return;
  const v = p.data;
  const viewer = viewerOf(actor);
  if ('issueId' in v) await issueOwner(tx, viewer, v.issueId);
  if ('occurrenceId' in v) await occurrenceOwner(tx, viewer, v.occurrenceId);
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

export function validationIssueActions(deps: LogLifecycleDeps): MenuActionDeclaration[] {
  const service = createValidationIssueService(deps);
  return Object.entries(operations).map(([name, op]) => {
    const linking = op === 'linkOccurrence' || op === 'linkEvidence';
    const capability: Capability = linking ? 'lifecycle.issue.link' : 'lifecycle.issue.contribute';
    const allowed = (actor: PlatformActor, tx: Tx) => currentAuthContext().kind === 'session' && holdsMenuPermission(deps.checkService, actor, capability, { tx });
    return {
      spec: { id: `logLifecycle.${name}`, menuId: LOG_MODELS_MENU_ID, inputKeys: inputKeys[op], permission: linking ? 'lifecycle:issue-link' : 'lifecycle:issue-contribute', requiresScope: false, concurrency: 'none', invalidates: ['logLifecycle.validationIssues', 'logLifecycle.validationIssueDetail', 'logLifecycle.validationIssueThread', 'logLifecycle.validationIssueHistory', 'logLifecycle.roundDiscussion'] },
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
        catch (e) {
          if (e instanceof HttpError && e.code === 'validation.failed' && e.detail && 'fields' in e.detail) {
            throw new MenuActionInvalidError(e.detail.fields.map(f => ({ path: f.path.map(String), code: f.code })));
          }
          throw e;
        }
      },
    };
  });
}
