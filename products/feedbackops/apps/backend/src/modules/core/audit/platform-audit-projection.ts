import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../../../db/tx.js';

// ADR-0069 decision 6: the allowlisted audit projection for the platform audit screen.
// The allowlist (subject types, survey_response exclusion, sensitive rows, columns) lives in
// `core.platform_audit_events` (migration 0074); this wrapper only passes filters and parses.
// Caller owns request authorization.

export interface PlatformAuditFilter {
  workspaceId: string;
  subjectType?: string;
  subjectId?: string;
  actor?: string;
  action?: string;
  source?: string;
  /** Inclusive. */
  from?: Date;
  /** Exclusive. */
  to?: Date;
  /** event_type → platform action; a type missing from the map is excluded by SQL. */
  actionByEventType: Readonly<Record<string, string>>;
  sort: { field: 'at' | 'actor' | 'action' | 'source' | 'targetType'; desc: boolean };
  /** null = every row (entity audit). */
  limit: number | null;
  offset: number;
}

export interface PlatformAuditRow {
  id: string;
  at: string;
  actor: string;
  actorType: string;
  eventType: string;
  subjectType: string;
  subjectId: string;
}

const rowSchema = z.object({
  total: z.coerce.number().int().nonnegative(),
  audit_id: z.string().uuid().nullable(),
  occurred_at: z.union([z.date(), z.string()]).nullable(),
  actor_external_id: z.string().nullable(),
  actor_kind: z.string().nullable(),
  event_type: z.string().nullable(),
  subject_type: z.string().nullable(),
  subject_id: z.string().uuid().nullable(),
});

export async function platformAuditEvents(
  tx: Tx,
  f: PlatformAuditFilter,
): Promise<{ rows: PlatformAuditRow[]; total: number }> {
  const result = await tx.execute(sql`
    SELECT * FROM core.platform_audit_events(
      ${f.workspaceId}::uuid, ${f.subjectType ?? null}::text, ${f.subjectId ?? null}::uuid,
      ${f.actor ?? null}::text, ${f.action ?? null}::text, ${f.source ?? null}::text,
      ${f.from ? f.from.toISOString() : null}::timestamptz,
      ${f.to ? f.to.toISOString() : null}::timestamptz,
      ${JSON.stringify(f.actionByEventType)}::jsonb, ${f.sort.field}::text, ${f.sort.desc}::boolean,
      ${f.limit}::integer, ${f.offset}::integer)
  `);
  const parsed = result.rows.map((row) => rowSchema.parse(row));
  const rows: PlatformAuditRow[] = [];
  for (const r of parsed) {
    if (r.audit_id === null) continue; // the total-only row of a page past the end
    rows.push({
      id: r.audit_id,
      at: new Date(r.occurred_at as Date | string).toISOString(),
      actor: r.actor_external_id as string,
      actorType: r.actor_kind as string,
      eventType: r.event_type as string,
      subjectType: r.subject_type as string,
      subjectId: r.subject_id as string,
    });
  }
  return { rows, total: parsed[0]?.total ?? 0 };
}
