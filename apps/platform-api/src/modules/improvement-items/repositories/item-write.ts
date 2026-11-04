// Write side of the improvement items (#1328 b): every statement is scoped to the session's workspace and runs on the
// caller's transaction. The item row is locked FOR UPDATE by the engine's `currentVersion`; targets and events are
// written under that lock. `platform_app` holds a column-limited UPDATE on `item` (never `workspace_id`, `id`,
// `item_no`, `created_*`), INSERT on the three data tables and DELETE on `item_target` only (migration 0094); the
// guard trigger refuses a missing `row_version` bump, an illegal status pair and a changed identity column.

import { and, eq, sql } from 'drizzle-orm';

import { actors } from '../../../db/schema/core.js';
import { improvementItemEvents, improvementItemTargets, improvementItems } from '../../../db/schema/improvement.js';
import type { Tx } from '../../../db/tx.js';
import type { FieldError } from '../../menu-dispatch/types.js';

export type ItemWriteRow = typeof improvementItems.$inferSelect;
export interface TargetSnapshot {
  kind: string;
  externalKey: string;
  displayName: string;
}

const i = improvementItems;
const t = improvementItemTargets;

/** The name of the deferred origin-or-target constraint triggers (one name on `item` and on `item_target`). */
export const ORIGIN_OR_TARGET_CONSTRAINT = 'improvement_item_origin_or_target';

export async function lockItem(tx: Tx, workspaceId: string, itemId: string): Promise<ItemWriteRow | null> {
  const [row] = await tx
    .select()
    .from(i)
    .where(and(eq(i.workspaceId, workspaceId), eq(i.id, itemId)))
    .for('update');
  return row ?? null;
}

export async function targetsOfItem(tx: Tx, workspaceId: string, itemId: string): Promise<TargetSnapshot[]> {
  const rows = await tx
    .select()
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.itemId, itemId)));
  return rows
    .map((r) => ({ kind: r.kind, externalKey: r.externalKey, displayName: r.displayNameSnapshot }))
    .sort((a, b) => (a.kind + a.externalKey < b.kind + b.externalKey ? -1 : 1));
}

/** An assignee must be an actor of the session workspace (the actor FKs are plain: core.actors has no workspace key). */
export async function actorInWorkspace(tx: Tx, workspaceId: string, actorId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: actors.id })
    .from(actors)
    .where(and(eq(actors.id, actorId), eq(actors.workspaceId, workspaceId)))
    .limit(1);
  return row !== undefined;
}

export interface NewItem {
  workspaceId: string;
  actorId: string;
  itemNo: number;
  problem: string;
  action: string | null;
  actionDate: string | null;
  assigneeId: string | null;
  questId: string | null;
  questTitle: string | null;
  origin: { menuId: string; context: Record<string, unknown> } | null;
}

export async function insertItem(tx: Tx, v: NewItem): Promise<ItemWriteRow> {
  const [row] = await tx
    .insert(i)
    .values({
      workspaceId: v.workspaceId,
      itemNo: v.itemNo,
      problem: v.problem,
      action: v.action,
      actionDate: v.actionDate,
      status: 'open',
      assigneeId: v.assigneeId,
      questId: v.questId,
      questTitleSnapshot: v.questTitle,
      originMenuId: v.origin?.menuId ?? null,
      originContext: v.origin?.context ?? null,
      createdBy: v.actorId,
      updatedBy: v.actorId,
    })
    .returning();
  if (!row) throw new Error('improvement item insert returned no row');
  return row;
}

export async function insertTargets(
  tx: Tx,
  workspaceId: string,
  itemId: string,
  targets: readonly TargetSnapshot[],
): Promise<void> {
  if (targets.length === 0) return;
  await tx.insert(t).values(
    targets.map((x) => ({
      workspaceId,
      itemId,
      kind: x.kind,
      externalKey: x.externalKey,
      displayNameSnapshot: x.displayName,
    })),
  );
}

export async function replaceTargets(
  tx: Tx,
  workspaceId: string,
  itemId: string,
  targets: readonly TargetSnapshot[],
): Promise<void> {
  await tx.delete(t).where(and(eq(t.workspaceId, workspaceId), eq(t.itemId, itemId)));
  await insertTargets(tx, workspaceId, itemId, targets);
}

/** The mutable columns of `improvement.item` (the 0094 column grant lists exactly these). */
export interface ItemPatch {
  problem?: string;
  action?: string | null;
  actionDate?: string | null;
  status?: string;
  assigneeId?: string | null;
  questId?: string | null;
  questTitleSnapshot?: string | null;
  originMenuId?: string | null;
  originContext?: Record<string, unknown> | null;
  effectResult?: string | null;
  effectNote?: string | null;
  effectCompareLink?: string | null;
  dropReason?: string | null;
}

/** One UPDATE: the patch plus the row_version bump and the audit columns. Returns the new row version. */
export async function patchItem(tx: Tx, workspaceId: string, itemId: string, actorId: string, patch: ItemPatch): Promise<number> {
  const [row] = await tx
    .update(i)
    .set({
      ...patch,
      rowVersion: sql`${i.rowVersion} + 1`,
      updatedAt: sql`now()`,
      updatedBy: actorId,
    })
    .where(and(eq(i.workspaceId, workspaceId), eq(i.id, itemId)))
    .returning({ v: i.rowVersion });
  if (!row) throw new Error('improvement item update matched no row');
  return row.v;
}

export type ItemEventType = 'created' | 'updated' | 'status_changed' | 'assigned' | 'quest_linked' | 'reopened';

export async function insertEvent(
  tx: Tx,
  v: {
    workspaceId: string;
    itemId: string;
    actorId: string;
    eventType: ItemEventType;
    changes: { before: Record<string, unknown>; after: Record<string, unknown> };
    reason?: string | null;
  },
): Promise<void> {
  await tx.insert(improvementItemEvents).values({
    workspaceId: v.workspaceId,
    itemId: v.itemId,
    actorId: v.actorId,
    eventType: v.eventType,
    changes: v.changes,
    reason: v.reason ?? null,
  });
}

/** The pg error behind a driver or drizzle wrapper. */
function pgError(error: unknown): { code?: string; constraint?: string } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const e = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, ...(typeof e.constraint === 'string' ? { constraint: e.constraint } : {}) };
    }
    current = e.cause;
  }
  return null;
}

/** A violated constraint, by NAME only. The guard trigger's own 23514 has no constraint name and is never mapped. */
const CONSTRAINT_FIELD: Record<string, FieldError> = {
  improvement_item_problem_check: { path: ['problem'], code: 'malformed' },
  improvement_item_action_check: { path: ['action'], code: 'too_long' },
  improvement_item_origin_pair_check: { path: ['origin'], code: 'malformed' },
  improvement_item_origin_menu_check: { path: ['origin', 'menuId'], code: 'malformed' },
  improvement_item_origin_context_check: { path: ['origin', 'context'], code: 'malformed' },
  improvement_item_quest_pair_check: { path: ['questId'], code: 'required' },
  improvement_item_quest_text_check: { path: ['questId'], code: 'malformed' },
  improvement_item_effect_result_check: { path: ['effect', 'result'], code: 'malformed' },
  improvement_item_effect_note_check: { path: ['effect', 'note'], code: 'too_long' },
  improvement_item_effect_compare_link_check: { path: ['effect', 'compareLink'], code: 'malformed' },
  improvement_item_effect_detail_check: { path: ['effect', 'result'], code: 'required' },
  improvement_item_drop_reason_check: { path: ['reason'], code: 'too_long' },
  improvement_item_action_required_check: { path: ['action'], code: 'required' },
  improvement_item_action_date_required_check: { path: ['actionDate'], code: 'required' },
  improvement_item_verified_effect_check: { path: ['effect'], code: 'required' },
  improvement_item_dropped_reason_check: { path: ['reason'], code: 'required' },
  improvement_item_target_kind_check: { path: ['targets'], code: 'malformed' },
  improvement_item_target_key_check: { path: ['targets'], code: 'malformed' },
  improvement_item_target_name_check: { path: ['targets'], code: 'too_long' },
  improvement_item_target_item_kind_key_uq: { path: ['targets'], code: 'duplicate' },
  [ORIGIN_OR_TARGET_CONSTRAINT]: { path: ['origin'], code: 'required_or_target' },
};

export function fieldErrorOfViolation(error: unknown): FieldError | null {
  const pg = pgError(error);
  if (!pg?.constraint || (pg.code !== '23514' && pg.code !== '23505')) return null;
  return CONSTRAINT_FIELD[pg.constraint] ?? null;
}

/**
 * Runs `work`; a CHECK or unique violation that names one of the item constraints becomes the matching field error
 * (`origin:required_or_target` for the deferred Q2 trigger). Anything else, the guard trigger included, stays loud.
 */
export async function mapViolations<T>(work: () => Promise<T>, toInvalid: (error: FieldError) => Error): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const mapped = fieldErrorOfViolation(error);
    if (mapped) throw toInvalid(mapped);
    throw error;
  }
}

/** Ends a create/update by firing the deferred origin-or-target check now, so a refusal raises inside `handle`. */
export async function settleOriginOrTarget(tx: Tx): Promise<void> {
  await tx.execute(sql.raw(`SET CONSTRAINTS improvement.${ORIGIN_OR_TARGET_CONSTRAINT} IMMEDIATE`));
}
