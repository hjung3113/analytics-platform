import { type SQL, type SQLWrapper, and, eq, isNull, sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { managedSystems } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';
import { PLATFORM_MANAGED_SYSTEM_EXTERNAL_KEY } from './registry-keys.js';

/** Non-archived managed system ids for a workspace. */
export async function allManagedSystemIds(db: Db | Tx, workspaceId: string): Promise<string[]> {
  const rows = await (db as Db)
    .select({ id: managedSystems.id })
    .from(managedSystems)
    .where(
      sql`${managedSystems.workspaceId} = ${workspaceId} AND ${managedSystems.archivedAt} IS NULL`,
    );
  return rows.map((r) => r.id);
}

/** Live (non-archived) systems of a workspace with the fields VOC create policy reads, ordered by name then id. */
export async function listLiveManagedSystemsForVocCreate(
  db: Db | Tx,
  workspaceId: string,
): Promise<Array<{ id: string; external_key: string | null; voc_create_mode: string }>> {
  return (db as Db)
    .select({
      id: managedSystems.id,
      external_key: managedSystems.externalKey,
      voc_create_mode: managedSystems.vocCreateMode,
    })
    .from(managedSystems)
    .where(and(eq(managedSystems.workspaceId, workspaceId), isNull(managedSystems.archivedAt)))
    .orderBy(managedSystems.name, managedSystems.id);
}

/** Whether a Managed System exists in a workspace, including archived systems. */
export async function managedSystemExists(
  db: Db | Tx,
  workspaceId: string,
  managedSystemId: string,
): Promise<boolean> {
  const rows = await (db as Db)
    .select({ id: managedSystems.id })
    .from(managedSystems)
    .where(
      sql`${managedSystems.id} = ${managedSystemId} AND ${managedSystems.workspaceId} = ${workspaceId}`,
    )
    .limit(1);
  return rows.length > 0;
}

/** Managed System id/workspace pairs, including archived systems. */
export async function allManagedSystemWorkspacePairs(
  db: Db | Tx,
): Promise<Array<{ id: string; workspace_id: string }>> {
  return (db as Db)
    .select({ id: managedSystems.id, workspace_id: managedSystems.workspaceId })
    .from(managedSystems);
}

/**
 * SQL condition: the Managed System referenced by `managedSystemIdColumn` is not
 * archived. For read predicates in other modules that must leave out rows of an
 * archived Managed System (#951 Triage queue) without importing this table.
 */
export function managedSystemIsLiveSql(managedSystemIdColumn: SQLWrapper): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${managedSystems} ms
    WHERE ms.id = ${managedSystemIdColumn} AND ms.archived_at IS NULL
  )`;
}

/**
 * SQL condition: the Managed System referenced by `managedSystemIdColumn` belongs to the workspace
 * (archived systems included). For read projections in other modules that must drop rows whose
 * system is not in the caller's workspace, without reading `core.managed_systems` themselves.
 */
export function managedSystemInWorkspaceSql(
  managedSystemIdColumn: SQLWrapper,
  workspaceId: string,
): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${managedSystems} ms
    WHERE ms.id = ${managedSystemIdColumn} AND ms.workspace_id = ${workspaceId}
  )`;
}

/** SQL scalar: the name of the workspace's Managed System referenced by `managedSystemIdColumn`. */
export function managedSystemNameInWorkspaceSql(
  managedSystemIdColumn: SQLWrapper,
  workspaceId: string,
): SQL {
  return sql`(
    SELECT ms.name FROM ${managedSystems} ms
    WHERE ms.id = ${managedSystemIdColumn} AND ms.workspace_id = ${workspaceId}
  )`;
}

/** Active workspace-owned MS lock for bounded VOC suggestion admission (FO ADR-0068). */
export async function lockLiveManagedSystemForShare(
  tx: Tx,
  workspaceId: string,
  managedSystemId: string,
): Promise<boolean> {
  const result = await tx.execute(sql`SELECT id FROM ${managedSystems}
    WHERE id = ${managedSystemId} AND workspace_id = ${workspaceId}
      AND archived_at IS NULL FOR SHARE`);
  return result.rows.length > 0;
}

export { PLATFORM_MANAGED_SYSTEM_EXTERNAL_KEY };

/**
 * The workspace's 「플랫폼」 Managed System: the one non-archived row whose `external_key` is
 * `platform`. No row, or more than one, returns null — the public-read platform arm fails closed
 * (a partial unique index keeps the key unique among active rows, #1289 node i).
 */
export async function platformManagedSystemId(
  db: Db | Tx,
  workspaceId: string,
): Promise<string | null> {
  const rows = await (db as Db)
    .select({ id: managedSystems.id })
    .from(managedSystems)
    .where(
      sql`${managedSystems.workspaceId} = ${workspaceId}
        AND ${managedSystems.externalKey} = ${PLATFORM_MANAGED_SYSTEM_EXTERNAL_KEY}
        AND ${managedSystems.archivedAt} IS NULL`,
    )
    .limit(2);
  const [only, second] = rows;
  return only !== undefined && second === undefined ? only.id : null;
}
