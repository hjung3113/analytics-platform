import { type Viewer, ref } from '../../log-knowledge/index.js';
import { projectVisibleSql, roundVisibleSql } from './access-visibility.js';
// Gate decision storage (#1446 e). Writes run on the caller's transaction after the project and Round rows are locked;
// `platform_app` holds SELECT and INSERT on `gate_decision` and nothing else (migration 0113 + the append-only trigger).
// Reads are scoped to the session workspace.

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { actors } from '../../../db/schema/core.js';
import {
  executionAttempts,
  executionRequests,
  gateDecisions,
  validationRounds,
} from '../../../db/schema/log-lifecycle.js';
import type { Tx } from '../../../db/tx.js';
import type { GateAttempt } from '../domain/gate-rules.js';
import type { Verdict } from '../domain/request-states.js';

const g = gateDecisions;
const iso = (d: Date | string): string => (d instanceof Date ? d : new Date(d)).toISOString();

/** The newest Round (highest seq) of a project: the one a Gate decision may rest on. */
export async function latestRoundId(tx: Tx, workspaceId: string, projectId: string, viewer: Viewer): Promise<string | null> {
  const [row] = await tx
    .select({ id: validationRounds.id })
    .from(validationRounds)
    .where(and(eq(validationRounds.workspaceId, workspaceId), eq(validationRounds.projectId, projectId), projectVisibleSql(viewer, ref(validationRounds.projectId))))
    .orderBy(desc(validationRounds.seq))
    .limit(1);
  return row?.id ?? null;
}

/** The project of a Round without locking either row (the action locks the project first, then the Round). */
export async function projectIdOfRound(tx: Tx, workspaceId: string, roundId: string, viewer: Viewer): Promise<string | null> {
  const [row] = await tx
    .select({ projectId: validationRounds.projectId })
    .from(validationRounds)
    .where(and(eq(validationRounds.workspaceId, workspaceId), eq(validationRounds.id, roundId), roundVisibleSql(viewer, ref(validationRounds.id))))
    .limit(1);
  return row?.projectId ?? null;
}

/** Every `succeeded` attempt of the Round, oldest first (the last one is the decisive attempt). */
export async function succeededAttempts(tx: Tx, workspaceId: string, roundId: string, viewer: Viewer): Promise<(GateAttempt & { requestDigest: string })[]> {
  const rows = await tx
    .select({
      id: executionAttempts.id,
      attemptNo: executionAttempts.attemptNo,
      requestId: executionAttempts.requestId,
      verdict: executionAttempts.verdict,
      ruleSetRevision: executionAttempts.ruleSetRevision,
      inputManifestDigest: executionAttempts.inputManifestDigest,
      endedAt: executionAttempts.endedAt,
      startedAt: executionAttempts.startedAt,
      requestDigest: executionRequests.requestDigest,
    })
    .from(executionAttempts)
    .innerJoin(
      executionRequests,
      and(eq(executionRequests.workspaceId, executionAttempts.workspaceId), eq(executionRequests.id, executionAttempts.requestId)),
    )
    .where(
      and(
        eq(executionAttempts.workspaceId, workspaceId),
        eq(executionRequests.roundId, roundId),
        roundVisibleSql(viewer, ref(executionRequests.roundId)),
        eq(executionAttempts.outcome, 'succeeded'),
      ),
    )
    .orderBy(asc(executionAttempts.endedAt), asc(executionAttempts.startedAt), asc(executionAttempts.id));
  return rows.map((row) => ({
    attemptId: row.id,
    attemptNo: row.attemptNo,
    requestId: row.requestId,
    verdict: row.verdict as Verdict,
    ruleSetRevision: row.ruleSetRevision,
    inputManifestDigest: row.inputManifestDigest,
    endedAt: row.endedAt ? iso(row.endedAt) : '',
    requestDigest: row.requestDigest,
  }));
}

/** The newest 검증 요청 of the Round: who asked for it and its digest. Null = the Round has no request. */
export async function latestRequest(tx: Tx, workspaceId: string, roundId: string, viewer: Viewer): Promise<{ requesterId: string; requestDigest: string } | null> {
  const [row] = await tx
    .select({ requesterId: executionRequests.requestedByActorId, requestDigest: executionRequests.requestDigest })
    .from(executionRequests)
    .where(and(eq(executionRequests.workspaceId, workspaceId), eq(executionRequests.roundId, roundId), roundVisibleSql(viewer, ref(executionRequests.roundId))))
    .orderBy(desc(executionRequests.createdAt), desc(executionRequests.id))
    .limit(1);
  return row ?? null;
}

/** An `internal_member` is a human; a `system` actor is a service identity. */
export async function actorIsHuman(tx: Tx, workspaceId: string, actorId: string): Promise<boolean> {
  const [row] = await tx
    .select({ type: actors.actorType })
    .from(actors)
    .where(and(eq(actors.id, actorId), eq(actors.workspaceId, workspaceId)))
    .limit(1);
  return row?.type === 'internal_member';
}

export interface NewGateDecision {
  workspaceId: string;
  roundId: string;
  fromStage: string;
  targetStage: string;
  decision: string;
  basis: unknown;
  reason: string;
  exception: unknown;
  selfApproved: boolean;
  actorId: string;
}

export async function insertGateDecision(tx: Tx, v: NewGateDecision): Promise<string> {
  const [row] = await tx
    .insert(g)
    .values({
      workspaceId: v.workspaceId,
      roundId: v.roundId,
      fromStage: v.fromStage,
      targetStage: v.targetStage,
      decision: v.decision,
      basis: v.basis,
      reason: v.reason,
      exception: v.exception ?? null,
      selfApproved: v.selfApproved,
      actorId: v.actorId,
    })
    .returning({ id: g.id });
  if (!row) throw new Error('gate decision insert returned no row');
  return row.id;
}

export interface GateDecisionOut {
  id: string;
  roundId: string;
  fromStage: string;
  targetStage: string;
  decision: string;
  /** Anyone who can read the Round reads the reason text of every decider (same visibility as the Round). */
  reason: string;
  exception: unknown;
  selfApproved: boolean;
  decidedBy: { id: string; displayName: string };
  at: string;
  basis: unknown;
  /** The basis in short: how many attempts it considered, the decisive verdict and the number of 수동 검증 첨부. */
  basisSummary: { attemptCount: number; decisiveVerdict: string | null; evidenceLinkCount: number };
}

function summaryOf(basis: unknown): GateDecisionOut['basisSummary'] {
  const b = (basis ?? {}) as { attempts?: unknown[]; decisiveVerdict?: string | null; evidenceLinks?: unknown[] };
  return {
    attemptCount: Array.isArray(b.attempts) ? b.attempts.length : 0,
    decisiveVerdict: b.decisiveVerdict ?? null,
    evidenceLinkCount: Array.isArray(b.evidenceLinks) ? b.evidenceLinks.length : 0,
  };
}

async function readDecisions(tx: Tx, workspaceId: string, roundIds: readonly string[], viewer: Viewer): Promise<GateDecisionOut[]> {
  if (roundIds.length === 0) return [];
  const decider = alias(actors, 'gate_decider');
  const rows = await tx
    .select({ row: g, name: decider.displayName })
    .from(g)
    .leftJoin(decider, and(eq(decider.id, g.actorId), eq(decider.workspaceId, g.workspaceId)))
    .where(and(eq(g.workspaceId, workspaceId), inArray(g.roundId, [...roundIds]), roundVisibleSql(viewer, ref(g.roundId))))
    .orderBy(asc(g.at), asc(g.id));
  return rows.map(({ row, name }) => ({
    id: row.id,
    roundId: row.roundId,
    fromStage: row.fromStage,
    targetStage: row.targetStage,
    decision: row.decision,
    reason: row.reason,
    exception: row.exception ?? null,
    selfApproved: row.selfApproved,
    decidedBy: { id: row.actorId, displayName: name ?? '' },
    at: iso(row.at),
    basis: row.basis,
    basisSummary: summaryOf(row.basis),
  }));
}

/** The Gate decision history of one Round, oldest first. */
export const gateHistoryOfRound = (tx: Tx, workspaceId: string, roundId: string, viewer: Viewer) => readDecisions(tx, workspaceId, [roundId], viewer);

export interface ProjectGateState {
  /** The newest decision of any Round of the project, or null when the Gate never decided. */
  latest: Omit<GateDecisionOut, 'basis'> | null;
  /** Whether a decision exists for the project's newest Round. */
  decidedOnLatestRound: boolean;
  decisionCount: number;
}

/** The current Gate state of a project: the newest decision (with its basis summary, not the basis) and the count. */
export async function projectGateState(tx: Tx, workspaceId: string, projectId: string, viewer: Viewer): Promise<ProjectGateState> {
  const rounds = await tx
    .select({ id: validationRounds.id })
    .from(validationRounds)
    .where(and(eq(validationRounds.workspaceId, workspaceId), eq(validationRounds.projectId, projectId), projectVisibleSql(viewer, ref(validationRounds.projectId))))
    .orderBy(desc(validationRounds.seq));
  const all = await readDecisions(tx, workspaceId, rounds.map((r) => r.id), viewer);
  const last = all.length === 0 ? null : (all[all.length - 1] as GateDecisionOut);
  const newest = rounds[0]?.id ?? null;
  const latest = last === null ? null : brief(last);
  return { latest, decidedOnLatestRound: newest !== null && all.some((d) => d.roundId === newest), decisionCount: all.length };
}

function brief(d: GateDecisionOut): Omit<GateDecisionOut, 'basis'> {
  return {
    id: d.id,
    roundId: d.roundId,
    fromStage: d.fromStage,
    targetStage: d.targetStage,
    decision: d.decision,
    reason: d.reason,
    exception: d.exception,
    selfApproved: d.selfApproved,
    decidedBy: d.decidedBy,
    at: d.at,
    basisSummary: d.basisSummary,
  };
}
