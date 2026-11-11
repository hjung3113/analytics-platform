// Writes of the Sample Window table and `eqv.equipment` (#1658 Sample Window·Fleet PR, ADR-0139 amendment). All run in the caller's transaction.
// Windows are insert-only except `state` and `counterpart_hash` (with the audit columns): the runtime role holds no other UPDATE and no DELETE
// (migration 0125), and no function here goes beyond it. `eqv.equipment` takes an INSERT of its four columns only.
import { and, eq, sql } from 'drizzle-orm';

import type { Tx } from '../../../db/tx.js';
import { sampleWindows } from '../../../db/schema/eqv.js';
import type { WindowState } from '../domain/window-checks.js';

export async function insertWindow(
  tx: Tx,
  v: {
    workspaceId: string; equipmentId: string; hash: string; from: string; to: string; dataGeneration: string; timeDomain: string; occurrences: number;
    state: 'active' | 'staged'; counterpartHash: string | null; batch: unknown; inventory: unknown; actorId: string;
  },
) {
  const [row] = await tx
    .insert(sampleWindows)
    .values({
      workspaceId: v.workspaceId,
      equipmentId: v.equipmentId,
      hash: v.hash,
      fromAt: v.from,
      toAt: v.to,
      dataGeneration: v.dataGeneration,
      timeDomain: v.timeDomain,
      occurrences: v.occurrences,
      state: v.state,
      counterpartHash: v.counterpartHash,
      batch: v.batch,
      inventory: v.inventory,
      importedBy: v.actorId,
      updatedBy: v.actorId,
    })
    .returning({ id: sampleWindows.id });
  if (!row) throw new Error('eqv sample window insert returned no row');
  return row;
}

/** The only window update: its state (and counterpart) changes; the content never does. */
export async function setWindowState(
  tx: Tx,
  v: { workspaceId: string; equipmentId: string; hash: string; state: WindowState; counterpartHash: string | null; actorId: string },
) {
  const [row] = await tx
    .update(sampleWindows)
    .set({ state: v.state, counterpartHash: v.counterpartHash, updatedAt: sql`now()`, updatedBy: v.actorId })
    .where(and(eq(sampleWindows.workspaceId, v.workspaceId), eq(sampleWindows.equipmentId, v.equipmentId), eq(sampleWindows.hash, v.hash)))
    .returning({ id: sampleWindows.id });
  if (!row) throw new Error('eqv sample window update returned no row');
  return row;
}

export async function insertEquipment(tx: Tx, v: { workspaceId: string; equipmentId: string; label: string; modelId: string }) {
  // Raw, four columns: drizzle also lists the defaulted `created_at`, which the INSERT grant (migration 0125) does not cover.
  await tx.execute(sql`insert into eqv.equipment (workspace_id, equipment_id, label, model_id) values (${v.workspaceId}, ${v.equipmentId}, ${v.label}, ${v.modelId})`);
}
