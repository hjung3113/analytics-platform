import { z } from 'zod/v4';

// Validation request queue, worker REST, `v0` (ADR-0117, #1445). PROVISIONAL: shapes, limits and error codes may change
// without compatibility until a first real worker pins them. Token-only: `Authorization: Bearer ap_…` with the scope
// `validation.worker` (service token); a login session or a token without the scope is 403 `permission.denied`.
//   POST /api/v1/validation-queue/claim                       -> 200 claim response | 204 (nothing claimable now)
//   POST /api/v1/validation-queue/requests/:id/heartbeat      -> 200 | 409 `queue.lease_lost`
//   POST /api/v1/validation-queue/requests/:id/result         -> 200 | 409 `conflict.stale_write` | 409 `queue.lease_lost` | 422
//   POST /api/v1/validation-queue/requests/:id/fail           -> 200 | 409 `conflict.stale_write` | 409 `queue.lease_lost`
// The server computes the verdict from the rule results; the worker sends no verdict, and the body has no field for an AI
// opinion. A result is idempotent by (request, attemptNo, result digest): the same body again answers the same 200, a
// different body for the same attempt is 409. Runtime-only (not expressible here): size limits of the text fields and the
// excerpt total (256 KB), refusal of control characters and token / secret patterns (422 `validation.failed`, field
// codes `too_long`, `too_many`, `secret_detected`, `not_in_sample`, `duplicate`, `excerpt_total_too_large`), and that
// every evidence `fileRef` is one of the Round's sample files.

export const VALIDATION_QUEUE_VERSION = 'v0';
export const VALIDATION_QUEUE_ERROR_CODES = ['queue.lease_lost', 'conflict.stale_write', 'permission.denied', 'validation.failed'] as const;

const uuid = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const instant = z.iso.datetime({ offset: true });
const attemptNo = z.number().int().min(1).max(1000);

export const ruleResultValueSchema = z.enum(['PASS', 'FAIL', 'WARN', 'NOT_CHECKED', 'SKIPPED', 'NOT_APPLICABLE', 'ERROR']);
export const verdictSchema = z.enum(['pass', 'fail', 'incomplete']);

/** 근거 위치 (EvidenceRef): the one evidence type: file, line, file hash; `excerpt` is the optional short log text. */
export const evidenceInputSchema = z.strictObject({
  fileRef: z.string().min(1).max(1024),
  line: z.number().int().min(1),
  fileSha256: sha256,
  excerpt: z.string().max(2000).nullable().optional(),
});

export const ruleResultInputSchema = z.strictObject({
  ruleId: z.string().min(1).max(200),
  result: ruleResultValueSchema,
  required: z.boolean(),
  expected: z.string().max(500).nullable().optional(),
  observed: z.string().max(500).nullable().optional(),
  evidence: z.array(evidenceInputSchema).max(20).nullable().optional(),
});

export const validationResultInputSchema = z.strictObject({
  attemptNo,
  /** The digest of the sample manifest the worker actually used; a mismatch makes the verdict `incomplete`. */
  inputManifestDigest: sha256,
  executorVersion: z.string().max(200).nullable().optional(),
  executorDigest: z.string().max(200).nullable().optional(),
  ruleSetRevision: z.string().max(200).nullable().optional(),
  /** The worker's own summary, stored for reference (<= 4,096 bytes serialised) and never used for the verdict. */
  summary: z.record(z.string(), z.unknown()).nullable().optional(),
  results: z.array(ruleResultInputSchema).max(2000),
});

export const validationResultResponseSchema = z.strictObject({
  requestId: uuid,
  attemptNo,
  state: z.literal('succeeded'),
  verdict: verdictSchema,
  resultDigest: sha256,
  ruleCount: z.number().int().min(0),
});

export const validationHeartbeatInputSchema = z.strictObject({ attemptNo });
export const validationHeartbeatResponseSchema = z.strictObject({ leaseExpiresAt: instant });

export const validationFailInputSchema = z.strictObject({ attemptNo, reason: z.string().max(500).nullable().optional() });
export const validationFailResponseSchema = z.strictObject({ requestId: uuid, attemptNo, state: z.literal('failed') });

const sampleFileSchema = z.strictObject({ fileRef: z.string(), order: z.number().int().min(1), sha256 });
export const validationClaimResponseSchema = z.strictObject({
  request: z.strictObject({
    id: uuid,
    roundId: uuid,
    priority: z.number().int().min(0).max(2),
    immediate: z.boolean(),
    engineProfileRef: z.string().nullable(),
    requestDigest: sha256,
    attemptNo,
    maxAttempts: z.number().int().min(1).max(10),
    sampleSet: z.strictObject({ files: z.array(sampleFileSchema), sourceOwner: z.string() }),
    sampleManifestDigest: sha256,
    specPin: z.unknown().nullable(),
  }),
  attempt: z.strictObject({ id: uuid, attemptNo }),
  leaseExpiresAt: instant,
});
