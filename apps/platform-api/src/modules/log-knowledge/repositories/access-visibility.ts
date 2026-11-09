// The visibility rule of the log knowledge objects as SQL (#1504 S-a, ADR-0124): the ONE place the rule is written for the
// database. Every read and every write that reaches a model, a SW version or an Item through this module goes through an
// expression or a function here; the pure twin is `domain/access-visibility.ts`. The expressions evaluate the CURRENT rule
// rows in the request's own statement, so a revocation takes effect with the next request and nothing is cached.
//
// Rule: no active deny on any level of the chain Model → SW → Item, and every level `internal` or holding an active allow for
// the viewing actor. No admin or service shortcut. An id that is hidden answers exactly like an id that does not exist:
// callers treat `false` as «not found», never as «forbidden».
//
// Outer columns: pass them through `ref()` (always qualified). A bare drizzle column renders unqualified in a single-table
// select and would bind to this subquery's own table.

import { type SQL, Table, and, eq, getTableName, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import { equipmentModels, softwareVersions } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import { uuidParam } from './search-sql.js';

/** Who is looking: the workspace of the session and the actor. */
export interface Viewer {
  workspaceId: string;
  actorId: string;
}

/** The viewer of an acting session or token. */
export const viewerOf = (actor: { workspace_id: string; actor_id: string }): Viewer => ({ workspaceId: actor.workspace_id, actorId: actor.actor_id });

/** A column of the OUTER query, always written with its table (or alias) so it cannot bind to this subquery's tables. */
export function ref(column: AnyPgColumn): SQL {
  const table = column.table as unknown as PgTable;
  const record = table as unknown as Record<symbol, unknown>;
  const symbols = (Table as unknown as { Symbol: { IsAlias: symbol; Schema: symbol } }).Symbol;
  const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
  const name = getTableName(table);
  const isAlias = record[symbols.IsAlias] === true;
  const schema = record[symbols.Schema];
  const prefix = !isAlias && typeof schema === 'string' ? `${q(schema)}.` : '';
  return sql.raw(`${prefix}${q(name)}.${q(column.name)}`);
}

/** The level test for one table alias holding `id` and `access_mode`: no active deny, and `internal` or an active allow. */
function level(alias: string, kind: 'model' | 'software' | 'item', viewer: Viewer): SQL {
  const a = sql.raw(alias);
  const rule = (effect: 'allow' | 'deny') =>
    sql`exists (select 1 from knowledge.object_access_rule acc_r where acc_r.workspace_id = ${uuidParam(viewer.workspaceId)} and acc_r.grantee_kind = 'actor' and acc_r.grantee_id = ${uuidParam(viewer.actorId)} and acc_r.target_kind = ${kind} and acc_r.target_id = ${a}.id and acc_r.effect = ${effect} and acc_r.revoked_at is null and (acc_r.valid_until is null or acc_r.valid_until > statement_timestamp()))`;
  return sql`(not ${rule('deny')} and (${a}.access_mode = 'internal' or ${rule('allow')}))`;
}

/** The model `modelId` (an SQL uuid expression) exists in the workspace and the viewer may see it. */
export function visibleModelSql(viewer: Viewer, modelId: SQL): SQL {
  return sql`exists (select 1 from knowledge.equipment_model acc_m where acc_m.workspace_id = ${uuidParam(viewer.workspaceId)} and acc_m.id = ${modelId} and ${level('acc_m', 'model', viewer)})`;
}

/** The SW version `softwareId` exists and the viewer may see it AND its model. */
export function visibleSoftwareSql(viewer: Viewer, softwareId: SQL): SQL {
  return sql`exists (select 1 from knowledge.software_version acc_s join knowledge.equipment_model acc_m on acc_m.workspace_id = acc_s.workspace_id and acc_m.id = acc_s.model_id where acc_s.workspace_id = ${uuidParam(viewer.workspaceId)} and acc_s.id = ${softwareId} and ${level('acc_s', 'software', viewer)} and ${level('acc_m', 'model', viewer)})`;
}

/** The Item `itemId` exists and the viewer may see it AND (when SW-owned) its SW version AND the model. */
export function visibleItemSql(viewer: Viewer, itemId: SQL): SQL {
  return sql`exists (select 1 from knowledge.knowledge_item acc_i left join knowledge.software_version acc_s on acc_s.workspace_id = acc_i.workspace_id and acc_s.id = acc_i.owner_software_id join knowledge.equipment_model acc_m on acc_m.workspace_id = acc_i.workspace_id and acc_m.id = coalesce(acc_i.owner_model_id, acc_s.model_id) where acc_i.workspace_id = ${uuidParam(viewer.workspaceId)} and acc_i.id = ${itemId} and ${level('acc_i', 'item', viewer)} and (acc_s.id is null or ${level('acc_s', 'software', viewer)}) and ${level('acc_m', 'model', viewer)})`;
}

/** The viewer's visibility of the owner of a draft or a new item: a model id, or a SW id. */
export function visibleOwnerSql(viewer: Viewer, owner: { modelId: SQL | null; softwareId: SQL | null }): SQL {
  if (owner.softwareId) return visibleSoftwareSql(viewer, owner.softwareId);
  if (owner.modelId) return visibleModelSql(viewer, owner.modelId);
  return sql`false`;
}

async function judge(tx: Tx, expression: SQL): Promise<boolean> {
  const [row] = await tx.select({ ok: sql<boolean>`${expression}` }).from(sql`(select 1) as acc_one`);
  return row?.ok === true;
}

export const canSeeModel = (tx: Tx, viewer: Viewer, modelId: string): Promise<boolean> => judge(tx, visibleModelSql(viewer, uuidParam(modelId)));
export const canSeeSoftware = (tx: Tx, viewer: Viewer, softwareId: string): Promise<boolean> => judge(tx, visibleSoftwareSql(viewer, uuidParam(softwareId)));
export const canSeeItem = (tx: Tx, viewer: Viewer, itemId: string): Promise<boolean> => judge(tx, visibleItemSql(viewer, uuidParam(itemId)));

/** Stabilizes the owner chain against mode changes, deny additions and allow revocations until commit. */
export async function lockOwnerAccess(tx: Tx, viewer: Viewer, owner: { ownerModelId: string | null; ownerSoftwareId: string | null }): Promise<boolean> {
  if (owner.ownerSoftwareId) {
    if (!(await canSeeSoftware(tx, viewer, owner.ownerSoftwareId))) return false;
    const [software] = await tx.select({ modelId: softwareVersions.modelId }).from(softwareVersions).where(and(eq(softwareVersions.workspaceId, viewer.workspaceId), eq(softwareVersions.id, owner.ownerSoftwareId)));
    if (!software) return false;
    await tx.select({ id: equipmentModels.id }).from(equipmentModels).where(and(eq(equipmentModels.workspaceId, viewer.workspaceId), eq(equipmentModels.id, software.modelId))).for('share');
    await tx.select({ id: softwareVersions.id }).from(softwareVersions).where(and(eq(softwareVersions.workspaceId, viewer.workspaceId), eq(softwareVersions.id, owner.ownerSoftwareId))).for('share');
    return canSeeSoftware(tx, viewer, owner.ownerSoftwareId);
  }
  if (!owner.ownerModelId || !(await canSeeModel(tx, viewer, owner.ownerModelId))) return false;
  await tx.select({ id: equipmentModels.id }).from(equipmentModels).where(and(eq(equipmentModels.workspaceId, viewer.workspaceId), eq(equipmentModels.id, owner.ownerModelId))).for('share');
  return canSeeModel(tx, viewer, owner.ownerModelId);
}
