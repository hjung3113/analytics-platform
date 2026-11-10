// Reads of the Onboarding tables (#1658). Every statement is scoped to the workspace of the actor.
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import type { Tx } from '../../../db/tx.js';
import { aliasRules, baselineInventories, bindings, equipment, mappingVersions, typeDictionaries } from '../../../db/schema/eqv.js';
import { vendors } from '../../../db/schema/knowledge.js';
import type { MappingScopeRef } from '../domain/mapping-checks.js';

const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

const colEq = <T>(column: Parameters<typeof eq>[0], value: T | null | undefined) => (value == null ? isNull(column as never) : eq(column, value));

export async function getAliasRulesRow(db: Tx, workspaceId: string, scope: MappingScopeRef) {
  const t = aliasRules;
  const [r] = await db
    .select()
    .from(t)
    .where(
      and(
        eq(t.workspaceId, workspaceId),
        eq(t.level, scope.level),
        colEq(t.vendorId, 'vendorId' in scope ? scope.vendorId : null),
        colEq(t.modelId, 'modelId' in scope ? scope.modelId : null),
        colEq(t.equipmentId, 'equipmentId' in scope ? scope.equipmentId : null),
      ),
    );
  return r ?? null;
}

export async function getTypeDictionaryRow(db: Tx, workspaceId: string, scope: MappingScopeRef) {
  const t = typeDictionaries;
  const [r] = await db
    .select()
    .from(t)
    .where(
      and(
        eq(t.workspaceId, workspaceId),
        eq(t.level, scope.level),
        colEq(t.vendorId, 'vendorId' in scope ? scope.vendorId : null),
        colEq(t.modelId, 'modelId' in scope ? scope.modelId : null),
      ),
    );
  return r ?? null;
}

export async function getEquipmentRow(db: Tx, workspaceId: string, equipmentId: string) {
  const [r] = await db
    .select({ equipmentId: equipment.equipmentId, label: equipment.label, modelId: equipment.modelId })
    .from(equipment)
    .where(and(eq(equipment.workspaceId, workspaceId), eq(equipment.equipmentId, equipmentId)));
  return r ?? null;
}

/** Vendors carry no object access (only models and software versions do), so existence in the workspace is the whole check. */
export async function vendorExists(db: Tx, workspaceId: string, vendorId: string): Promise<boolean> {
  const [r] = await db.select({ id: vendors.id }).from(vendors).where(and(eq(vendors.workspaceId, workspaceId), eq(vendors.id, vendorId)));
  return r !== undefined;
}

/** Newest first, at most `limit` rows, no document. */
export async function listMappingVersions(db: Tx, workspaceId: string, equipmentId: string, limit: number) {
  const t = mappingVersions;
  const rows = await db
    .select({
      hash: t.hash,
      layoutId: t.layoutId,
      layoutRevision: t.layoutRevision,
      entryCount: sql<number>`coalesce(jsonb_array_length(${t.document} -> 'entries'), 0)::int`,
      publishedAt: t.publishedAt,
    })
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.equipmentId, equipmentId)))
    .orderBy(desc(t.publishedAt), asc(t.hash))
    .limit(limit);
  return rows.map((r) => ({ ...r, publishedAt: iso(r.publishedAt) }));
}

export async function getMappingVersionRow(db: Tx, workspaceId: string, equipmentId: string, hash: string) {
  const t = mappingVersions;
  const [r] = await db.select().from(t).where(and(eq(t.workspaceId, workspaceId), eq(t.equipmentId, equipmentId), eq(t.hash, hash)));
  return r ?? null;
}

export async function getBaselineRow(db: Tx, workspaceId: string, equipmentId: string, mappingHash: string) {
  const t = baselineInventories;
  const [r] = await db
    .select()
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.equipmentId, equipmentId), eq(t.mappingHash, mappingHash)));
  return r ?? null;
}

/** Every Binding row of one equipment, oldest `effective_from` first. */
export async function listBindingRows(db: Tx, workspaceId: string, equipmentId: string) {
  const t = bindings;
  return db
    .select()
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.equipmentId, equipmentId)))
    .orderBy(asc(t.effectiveFrom));
}
