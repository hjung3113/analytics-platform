// Reads of the Sample Window table and the Fleet figures (#1658 Sample Window·Fleet PR). Every statement is scoped to the workspace of the actor.
// The Fleet reads are grouped statements (one per figure, never one per equipment).
import { and, asc, eq, ne, sql } from 'drizzle-orm';

import type { Tx } from '../../../db/tx.js';
import { equipment, sampleWindows } from '../../../db/schema/eqv.js';

export type WindowRow = typeof sampleWindows.$inferSelect;

/** The window rows of one equipment, oldest range first, without their content; `mappingCount` is the Baselines taken from the window. */
export async function listWindowRows(db: Tx, workspaceId: string, equipmentId: string) {
  const t = sampleWindows;
  return db
    .select({
      hash: t.hash,
      from: t.fromAt,
      to: t.toAt,
      dataGeneration: t.dataGeneration,
      timeDomain: t.timeDomain,
      occurrences: t.occurrences,
      state: t.state,
      counterpart: t.counterpartHash,
      mappingCount: sql<number>`(select count(*)::int from eqv.baseline_inventory b where b.workspace_id = ${t.workspaceId} and b.window_id = ${t.id})`,
    })
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.equipmentId, equipmentId)))
    .orderBy(asc(t.fromAt), asc(t.importedAt), asc(t.hash));
}

export async function getWindowRow(db: Tx, workspaceId: string, equipmentId: string, hash: string): Promise<WindowRow | null> {
  const t = sampleWindows;
  const [r] = await db.select().from(t).where(and(eq(t.workspaceId, workspaceId), eq(t.equipmentId, equipmentId), eq(t.hash, hash)));
  return r ?? null;
}

/** The windows an import is judged against: every one but the retired (a retired window no longer blocks its range). */
export async function listLiveWindowRefs(db: Tx, workspaceId: string, equipmentId: string) {
  const t = sampleWindows;
  return db
    .select({ from: t.fromAt, to: t.toAt, hash: t.hash, timeDomain: t.timeDomain })
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.equipmentId, equipmentId), ne(t.state, 'retired')));
}

/** One row of a stored window with a given counterpart (the staged window of an active one). */
export async function findStagedFor(db: Tx, workspaceId: string, equipmentId: string, activeHash: string) {
  const t = sampleWindows;
  const [r] = await db
    .select({ hash: t.hash })
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.equipmentId, equipmentId), eq(t.state, 'staged'), eq(t.counterpartHash, activeHash)));
  return r ?? null;
}

export interface FleetEquipmentRow {
  equipmentId: string;
  label: string;
  modelId: string;
}

/** The first `limit` equipment of the workspace by id (the Fleet screen's rows before the Hub filters hidden models). */
export async function listEquipmentRows(db: Tx, workspaceId: string, limit: number): Promise<FleetEquipmentRow[]> {
  return db
    .select({ equipmentId: equipment.equipmentId, label: equipment.label, modelId: equipment.modelId })
    .from(equipment)
    .where(eq(equipment.workspaceId, workspaceId))
    .orderBy(asc(equipment.equipmentId))
    .limit(limit);
}

/** Whether an equipment id exists in the workspace, ignoring letter case. */
export async function equipmentIdExists(db: Tx, workspaceId: string, equipmentId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: equipment.equipmentId })
    .from(equipment)
    .where(and(eq(equipment.workspaceId, workspaceId), sql`lower(${equipment.equipmentId}) = lower(${equipmentId})`))
    .limit(1);
  return r !== undefined;
}

export interface LatestWindow {
  equipmentId: string;
  hash: string;
  from: string;
  to: string;
  inventory: unknown;
}

const idList = (ids: readonly string[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `);

/** The latest active window (greatest `from`) of each given equipment, with its Inventory. */
export async function latestActiveWindows(db: Tx, workspaceId: string, ids: readonly string[]): Promise<LatestWindow[]> {
  if (ids.length === 0) return [];
  const rows = await db.execute<{ equipment_id: string; hash: string; from_at: string; to_at: string; inventory: unknown }>(sql`
    select distinct on (equipment_id) equipment_id, hash, from_at, to_at, inventory
      from eqv.sample_window
     where workspace_id = ${workspaceId} and state = 'active' and equipment_id in (${idList(ids)})
     order by equipment_id, from_at desc, imported_at desc, hash`);
  return rows.rows.map((r) => ({ equipmentId: r.equipment_id, hash: r.hash, from: r.from_at, to: r.to_at, inventory: r.inventory }));
}

/** The equipment (of the given) that have any window row, whatever its state. */
export async function equipmentWithWindows(db: Tx, workspaceId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.execute<{ equipment_id: string }>(sql`
    select distinct equipment_id from eqv.sample_window where workspace_id = ${workspaceId} and equipment_id in (${idList(ids)})`);
  return new Set(rows.rows.map((r) => r.equipment_id));
}

export interface LatestBindingRow {
  equipmentId: string;
  layoutId: string;
  layoutRevision: string;
  mappingHash: string;
}

/** The Binding with the greatest `effective_from` of each given equipment. */
export async function latestBindings(db: Tx, workspaceId: string, ids: readonly string[]): Promise<LatestBindingRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.execute<{ equipment_id: string; layout_id: string; layout_revision: string; mapping_hash: string }>(sql`
    select distinct on (equipment_id) equipment_id, layout_id, layout_revision, mapping_hash
      from eqv.binding
     where workspace_id = ${workspaceId} and equipment_id in (${idList(ids)})
     order by equipment_id, effective_from desc`);
  return rows.rows.map((r) => ({ equipmentId: r.equipment_id, layoutId: r.layout_id, layoutRevision: r.layout_revision, mappingHash: r.mapping_hash }));
}

/** The documents of the given (equipment, Mapping hash) pairs: Mapping Version and Baseline, one statement each. */
export async function mappingAndBaselineDocuments(db: Tx, workspaceId: string, pairs: readonly { equipmentId: string; mappingHash: string }[]) {
  const mappings = new Map<string, { hash: string; document: unknown }>();
  const baselines = new Map<string, unknown>();
  if (pairs.length === 0) return { mappings, baselines };
  const tuples = sql.join(pairs.map((p) => sql`(${p.equipmentId}, ${p.mappingHash})`), sql`, `);
  const m = await db.execute<{ equipment_id: string; hash: string; document: unknown }>(sql`
    select equipment_id, hash, document from eqv.mapping_version where workspace_id = ${workspaceId} and (equipment_id, hash) in (${tuples})`);
  for (const r of m.rows) mappings.set(`${r.equipment_id}/${r.hash}`, { hash: r.hash, document: r.document });
  const b = await db.execute<{ equipment_id: string; mapping_hash: string; document: unknown }>(sql`
    select equipment_id, mapping_hash, document from eqv.baseline_inventory where workspace_id = ${workspaceId} and (equipment_id, mapping_hash) in (${tuples})`);
  for (const r of b.rows) baselines.set(`${r.equipment_id}/${r.mapping_hash}`, r.document);
  return { mappings, baselines };
}

/** The scope columns of every alias-rules row of the workspace (no document): which rule files exist. */
export async function listRuleScopes(db: Tx, workspaceId: string) {
  const rows = await db.execute<{ level: string; vendor_id: string | null; model_id: string | null; equipment_id: string | null }>(sql`
    select level, vendor_id, model_id, equipment_id from eqv.alias_rules where workspace_id = ${workspaceId}`);
  return rows.rows.map((r) => ({ level: r.level, vendorId: r.vendor_id, modelId: r.model_id, equipmentId: r.equipment_id }));
}
