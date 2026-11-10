// Equipment visualization (`eqv`) audit detail schemas (#1645, ADR-0135). Ids, versions and Revision hashes only: never a Layout or
// Template document, a name or any text of it. The subject id is the row uuid (`core.audit_log.subject_id` is a uuid): the draft's uuid
// never changes across saves. Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const EQV_AUDIT_EVENT_TYPES = [
  'eqv.layout.draft_created',
  'eqv.layout.draft_saved',
  'eqv.layout.revision_published',
  'eqv.template.promoted',
] as const;

export const EQV_SUBJECT_TYPES = ['eqv_layout', 'eqv_layout_revision', 'eqv_template'] as const;

const LAYOUT_ID = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const REVISION = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const eqvDraftDetailSchema = z.object({ layoutId: LAYOUT_ID, version: z.number().int().min(1) }).strict();
export const eqvRevisionPublishedDetailSchema = z
  .object({ layoutId: LAYOUT_ID, revision: REVISION, draftVersion: z.number().int().min(1) })
  .strict();
export const eqvTemplatePromotedDetailSchema = z
  .object({ templateId: LAYOUT_ID, layoutId: LAYOUT_ID, revision: REVISION })
  .strict();

export const EQV_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'eqv.layout.draft_created': eqvDraftDetailSchema,
  'eqv.layout.draft_saved': eqvDraftDetailSchema,
  'eqv.layout.revision_published': eqvRevisionPublishedDetailSchema,
  'eqv.template.promoted': eqvTemplatePromotedDetailSchema,
} as const satisfies Record<(typeof EQV_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
