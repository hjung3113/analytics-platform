// Write side of the log knowledge catalog (#1194 a): `knowledge.*` tables only, every statement scoped to
// the actor's workspace, no hard delete (only `model_process` rows are removed). The caller owns the
// transaction and the audit rows. Row locks: the write target is locked `FOR UPDATE` by `lockRow` (the
// action's `currentVersion`), a parent that a new row hangs under is locked `FOR SHARE` so a concurrent
// deactivation cannot slip between the check and the insert.

import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import {
  equipmentModels,
  modelProcesses,
  processCategories,
  softwareVersions,
  vendors,
} from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import { toCodeKey } from '../domain/code-key.js';

export type CatalogKind = 'vendor' | 'process' | 'model' | 'software';
export type ParentKind = 'vendor' | 'process' | 'model';

export interface CatalogRow {
  id: string;
  /** `versionLabel` for a software version. */
  code: string;
  name: string;
  active: boolean;
  rowVersion: number;
  /** vendor id of a model, model id of a software version; null for vendors and processes. */
  parentId: string | null;
}

/** A unique `code_key` was hit (pre-check or a concurrent insert). */
export class DuplicateCatalogKeyError extends Error {}

// Vendors and processes share one column shape; the cast only unifies the two table types.
const simpleTable = (kind: 'vendor' | 'process'): typeof vendors =>
  (kind === 'vendor' ? vendors : processCategories) as unknown as typeof vendors;

const isUniqueViolation = (error: unknown): boolean => {
  const code = (e: unknown) => (e as { code?: string } | null)?.code;
  return code(error) === '23505' || code((error as { cause?: unknown } | null)?.cause) === '23505';
};

function fromSimple(row: typeof vendors.$inferSelect): CatalogRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    rowVersion: row.rowVersion,
    parentId: null,
  };
}
const fromModel = (row: typeof equipmentModels.$inferSelect): CatalogRow => ({
  ...fromSimple(row as unknown as typeof vendors.$inferSelect),
  parentId: row.vendorId,
});
const fromSoftware = (row: typeof softwareVersions.$inferSelect): CatalogRow => ({
  id: row.id,
  code: row.versionLabel,
  name: row.name,
  active: row.active,
  rowVersion: row.rowVersion,
  parentId: row.modelId,
});

/** Locks the target row `FOR UPDATE`; null when it is not in the workspace. */
export async function lockRow(
  tx: Tx,
  kind: CatalogKind,
  workspaceId: string,
  id: string,
): Promise<CatalogRow | null> {
  if (kind === 'model') {
    const [row] = await tx
      .select()
      .from(equipmentModels)
      .where(and(eq(equipmentModels.workspaceId, workspaceId), eq(equipmentModels.id, id)))
      .for('update');
    return row ? fromModel(row) : null;
  }
  if (kind === 'software') {
    const [row] = await tx
      .select()
      .from(softwareVersions)
      .where(and(eq(softwareVersions.workspaceId, workspaceId), eq(softwareVersions.id, id)))
      .for('update');
    return row ? fromSoftware(row) : null;
  }
  const t = simpleTable(kind);
  const [row] = await tx
    .select()
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.id, id)))
    .for('update');
  return row ? fromSimple(row) : null;
}

/** A parent row (`FOR SHARE`) a new or remapped row hangs under; null when it is not in the workspace. */
export async function shareLockParent(
  tx: Tx,
  kind: ParentKind,
  workspaceId: string,
  id: string,
): Promise<{ id: string; active: boolean } | null> {
  const t =
    kind === 'model' ? (equipmentModels as unknown as typeof vendors) : simpleTable(kind);
  const [row] = await tx
    .select({ id: t.id, active: t.active })
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.id, id)))
    .for('share');
  return row ?? null;
}

/** Process rows of the workspace among `ids` (`FOR SHARE`), in no order. */
export async function shareLockProcesses(
  tx: Tx,
  workspaceId: string,
  ids: readonly string[],
): Promise<{ id: string; active: boolean }[]> {
  if (ids.length === 0) return [];
  return tx
    .select({ id: processCategories.id, active: processCategories.active })
    .from(processCategories)
    .where(and(eq(processCategories.workspaceId, workspaceId), inArray(processCategories.id, [...ids])))
    .for('share');
}

/** True when another row of the same ADR-0107 scope already holds this comparison key. */
export async function codeKeyTaken(
  tx: Tx,
  kind: CatalogKind,
  workspaceId: string,
  key: string,
  scopeParentId: string | null,
  exceptId: string | null,
): Promise<boolean> {
  if (kind === 'model') {
    const t = equipmentModels;
    const [row] = await tx
      .select({ id: t.id })
      .from(t)
      .where(
        and(
          eq(t.workspaceId, workspaceId),
          eq(t.vendorId, scopeParentId as string),
          eq(t.codeKey, key),
          exceptId ? ne(t.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    return Boolean(row);
  }
  if (kind === 'software') {
    const t = softwareVersions;
    const [row] = await tx
      .select({ id: t.id })
      .from(t)
      .where(
        and(
          eq(t.workspaceId, workspaceId),
          eq(t.modelId, scopeParentId as string),
          eq(t.versionKey, key),
          exceptId ? ne(t.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    return Boolean(row);
  }
  const t = simpleTable(kind);
  const [row] = await tx
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.codeKey, key), exceptId ? ne(t.id, exceptId) : undefined))
    .limit(1);
  return Boolean(row);
}

/** Runs one statement inside a savepoint so a unique violation leaves the transaction usable. */
async function guarded<T>(tx: Tx, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`SAVEPOINT catalog_write`);
  try {
    const result = await run();
    await tx.execute(sql`RELEASE SAVEPOINT catalog_write`);
    return result;
  } catch (error) {
    await tx.execute(sql`ROLLBACK TO SAVEPOINT catalog_write`);
    if (isUniqueViolation(error)) throw new DuplicateCatalogKeyError();
    throw error;
  }
}

export interface NewRow {
  workspaceId: string;
  actorId: string;
  /** Typed original; the comparison key is computed here, never taken from input. */
  code: string;
  name: string;
  parentId: string | null;
}

export async function insertRow(tx: Tx, kind: CatalogKind, input: NewRow): Promise<CatalogRow> {
  const stamp = { workspaceId: input.workspaceId, createdBy: input.actorId, updatedBy: input.actorId };
  const key = toCodeKey(input.code);
  return guarded(tx, async () => {
    if (kind === 'model') {
      const [row] = await tx
        .insert(equipmentModels)
        .values({ ...stamp, vendorId: input.parentId as string, code: input.code, codeKey: key, name: input.name })
        .returning();
      return fromModel(row as typeof equipmentModels.$inferSelect);
    }
    if (kind === 'software') {
      const [row] = await tx
        .insert(softwareVersions)
        .values({ ...stamp, modelId: input.parentId as string, versionLabel: input.code, versionKey: key, name: input.name })
        .returning();
      return fromSoftware(row as typeof softwareVersions.$inferSelect);
    }
    const t = simpleTable(kind);
    const [row] = await tx
      .insert(t)
      .values({ ...stamp, code: input.code, codeKey: key, name: input.name })
      .returning();
    return fromSimple(row as typeof vendors.$inferSelect);
  });
}

export async function updateRow(
  tx: Tx,
  kind: CatalogKind,
  workspaceId: string,
  id: string,
  actorId: string,
  next: { code: string; name: string },
): Promise<CatalogRow> {
  const bump = { rowVersion: sql`row_version + 1`, updatedAt: sql`now()`, updatedBy: actorId };
  const key = toCodeKey(next.code);
  return guarded(tx, async () => {
    if (kind === 'model') {
      const t = equipmentModels;
      const [row] = await tx
        .update(t)
        .set({ ...bump, code: next.code, codeKey: key, name: next.name })
        .where(and(eq(t.workspaceId, workspaceId), eq(t.id, id)))
        .returning();
      return fromModel(row as typeof t.$inferSelect);
    }
    if (kind === 'software') {
      const t = softwareVersions;
      const [row] = await tx
        .update(t)
        .set({ ...bump, versionLabel: next.code, versionKey: key, name: next.name })
        .where(and(eq(t.workspaceId, workspaceId), eq(t.id, id)))
        .returning();
      return fromSoftware(row as typeof t.$inferSelect);
    }
    const t = simpleTable(kind);
    const [row] = await tx
      .update(t)
      .set({ ...bump, code: next.code, codeKey: key, name: next.name })
      .where(and(eq(t.workspaceId, workspaceId), eq(t.id, id)))
      .returning();
    return fromSimple(row as typeof t.$inferSelect);
  });
}

export async function setRowActive(
  tx: Tx,
  kind: CatalogKind,
  workspaceId: string,
  id: string,
  actorId: string,
  active: boolean,
): Promise<CatalogRow> {
  const set = { active, rowVersion: sql`row_version + 1`, updatedAt: sql`now()`, updatedBy: actorId };
  if (kind === 'model') {
    const t = equipmentModels;
    const [row] = await tx.update(t).set(set).where(and(eq(t.workspaceId, workspaceId), eq(t.id, id))).returning();
    return fromModel(row as typeof t.$inferSelect);
  }
  if (kind === 'software') {
    const t = softwareVersions;
    const [row] = await tx.update(t).set(set).where(and(eq(t.workspaceId, workspaceId), eq(t.id, id))).returning();
    return fromSoftware(row as typeof t.$inferSelect);
  }
  const t = simpleTable(kind);
  const [row] = await tx.update(t).set(set).where(and(eq(t.workspaceId, workspaceId), eq(t.id, id))).returning();
  return fromSimple(row as typeof t.$inferSelect);
}

export async function modelProcessIds(tx: Tx, workspaceId: string, modelId: string): Promise<string[]> {
  const rows = await tx
    .select({ processId: modelProcesses.processId })
    .from(modelProcesses)
    .where(and(eq(modelProcesses.workspaceId, workspaceId), eq(modelProcesses.modelId, modelId)));
  return rows.map((r) => r.processId).sort();
}

/** Adds and removes mapping rows; the model row itself (and its id) is untouched. */
export async function changeModelProcesses(
  tx: Tx,
  workspaceId: string,
  modelId: string,
  actorId: string,
  add: readonly string[],
  remove: readonly string[],
): Promise<void> {
  if (remove.length > 0) {
    await tx
      .delete(modelProcesses)
      .where(
        and(
          eq(modelProcesses.workspaceId, workspaceId),
          eq(modelProcesses.modelId, modelId),
          inArray(modelProcesses.processId, [...remove]),
        ),
      );
  }
  if (add.length > 0) {
    await tx
      .insert(modelProcesses)
      .values(add.map((processId) => ({ workspaceId, modelId, processId, assignedBy: actorId })));
  }
}
