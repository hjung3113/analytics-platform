// Log knowledge model spec audit detail schemas (#1196 b1, ADR-0111). Non-sensitive and body-free: the model, the
// revision number and counts / the content hash — never a module, event or field text.
// Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_KNOWLEDGE_SPEC_AUDIT_EVENT_TYPES = [
  'knowledge.spec.draft_saved',
  'knowledge.spec.published',
  'knowledge.spec.rejected',
] as const;

/** Subject id of these events is the revision id. */
export const LOG_KNOWLEDGE_SPEC_SUBJECT_TYPES = ['knowledge_model_spec'] as const;

const countsSchema = z
  .object({
    modules: z.number().int().min(0),
    events: z.number().int().min(0),
    relations: z.number().int().min(0),
  })
  .strict();

const base = {
  modelId: z.string().uuid(),
  revisionNo: z.number().int().min(1),
};

export const logKnowledgeSpecDraftSavedDetailSchema = z
  .object({
    ...base,
    mode: z.enum(['create', 'append', 'replace']),
    /** How the rows arrived (#1196 b2); a `create` carries no rows and omits it. Never the text itself. */
    input: z.enum(['rows', 'tsv', 'paste']).optional(),
    /** Rows added by this call (a `replace` reports the new draft's rows). */
    added: countsSchema,
    /** `replace` only: the draft this call rejected in favour of the new one. */
    replacedRevisionId: z.string().uuid().optional(),
  })
  .strict();

export const logKnowledgeSpecPublishedDetailSchema = z
  .object({
    ...base,
    outcome: z.enum(['published', 'unchanged']),
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
    counts: countsSchema,
    /** `unchanged` only: the already published revision with the same hash. */
    existingRevisionId: z.string().uuid().optional(),
  })
  .strict();

export const logKnowledgeSpecRejectedDetailSchema = z
  .object({
    ...base,
    /** The reason is free text typed by a person: it is not copied into the audit detail (length only). */
    reasonLength: z.number().int().min(0).max(500),
  })
  .strict();

export const LOG_KNOWLEDGE_SPEC_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'knowledge.spec.draft_saved': logKnowledgeSpecDraftSavedDetailSchema,
  'knowledge.spec.published': logKnowledgeSpecPublishedDetailSchema,
  'knowledge.spec.rejected': logKnowledgeSpecRejectedDetailSchema,
} as const satisfies Record<(typeof LOG_KNOWLEDGE_SPEC_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
