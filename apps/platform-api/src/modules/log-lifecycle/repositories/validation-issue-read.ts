import { type SQL, sql } from 'drizzle-orm';
import type { Tx } from '../../../db/tx.js';
import type { Viewer } from '../../log-knowledge/index.js';
import { projectVisibleSql, roundVisibleSql } from './access-visibility.js';

export interface IssueFilters { projectId?: string | undefined; roundId?: string | undefined; states?: readonly string[] | undefined }
export interface IssuePageKey { at: string; id: string }
export interface IssueListRow { id: string; projectId: string; firstRoundId: string; title: string; reporterActorId: string; createdAt: string; lastActivityAt: string; commentCount: number; occurrenceCount: number; roundCount: number; state: string; assigneeActorId: string | null }
export interface DiscussionRow { id: string; authorActorId: string; body: string; correctsCommentId: string | null; createdAt: string }
export interface IssueEventRow { id: string; kind: string; field: string; body: string; correctsEventId: string | null; actorId: string; createdAt: string }
export const issueVisibleSql = (viewer: Viewer, alias: SQL) => sql`${projectVisibleSql(viewer, sql`${alias}.project_id`)} and ${roundVisibleSql(viewer, sql`${alias}.first_round_id`)}`;

/** Visible issues of the project/Round filter at the snapshot, each with its state and assignee as of the snapshot (#1808 H3). */
const visibleIssuesSql = (viewer: Viewer, filters: IssueFilters, snapshot: string) => sql`visible_issues as (
    select i.*, coalesce(lt.to_state, 'reported') as state, lt.assignee_actor_id as assignee
    from log_lifecycle.validation_issue i
    left join lateral (select t.to_state, t.assignee_actor_id from log_lifecycle.validation_issue_transition t where t.workspace_id = i.workspace_id and t.issue_id = i.id
      and t.created_at <= ${snapshot}::timestamptz order by t.seq desc limit 1) lt on true
    where i.workspace_id = ${viewer.workspaceId}::uuid
    and ${issueVisibleSql(viewer, sql`i`)} and i.created_at <= ${snapshot}::timestamptz
    ${filters.projectId ? sql`and i.project_id = ${filters.projectId}::uuid` : sql``}
    ${filters.roundId ? sql`and (i.first_round_id = ${filters.roundId}::uuid or exists (select 1 from log_lifecycle.validation_issue_occurrence f where f.workspace_id = i.workspace_id and f.issue_id = i.id and f.round_id = ${filters.roundId}::uuid and f.created_at <= ${snapshot}::timestamptz and ${roundVisibleSql(viewer, sql`f.round_id`)}))` : sql``}
  )`;

/** Current ACL is evaluated in every statement, before counts and last-activity aggregation. */
export async function readIssueList(tx: Tx, viewer: Viewer, filters: IssueFilters, snapshot: string, after: IssuePageKey | null, limit: number): Promise<IssueListRow[]> {
  const result = await tx.execute(sql`with ${visibleIssuesSql(viewer, filters, snapshot)}, visible_occurrences as (
    select o.* from log_lifecycle.validation_issue_occurrence o join visible_issues i on i.workspace_id = o.workspace_id and i.id = o.issue_id
    where o.created_at <= ${snapshot}::timestamptz and ${roundVisibleSql(viewer, sql`o.round_id`)}
  ), activities as (
    select i.id as issue_id, i.created_at as at from visible_issues i
    union all select o.issue_id, o.created_at from visible_occurrences o
    union all select o.issue_id, e.created_at from log_lifecycle.validation_issue_evidence_ref e join visible_occurrences o on o.workspace_id = e.workspace_id and o.id = e.occurrence_id where e.created_at <= ${snapshot}::timestamptz
    union all select c.issue_id, c.created_at from log_lifecycle.validation_issue_comment c join visible_issues i on i.workspace_id = c.workspace_id and i.id = c.issue_id where c.created_at <= ${snapshot}::timestamptz
    union all select e.issue_id, e.created_at from log_lifecycle.validation_issue_event e join visible_issues i on i.workspace_id = e.workspace_id and i.id = e.issue_id where e.created_at <= ${snapshot}::timestamptz
    union all select t.issue_id, t.created_at from log_lifecycle.validation_issue_transition t join visible_issues i on i.workspace_id = t.workspace_id and i.id = t.issue_id where t.created_at <= ${snapshot}::timestamptz
  ), summaries as (
    select i.id, i.project_id as "projectId", i.first_round_id as "firstRoundId",
      coalesce((select e.body from log_lifecycle.validation_issue_event e where e.workspace_id = i.workspace_id and e.issue_id = i.id and e.field = 'title' and e.created_at <= ${snapshot}::timestamptz order by e.created_at desc, e.id desc limit 1), i.title) as title,
      i.reporter_actor_id as "reporterActorId", i.created_at::text as "createdAt", i.state, i.assignee as "assigneeActorId",
      (select max(a.at) from activities a where a.issue_id = i.id) as activity,
      (select count(*)::int from log_lifecycle.validation_issue_comment c where c.workspace_id = i.workspace_id and c.issue_id = i.id and c.created_at <= ${snapshot}::timestamptz) as "commentCount",
      (select count(*)::int from visible_occurrences o where o.issue_id = i.id) as "occurrenceCount",
      (select count(distinct o.round_id)::int from visible_occurrences o where o.issue_id = i.id) as "roundCount"
    from visible_issues i
  ) select id, "projectId", "firstRoundId", title, "reporterActorId", "createdAt", activity::text as "lastActivityAt", "commentCount", "occurrenceCount", "roundCount", state, "assigneeActorId"
    from summaries where true ${filters.states ? sql`and state in (${sql.join(filters.states.map(state => sql`${state}`), sql`, `)})` : sql``}
    ${after ? sql`and (activity, id) < (${after.at}::timestamptz, ${after.id}::uuid)` : sql``}
    order by activity desc, id desc limit ${limit}`);
  return result.rows as unknown as IssueListRow[];
}

/** Issue counts per state under the same visibility and project/Round filter (the state filter does not apply). */
export async function readIssueStateCounts(tx: Tx, viewer: Viewer, filters: IssueFilters, snapshot: string): Promise<{ state: string; count: number }[]> {
  const rows = await tx.execute(sql`with ${visibleIssuesSql(viewer, filters, snapshot)} select state, count(*)::int as count from visible_issues group by state order by state`);
  return rows.rows as unknown as { state: string; count: number }[];
}
export async function readIssueDetail(tx: Tx, viewer: Viewer, issueId: string) {
  const result = await tx.execute(sql`select i.id, i.project_id as "projectId", i.first_round_id as "firstRoundId", i.title, i.body, i.expected, i.actual, i.repro,
    i.reporter_actor_id as "reporterActorId", i.created_at::text as "createdAt"
    from log_lifecycle.validation_issue i where i.workspace_id = ${viewer.workspaceId}::uuid and i.id = ${issueId}::uuid and ${issueVisibleSql(viewer, sql`i`)}`);
  const row = result.rows[0] as { id: string; projectId: string; firstRoundId: string; title: string; body: string; expected: string | null; actual: string | null; repro: string | null; reporterActorId: string; createdAt: string } | undefined;
  if (!row) return null;
  const corrections = await tx.execute(sql`select distinct on (e.field) e.field, e.body from log_lifecycle.validation_issue_event e
    join log_lifecycle.validation_issue i on i.workspace_id = e.workspace_id and i.id = e.issue_id where e.workspace_id = ${viewer.workspaceId}::uuid
    and e.issue_id = ${issueId}::uuid and ${issueVisibleSql(viewer, sql`i`)} order by e.field, e.created_at desc, e.id desc`);
  for (const event of corrections.rows) {
    const field = event.field;
    if (field === 'title' || field === 'body' || field === 'expected' || field === 'actual' || field === 'repro') row[field] = event.body as string;
  }
  // #1808 H3: the current state is the last transition's `to_state`, or `reported` when there is none.
  const head = await tx.execute(sql`select ${transitionColumns(viewer)} from log_lifecycle.validation_issue_transition t
    where t.workspace_id = ${viewer.workspaceId}::uuid and t.issue_id = ${issueId}::uuid order by t.seq desc limit 1`);
  const lastTransition = (head.rows[0] as unknown as IssueTransitionRow | undefined) ?? null;
  const state = { state: lastTransition?.toState ?? 'reported', assigneeActorId: lastTransition?.assigneeActorId ?? null, lastTransition };
  // A concurrent revocation between the statements must not leave a cached original visible.
  const visible = await tx.execute(sql`select i.id from log_lifecycle.validation_issue i where i.workspace_id = ${viewer.workspaceId}::uuid and i.id = ${issueId}::uuid and ${issueVisibleSql(viewer, sql`i`)}`);
  return visible.rows.length ? { ...row, ...state } : null;
}
export type DiscussionTarget = { kind: 'issue' | 'round'; id: string };
export async function discussionVisible(tx: Tx, viewer: Viewer, target: DiscussionTarget): Promise<boolean> {
  const result = target.kind === 'issue'
    ? await tx.execute(sql`select i.id from log_lifecycle.validation_issue i where i.workspace_id = ${viewer.workspaceId}::uuid and i.id = ${target.id}::uuid and ${issueVisibleSql(viewer, sql`i`)}`)
    : await tx.execute(sql`select r.id from log_lifecycle.validation_round r where r.workspace_id = ${viewer.workspaceId}::uuid and r.id = ${target.id}::uuid and ${roundVisibleSql(viewer, sql`r.id`)}`);
  return result.rows.length > 0;
}
export async function readDiscussion(tx: Tx, viewer: Viewer, target: DiscussionTarget, snapshot: string, after: IssuePageKey | null, limit: number): Promise<DiscussionRow[]> {
  const table = target.kind === 'issue' ? sql`log_lifecycle.validation_issue_comment` : sql`log_lifecycle.round_comment`;
  const ownership = target.kind === 'issue'
    ? sql`exists (select 1 from log_lifecycle.validation_issue i where i.workspace_id = c.workspace_id and i.id = c.issue_id and ${issueVisibleSql(viewer, sql`i`)}) and c.issue_id = ${target.id}::uuid`
    : sql`${roundVisibleSql(viewer, sql`c.round_id`)} and c.round_id = ${target.id}::uuid`;
  const result = await tx.execute(sql`select c.id, c.author_actor_id as "authorActorId", c.body, c.corrects_comment_id as "correctsCommentId", c.created_at::text as "createdAt"
    from ${table} c where c.workspace_id = ${viewer.workspaceId}::uuid and ${ownership} and c.created_at <= ${snapshot}::timestamptz
    ${after ? sql`and (c.created_at, c.id) > (${after.at}::timestamptz, ${after.id}::uuid)` : sql``}
    order by c.created_at, c.id limit ${limit}`);
  return result.rows as unknown as DiscussionRow[];
}
export async function readIssueHistory(tx: Tx, viewer: Viewer, issueId: string, snapshot: string, after: IssuePageKey | null, limit: number): Promise<IssueEventRow[]> {
  const result = await tx.execute(sql`select e.id, e.kind, e.field, e.body, e.corrects_event_id as "correctsEventId", e.actor_id as "actorId", e.created_at::text as "createdAt"
    from log_lifecycle.validation_issue_event e join log_lifecycle.validation_issue i on i.workspace_id = e.workspace_id and i.id = e.issue_id
    where e.workspace_id = ${viewer.workspaceId}::uuid and e.issue_id = ${issueId}::uuid and ${issueVisibleSql(viewer, sql`i`)}
    and e.created_at <= ${snapshot}::timestamptz ${after ? sql`and (e.created_at, e.id) > (${after.at}::timestamptz, ${after.id}::uuid)` : sql``}
    order by e.created_at, e.id limit ${limit}`);
  return result.rows as unknown as IssueEventRow[];
}

export interface IssueTransitionRow { id: string; seq: number; fromState: string; toState: string; reason: string | null; assigneeActorId: string | null; basisCommentId: string | null; occurrenceId: string | null; duplicateOfIssueId: string | null; actorId: string; createdAt: string }
/** Cited occurrences and duplicate issues the viewer cannot see now are returned as null, never as ids. */
const transitionColumns = (viewer: Viewer) => sql`t.id, t.seq, t.from_state as "fromState", t.to_state as "toState", t.reason, t.assignee_actor_id as "assigneeActorId",
    t.basis_comment_id as "basisCommentId",
    (select o.id from log_lifecycle.validation_issue_occurrence o where o.workspace_id = t.workspace_id and o.id = t.occurrence_id and ${roundVisibleSql(viewer, sql`o.round_id`)}) as "occurrenceId",
    (select d.id from log_lifecycle.validation_issue d where d.workspace_id = t.workspace_id and d.id = t.duplicate_of_issue_id and ${issueVisibleSql(viewer, sql`d`)}) as "duplicateOfIssueId",
    t.actor_id as "actorId", t.created_at::text as "createdAt"`;
/** Transitions keyset by seq; the cursor's id names the last row seen (an unknown id ends the walk). */
export async function readIssueTransitions(tx: Tx, viewer: Viewer, issueId: string, snapshot: string, after: IssuePageKey | null, limit: number): Promise<IssueTransitionRow[]> {
  const rows = await tx.execute(sql`select ${transitionColumns(viewer)}
    from log_lifecycle.validation_issue_transition t join log_lifecycle.validation_issue i on i.workspace_id = t.workspace_id and i.id = t.issue_id
    where t.workspace_id = ${viewer.workspaceId}::uuid and t.issue_id = ${issueId}::uuid and ${issueVisibleSql(viewer, sql`i`)}
    and t.created_at <= ${snapshot}::timestamptz
    ${after ? sql`and t.seq > coalesce((select p.seq from log_lifecycle.validation_issue_transition p where p.workspace_id = t.workspace_id and p.issue_id = t.issue_id and p.id = ${after.id}::uuid), 2147483647)` : sql``}
    order by t.seq limit ${limit}`);
  return rows.rows as unknown as IssueTransitionRow[];
}

export interface IssueOccurrenceRow { id: string; roundId: string; attemptId: string | null; ruleResultId: string | null; linkerActorId: string; createdAt: string; evidence: { fileRef: string; line: number; fileSha256: string }[] }
export async function readIssueOccurrences(tx: Tx, viewer: Viewer, issueId: string, snapshot: string, after: IssuePageKey | null, limit: number): Promise<IssueOccurrenceRow[]> {
  const result = await tx.execute(sql`select o.id, o.round_id as "roundId", o.attempt_id as "attemptId", o.rule_result_id as "ruleResultId",
    o.linker_actor_id as "linkerActorId", o.created_at::text as "createdAt",
    coalesce((select jsonb_agg(jsonb_build_object('fileRef', e.file_ref, 'line', e.line, 'fileSha256', e.file_sha256) order by e.created_at, e.id)
      from log_lifecycle.validation_issue_evidence_ref e where e.workspace_id = o.workspace_id and e.occurrence_id = o.id and e.created_at <= ${snapshot}::timestamptz), '[]'::jsonb) as evidence
    from log_lifecycle.validation_issue_occurrence o join log_lifecycle.validation_issue i on i.workspace_id = o.workspace_id and i.id = o.issue_id
    where o.workspace_id = ${viewer.workspaceId}::uuid and o.issue_id = ${issueId}::uuid and ${issueVisibleSql(viewer, sql`i`)} and ${roundVisibleSql(viewer, sql`o.round_id`)}
    and o.created_at <= ${snapshot}::timestamptz ${after ? sql`and (o.created_at, o.id) > (${after.at}::timestamptz, ${after.id}::uuid)` : sql``}
    order by o.created_at, o.id limit ${limit}`);
  return result.rows as unknown as IssueOccurrenceRow[];
}
