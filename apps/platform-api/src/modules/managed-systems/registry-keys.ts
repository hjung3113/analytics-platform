// Registry-owned `external_key` families (#1289 node i, ADR-0110 decision 5). `platform` and `space:<space id>` are sync
// keys written only by the startup sync; every other key stays free metadata (migration 0086 holds the unique index).

import { sql } from 'drizzle-orm';

import type { Tx } from '../../db/tx.js';

export const PLATFORM_MANAGED_SYSTEM_EXTERNAL_KEY = 'platform';
export const SPACE_EXTERNAL_KEY_PREFIX = 'space:';

export function isRegistryOwnedKey(key: string | null | undefined): key is string {
  return (
    key !== null &&
    key !== undefined &&
    (key === PLATFORM_MANAGED_SYSTEM_EXTERNAL_KEY || key.startsWith(SPACE_EXTERNAL_KEY_PREFIX))
  );
}

/**
 * Per-workspace transaction lock shared by the startup sync and the archive command: the sync's declared-link writes
 * and archive's "is this system still declared" check + archive must not interleave (a declared link on an archived
 * system). Take it before reading or writing managed_systems / space_links.
 */
export async function lockPlatformSystemsSync(tx: Tx, workspaceId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('platform-systems-sync'), hashtext(${workspaceId}))`,
  );
}
