// Per-workspace display number of a knowledge item (`KI-<n>`). One atomic upsert on the workspace's counter row:
// the first item of a workspace inserts the row, every later one increments it. Two concurrent allocations
// serialize on that row (the second waits for the first transaction, then increments) and never see the same
// number; the unique `(workspace_id, item_no)` index is the backstop. A rolled-back transaction rolls the counter
// back with it, so numbers stay gap-free.

import { sql } from 'drizzle-orm';

import { itemCounters } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';

export async function allocateItemNo(tx: Tx, workspaceId: string): Promise<number> {
  const [row] = await tx
    .insert(itemCounters)
    .values({ workspaceId, lastItemNo: 1 })
    .onConflictDoUpdate({
      target: itemCounters.workspaceId,
      set: { lastItemNo: sql`"knowledge"."item_counter"."last_item_no" + 1` },
    })
    .returning({ n: itemCounters.lastItemNo });
  if (!row) throw new Error('item number allocation returned no row');
  return row.n;
}
