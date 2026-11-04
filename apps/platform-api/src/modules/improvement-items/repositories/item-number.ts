// Per-workspace display number of an improvement item (`IM-<n>`). One atomic upsert on the workspace's counter row:
// the first item of a workspace inserts the row, every later one increments it. Two concurrent allocations
// serialize on that row (the second waits for the first transaction, then increments) and never see the same
// number; the unique `(workspace_id, item_no)` index is the backstop. A rolled-back transaction rolls the counter
// back with it, so numbers stay gap-free.

import { sql } from 'drizzle-orm';

import { improvementItemCounters } from '../../../db/schema/improvement.js';
import type { Tx } from '../../../db/tx.js';

export async function allocateImprovementItemNo(tx: Tx, workspaceId: string): Promise<number> {
  const [row] = await tx
    .insert(improvementItemCounters)
    .values({ workspaceId, lastItemNo: 1 })
    .onConflictDoUpdate({
      target: improvementItemCounters.workspaceId,
      set: { lastItemNo: sql`"improvement"."item_counter"."last_item_no" + 1` },
    })
    .returning({ n: improvementItemCounters.lastItemNo });
  if (!row) throw new Error('improvement item number allocation returned no row');
  return row.n;
}
