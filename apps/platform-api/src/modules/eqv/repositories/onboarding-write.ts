// Writes of the Onboarding tables (#1658). All run in the caller's transaction. Mapping Versions and Baselines are insert-only and Bindings
// change `effective_to` only: the runtime role holds no other UPDATE and no DELETE (migration 0124), and no function here goes beyond it.
import { and, eq, sql } from 'drizzle-orm';

import type { Tx } from '../../../db/tx.js';
import { aliasRules, baselineInventories, bindings, mappingVersions, typeDictionaries } from '../../../db/schema/eqv.js';
import type { MappingScopeRef } from '../domain/mapping-checks.js';

/** One writer per scope row (or per equipment): a creation race waits here and then sees the first row. Held until the transaction ends. */
export async function lockOnboarding(tx: Tx, kind: 'alias_rules' | 'type_dictionary' | 'equipment', workspaceId: string, id: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`eqv.${kind}`}), hashtext(${`${workspaceId}:${id}`}))`);
}

type Scoped = { workspaceId: string; scope: MappingScopeRef; document: unknown; actorId: string };

export async function insertAliasRules(tx: Tx, v: Scoped) {
  const [row] = await tx
    .insert(aliasRules)
    .values({
      workspaceId: v.workspaceId,
      level: v.scope.level,
      vendorId: 'vendorId' in v.scope ? v.scope.vendorId : null,
      modelId: 'modelId' in v.scope ? v.scope.modelId : null,
      equipmentId: 'equipmentId' in v.scope ? v.scope.equipmentId : null,
      document: v.document,
      createdBy: v.actorId,
      updatedBy: v.actorId,
    })
    .returning({ id: aliasRules.id, version: aliasRules.version });
  if (!row) throw new Error('eqv alias rules insert returned no row');
  return row;
}

export async function updateAliasRules(tx: Tx, v: { id: string; workspaceId: string; document: unknown; actorId: string }) {
  const [row] = await tx
    .update(aliasRules)
    .set({ document: v.document, version: sql`${aliasRules.version} + 1`, updatedAt: sql`now()`, updatedBy: v.actorId })
    .where(and(eq(aliasRules.workspaceId, v.workspaceId), eq(aliasRules.id, v.id)))
    .returning({ id: aliasRules.id, version: aliasRules.version });
  if (!row) throw new Error('eqv alias rules update returned no row');
  return row;
}

export async function insertTypeDictionary(tx: Tx, v: Scoped) {
  const [row] = await tx
    .insert(typeDictionaries)
    .values({
      workspaceId: v.workspaceId,
      level: v.scope.level,
      vendorId: 'vendorId' in v.scope ? v.scope.vendorId : null,
      modelId: 'modelId' in v.scope ? v.scope.modelId : null,
      document: v.document,
      createdBy: v.actorId,
      updatedBy: v.actorId,
    })
    .returning({ id: typeDictionaries.id, version: typeDictionaries.version });
  if (!row) throw new Error('eqv type dictionary insert returned no row');
  return row;
}

export async function updateTypeDictionary(tx: Tx, v: { id: string; workspaceId: string; document: unknown; actorId: string }) {
  const [row] = await tx
    .update(typeDictionaries)
    .set({ document: v.document, version: sql`${typeDictionaries.version} + 1`, updatedAt: sql`now()`, updatedBy: v.actorId })
    .where(and(eq(typeDictionaries.workspaceId, v.workspaceId), eq(typeDictionaries.id, v.id)))
    .returning({ id: typeDictionaries.id, version: typeDictionaries.version });
  if (!row) throw new Error('eqv type dictionary update returned no row');
  return row;
}

export async function insertMappingVersion(
  tx: Tx,
  v: { workspaceId: string; equipmentId: string; layoutId: string; layoutRevision: string; hash: string; document: unknown; actorId: string },
) {
  const [row] = await tx
    .insert(mappingVersions)
    .values({ ...v, publishedBy: v.actorId })
    .returning({ id: mappingVersions.id });
  if (!row) throw new Error('eqv mapping version insert returned no row');
  return row;
}

export async function insertBaseline(tx: Tx, v: { workspaceId: string; equipmentId: string; mappingHash: string; document: unknown; actorId: string }) {
  const [row] = await tx
    .insert(baselineInventories)
    .values({ workspaceId: v.workspaceId, equipmentId: v.equipmentId, mappingHash: v.mappingHash, document: v.document, createdBy: v.actorId })
    .returning({ id: baselineInventories.id });
  if (!row) throw new Error('eqv baseline insert returned no row');
  return row;
}

export async function insertBinding(
  tx: Tx,
  v: { workspaceId: string; equipmentId: string; layoutId: string; layoutRevision: string; mappingHash: string; effectiveFrom: string; actorId: string },
) {
  const [row] = await tx
    .insert(bindings)
    .values({
      workspaceId: v.workspaceId,
      equipmentId: v.equipmentId,
      layoutId: v.layoutId,
      layoutRevision: v.layoutRevision,
      mappingHash: v.mappingHash,
      effectiveFrom: v.effectiveFrom,
      createdBy: v.actorId,
    })
    .returning({ id: bindings.id });
  if (!row) throw new Error('eqv binding insert returned no row');
  return row;
}

/** The only Binding update: the open latest Binding ends where the next one starts. */
export async function closeBinding(tx: Tx, v: { workspaceId: string; id: string; effectiveTo: string }) {
  await tx
    .update(bindings)
    .set({ effectiveTo: v.effectiveTo })
    .where(and(eq(bindings.workspaceId, v.workspaceId), eq(bindings.id, v.id)));
}
