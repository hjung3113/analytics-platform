// Read side of the log explorer investigations (#1468 b): owner-scoped. The list is the caller's own investigations;
// the detail answers for the caller's own investigation only, so another owner's id and another workspace's id are
// the same `null` (no existence leak).

import { and, count, desc, eq } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { investigations } from '../../../db/schema/log-explorer.js';
import type { Tx } from '../../../db/tx.js';
import { storedEvidence } from '../domain/evidence.js';
import type { ListQuery } from '../domain/investigation-params.js';
import type { InvestigationRow } from './investigation-write.js';

const i = investigations;

export interface InvestigationSummary {
  id: string;
  title: string;
  origin: string;
  roundId: string | null;
  status: string;
  version: string;
  evidenceCount: number;
  createdAt: string;
  updatedAt: string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v : new Date(v)).toISOString();

export const summaryOf = (row: InvestigationRow): InvestigationSummary => ({
  id: row.id,
  title: row.title,
  origin: row.origin,
  roundId: row.roundId,
  status: row.status,
  version: String(row.rowVersion),
  evidenceCount: storedEvidence(row.evidence).length,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

export async function listMine(
  db: Db | Tx,
  workspaceId: string,
  ownerActorId: string,
  q: ListQuery,
): Promise<{ rows: InvestigationSummary[]; total: number }> {
  const where = and(eq(i.workspaceId, workspaceId), eq(i.ownerActorId, ownerActorId), q.status ? eq(i.status, q.status) : undefined);
  const [total] = await db.select({ n: count() }).from(i).where(where);
  const rows = await db
    .select()
    .from(i)
    .where(where)
    .orderBy(desc(i.updatedAt), desc(i.id))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  return { rows: rows.map(summaryOf), total: Number(total?.n ?? 0) };
}

export async function getOwned(db: Db | Tx, workspaceId: string, ownerActorId: string, id: string): Promise<InvestigationRow | null> {
  const [row] = await db
    .select()
    .from(i)
    .where(and(eq(i.workspaceId, workspaceId), eq(i.ownerActorId, ownerActorId), eq(i.id, id)))
    .limit(1);
  return row ?? null;
}
