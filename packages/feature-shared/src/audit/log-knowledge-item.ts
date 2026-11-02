// Log knowledge item audit detail schemas (#1197 w, ADR-0109). Non-sensitive and body-free: the item number and
// title, plus what the event changed (revision number, assessment dimension and states, derivation source).
// Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_KNOWLEDGE_ITEM_AUDIT_EVENT_TYPES = [
  'knowledge.item.created',
  'knowledge.item.revised',
  'knowledge.item.assessed',
  'knowledge.item.derived',
  'knowledge.item.archived',
  'knowledge.item.restored',
] as const;

export const LOG_KNOWLEDGE_ITEM_SUBJECT_TYPES = ['knowledge_item'] as const;

export const logKnowledgeItemDetailSchema = z
  .object({
    itemNo: z.number().int().min(1),
    title: z.string(),
    revisionNo: z.number().int().min(1).optional(),
    dimension: z.enum(['verification', 'processing']).optional(),
    priorState: z.string().optional(),
    newState: z.string().optional(),
    sourceItemId: z.string().uuid().optional(),
    sourceRevisionNo: z.number().int().min(1).optional(),
  })
  .strict();
export type LogKnowledgeItemDetail = z.infer<typeof logKnowledgeItemDetailSchema>;

export const LOG_KNOWLEDGE_ITEM_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'knowledge.item.created': logKnowledgeItemDetailSchema,
  'knowledge.item.revised': logKnowledgeItemDetailSchema,
  'knowledge.item.assessed': logKnowledgeItemDetailSchema,
  'knowledge.item.derived': logKnowledgeItemDetailSchema,
  'knowledge.item.archived': logKnowledgeItemDetailSchema,
  'knowledge.item.restored': logKnowledgeItemDetailSchema,
} as const satisfies Record<(typeof LOG_KNOWLEDGE_ITEM_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
