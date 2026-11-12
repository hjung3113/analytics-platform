import { z } from 'zod/v4';

// Attempt opinions, worker REST, `v0` (ADR-0117 amendment 2, #1778). PROVISIONAL like validation-queue.ts.
//   POST /api/v1/validation-queue/requests/:id/attempts/:attemptNo/opinions
//     -> 200 { requestId, attemptNo, recorded, duplicate } | 404 | 409 `conflict.attempt_not_succeeded` | 409 `conflict.stale_write` | 422
// Token-only, scope `validation.worker`. An opinion is an append-only note on one item of a succeeded attempt, on its own axis:
// it never changes a verdict, a Gate decision or a regression comparison. `grade` / `mark` are keys of the scale the workspace
// declares (`queue_settings.opinion_scale`); the platform holds no values. Runtime-only (not expressible here): that the keys are
// declared, that every evidence `fileRef` is in the request subject's sample list, the per-attempt totals (2,000 rows,
// 256 KB of notes), control-character removal and the secret-pattern refusal (422 field codes `opinion.scale_undeclared`,
// `not_declared`, `not_in_sample`, `secret_detected`, `too_long`, `too_many`, `duplicate`).
// `note` is a query or memo of the in-house side, never a log excerpt.

export const VALIDATION_OPINION_VERSION = 'v0';
export const VALIDATION_OPINION_ERROR_CODES = [
  'conflict.attempt_not_succeeded',
  'conflict.stale_write',
  'not_found.record',
  'permission.denied',
  'validation.failed',
] as const;

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const scaleKey = z.string().regex(/^[a-z0-9_-]{1,32}$/);

export const validationOpinionEvidenceSchema = z.strictObject({
  fileRef: z.string().min(1).max(1024),
  line: z.number().int().min(1),
  fileSha256: sha256,
});

export const validationOpinionItemSchema = z.strictObject({
  itemKey: z.string().min(1).max(200),
  grade: z.string().min(1).max(200),
  mark: z.string().min(1).max(200).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  evidence: z.array(validationOpinionEvidenceSchema).max(20).nullable().optional(),
  inputRevision: z.string().max(200).nullable().optional(),
  producer: z.string().max(200).nullable().optional(),
});

export const validationOpinionInputSchema = z.strictObject({
  submissionId: z.string().min(1).max(200),
  opinions: z.array(validationOpinionItemSchema).min(1).max(500),
});

export const validationOpinionResponseSchema = z.strictObject({
  requestId: z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/),
  attemptNo: z.number().int().min(1).max(1000),
  recorded: z.number().int().min(0),
  duplicate: z.number().int().min(0),
});

/** The workspace's declaration (`queue_settings.opinion_scale`); array order is display order. */
export const validationOpinionScaleSchema = z.strictObject({
  grades: z.array(z.strictObject({ key: scaleKey, label: z.string().max(40) })).max(12),
  marks: z.array(z.strictObject({ key: scaleKey, label: z.string().max(40) })).max(12),
});
