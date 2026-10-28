// Platform saved-view audit detail schemas (#1105, ADR-0099). Ids, action and version only:
// never a view body, title, people query or secret. Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const PLATFORM_SAVED_VIEW_AUDIT_EVENT_TYPES = [
  'saved_view_official_requested',
  'saved_view_official_approved',
  'saved_view_official_rejected',
  'saved_view_official_revoked',
  'saved_view_visibility_changed',
  'saved_view_group_created',
  'saved_view_group_updated',
  'saved_view_import_submitted',
] as const;

const uuid = z.string().uuid();
const viewVersion = z.object({ view_id: uuid, version: z.number().int().min(1) }).strict();

export const savedViewVisibilityChangedDetailSchema = viewVersion
  .extend({
    visibility: z.enum(['private', 'people', 'groups']),
    target_count: z.number().int().min(0),
  })
  .strict();
export const savedViewGroupCreatedDetailSchema = z
  .object({ group_id: uuid, member_count: z.number().int().min(0) })
  .strict();
export const savedViewGroupUpdatedDetailSchema = z
  .object({
    group_id: uuid,
    added_ids: z.array(uuid),
    removed_ids: z.array(uuid),
    renamed: z.boolean(),
  })
  .strict();
export const savedViewImportSubmittedDetailSchema = z
  .object({
    imported: z.number().int().min(0),
    already_imported: z.number().int().min(0),
    rejected: z.number().int().min(0),
    view_ids: z.array(uuid),
  })
  .strict();

export const PLATFORM_SAVED_VIEW_AUDIT_EVENT_DETAIL_SCHEMAS = {
  saved_view_official_requested: viewVersion,
  saved_view_official_approved: viewVersion,
  saved_view_official_rejected: viewVersion,
  saved_view_official_revoked: viewVersion,
  saved_view_visibility_changed: savedViewVisibilityChangedDetailSchema,
  saved_view_group_created: savedViewGroupCreatedDetailSchema,
  saved_view_group_updated: savedViewGroupUpdatedDetailSchema,
  saved_view_import_submitted: savedViewImportSubmittedDetailSchema,
} as const satisfies Record<(typeof PLATFORM_SAVED_VIEW_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
