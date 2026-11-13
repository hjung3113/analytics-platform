// Boot-time work for the declared capabilities of one server (ADR-0157 decisions 7, 8 and 10).
//
// - `syncDeclaredCapabilities` mirrors the registry's declared rows into `core.declared_capabilities` through the
//   SECURITY DEFINER function `core.sync_declared_capabilities` (one statement, so one transaction: rows the bundle no
//   longer declares are deleted, present rows are upserted). The app role holds EXECUTE on that function only, never a
//   privilege on the table; the audit projection reads the table as the function-owner role.
// - `countUndeclaredPermissionRows` counts the active grants, active denies and open requests of declared-prefix names the
//   registry does not hold (deployment-wide count only, never names or recipients). Not a boot failure.

import { DECLARED_CAPABILITY_PREFIX } from '@ap/feature-shared';
import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { sqlTextArray } from '../../db/sql-arrays.js';
import type { CapabilityRegistry } from './capability-registry.js';

export async function syncDeclaredCapabilities(db: Db, capabilities: CapabilityRegistry): Promise<void> {
  const rows = capabilities.declaredList();
  const sensitive = rows.length === 0
    ? sql`ARRAY[]::boolean[]`
    : sql`ARRAY[${sql.join(rows.map((row) => sql`${row.sensitive}::boolean`), sql`, `)}]::boolean[]`;
  await db.execute(sql`SELECT core.sync_declared_capabilities(${sqlTextArray(rows.map((row) => row.id))}, ${sensitive})`);
}

export interface UndeclaredPermissionRows {
  grants: number;
  denies: number;
  requests: number;
}

export async function countUndeclaredPermissionRows(db: Db, capabilities: CapabilityRegistry): Promise<UndeclaredPermissionRows> {
  const declared = sqlTextArray(capabilities.declaredList().map((row) => row.id));
  const prefix = `${DECLARED_CAPABILITY_PREFIX}%`;
  const result = await db.execute<{ grants: number; denies: number; requests: number }>(sql`SELECT
    (SELECT count(*)::int FROM permission.permission_grants g
      WHERE g.capability LIKE ${prefix} AND g.capability <> ALL(${declared})
        AND g.revoked_at IS NULL AND g.superseded_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())) AS grants,
    (SELECT count(*)::int FROM permission.permission_denies d
      WHERE d.capability LIKE ${prefix} AND d.capability <> ALL(${declared}) AND d.revoked_at IS NULL) AS denies,
    (SELECT count(*)::int FROM permission.permission_requests r
      WHERE r.requested_capability LIKE ${prefix} AND r.requested_capability <> ALL(${declared})
        AND r.status IN ('pending', 'needs_more_info')) AS requests`);
  const row = result.rows[0];
  return { grants: Number(row?.grants ?? 0), denies: Number(row?.denies ?? 0), requests: Number(row?.requests ?? 0) };
}
