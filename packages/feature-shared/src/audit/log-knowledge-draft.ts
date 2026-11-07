// Log knowledge draft audit detail schemas (#1198 a). Non-sensitive and body-free: ids, the proposal type, the origin,
// the draft revision number, the payload digest and the status before/after — never the title, body, evidence or the
// withdraw reason or the review rationale, which live in `knowledge.draft_revision` / `knowledge.draft` (read through their endpoints).
// Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_KNOWLEDGE_DRAFT_AUDIT_EVENT_TYPES = [
  'knowledge.draft.created',
  'knowledge.draft.updated',
  'knowledge.draft.submitted',
  'knowledge.draft.withdrawn',
  'knowledge.draft.approved',
  'knowledge.draft.rejected',
  'knowledge.draft.changes_requested',
] as const;

/** Subject id of the draft events is the draft id. */
export const LOG_KNOWLEDGE_DRAFT_SUBJECT_TYPES = ['knowledge_draft'] as const;

const STATUS = z.enum(['draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'withdrawn']);

const draftDetail = z
  .object({
    draftId: z.string().uuid(),
    proposalType: z.enum(['create', 'revise']),
    origin: z.enum(['human', 'ai', 'validator']),
    targetItemId: z.string().uuid().nullable(),
    draftRevNo: z.number().int().min(1),
    payloadDigest: z.string().regex(/^[0-9a-f]{64}$/),
    /** Null on create (there is no status before). */
    statusBefore: STATUS.nullable(),
    statusAfter: STATUS,
  })
  .strict();

export const knowledgeDraftCreatedDetailSchema = draftDetail;
export const knowledgeDraftUpdatedDetailSchema = draftDetail;
export const knowledgeDraftSubmittedDetailSchema = draftDetail;
export const knowledgeDraftWithdrawnDetailSchema = draftDetail;

// Review decisions (#1198 b): ids, the digest and the origin — never the rationale text (it lives in `knowledge.draft_review`).
const reviewDetail = z
  .object({
    draftId: z.string().uuid(),
    reviewId: z.string().uuid(),
    draftRevNo: z.number().int().min(1),
    payloadDigest: z.string().regex(/^[0-9a-f]{64}$/),
    origin: z.enum(['human', 'ai', 'validator']),
  })
  .strict();

export const knowledgeDraftApprovedDetailSchema = z
  .object({
    draftId: z.string().uuid(),
    reviewId: z.string().uuid(),
    draftRevNo: z.number().int().min(1),
    approvedDigest: z.string().regex(/^[0-9a-f]{64}$/),
    itemId: z.string().uuid(),
    revisionNo: z.number().int().min(1),
    selfApproval: z.boolean(),
    origin: z.enum(['human', 'ai', 'validator']),
  })
  .strict();
export const knowledgeDraftRejectedDetailSchema = reviewDetail;
export const knowledgeDraftChangesRequestedDetailSchema = reviewDetail;

export const LOG_KNOWLEDGE_DRAFT_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'knowledge.draft.created': knowledgeDraftCreatedDetailSchema,
  'knowledge.draft.updated': knowledgeDraftUpdatedDetailSchema,
  'knowledge.draft.submitted': knowledgeDraftSubmittedDetailSchema,
  'knowledge.draft.withdrawn': knowledgeDraftWithdrawnDetailSchema,
  'knowledge.draft.approved': knowledgeDraftApprovedDetailSchema,
  'knowledge.draft.rejected': knowledgeDraftRejectedDetailSchema,
  'knowledge.draft.changes_requested': knowledgeDraftChangesRequestedDetailSchema,
} as const satisfies Record<(typeof LOG_KNOWLEDGE_DRAFT_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
