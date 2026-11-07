import { z } from 'zod/v4';

import { sourceRecordQuerySchema, sourceSampleSetSchema } from './source-read.ts';

// Log Explorer token budget, export REST and usage read, `v0` (provisional; design log-explorer §4.1, §5, ADR-0119 decision 5, #1472).
// `POST /api/v1/log-explorer/export` answers a stream (`text/csv` or `application/x-ndjson`) on success and a JSON refusal below on failure.
// Runtime-only rules (not expressible in JSON Schema): exactly one of `investigationId` / `sampleSet` is present; the row, byte, budget, concurrency
// and daily-count limits below are enforced by the server, so a refusal is a code, never a cut file.

export const LOG_EXPLORER_EXPORT_VERSION = 'v0';

// The identifier rule of the api-token contract (any 8-4-4-4-12 hex), not v4's RFC version/variant check: seeded ids are valid.
const uuid = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

/** Start values of design §4.1 (measure, then adjust). */
export const EXPORT_ROWS_MAX = 10_000;
export const EXPORT_BYTES_MAX = 5 * 1024 * 1024;
/** Daily response-body budget of one API token and of one Actor's token calls, reads and exports together. */
export const TOKEN_DAILY_BODY_BUDGET_BYTES = 50 * 1024 * 1024;
/** Exports per day, per token and per Actor (a session counts per Actor). */
export const EXPORT_DAILY_MAX = 20;
/** At most this many exports run at once per token and per Actor. */
export const EXPORT_CONCURRENT_MAX = 1;

export const EXPORT_FORMATS = ['csv', 'jsonl'] as const;
export const exportFormatSchema = z.enum(EXPORT_FORMATS);

export const EXPORT_CONTENT_TYPES = { csv: 'text/csv', jsonl: 'application/x-ndjson' } as const;

/** Columns of both formats, in order. `synthetic` marks fixture output («합성»). */
export const EXPORT_COLUMNS = ['fileRef', 'fileOrder', 'line', 'timestamp', 'text', 'truncated', 'timeReversal', 'synthetic'] as const;

/**
 * The export request: one sample set, one condition, one range. `range.rows` is how many matching rows from the start (file order, then line) the file
 * holds; above `EXPORT_ROWS_MAX` the request is refused as `range_too_large`, not cut. `investigationId` belongs to the investigation node (X-b) and
 * is refused with `investigation_unsupported` until it exists.
 */
export const exportRequestSchema = z
  .strictObject({
    investigationId: uuid.optional(),
    sampleSet: sourceSampleSetSchema.optional(),
    query: sourceRecordQuerySchema,
    range: z.strictObject({ rows: z.int().min(1).max(1_000_000) }),
    format: exportFormatSchema,
  })
  .refine((request) => (request.investigationId === undefined) !== (request.sampleSet === undefined), {
    message: 'exactly one of investigationId and sampleSet',
    path: ['sampleSet'],
  });

/** Reason codes of an export refusal (`code` of the JSON body). Each is a stable name; none carries a Source message. */
export const EXPORT_ERROR_CODES = [
  'explorer.budget_exceeded',
  'explorer.range_too_large',
  'explorer.forbidden',
  'explorer.source_unavailable',
  'explorer.export_busy',
  'explorer.export_daily_limit',
  'explorer.investigation_unsupported',
] as const;
export const exportErrorCodeSchema = z.enum(EXPORT_ERROR_CODES);

/** HTTP status of each refusal. */
export const EXPORT_ERROR_STATUS: Readonly<Record<(typeof EXPORT_ERROR_CODES)[number], number>> = {
  'explorer.budget_exceeded': 429,
  'explorer.range_too_large': 413,
  'explorer.forbidden': 403,
  'explorer.source_unavailable': 503,
  'explorer.export_busy': 429,
  'explorer.export_daily_limit': 429,
  'explorer.investigation_unsupported': 422,
};

export const exportErrorSchema = z.strictObject({ code: exportErrorCodeSchema, message: z.string().max(200) });

// --- usage read (`logExplorer.usage`, admin only) --------------------------------------------------------------------------------------------

export const usageSubjectKindSchema = z.enum(['token', 'actor', 'session']);

/** Counters of one token / Actor / session Actor on one UTC day. `bytes` is the response body total (budget basis), `exportBytes` its export part. */
export const usageRowSchema = z.strictObject({
  kind: usageSubjectKindSchema,
  id: uuid,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bytes: z.int().min(0),
  readBytes: z.int().min(0),
  exportBytes: z.int().min(0),
  reads: z.int().min(0),
  exports: z.int().min(0),
  /** True when the token / Actor reached the daily body budget or the daily export count. */
  atLimit: z.boolean(),
});

export const usageResponseSchema = z.strictObject({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limits: z.strictObject({ dailyBodyBytes: z.int(), dailyExports: z.int() }),
  rows: z.array(usageRowSchema).max(500),
});
