import { type Viewer, ref, lockOwnerAccess } from '../../log-knowledge/index.js';
import { lockRoundOwner, projectVisibleSql, roundVisibleSql } from './access-visibility.js';
// Write side of the log lifecycle (#1444 c): every statement is scoped to the session's workspace and runs on the
// caller's transaction. The project row is locked FOR UPDATE (by the engine's `currentVersion`, or by `lockProject`
// before a round is opened); event and round `seq` are allocated under that lock, so they are gapless per project.
// `platform_app` holds a column-limited UPDATE on project and round, INSERT on the three tables and nothing else
// (migration of #1444 c); the guard triggers refuse a missing `row_version` bump, an illegal stage pair, a changed input
// column and any edit of a closed round or an event.

import { and, desc, eq, sql } from 'drizzle-orm';

import { actors } from '../../../db/schema/core.js';
import { developmentEvents, developmentProjects, validationRounds } from '../../../db/schema/log-lifecycle.js';
import type { Tx } from '../../../db/tx.js';

export type ProjectRow = typeof developmentProjects.$inferSelect;
export type RoundRow = typeof validationRounds.$inferSelect;
export type EventKind = 'created' | 'stage_changed' | 'owner_changed' | 'target_changed' | 'cancelled' | 'reopened' | 'gate_decided';

const p = developmentProjects;
const r = validationRounds;

export async function lockProject(tx: Tx, workspaceId: string, projectId: string, viewer: Viewer): Promise<ProjectRow | null> {
  const [row] = await tx
    .select()
    .from(p)
    .where(and(eq(p.workspaceId, workspaceId), eq(p.id, projectId), projectVisibleSql(viewer, ref(p.id))))
    .for('update');
  return row && await lockOwnerAccess(tx, viewer, { ownerModelId: row.modelId, ownerSoftwareId: row.softwareId }) ? row : null;
}

/** Locks a round row; its project is NOT locked here (a close does not allocate a seq). */
export async function lockRound(tx: Tx, workspaceId: string, roundId: string, viewer: Viewer): Promise<RoundRow | null> {
  const [row] = await tx
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, roundId), roundVisibleSql(viewer, ref(r.id))))
    .for('update');
  if (!row) return null;
  return await lockRoundOwner(tx, viewer, row.id) ? row : null;
}

/** An owner must be an actor of the session workspace (the actor FKs are plain: core.actors has no workspace key). */
export async function actorInWorkspace(tx: Tx, workspaceId: string, actorId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: actors.id })
    .from(actors)
    .where(and(eq(actors.id, actorId), eq(actors.workspaceId, workspaceId)))
    .limit(1);
  return row !== undefined;
}

export interface NewProject {
  workspaceId: string;
  actorId: string;
  modelId: string;
  softwareId: string | null;
  kind: string;
  ownerActorId: string;
  targetDate: string | null;
}

export async function insertProject(tx: Tx, v: NewProject): Promise<ProjectRow> {
  const [row] = await tx
    .insert(p)
    .values({
      workspaceId: v.workspaceId,
      modelId: v.modelId,
      softwareId: v.softwareId,
      kind: v.kind,
      stage: 'registered',
      ownerActorId: v.ownerActorId,
      targetDate: v.targetDate,
      createdBy: v.actorId,
      updatedBy: v.actorId,
    })
    .returning();
  if (!row) throw new Error('development project insert returned no row');
  return row;
}

/** The mutable columns of `development_project` (the column grant lists exactly these plus the audit columns). */
export interface ProjectPatch {
  stage?: string;
  ownerActorId?: string;
  softwareId?: string | null;
  targetDate?: string | null;
}

/** One UPDATE: the patch plus the row_version bump and the audit columns. Returns the new row version. */
export async function patchProject(tx: Tx, workspaceId: string, projectId: string, actorId: string, patch: ProjectPatch): Promise<number> {
  const [row] = await tx
    .update(p)
    .set({ ...patch, rowVersion: sql`${p.rowVersion} + 1`, updatedAt: sql`now()`, updatedBy: actorId })
    .where(and(eq(p.workspaceId, workspaceId), eq(p.id, projectId)))
    .returning({ v: p.rowVersion });
  if (!row) throw new Error('development project update matched no row');
  return row.v;
}

/** Appends the next event of a project. The caller holds the project row lock, so `max(seq) + 1` has no gap or race. */
export async function insertEvent(
  tx: Tx,
  v: {
    workspaceId: string;
    projectId: string;
    actorId: string;
    kind: EventKind;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    reason?: string | null;
  },
): Promise<number> {
  const [next] = await tx
    .select({ n: sql<number>`coalesce(max(${developmentEvents.seq}), 0) + 1` })
    .from(developmentEvents)
    .where(and(eq(developmentEvents.workspaceId, v.workspaceId), eq(developmentEvents.projectId, v.projectId)));
  const seq = Number(next?.n ?? 1);
  await tx.insert(developmentEvents).values({
    workspaceId: v.workspaceId,
    projectId: v.projectId,
    seq,
    kind: v.kind,
    before: v.before,
    after: v.after,
    reason: v.reason ?? null,
    actorId: v.actorId,
  });
  return seq;
}

/** The stage a project had before its latest cancel: `before.stage` of the last `cancelled` event; null when none. */
export async function stageBeforeLastCancel(tx: Tx, workspaceId: string, projectId: string): Promise<string | null> {
  const [row] = await tx
    .select({ before: developmentEvents.before })
    .from(developmentEvents)
    .where(and(eq(developmentEvents.workspaceId, workspaceId), eq(developmentEvents.projectId, projectId), eq(developmentEvents.kind, 'cancelled')))
    .orderBy(desc(developmentEvents.seq))
    .limit(1);
  const stage = (row?.before as { stage?: unknown } | undefined)?.stage;
  return typeof stage === 'string' ? stage : null;
}

export interface NewRound {
  ownerModelId: string;
  ownerSoftwareId: string | null;
  workspaceId: string;
  actorId: string;
  projectId: string;
  stage: string;
  sampleSet: unknown;
  sampleManifestDigest: string;
  specPin: { revisionId: string; changeSetDigest: string } | null;
  note: string | null;
}

/** Inserts the next round (seq = max + 1 under the project lock). */
export async function insertRound(tx: Tx, v: NewRound): Promise<RoundRow> {
  const [next] = await tx
    .select({ n: sql<number>`coalesce(max(${r.seq}), 0) + 1` })
    .from(r)
    .where(and(eq(r.workspaceId, v.workspaceId), eq(r.projectId, v.projectId)));
  const [row] = await tx
    .insert(r)
    .values({
      workspaceId: v.workspaceId,
      projectId: v.projectId,
      ownerModelId: v.ownerModelId,
      ownerSoftwareId: v.ownerSoftwareId,
      seq: Number(next?.n ?? 1),
      stage: v.stage,
      status: 'open',
      sampleSet: v.sampleSet,
      sampleManifestDigest: v.sampleManifestDigest,
      specPin: v.specPin,
      note: v.note,
      createdBy: v.actorId,
      updatedBy: v.actorId,
    })
    .returning();
  if (!row) throw new Error('validation round insert returned no row');
  return row;
}

export async function closeRound(tx: Tx, workspaceId: string, roundId: string, actorId: string): Promise<number> {
  const [row] = await tx
    .update(r)
    .set({ status: 'closed', closedAt: sql`now()`, closedBy: actorId, rowVersion: sql`${r.rowVersion} + 1`, updatedAt: sql`now()`, updatedBy: actorId })
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, roundId)))
    .returning({ v: r.rowVersion });
  if (!row) throw new Error('validation round update matched no row');
  return row.v;
}

/** The pg error behind a driver or drizzle wrapper. */
function pgError(error: unknown): { code?: string; constraint?: string } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const e = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, ...(typeof e.constraint === 'string' ? { constraint: e.constraint } : {}) };
    }
    current = e.cause;
  }
  return null;
}

/** A violated unique index, by NAME only: the two partial unique indexes are the races the service check cannot close. */
export const OPEN_PROJECT_CONSTRAINT = 'development_project_open_model_uq';
export const OPEN_ROUND_CONSTRAINT = 'validation_round_open_project_uq';

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pg = pgError(error);
  return pg?.code === '23505' && pg.constraint === constraint;
}

/**
 * Runs `work`; a violation of the named unique index becomes `toInvalid()` (the engine rolls the transaction back and
 * answers `invalid`). Anything else stays loud.
 */
export async function mapUnique<T>(
  work: () => Promise<T>,
  constraint: string,
  toInvalid: () => Error,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolation(error, constraint)) throw toInvalid();
    throw error;
  }
}
