import { sql } from 'drizzle-orm';
import type { Tx } from '../../../db/tx.js';
import { HttpError } from '../../../lib/errors.js';
import { type Viewer } from '../../log-knowledge/index.js';
import { projectVisibleSql, roundVisibleSql, lockRoundOwner } from './access-visibility.js';
import { validationIssueOccurrences } from '../../../db/schema/log-lifecycle.js';
import type { SampleSet } from '../domain/sample-set.js';

export function missing(): never { throw new HttpError('not_found.record', 'validation record not found'); }
export function invalid(path: string, code: string): never {
  throw new HttpError('validation.failed', 'validation record refused', { fields: [{ path: [path], code }] });
}
export interface IssueOwner { id: string; project_id: string; first_round_id: string }
export async function issueOwner(tx: Tx, viewer: Viewer, issueId: string): Promise<IssueOwner> {
  const result = await tx.execute(sql`select i.id, i.project_id, i.first_round_id from log_lifecycle.validation_issue i
    where i.workspace_id = ${viewer.workspaceId}::uuid and i.id = ${issueId}::uuid
    and ${projectVisibleSql(viewer, sql`i.project_id`)} and ${roundVisibleSql(viewer, sql`i.first_round_id`)}`);
  return result.rows[0] as unknown as IssueOwner | undefined ?? missing();
}
/** The shared project lock serialises all writers to its issues, including evidence cap checks. */
export async function lockIssueRound(tx: Tx, viewer: Viewer, projectId: string, roundId: string): Promise<SampleSet> {
  const project = await tx.execute(sql`select p.id from log_lifecycle.development_project p where p.workspace_id = ${viewer.workspaceId}::uuid
    and p.id = ${projectId}::uuid and ${projectVisibleSql(viewer, sql`p.id`)} for update`);
  if (!project.rows.length) missing();
  const round = await tx.execute(sql`select r.sample_set from log_lifecycle.validation_round r where r.workspace_id = ${viewer.workspaceId}::uuid
    and r.project_id = ${projectId}::uuid and r.id = ${roundId}::uuid and ${roundVisibleSql(viewer, sql`r.id`)} for update`);
  if (!round.rows.length || !await lockRoundOwner(tx, viewer, roundId)) missing();
  return (round.rows[0] as { sample_set: SampleSet }).sample_set;
}
export async function roundOwner(tx: Tx, viewer: Viewer, roundId: string): Promise<string> {
  const result = await tx.execute(sql`select r.project_id from log_lifecycle.validation_round r where r.workspace_id = ${viewer.workspaceId}::uuid
    and r.id = ${roundId}::uuid and ${roundVisibleSql(viewer, sql`r.id`)}`);
  return (result.rows[0] as { project_id: string } | undefined)?.project_id ?? missing();
}
export async function occurrenceOwner(tx: Tx, viewer: Viewer, occurrenceId: string) {
  const result = await tx.execute(sql`select o.id, o.issue_id, o.project_id, o.round_id from log_lifecycle.validation_issue_occurrence o
    where o.workspace_id = ${viewer.workspaceId}::uuid and o.id = ${occurrenceId}::uuid and ${roundVisibleSql(viewer, sql`o.round_id`)}`);
  const row = result.rows[0] as { id: string; issue_id: string; project_id: string; round_id: string } | undefined;
  if (!row) missing();
  await issueOwner(tx, viewer, row.issue_id);
  return row;
}
export async function occurrenceRequest(tx: Tx, viewer: Viewer, roundId: string, attemptId: string | null, resultId: string | null): Promise<string | null> {
  if (!attemptId) {
    if (resultId) invalid('attemptId', 'required');
    return null;
  }
  const result = await tx.execute(sql`select a.request_id from log_lifecycle.execution_attempt a join log_lifecycle.execution_request q
    on q.workspace_id = a.workspace_id and q.id = a.request_id where a.workspace_id = ${viewer.workspaceId}::uuid
    and a.id = ${attemptId}::uuid and q.round_id = ${roundId}::uuid and ${roundVisibleSql(viewer, sql`q.round_id`)}
    and (${resultId}::uuid is null or exists (select 1 from log_lifecycle.rule_result rr where rr.workspace_id = a.workspace_id and rr.attempt_id = a.id and rr.id = ${resultId}::uuid))`);
  return (result.rows[0] as { request_id: string } | undefined)?.request_id ?? invalid('attemptId', 'invalid_location');
}
export async function insertOccurrence(tx: Tx, viewer: Viewer, values: { issueId: string; projectId: string; roundId: string; requestId: string | null; attemptId: string | null; ruleResultId: string | null }) {
  const [added] = await tx.insert(validationIssueOccurrences).values({ ...values, workspaceId: viewer.workspaceId, linkerActorId: viewer.actorId, createdAt: sql`clock_timestamp()` }).onConflictDoNothing().returning({ id: validationIssueOccurrences.id });
  if (added) return { id: added.id, added: true };
  const result = await tx.execute(sql`select id from log_lifecycle.validation_issue_occurrence where workspace_id = ${viewer.workspaceId}::uuid
    and issue_id = ${values.issueId}::uuid and round_id = ${values.roundId}::uuid
    and attempt_id is not distinct from ${values.attemptId}::uuid and rule_result_id is not distinct from ${values.ruleResultId}::uuid`);
  return { id: (result.rows[0] as { id: string } | undefined)?.id ?? missing(), added: false };
}
export async function assertCorrection(tx: Tx, viewer: Viewer, kind: 'issue' | 'round' | 'event', targetId: string, correctionId: string | null, field?: string) {
  if (!correctionId) return;
  const table = kind === 'issue' ? sql`log_lifecycle.validation_issue_comment` : kind === 'round' ? sql`log_lifecycle.round_comment` : sql`log_lifecycle.validation_issue_event`;
  const target = kind === 'round' ? sql`round_id` : sql`issue_id`;
  const result = await tx.execute(sql`select id from ${table} where workspace_id = ${viewer.workspaceId}::uuid and ${target} = ${targetId}::uuid
    and id = ${correctionId}::uuid ${kind === 'event' ? sql`and field = ${field}` : sql``}`);
  if (!result.rows.length) invalid(kind === 'event' ? 'correctsEventId' : 'correctsCommentId', 'not_found');
}
