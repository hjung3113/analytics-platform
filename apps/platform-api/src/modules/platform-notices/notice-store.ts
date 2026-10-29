// Persistence of `platform.notices`. Every statement is scoped to the session's workspace; the
// wall-clock `until` goes in and out as `YYYY-MM-DDTHH:mm:ss` (the column is a naive timestamp).

import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import { notices } from '../../db/schema/platform.js';
import type { Tx } from '../../db/tx.js';
import type { HomeNotice, Notice, NoticeDraft } from './types.js';
import { versionOf } from './types.js';

type Row = typeof notices.$inferSelect;

const wire = (until: string) => until.replace(' ', 'T').slice(0, 19);

export function toNotice(row: Row): Notice {
  return {
    id: row.id,
    title: { ko: row.titleKo, en: row.titleEn },
    content: { ko: row.contentKo, en: row.contentEn },
    scopeId: row.scopeId,
    until: wire(row.until),
    version: versionOf(row.revision),
  };
}

export function toHomeNotice(row: Row): HomeNotice {
  return {
    id: row.id,
    title: { ko: row.titleKo, en: row.titleEn },
    scopeId: row.scopeId,
    until: wire(row.until),
  };
}

const columns = (draft: NoticeDraft) => ({
  titleKo: draft.title.ko,
  titleEn: draft.title.en,
  contentKo: draft.content.ko,
  contentEn: draft.content.en,
  scopeId: draft.scopeId,
  until: draft.until,
});

export async function insertNotice(
  tx: Tx,
  workspaceId: string,
  authorActorId: string,
  draft: NoticeDraft,
): Promise<Row> {
  const [row] = await tx
    .insert(notices)
    .values({ workspaceId, authorActorId, ...columns(draft) })
    .returning();
  return row as Row;
}

/** The workspace's row under a row lock, so a concurrent update/delete waits for this transaction. */
export async function lockNotice(tx: Tx, workspaceId: string, id: string): Promise<Row | null> {
  const rows = await tx
    .select()
    .from(notices)
    .where(and(eq(notices.workspaceId, workspaceId), eq(notices.id, id)))
    .for('update')
    .limit(1);
  return rows[0] ?? null;
}

export async function updateNotice(tx: Tx, current: Row, draft: NoticeDraft): Promise<Row> {
  const [row] = await tx
    .update(notices)
    .set({ ...columns(draft), revision: current.revision + 1, updatedAt: sql`now()` })
    .where(and(eq(notices.workspaceId, current.workspaceId), eq(notices.id, current.id)))
    .returning();
  return row as Row;
}

export async function deleteNotice(tx: Tx, current: Row): Promise<void> {
  await tx
    .delete(notices)
    .where(and(eq(notices.workspaceId, current.workspaceId), eq(notices.id, current.id)));
}

/**
 * The management list, expired notices included. Only global notices are listed: a site-targeted row
 * is listed only for a session granted that site, and this server knows no authoritative site grants.
 */
export async function listGlobalNotices(tx: Tx, workspaceId: string): Promise<Notice[]> {
  const rows = await tx
    .select()
    .from(notices)
    .where(and(eq(notices.workspaceId, workspaceId), isNull(notices.scopeId)))
    .orderBy(desc(notices.updatedAt), asc(notices.id));
  return rows.map(toNotice);
}

/**
 * Unexpired notices for the Home banner: exactly this target (a null target selects the global
 * notices), `until` strictly after `nowWallClock`. Deterministic order.
 */
export async function listHomeNotices(
  tx: Tx,
  workspaceId: string,
  targetScopeId: string | null,
  nowWallClock: string,
): Promise<HomeNotice[]> {
  const rows = await tx
    .select()
    .from(notices)
    .where(
      and(
        eq(notices.workspaceId, workspaceId),
        targetScopeId === null ? isNull(notices.scopeId) : eq(notices.scopeId, targetScopeId),
        gt(notices.until, nowWallClock),
      ),
    )
    .orderBy(asc(notices.until), asc(notices.id));
  return rows.map(toHomeNotice);
}
