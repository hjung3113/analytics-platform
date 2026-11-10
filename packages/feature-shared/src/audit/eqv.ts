// Equipment visualization (`eqv`) audit detail schemas (#1645, ADR-0135). Ids, versions and Revision hashes only: never a Layout or
// Template document, a name or any text of it. The subject id is the row uuid (`core.audit_log.subject_id` is a uuid): the draft's uuid
// never changes across saves. Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const EQV_AUDIT_EVENT_TYPES = [
  'eqv.layout.draft_created',
  'eqv.layout.draft_saved',
  'eqv.layout.revision_published',
  'eqv.template.promoted',
  'eqv.alias_rules.created',
  'eqv.alias_rules.saved',
  'eqv.type_dictionary.created',
  'eqv.type_dictionary.saved',
  'eqv.mapping.published',
] as const;

export const EQV_SUBJECT_TYPES = [
  'eqv_layout',
  'eqv_layout_revision',
  'eqv_template',
  'eqv_alias_rules',
  'eqv_type_dictionary',
  'eqv_binding',
] as const;

const LAYOUT_ID = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const REVISION = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const eqvDraftDetailSchema = z.object({ layoutId: LAYOUT_ID, version: z.number().int().min(1) }).strict();
export const eqvRevisionPublishedDetailSchema = z
  .object({ layoutId: LAYOUT_ID, revision: REVISION, draftVersion: z.number().int().min(1) })
  .strict();
export const eqvTemplatePromotedDetailSchema = z
  .object({ templateId: LAYOUT_ID, layoutId: LAYOUT_ID, revision: REVISION })
  .strict();

// Onboarding (#1658, ADR-0139): scope ids, versions, hashes and the Binding's wall-clock only. Never a rule, a dictionary entry or an Inventory.
const UUID = z.string().uuid();
const WALL_CLOCK = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
const EQUIPMENT_ID = z.string().min(1).max(200);
export const eqvAliasRulesDetailSchema = z
  .object({
    level: z.enum(['global', 'maker', 'model', 'equipment']),
    vendorId: UUID.optional(),
    modelId: UUID.optional(),
    equipmentId: EQUIPMENT_ID.optional(),
    version: z.number().int().min(1),
  })
  .strict();
export const eqvTypeDictionaryDetailSchema = z
  .object({ level: z.enum(['global', 'maker', 'model']), vendorId: UUID.optional(), modelId: UUID.optional(), version: z.number().int().min(1) })
  .strict();
export const eqvMappingPublishedDetailSchema = z
  .object({ equipmentId: EQUIPMENT_ID, mappingHash: REVISION, layoutRevision: REVISION, effectiveFrom: WALL_CLOCK })
  .strict();

export const EQV_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'eqv.layout.draft_created': eqvDraftDetailSchema,
  'eqv.layout.draft_saved': eqvDraftDetailSchema,
  'eqv.layout.revision_published': eqvRevisionPublishedDetailSchema,
  'eqv.template.promoted': eqvTemplatePromotedDetailSchema,
  'eqv.alias_rules.created': eqvAliasRulesDetailSchema,
  'eqv.alias_rules.saved': eqvAliasRulesDetailSchema,
  'eqv.type_dictionary.created': eqvTypeDictionaryDetailSchema,
  'eqv.type_dictionary.saved': eqvTypeDictionaryDetailSchema,
  'eqv.mapping.published': eqvMappingPublishedDetailSchema,
} as const satisfies Record<(typeof EQV_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
