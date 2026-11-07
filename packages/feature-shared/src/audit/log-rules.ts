// Log rules audit detail schemas (#1491, design docs/design/features/log-rules/README.md §5.1, ADR-0122). Non-sensitive
// and body-free: the source system, counts, the report digest and the outcome — never a rule key, title, summary or
// target. The token id is added by the audit service from the request's auth context.
// Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_RULES_AUDIT_EVENT_TYPES = [
  'validation.catalog.reported',
  'validation.catalog.rejected',
] as const;

/** Subject id of both events is the `catalog_report` id. */
export const LOG_RULES_SUBJECT_TYPES = ['catalog_report'] as const;

const counts = {
  ruleSetCount: z.number().int().min(0),
  ruleCount: z.number().int().min(0),
  targetCount: z.number().int().min(0),
  reportDigest: z.string().regex(/^[0-9a-f]{64}$/),
};

export const validationCatalogReportedDetailSchema = z
  .object({
    sourceSystem: z.string(),
    validatorVersion: z.string(),
    outcome: z.literal('accepted'),
    ...counts,
    /** The previous accepted report of the same source this one superseded, if any. */
    supersededReportId: z.string().uuid().nullable(),
  })
  .strict();

export const validationCatalogRejectedDetailSchema = z
  .object({
    /** Only when it passed the identifier and secret checks itself; else null. */
    sourceSystem: z.string().nullable(),
    outcome: z.literal('rejected'),
    rejectReason: z.string(),
    bodyBytes: z.number().int().min(0),
    reportDigest: counts.reportDigest,
  })
  .strict();

export const LOG_RULES_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'validation.catalog.reported': validationCatalogReportedDetailSchema,
  'validation.catalog.rejected': validationCatalogRejectedDetailSchema,
} as const satisfies Record<(typeof LOG_RULES_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
