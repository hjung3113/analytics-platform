// Read side of the log lifecycle (#1444 c): `log_lifecycle.*` tables plus a direct read join on `knowledge.*` for the
// model list (documented in 02 §Approved cross-module surfaces; writes validate through the log-knowledge port). Every
// statement is scoped to the session's workspace. Nothing here writes.

import { type SQL, and, asc, count, desc, eq, exists, ilike, inArray, isNotNull, isNull, like, not, notInArray, or, sql } from 'drizzle-orm';
import { type AnyPgColumn, alias } from 'drizzle-orm/pg-core';

import { actors } from '../../../db/schema/core.js';
import { equipmentModels, modelProcesses, processCategories, softwareVersions, vendors } from '../../../db/schema/knowledge.js';
import { developmentEvents, developmentProjects, roundEvidenceRefs, validationRounds } from '../../../db/schema/log-lifecycle.js';
import type { Tx } from '../../../db/tx.js';
import type { FilterCondition } from '../../../lib/list-params/catalog-filters.js';
import type { ListQuery, Page } from '../../../lib/list-params/types.js';
import { escapeLikePattern } from '../../../lib/sql-like.js';
import { type Viewer, ref, visibleModelSql, visibleSoftwareSql, toCodeKey } from '../../log-knowledge/index.js';
import type { EventQuery } from '../domain/lifecycle-params.js';
import { canSetStage, reopenTarget, STAGES } from '../domain/stage-transitions.js';
import { stageBeforeLastCancel } from './lifecycle-write.js';

import { projectVisibleSql, roundVisibleSql } from './access-visibility.js';

const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

const p = developmentProjects;
const r = validationRounds;
const m = equipmentModels;

export interface ModelRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  version: string;
  vendorId: string;
  vendorName: string;
  processes: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
  validation: string;
  pendingRequests: number;
  gateDecision: string | null;
  /** Open project, or latest closed project when includeClosedProjects is opted into; null = none. */
  project: {
    projectId: string;
    stage: string;
    kind: string;
    ownerActorId: string;
    latestRound: { id: string; seq: number; status: string } | null;
  } | null;
}

const order = (expr: SQL | AnyPgColumn, descending: boolean): SQL => (descending ? desc(expr) : asc(expr));

function columnFilter(column: AnyPgColumn, condition: FilterCondition | undefined, as: (v: string) => unknown = (v) => v): SQL | undefined {
  if (!condition) return undefined;
  const values = condition.values.map(as);
  return condition.op === 'notIn' ? notInArray(column, values) : inArray(column, values);
}

/** Stage of the selected project (open by default). Negative operators exclude models without one (ADR-0105). */
function stageFilter(condition: FilterCondition | undefined): SQL | undefined {
  if (!condition) return undefined;
  switch (condition.op) {
    case 'in':
      return inArray(p.stage, condition.values);
    case 'notIn':
      return and(isNotNull(p.id), notInArray(p.stage, condition.values));
    case 'isEmpty':
      return isNull(p.id);
    default:
      return isNotNull(p.id);
  }
}

function processFilter(tx: Tx, condition: FilterCondition | undefined): SQL | undefined {
  if (!condition) return undefined;
  const mapped = (processIds?: readonly string[]) =>
    exists(
      tx
        .select({ one: sql`1` })
        .from(modelProcesses)
        .where(
          and(
            eq(modelProcesses.workspaceId, m.workspaceId),
            eq(modelProcesses.modelId, m.id),
            processIds ? inArray(modelProcesses.processId, [...processIds]) : undefined,
          ),
        ),
    );
  switch (condition.op) {
    case 'in':
      return mapped(condition.values);
    case 'notIn':
      return and(mapped(), not(mapped(condition.values)));
    case 'isEmpty':
      return not(mapped());
    default:
      return mapped();
  }
}

function textFilter(q: string | null): SQL | undefined {
  if (q === null) return undefined;
  const key = toCodeKey(q);
  if (key === '' && q.trim() === '') return undefined;
  return or(like(m.codeKey, `${escapeLikePattern(key)}%`), ilike(m.name, `%${escapeLikePattern(q.trim())}%`));
}

/** Every knowledge model as a base row with its open project and that project's latest round. */
export async function listModels(tx: Tx, q: ListQuery & { includeClosedProjects?: boolean }, viewer: Viewer): Promise<Page<ModelRow>> {
  // The latest Round alone supplies validation; the human Gate remains a separate axis.
  const latestRoundId = sql`(select lr.id from log_lifecycle.validation_round lr where lr.workspace_id = ${m.workspaceId} and lr.project_id = ${p.id} and ${roundVisibleSql(viewer, sql`lr.id`)} order by lr.seq desc limit 1)`;
  const latestRequestState = sql`(select eq.state from log_lifecycle.execution_request eq where eq.workspace_id = ${m.workspaceId} and eq.round_id = ${latestRoundId} order by eq.created_at desc, eq.id desc limit 1)`;
  const latestVerdict = sql`(select ea.verdict from log_lifecycle.execution_attempt ea join log_lifecycle.execution_request eq on eq.workspace_id = ea.workspace_id and eq.id = ea.request_id where eq.workspace_id = ${m.workspaceId} and eq.round_id = ${latestRoundId} order by ea.started_at desc, ea.id desc limit 1)`;
  const validation = sql<string>`case when ${latestRequestState} in ('queued','claimed') then ${latestRequestState} else coalesce(${latestVerdict}, 'none') end`;
  const pendingRequests = sql<number>`(select count(*)::int from log_lifecycle.execution_request eq join log_lifecycle.validation_round lr on lr.workspace_id = eq.workspace_id and lr.id = eq.round_id where eq.workspace_id = ${m.workspaceId} and lr.project_id = ${p.id} and ${roundVisibleSql(viewer, sql`lr.id`)} and eq.state in ('queued','claimed'))`;
  const gateDecision = sql<string | null>`(select gd.decision from log_lifecycle.gate_decision gd where gd.workspace_id = ${m.workspaceId} and gd.round_id = ${latestRoundId} order by gd.at desc, gd.id desc limit 1)`;

  const where = and(
    eq(m.workspaceId, q.workspaceId),
    visibleModelSql(viewer, ref(m.id)),
    columnFilter(m.active, q.conditions.active, (v) => v === 'true'),
    columnFilter(m.id, q.conditions.id),
    columnFilter(m.vendorId, q.conditions.vendorId),
    processFilter(tx, q.conditions.processes),
    stageFilter(q.conditions.stage),
    textFilter(q.q),
    q.conditions.validation ? (q.conditions.validation.op === 'notIn' ? notInArray(validation, q.conditions.validation.values) : inArray(validation, q.conditions.validation.values)) : undefined,
  );
  const projectChoice = q.includeClosedProjects
    ? eq(p.id, sql`(select dp.id from ${p} dp where dp.workspace_id = ${m.workspaceId} and dp.model_id = ${m.id} and ${projectVisibleSql(viewer, sql`dp.id`)} order by (dp.stage not in ('completed','cancelled')) desc, dp.created_at desc, dp.id desc limit 1)`)
    : sql`${p.stage} not in ('completed','cancelled')`;
  const round = (column: string) =>
    sql`(select lr.${sql.raw(column)} from ${r} lr where lr.workspace_id = ${m.workspaceId} and lr.project_id = ${p.id} and ${roundVisibleSql(viewer, sql`lr.id`)} order by lr.seq desc limit 1)`;
  const softwareCount = sql<number>`(select count(*)::int from ${softwareVersions} s where s.workspace_id = ${m.workspaceId} and s.model_id = ${m.id} and s.active and ${visibleSoftwareSql(viewer, sql`s.id`)})`;
  const sortable: Record<string, SQL | AnyPgColumn> = {
    code: m.codeKey,
    name: m.name,
    vendorName: vendors.name,
    active: m.active,
    softwareCount,
    stage: p.stage,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
  const rows = await tx
    .select({
      row: m,
      validation, pendingRequests, gateDecision,
      vendorName: vendors.name,
      project: p,
      roundId: round('id'),
      roundSeq: round('seq'),
      roundStatus: round('status'),
    })
    .from(m)
    .innerJoin(vendors, and(eq(vendors.workspaceId, m.workspaceId), eq(vendors.id, m.vendorId)))
    .leftJoin(
      p,
      and(eq(p.workspaceId, m.workspaceId), eq(p.modelId, m.id), projectVisibleSql(viewer, ref(p.id)), projectChoice),
    )
    .where(where)
    // `id` makes every order total, so a page never repeats a row.
    .orderBy(...q.sorting.map((s) => order(sortable[s.id] as SQL | AnyPgColumn, s.desc)), asc(m.id))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx
    .select({ n: count() })
    .from(m)
    .innerJoin(vendors, and(eq(vendors.workspaceId, m.workspaceId), eq(vendors.id, m.vendorId)))
    .leftJoin(
      p,
      and(eq(p.workspaceId, m.workspaceId), eq(p.modelId, m.id), projectVisibleSql(viewer, ref(p.id)), projectChoice),
    )
    .where(where);
  const ids = rows.map((x) => x.row.id);
  const mapped =
    ids.length === 0
      ? []
      : await tx
          .select({ modelId: modelProcesses.modelId, id: processCategories.id, name: processCategories.name })
          .from(modelProcesses)
          .innerJoin(
            processCategories,
            and(eq(processCategories.workspaceId, modelProcesses.workspaceId), eq(processCategories.id, modelProcesses.processId)),
          )
          .where(and(eq(modelProcesses.workspaceId, q.workspaceId), inArray(modelProcesses.modelId, ids)))
          .orderBy(asc(processCategories.name), asc(processCategories.id));
  return {
    total: Number(totalRow?.n ?? 0),
    rows: rows.map(({ row, vendorName, project, roundId, roundSeq, roundStatus, validation, pendingRequests, gateDecision }) => ({
      id: row.id,
      validation, pendingRequests: Number(pendingRequests), gateDecision,
      code: row.code,
      name: row.name,
      active: row.active,
      version: String(row.rowVersion),
      vendorId: row.vendorId,
      vendorName,
      processes: mapped.filter((x) => x.modelId === row.id).map(({ id, name }) => ({ id, name })),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      project: project
        ? {
            projectId: project.id,
            stage: project.stage,
            kind: project.kind,
            ownerActorId: project.ownerActorId,
            latestRound:
              roundId === null || roundId === undefined
                ? null
                : { id: String(roundId), seq: Number(roundSeq), status: String(roundStatus) },
          }
        : null,
    })),
  };
}

export interface ProjectDetail {
  id: string;
  modelId: string;
  model: { code: string; name: string; vendorName: string } | null;
  softwareId: string | null;
  softwareLabel: string | null;
  kind: string;
  stage: string;
  owner: { id: string; displayName: string };
  targetDate: string | null;
  /** What `projectSetStage` accepts now (never `completed`: that is the Gate's) and what `projectReopen` would restore. */
  nextStages: string[];
  reopenTo: string | null;
  openRound: { id: string; seq: number } | null;
  version: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** One project; null when it does not exist in the workspace. */
export async function getProjectDetail(tx: Tx, workspaceId: string, projectId: string, viewer: Viewer): Promise<ProjectDetail | null> {
  const owner = alias(actors, 'owner');
  const [found] = await tx
    .select({ project: p, ownerName: owner.displayName, code: m.code, name: m.name, vendorName: vendors.name, softwareLabel: sql<string | null>`(select s.version_label from ${softwareVersions} s where s.workspace_id = ${p.workspaceId} and s.id = ${p.softwareId})` })
    .from(p)
    .leftJoin(owner, and(eq(owner.id, p.ownerActorId), eq(owner.workspaceId, p.workspaceId)))
    .leftJoin(m, and(eq(m.workspaceId, p.workspaceId), eq(m.id, p.modelId)))
    .leftJoin(vendors, and(eq(vendors.workspaceId, m.workspaceId), eq(vendors.id, m.vendorId)))
    .where(and(eq(p.workspaceId, workspaceId), eq(p.id, projectId), projectVisibleSql(viewer, ref(p.id))))
    .limit(1);
  if (!found) return null;
  const x = found.project;
  const [open] = await tx
    .select({ id: r.id, seq: r.seq })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.projectId, x.id), eq(r.status, 'open'), roundVisibleSql(viewer, ref(r.id))))
    .limit(1);
  const before = x.stage === 'cancelled' ? await stageBeforeLastCancel(tx, workspaceId, x.id) : null;
  return {
    id: x.id,
    modelId: x.modelId,
    model: found.code === null || found.name === null ? null : { code: found.code, name: found.name, vendorName: found.vendorName ?? '' },
    softwareId: x.softwareId,
    softwareLabel: found.softwareLabel,
    kind: x.kind,
    stage: x.stage,
    owner: { id: x.ownerActorId, displayName: found.ownerName ?? '' },
    targetDate: x.targetDate,
    nextStages: STAGES.filter((to) => canSetStage(x.stage, to) === 'ok'),
    reopenTo: reopenTarget(x.stage, before),
    openRound: open ?? null,
    version: String(x.rowVersion),
    createdBy: x.createdBy,
    createdAt: iso(x.createdAt),
    updatedBy: x.updatedBy,
    updatedAt: iso(x.updatedAt),
  };
}

export interface ProjectEventRow {
  id: string;
  seq: number;
  kind: string;
  actor: { id: string; displayName: string };
  at: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** The history of one project, newest first (`seq desc`). */
export async function listProjectEvents(tx: Tx, workspaceId: string, q: EventQuery, viewer: Viewer): Promise<Page<ProjectEventRow>> {
  const e = developmentEvents;
  const actor = alias(actors, 'event_actor');
  const where = and(eq(e.workspaceId, workspaceId), eq(e.projectId, q.projectId), projectVisibleSql(viewer, ref(e.projectId)),
    sql`((${e.before}->>'softwareId') is null or ${visibleSoftwareSql(viewer, sql`(${ref(e.before)}->>'softwareId')::uuid`)})`,
    sql`((${e.after}->>'softwareId') is null or ${visibleSoftwareSql(viewer, sql`(${ref(e.after)}->>'softwareId')::uuid`)})`);
  const rows = await tx
    .select({ event: e, actorName: actor.displayName })
    .from(e)
    .leftJoin(actor, and(eq(actor.id, e.actorId), eq(actor.workspaceId, e.workspaceId)))
    .where(where)
    .orderBy(desc(e.seq))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx.select({ n: count() }).from(e).where(where);
  return {
    total: Number(totalRow?.n ?? 0),
    rows: rows.map(({ event, actorName }) => ({
      id: event.id,
      seq: event.seq,
      kind: event.kind,
      actor: { id: event.actorId, displayName: actorName ?? '' },
      at: iso(event.at),
      before: event.before,
      after: event.after,
      reason: event.reason,
    })),
  };
}

export interface RoundSummary {
  validation?: string;
  gateDecision?: string | null;
  id: string;
  projectId: string;
  seq: number;
  stage: string;
  status: string;
  sampleCount: number;
  sampleManifestDigest: string;
  specPin: unknown;
  note: string | null;
  version: string;
  createdBy: string;
  createdAt: string;
  closedBy: string | null;
  closedAt: string | null;
}
/** An evidence location handed to a round (#1474): a body-free pointer with the status the round gave it. */
export interface RoundEvidenceRefRow {
  seq: number;
  fileRef: string;
  line: number;
  fileSha256: string;
  note: string | null;
  status: string;
  originKind: string;
  originId: string;
  handedOffBy: string;
  at: string;
}
export interface RoundDetail extends Omit<RoundSummary, 'sampleCount'> {
  ownerModelId: string | null;
  ownerSoftwareId: string | null;
  /** Files in the user's order (`order` 1..n) and the owner of the source. */
  sampleSet: { files: { fileRef: string; order: number; sha256: string }[]; sourceOwner: string };
  /** Evidence locations handed to this round, newest first (a round holds at most 1000). */
  evidenceRefs: RoundEvidenceRefRow[];
}

type RoundDbRow = typeof validationRounds.$inferSelect;
const filesOf = (row: RoundDbRow) => {
  const set = row.sampleSet as { files?: { fileRef: string; order: number; sha256: string }[]; sourceOwner?: string };
  return { files: [...(set.files ?? [])].sort((a, b) => a.order - b.order), sourceOwner: set.sourceOwner ?? '' };
};
const baseRound = (row: RoundDbRow) => ({
  id: row.id,
  projectId: row.projectId,
  seq: row.seq,
  stage: row.stage,
  status: row.status,
  sampleManifestDigest: row.sampleManifestDigest,
  specPin: row.specPin ?? null,
  note: row.note,
  version: String(row.rowVersion),
  createdBy: row.createdBy,
  createdAt: iso(row.createdAt),
  closedBy: row.closedBy,
  closedAt: row.closedAt ? iso(row.closedAt) : null,
});

/** The rounds of one project, newest first. */
export async function listRounds(tx: Tx, workspaceId: string, projectId: string, viewer: Viewer): Promise<{ rows: RoundSummary[] }> {
  const rows = await tx
    .select({ row: r,
      validation: sql<string>`coalesce((select coalesce(ea.verdict, case when eq.state in ('queued','claimed') then eq.state end) from log_lifecycle.execution_request eq left join lateral (select a.verdict from log_lifecycle.execution_attempt a where a.workspace_id = eq.workspace_id and a.request_id = eq.id order by a.attempt_no desc limit 1) ea on true where eq.workspace_id = ${sql.raw('"validation_round"."workspace_id"')} and eq.round_id = ${sql.raw('"validation_round"."id"')} order by eq.created_at desc, eq.id desc limit 1), 'none')`,
      gateDecision: sql<string | null>`(select gd.decision from log_lifecycle.gate_decision gd where gd.workspace_id = ${sql.raw('"validation_round"."workspace_id"')} and gd.round_id = ${sql.raw('"validation_round"."id"')} order by gd.at desc, gd.id desc limit 1)`,
    })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.projectId, projectId), roundVisibleSql(viewer, ref(r.id))))
    .orderBy(desc(r.seq));
  return { rows: rows.map(({ row, validation, gateDecision }) => ({ ...baseRound(row), sampleCount: filesOf(row).files.length, validation, gateDecision })) };
}

/** One round with its ordered sample list; null when it does not exist in the workspace. */
export async function getRoundDetail(tx: Tx, workspaceId: string, roundId: string, viewer: Viewer): Promise<RoundDetail | null> {
  const [row] = await tx
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, roundId), roundVisibleSql(viewer, ref(r.id))))
    .limit(1);
  if (!row) return null;
  const refs = await tx
    .select()
    .from(roundEvidenceRefs)
    .where(and(eq(roundEvidenceRefs.workspaceId, workspaceId), eq(roundEvidenceRefs.roundId, roundId)))
    .orderBy(desc(roundEvidenceRefs.seq));
  const evidenceRefs = refs.map((x) => ({
    seq: x.seq,
    fileRef: x.fileRef,
    line: x.line,
    fileSha256: x.fileSha256,
    note: x.note,
    status: x.status,
    originKind: x.originKind,
    originId: x.originId,
    handedOffBy: x.handedOffBy,
    at: iso(x.at),
  }));
  return { ...baseRound(row), ownerModelId: row.ownerModelId, ownerSoftwareId: row.ownerSoftwareId, sampleSet: filesOf(row), evidenceRefs };
}

/** The sample set of a round in the workspace, or null (the cross-module read port: no evidence locations are read). */
export async function getRoundSampleSet(tx: Tx, workspaceId: string, roundId: string, viewer: Viewer) {
  const [row] = await tx
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, roundId), roundVisibleSql(viewer, ref(r.id))))
    .limit(1);
  return row ? filesOf(row) : null;
}

/** Whether the round exists in the workspace (the attachment parent reader and the evidence list share it). */
export async function roundInWorkspace(tx: Tx, workspaceId: string, roundId: string, viewer: Viewer): Promise<boolean> {
  const [row] = await tx
    .select({ id: r.id })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, roundId), roundVisibleSql(viewer, ref(r.id))))
    .limit(1);
  return row !== undefined;
}
