// Improvement item audit detail schemas (#1328 b, design docs/design/features/improvement-items.md §3). Non-sensitive
// and body-free: the item number, status names, counts and the names of the fields a write changed — never the
// problem, action, reason or effect text, which live in `improvement.item_event` (read through the item history).
// Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const IMPROVEMENT_AUDIT_EVENT_TYPES = [
  'improvement.item.created',
  'improvement.item.updated',
  'improvement.item.status_changed',
  'improvement.item.assigned',
  'improvement.item.quest_linked',
  'improvement.item.reopened',
] as const;

/** Subject id of these events is the item id. */
export const IMPROVEMENT_SUBJECT_TYPES = ['improvement_item'] as const;

const STATUS = z.enum(['open', 'in_progress', 'done', 'verified', 'dropped']);
const base = { itemNo: z.number().int().min(1) };

export const improvementItemCreatedDetailSchema = z
  .object({
    ...base,
    hasOrigin: z.boolean(),
    targetCount: z.number().int().min(0),
    assigned: z.boolean(),
    questLinked: z.boolean(),
  })
  .strict();

export const improvementItemUpdatedDetailSchema = z
  .object({
    ...base,
    /** Names of the fields the call changed (`problem`, `action`, `actionDate`, `origin`, `targets`). */
    changed: z.array(z.string()).min(1),
    targetCount: z.number().int().min(0),
  })
  .strict();

const statusMove = { ...base, from: STATUS, to: STATUS };

export const improvementItemStatusChangedDetailSchema = z.object(statusMove).strict();
export const improvementItemReopenedDetailSchema = z.object(statusMove).strict();

export const improvementItemAssignedDetailSchema = z
  .object({ ...base, assigneeId: z.string().uuid().nullable(), previousAssigneeId: z.string().uuid().nullable() })
  .strict();

export const improvementItemQuestLinkedDetailSchema = z
  .object({ ...base, questId: z.string().nullable(), previousQuestId: z.string().nullable() })
  .strict();

export const IMPROVEMENT_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'improvement.item.created': improvementItemCreatedDetailSchema,
  'improvement.item.updated': improvementItemUpdatedDetailSchema,
  'improvement.item.status_changed': improvementItemStatusChangedDetailSchema,
  'improvement.item.assigned': improvementItemAssignedDetailSchema,
  'improvement.item.quest_linked': improvementItemQuestLinkedDetailSchema,
  'improvement.item.reopened': improvementItemReopenedDetailSchema,
} as const satisfies Record<(typeof IMPROVEMENT_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
