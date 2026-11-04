// Approved read projection over `platform.client_errors` for other modules (#606). Identity fields
// only (menu, path, error name, receive time): the table never holds message, stack or URL
// (http-adapter-contract §1, R6.7), and `actor_id` / `request_id` are not granted to the app role.
// The correlation id is a lookup key, not a permission: callers decide who may ask.
import { and, asc, eq } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { clientErrors } from '../../db/schema/platform.js';
import type { Tx } from '../../db/tx.js';

export interface ClientErrorIdentity {
  menuId: string;
  path: string;
  name: string;
  receivedAt: Date;
}

/** Earliest report in the workspace carrying this correlation id, or null. */
export async function readClientErrorIdentity(
  db: Db | Tx,
  workspaceId: string,
  correlationId: string,
): Promise<ClientErrorIdentity | null> {
  const rows = await db
    .select({
      menuId: clientErrors.menuId,
      path: clientErrors.path,
      name: clientErrors.name,
      receivedAt: clientErrors.receivedAt,
    })
    .from(clientErrors)
    .where(
      and(eq(clientErrors.workspaceId, workspaceId), eq(clientErrors.correlationId, correlationId)),
    )
    .orderBy(asc(clientErrors.receivedAt))
    .limit(1);
  return rows[0] ?? null;
}
