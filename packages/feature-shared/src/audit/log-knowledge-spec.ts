// Log knowledge model spec audit detail schemas (#1196 b1, ADR-0111). Non-sensitive and body-free: the model, the
// revision number and counts / the content hash — never a module, event or field text.
// Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_KNOWLEDGE_SPEC_AUDIT_EVENT_TYPES = [
  'knowledge.spec.draft_saved',
  'knowledge.spec.published',
  'knowledge.spec.rejected',
  'knowledge.spec.change_added',
  'knowledge.spec.change_retired',
  'knowledge.spec.change_confirmed',
  'knowledge.spec.concept_proposed',
  'knowledge.spec.concept_confirmed',
  'knowledge.spec.concept_rejected',
] as const;

/** Subject id of the draft / publish / reject events is the revision id; of the `change_*` events (#1196 c) the SW change row id; of the `concept_*` events (#1196 e) the concept mapping row id. */
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
    /** `published` only (#1196 c): how many open SW changes the publish flagged for re-validation; absent on rows written before. */
    flagged: z.number().int().min(0).optional(),
  })
  .strict();

export const logKnowledgeSpecRejectedDetailSchema = z
  .object({
    ...base,
    /** The reason is free text typed by a person: it is not copied into the audit detail (length only). */
    reasonLength: z.number().int().min(0).max(500),
  })
  .strict();

// SW change events (#1196 c): ids, kinds and numbers only — never the target key, the note or the change body.
export const logKnowledgeSpecChangeAddedDetailSchema = z
  .object({
    modelId: z.string().uuid(),
    changeId: z.string().uuid(),
    softwareId: z.string().uuid(),
    endsBeforeSoftwareId: z.string().uuid().nullable(),
    targetKind: z.enum(['module', 'event', 'field', 'relation']),
    changeKind: z.enum(['added', 'removed', 'changed', 'behavior']),
    basedOnRevNo: z.number().int().min(1),
    /** A replacement written by `specChangeRetire`: the change it replaces. */
    replacesChangeId: z.string().uuid().optional(),
  })
  .strict();

export const logKnowledgeSpecChangeRetiredDetailSchema = z
  .object({
    modelId: z.string().uuid(),
    changeId: z.string().uuid(),
    replacementChangeId: z.string().uuid().optional(),
  })
  .strict();

export const logKnowledgeSpecChangeConfirmedDetailSchema = z
  .object({
    modelId: z.string().uuid(),
    changeId: z.string().uuid(),
    revalidationRevNo: z.number().int().min(1).optional(),
  })
  .strict();

// Concept mapping events (#1196 e): ids and closed vocabularies only — never the target key, a label or the reject reason.
export const logKnowledgeSpecConceptProposedDetailSchema = z
  .object({
    modelId: z.string().uuid(),
    mappingId: z.string().uuid(),
    conceptId: z.string().uuid(),
    targetKind: z.enum(['module', 'event']),
    relationKind: z.enum(['equivalent', 'related']),
    /** `similarity`: the proposal came from an accepted suggestion (still only a proposal until a human confirms it). */
    origin: z.enum(['human', 'similarity']),
  })
  .strict();

export const logKnowledgeSpecConceptConfirmedDetailSchema = z
  .object({
    modelId: z.string().uuid(),
    mappingId: z.string().uuid(),
    conceptId: z.string().uuid(),
    relationKind: z.enum(['equivalent', 'related']),
  })
  .strict();

export const logKnowledgeSpecConceptRejectedDetailSchema = z
  .object({
    modelId: z.string().uuid(),
    mappingId: z.string().uuid(),
    conceptId: z.string().uuid(),
    priorState: z.enum(['proposed', 'confirmed']),
  })
  .strict();

export const LOG_KNOWLEDGE_SPEC_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'knowledge.spec.draft_saved': logKnowledgeSpecDraftSavedDetailSchema,
  'knowledge.spec.published': logKnowledgeSpecPublishedDetailSchema,
  'knowledge.spec.rejected': logKnowledgeSpecRejectedDetailSchema,
  'knowledge.spec.change_added': logKnowledgeSpecChangeAddedDetailSchema,
  'knowledge.spec.change_retired': logKnowledgeSpecChangeRetiredDetailSchema,
  'knowledge.spec.change_confirmed': logKnowledgeSpecChangeConfirmedDetailSchema,
  'knowledge.spec.concept_proposed': logKnowledgeSpecConceptProposedDetailSchema,
  'knowledge.spec.concept_confirmed': logKnowledgeSpecConceptConfirmedDetailSchema,
  'knowledge.spec.concept_rejected': logKnowledgeSpecConceptRejectedDetailSchema,
} as const satisfies Record<(typeof LOG_KNOWLEDGE_SPEC_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
