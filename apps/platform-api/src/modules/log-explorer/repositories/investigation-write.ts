// Write side of the log explorer investigations (#1468 b): every statement is scoped to the session's workspace AND
// the owner and runs on the caller's transaction. `platform_app` holds SELECT, INSERT and a column-limited UPDATE
// (title, filters, evidence, status, row_version, updated_at) and never DELETE; the guard trigger refuses a changed
// identity/origin column, a missing `row_version` bump and any edit of an archived investigation.

import { and, eq, sql } from 'drizzle-orm';

import { investigations } from '../../../db/schema/log-explorer.js';
import type { Tx } from '../../../db/tx.js';
import type { EvidenceRef } from '../domain/evidence.js';
import type { Filters } from '../domain/investigation-input.js';

export type InvestigationRow = typeof investigations.$inferSelect;
const i = investigations;

/** Locks the owner's investigation; a foreign owner, another workspace or an unknown id is the same `null`. */
export async function lockOwned(tx: Tx, workspaceId: string, ownerActorId: string, id: string): Promise<InvestigationRow | null> {
  const [row] = await tx
    .select()
    .from(i)
    .where(and(eq(i.workspaceId, workspaceId), eq(i.ownerActorId, ownerActorId), eq(i.id, id)))
    .for('update');
  return row ?? null;
}

export interface NewInvestigation {
  workspaceId: string;
  ownerActorId: string;
  title: string;
  origin: 'standalone' | 'round';
  roundId: string | null;
  sampleSet: unknown;
}

export async function insertInvestigation(tx: Tx, v: NewInvestigation): Promise<InvestigationRow> {
  const [row] = await tx
    .insert(i)
    .values({
      workspaceId: v.workspaceId,
      ownerActorId: v.ownerActorId,
      title: v.title,
      origin: v.origin,
      roundId: v.roundId,
      // A round origin keeps SQL NULL (the round is referenced, not copied); a JS null would also be SQL NULL here.
      sampleSet: v.sampleSet,
    })
    .returning();
  if (!row) throw new Error('investigation insert returned no row');
  return row;
}

export interface InvestigationPatch {
  title?: string;
  filters?: Filters;
  evidence?: EvidenceRef[];
  status?: 'archived';
}

/** One UPDATE: the patch plus the row_version bump. Returns the new row version. */
export async function patchInvestigation(tx: Tx, workspaceId: string, id: string, patch: InvestigationPatch): Promise<number> {
  const [row] = await tx
    .update(i)
    .set({ ...patch, rowVersion: sql`${i.rowVersion} + 1`, updatedAt: sql`now()` })
    .where(and(eq(i.workspaceId, workspaceId), eq(i.id, id)))
    .returning({ v: i.rowVersion });
  if (!row) throw new Error('investigation update matched no row');
  return row.v;
}
