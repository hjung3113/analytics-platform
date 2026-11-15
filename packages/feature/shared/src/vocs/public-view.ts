import { z } from 'zod';

import { LinkedAttachmentSchema } from './attachment.js';
import { reporterFacingStatusEnumSchema } from './list-item.js';

// The public (「플랫폼」 / `voc.read_public`) projection of a VOC (ADR-0110 decision 3).
//
// An allowlist: the server builds these objects field by field and runs them through the
// strict schemas below; it never deletes fields from an operator object. No reporter
// identity, owner, severity, triage state, cluster, links, linked execution, similar VOCs,
// permission decisions, internal comments or reporter replies. `uploaded_by_actor_id` is
// dropped from attachments for the same reason (the uploader is usually the reporter).

export const publicVocAttachmentSchema = LinkedAttachmentSchema.omit({
  uploaded_by_actor_id: true,
}).strict();
export type PublicVocAttachment = z.infer<typeof publicVocAttachmentSchema>;

const managedSystemRefSchema = z
  .object({ id: z.string().uuid(), name: z.string() })
  .strict();

export const publicVocListItemSchema = z
  .object({
    id: z.string().uuid(),
    display_id: z.string(),
    title: z.string(),
    reporter_facing_status: reporterFacingStatusEnumSchema,
    managed_system: managedSystemRefSchema,
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    mine: z.boolean(),
  })
  .strict();
export type PublicVocListItem = z.infer<typeof publicVocListItemSchema>;

export const publicVocEntrySchema = z
  .object({
    id: z.string().uuid(),
    // Reporter replies are not part of the public part (they stay with the reporter and triage).
    kind: z.literal('public_update'),
    // TipTap doc, already sanitized for the `public-update` surface on write.
    body_rich_content: z.unknown(),
    created_at: z.string().datetime({ offset: true }),
    attachments: z.array(publicVocAttachmentSchema),
  })
  .strict();
export type PublicVocEntry = z.infer<typeof publicVocEntrySchema>;

export const publicVocViewSchema = publicVocListItemSchema
  .extend({
    // TipTap doc, already sanitized for the `voc-description` surface on write.
    description_rich_content: z.unknown(),
    entries: z.array(publicVocEntrySchema),
    attachments: z.array(publicVocAttachmentSchema),
  })
  .strict();
export type PublicVocView = z.infer<typeof publicVocViewSchema>;

export const PUBLIC_VOC_LIST_MAX_LIMIT = 50;
export const PUBLIC_VOC_LIST_DEFAULT_LIMIT = 20;

export const publicVocListQuerySchema = z
  .object({
    mine: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    managed_system_id: z.string().uuid().optional(),
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((v) => (v === undefined || v === '' ? undefined : v)),
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(PUBLIC_VOC_LIST_MAX_LIMIT)
      .default(PUBLIC_VOC_LIST_DEFAULT_LIMIT),
  })
  .strict();
export type PublicVocListQuery = z.infer<typeof publicVocListQuerySchema>;

export const publicVocListResponseSchema = z
  .object({
    items: z.array(publicVocListItemSchema),
    page: z.object({ cursor: z.string().optional(), has_more: z.boolean() }).strict(),
  })
  .strict();
export type PublicVocListResponse = z.infer<typeof publicVocListResponseSchema>;
