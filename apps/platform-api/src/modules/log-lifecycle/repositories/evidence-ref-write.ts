// Write side of the round evidence locations (#1474 X-h): `log_lifecycle.round_evidence_ref` only. Append-only (the runtime
// role holds SELECT and INSERT, a trigger refuses UPDATE and DELETE). Every statement is scoped to the workspace and runs on
// the caller's transaction; the caller holds the round row lock (`lockRound`) before reading the stored rows or allocating a
// `seq`, so `seq` is gapless per round.

import { and, eq, sql } from 'drizzle-orm';

import { roundEvidenceRefs } from '../../../db/schema/log-lifecycle.js';
import type { Tx } from '../../../db/tx.js';
import type { EvidenceRefStatus } from '../domain/evidence-ref-intake.js';

const e = roundEvidenceRefs;

/** The pointers already stored for a round (at most 1000), for the idempotency and the cap judgment. */
export async function listStoredRefTriples(
  tx: Tx,
  workspaceId: string,
  roundId: string,
): Promise<{ fileRef: string; line: number; fileSha256: string }[]> {
  return tx
    .select({ fileRef: e.fileRef, line: e.line, fileSha256: e.fileSha256 })
    .from(e)
    .where(and(eq(e.workspaceId, workspaceId), eq(e.roundId, roundId)));
}

export interface NewEvidenceRef {
  workspaceId: string;
  roundId: string;
  seq: number;
  fileRef: string;
  line: number;
  fileSha256: string;
  note: string | null;
  status: EvidenceRefStatus;
  originKind: 'log_explorer';
  originId: string;
  handedOffBy: string;
}

/** `ON CONFLICT DO NOTHING` on the triple (a raw 23505 would abort the caller's transaction); true when the row was inserted. */
export async function insertEvidenceRef(tx: Tx, v: NewEvidenceRef): Promise<boolean> {
  const rows = await tx
    .insert(e)
    .values(v)
    .onConflictDoNothing({ target: [e.workspaceId, e.roundId, e.fileRef, e.line, e.fileSha256] })
    .returning({ id: e.id });
  return rows.length > 0;
}

/** The next `seq` of a round; the caller holds the round row lock. */
export async function nextEvidenceRefSeq(tx: Tx, workspaceId: string, roundId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`coalesce(max(${e.seq}), 0) + 1` })
    .from(e)
    .where(and(eq(e.workspaceId, workspaceId), eq(e.roundId, roundId)));
  return Number(row?.n ?? 1);
}
