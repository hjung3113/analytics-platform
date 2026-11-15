// Platform notice mutation audit detail schemas (#1266 b7, SEC-04).
// Ids and revisions only: notice title/body never enter an audit row.

import { z } from 'zod';

export const PLATFORM_NOTICE_AUDIT_EVENT_TYPES = [
  'platform_notice_created',
  'platform_notice_updated',
  'platform_notice_deleted',
] as const;

const revisionSchema = z.number().int().nonnegative();
const correlationIdSchema = z.string().min(1).max(200);

export const platformNoticeCreatedDetailSchema = z
  .object({ revision_after: revisionSchema, correlation_id: correlationIdSchema })
  .strict();
export const platformNoticeUpdatedDetailSchema = z
  .object({
    revision_before: revisionSchema,
    revision_after: revisionSchema,
    correlation_id: correlationIdSchema,
  })
  .strict();
export const platformNoticeDeletedDetailSchema = z
  .object({ revision_before: revisionSchema, correlation_id: correlationIdSchema })
  .strict();
export type PlatformNoticeUpdatedDetail = z.infer<typeof platformNoticeUpdatedDetailSchema>;

export const PLATFORM_NOTICE_AUDIT_EVENT_DETAIL_SCHEMAS = {
  platform_notice_created: platformNoticeCreatedDetailSchema,
  platform_notice_updated: platformNoticeUpdatedDetailSchema,
  platform_notice_deleted: platformNoticeDeletedDetailSchema,
} as const satisfies Record<(typeof PLATFORM_NOTICE_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
