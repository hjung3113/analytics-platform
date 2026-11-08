// Storage of the object access rules and modes (#1504 S-a, ADR-0124): `knowledge.object_access_rule` and the `access_mode` column
// of model / SW version / Item. Every statement is scoped to the actor's workspace. Rules are appended and revoked, never deleted.
// The caller owns the transaction and the audit row. Managing access is judged by the capability, not by visibility: a manager
// reaches a target they cannot see (otherwise a restricted object without a rule for them could never be reopened).
// NOT here: search outbox writes (node S-c adds them at `setAccessMode` / `insertRule` / `revokeRule`, the single place to extend).

import { type SQL, and, desc, eq, sql } from 'drizzle-orm';

import { equipmentModels, knowledgeItems, objectAccessRules, softwareVersions } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import type { AccessEffect, AccessMode, AccessTargetKind } from '../domain/access-visibility.js';

export interface AccessTarget {
  id: string;
  accessMode: AccessMode;
  rowVersion: number;
}

function table(kind: AccessTargetKind) {
  return kind === 'model' ? equipmentModels : kind === 'software' ? softwareVersions : knowledgeItems;
}

/** The target `FOR UPDATE`; null when it is not in the workspace. */
export async function lockTarget(tx: Tx, workspaceId: string, kind: AccessTargetKind, id: string): Promise<AccessTarget | null> {
  const t = table(kind);
  const [row] = await tx
    .select({ id: t.id, accessMode: t.accessMode, rowVersion: t.rowVersion })
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.id, id)))
    .for('update');
  return row ? { id: row.id, accessMode: row.accessMode as AccessMode, rowVersion: row.rowVersion } : null;
}

/** The target without a lock (a read). */
export async function readTarget(tx: Tx, workspaceId: string, kind: AccessTargetKind, id: string): Promise<AccessTarget | null> {
  const t = table(kind);
  const [row] = await tx
    .select({ id: t.id, accessMode: t.accessMode, rowVersion: t.rowVersion })
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.id, id)));
  return row ? { id: row.id, accessMode: row.accessMode as AccessMode, rowVersion: row.rowVersion } : null;
}

/** Sets the mode and bumps `row_version`; returns the new version. */
export async function setAccessMode(tx: Tx, workspaceId: string, actorId: string, kind: AccessTargetKind, target: AccessTarget, mode: AccessMode): Promise<number> {
  const t = table(kind);
  const [row] = await tx
    .update(t)
    .set({ accessMode: mode, rowVersion: sql`${t.rowVersion} + 1`, updatedAt: sql`now()`, updatedBy: actorId })
    .where(and(eq(t.workspaceId, workspaceId), eq(t.id, target.id)))
    .returning({ rowVersion: t.rowVersion });
  if (!row) throw new Error('access mode update returned no row');
  return row.rowVersion;
}

export interface RuleRow {
  ruleId: string;
  targetKind: AccessTargetKind;
  targetId: string;
  granteeId: string;
  effect: AccessEffect;
  validUntil: Date | null;
  createdBy: string;
  createdAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
}

const r = objectAccessRules;
const ruleColumns = {
  ruleId: r.ruleId,
  targetKind: r.targetKind,
  targetId: r.targetId,
  granteeId: r.granteeId,
  effect: r.effect,
  validUntil: r.validUntil,
  createdBy: r.createdBy,
  createdAt: r.createdAt,
  revokedAt: r.revokedAt,
  revokedBy: r.revokedBy,
};

/** Whether an active (not revoked, not expired) rule of this exact kind already exists: a second one adds nothing. */
export async function activeRuleExists(tx: Tx, workspaceId: string, kind: AccessTargetKind, targetId: string, granteeId: string, effect: AccessEffect): Promise<boolean> {
  const rows = await tx
    .select({ id: r.ruleId })
    .from(r)
    .where(
      and(
        eq(r.workspaceId, workspaceId),
        eq(r.targetKind, kind),
        eq(r.targetId, targetId),
        eq(r.granteeId, granteeId),
        eq(r.effect, effect),
        sql`${r.revokedAt} is null and (${r.validUntil} is null or ${r.validUntil} > now())`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function insertRule(
  tx: Tx,
  values: { workspaceId: string; actorId: string; kind: AccessTargetKind; targetId: string; granteeId: string; effect: AccessEffect; validUntil: Date | null },
): Promise<RuleRow> {
  const [row] = await tx
    .insert(r)
    .values({
      workspaceId: values.workspaceId,
      targetKind: values.kind,
      targetId: values.targetId,
      granteeKind: 'actor',
      granteeId: values.granteeId,
      effect: values.effect,
      validUntil: values.validUntil,
      createdBy: values.actorId,
    })
    .returning(ruleColumns);
  if (!row) throw new Error('access rule insert returned no row');
  return row as RuleRow;
}

export async function lockRule(tx: Tx, workspaceId: string, ruleId: string): Promise<RuleRow | null> {
  const [row] = await tx.select(ruleColumns).from(r).where(and(eq(r.workspaceId, workspaceId), eq(r.ruleId, ruleId))).for('update');
  return (row as RuleRow | undefined) ?? null;
}

export async function revokeRule(tx: Tx, workspaceId: string, actorId: string, ruleId: string): Promise<void> {
  await tx
    .update(r)
    .set({ revokedAt: sql`now()`, revokedBy: actorId })
    .where(and(eq(r.workspaceId, workspaceId), eq(r.ruleId, ruleId)));
}

export async function listRules(
  tx: Tx,
  workspaceId: string,
  kind: AccessTargetKind,
  targetId: string,
  paging: { page: number; pageSize: number },
): Promise<{ total: number; rows: RuleRow[] }> {
  const where: SQL | undefined = and(eq(r.workspaceId, workspaceId), eq(r.targetKind, kind), eq(r.targetId, targetId));
  const rows = await tx
    .select(ruleColumns)
    .from(r)
    .where(where)
    .orderBy(desc(r.createdAt), desc(r.ruleId))
    .limit(paging.pageSize)
    .offset(paging.page * paging.pageSize);
  const [total] = await tx.select({ n: sql<number>`count(*)::int` }).from(r).where(where);
  return { total: total?.n ?? 0, rows: rows as RuleRow[] };
}
