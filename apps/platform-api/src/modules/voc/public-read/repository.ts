// apps/platform-api/src/modules/voc/public-read/repository.ts
//
// SQL for the public VOC projection. Every query carries the workspace, `archived_at IS NULL` and
// `publicVocVisibilityPredicate`; selected columns are the allowlist, nothing else is read from the
// operator tables (no reporter_id value, owner, severity, triage, cluster, link or analytics area).
import { sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import {
  managedSystemInWorkspaceSql,
  managedSystemNameInWorkspaceSql,
} from '../../managed-systems/read-projections.js';
import { escapeLikePattern } from '../../../lib/sql-like.js';
import { type PublicReadRule, publicVocVisibilityPredicate } from './rule.js';

const V = sql`v`;

export type PublicVocRow = {
  id: string;
  display_id: string;
  title: string;
  reporter_facing_status: string;
  managed_system_id: string;
  managed_system_name: string;
  created_at: Date | string;
  updated_at: Date | string;
  created_at_raw: string;
  mine: boolean;
  description_rich_content?: unknown;
};

export type PublicEntryRow = {
  id: string;
  body_rich_content: unknown;
  created_at: Date | string;
};

function mineColumn(rule: PublicReadRule) {
  return sql`(v.reporter_id = ${rule.actorId}) AS mine`;
}

export async function selectPublicVocPage(
  db: Db | Tx,
  args: {
    workspaceId: string;
    rule: PublicReadRule;
    mine: boolean;
    managedSystemId?: string;
    q?: string;
    cursor?: { timestamp: string; id: string };
    limit: number;
  },
): Promise<PublicVocRow[]> {
  const { workspaceId, rule } = args;
  const wheres = [
    sql`v.workspace_id = ${workspaceId}`,
    sql`v.archived_at IS NULL`,
    managedSystemInWorkspaceSql(sql`v.primary_managed_system_id`, workspaceId),
    args.mine ? sql`v.reporter_id = ${rule.actorId}` : publicVocVisibilityPredicate(rule, V),
  ];
  if (args.managedSystemId !== undefined) {
    wheres.push(sql`v.primary_managed_system_id = ${args.managedSystemId}::uuid`);
  }
  if (args.q !== undefined) {
    const pattern = escapeLikePattern(args.q);
    wheres.push(
      sql`(v.display_id ILIKE ${`${pattern}%`} ESCAPE '\\' OR v.title ILIKE ${`%${pattern}%`} ESCAPE '\\')`,
    );
  }
  if (args.cursor !== undefined) {
    wheres.push(
      sql`(v.created_at < ${args.cursor.timestamp}::timestamptz
        OR (v.created_at = ${args.cursor.timestamp}::timestamptz AND v.id < ${args.cursor.id}::uuid))`,
    );
  }
  const result = await (db as Db).execute<PublicVocRow>(sql`
    SELECT v.id, v.display_id, v.title, v.reporter_facing_status,
           v.primary_managed_system_id AS managed_system_id, ${managedSystemNameInWorkspaceSql(sql`v.primary_managed_system_id`, workspaceId)} AS managed_system_name,
           v.created_at, v.updated_at, v.created_at::text AS created_at_raw, ${mineColumn(rule)}
      FROM voc.vocs v
     WHERE ${sql.join(wheres, sql` AND `)}
     ORDER BY v.created_at DESC, v.id DESC
     LIMIT ${args.limit + 1}
  `);
  return result.rows;
}

/** One query for "missing" and "not visible": the predicate is part of the WHERE. */
export async function selectPublicVocById(
  db: Db | Tx,
  args: { workspaceId: string; rule: PublicReadRule; vocId: string },
): Promise<PublicVocRow | null> {
  const { workspaceId, rule, vocId } = args;
  const result = await (db as Db).execute<PublicVocRow>(sql`
    SELECT v.id, v.display_id, v.title, v.reporter_facing_status,
           v.primary_managed_system_id AS managed_system_id, ${managedSystemNameInWorkspaceSql(sql`v.primary_managed_system_id`, workspaceId)} AS managed_system_name,
           v.created_at, v.updated_at, v.created_at::text AS created_at_raw,
           v.description_rich_content, ${mineColumn(rule)}
      FROM voc.vocs v
     WHERE v.id = ${vocId}::uuid
       AND v.workspace_id = ${workspaceId}
       AND v.archived_at IS NULL
       AND ${managedSystemInWorkspaceSql(sql`v.primary_managed_system_id`, workspaceId)}
       AND ${publicVocVisibilityPredicate(rule, V)}
     LIMIT 1
  `);
  return result.rows[0] ?? null;
}

export const PUBLIC_ENTRY_LIMIT = 200;

/** `public_update` entries that carry a body, newest 200, returned oldest first. */
export async function selectPublicEntries(
  db: Db | Tx,
  args: { workspaceId: string; vocId: string },
): Promise<PublicEntryRow[]> {
  const result = await (db as Db).execute<PublicEntryRow>(sql`
    SELECT pu.id, pu.body_rich_content, pu.created_at
      FROM voc.voc_public_updates pu
      JOIN voc.vocs v ON v.id = pu.voc_id AND v.workspace_id = ${args.workspaceId} AND v.archived_at IS NULL
     WHERE pu.voc_id = ${args.vocId}::uuid
       AND pu.skip_public_update = false
     ORDER BY pu.created_at DESC, pu.id DESC
     LIMIT ${PUBLIC_ENTRY_LIMIT}
  `);
  return result.rows.reverse();
}

/** Attachment entitlement, VOC-body arm: the VOC passes the public read rule. */
export async function isVocPubliclyReadable(
  db: Db | Tx,
  args: { workspaceId: string; rule: PublicReadRule; vocId: string },
): Promise<boolean> {
  const row = await selectPublicVocById(db, args);
  return row !== null;
}

/** Attachment entitlement, comment arm: a bodied `public_update` of a VOC that passes the rule. */
export async function isPublicUpdatePubliclyReadable(
  db: Db | Tx,
  args: { workspaceId: string; rule: PublicReadRule; entryId: string },
): Promise<boolean> {
  const result = await (db as Db).execute(sql`
    SELECT 1
      FROM voc.voc_public_updates pu
      JOIN voc.vocs v ON v.id = pu.voc_id AND v.workspace_id = ${args.workspaceId} AND v.archived_at IS NULL
     WHERE pu.id = ${args.entryId}::uuid
       AND pu.skip_public_update = false
       AND ${publicVocVisibilityPredicate(args.rule, V)}
     LIMIT 1
  `);
  return result.rows.length === 1;
}
