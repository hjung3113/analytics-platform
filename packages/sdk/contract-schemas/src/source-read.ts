import { z } from 'zod/v4';

// Log Explorer SourceReadPort wire contract, `v0` (provisional; ADR-0119, design log-explorer §3.1, #1467). The platform server calls a Source
// owner's adapter with these shapes; the platform stores none of the answered text. Same boundary rule as service-ports.ts: strict objects,
// so a forged extra field is refused. Limits are start values (design §3.1) and are enforced by the server and by the adapter contract
// suite, not by JSON Schema alone: a consumer using only the JSON artifacts must apply them itself.
//
// Runtime-only rules (not expressible in JSON Schema): `rows.length <= limit` of the request, a window request whose
// `before + after + 1` exceeds the 200-row response cap, the sample-set rules shared with log-lifecycle (distinct file refs, `order` is each
// of 1..n once, trimmed identifiers without control characters or lone surrogates), at most 20 `context` keys and distinct capabilities.
// A state other than `ok` carries no rows (the union enforces that structurally, the request limit is a caller rule).

export const SOURCE_READ_VERSION = 'v0';
/** Start values of design §3.1. `describe` reports the limits an adapter really applies; they never exceed these. */
export const SOURCE_READ_ROWS_MAX = 200;
export const SOURCE_READ_ROW_CHARS_MAX = 8000;
export const SOURCE_READ_WINDOW_MAX = 100;
export const SOURCE_READ_TIME_BUDGET_MS = 10_000;
export const SOURCE_READ_SAMPLE_FILES_MAX = 1000;
export const SOURCE_READ_CURSOR_MAX = 512;

export const SOURCE_READ_CAPABILITIES = ['searchRecords', 'getWindow', 'getParsed', 'getPeriods', 'getTopViewLink'] as const;
export const sourceReadCapabilitySchema = z.enum(SOURCE_READ_CAPABILITIES);

const SOURCE_READ_CONTEXT_KEYS_MAX = 20;

/** C0, DEL and C1 control characters, NUL and lone UTF-16 surrogates: text the database or the wire cannot carry faithfully. */
function hasUnsafeChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i += 1;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/** An opaque external identifier, the same rule as the lifecycle sample set: non-blank, already trimmed, at most `max` code points, no unsafe characters. */
const identifier = (max: number) =>
  z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0, { message: 'must not be blank' })
    .refine((value) => value === value.trim(), { message: 'must be trimmed' })
    .refine((value) => !hasUnsafeChars(value), { message: 'must not contain control characters or lone surrogates' })
    .refine((value) => [...value].length <= max, { message: `at most ${max} characters` })
    .meta({ maxLength: max });
const sourceOwner = identifier(200);
const fileRef = identifier(1024);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const line = z.int().min(1);
const text = z.string().max(SOURCE_READ_ROW_CHARS_MAX);

/** An ordered file list: `order` is the user-confirmed file order that every answer follows (never timestamp order). */
export const sourceSampleSetSchema = z
  .strictObject({
    sourceOwner,
    files: z.array(z.strictObject({ fileRef, order: z.int().min(1).max(SOURCE_READ_SAMPLE_FILES_MAX), sha256 })).min(1).max(SOURCE_READ_SAMPLE_FILES_MAX),
  })
  .refine((set) => new Set(set.files.map((file) => file.fileRef)).size === set.files.length, { message: 'file refs must be distinct' })
  .refine((set) => new Set(set.files.map((file) => file.order)).size === set.files.length && set.files.every((file) => file.order <= set.files.length), {
    message: 'order must be each of 1..n once',
  });

export const sourceRecordQuerySchema = z.strictObject({
  text: z.string().max(200).optional(),
  logType: z.string().max(100).optional(),
  module: z.string().max(100).optional(),
  event: z.string().max(100).optional(),
  context: z
    .record(z.string().max(100), z.string().max(200))
    .refine((values) => Object.keys(values).length <= SOURCE_READ_CONTEXT_KEYS_MAX, { message: `at most ${SOURCE_READ_CONTEXT_KEYS_MAX} keys` })
    .optional()
    .meta({ maxProperties: SOURCE_READ_CONTEXT_KEYS_MAX }),
});

export const sourceDescribeRequestSchema = z.strictObject({ sourceOwner });
export const sourceSearchRequestSchema = z.strictObject({
  sampleSet: sourceSampleSetSchema,
  query: sourceRecordQuerySchema,
  cursor: z.string().min(1).max(SOURCE_READ_CURSOR_MAX).nullable(),
  limit: z.int().min(1).max(SOURCE_READ_ROWS_MAX),
});
/** Each side is at most 100 lines and the answer (target row included) at most 200 rows; a request above that is refused, never cut. */
export const sourceWindowRequestSchema = z
  .strictObject({
    sourceOwner,
    fileRef,
    line,
    before: z.int().min(0).max(SOURCE_READ_WINDOW_MAX),
    after: z.int().min(0).max(SOURCE_READ_WINDOW_MAX),
  })
  .refine((request) => request.before + request.after + 1 <= SOURCE_READ_ROWS_MAX, { message: `before + after + 1 at most ${SOURCE_READ_ROWS_MAX}` });
export const sourceParsedRequestSchema = z.strictObject({ sourceOwner, fileRef, line });
export const sourcePeriodsRequestSchema = z.strictObject({
  sampleSet: sourceSampleSetSchema,
  query: sourceRecordQuerySchema,
  cursor: z.string().min(1).max(SOURCE_READ_CURSOR_MAX).nullable(),
  limit: z.int().min(1).max(SOURCE_READ_ROWS_MAX),
});
export const sourceTopViewRequestSchema = z.strictObject({ sourceOwner, fileRef, line });

/** One source line. Position is `(fileRef, line)`; `fileOrder` is its file's place in the sample set. `synthetic` marks fixture output ("합성"). */
export const sourceRowSchema = z.strictObject({
  fileRef,
  fileOrder: z.int().min(1).max(SOURCE_READ_SAMPLE_FILES_MAX),
  line,
  text,
  /** True when the Source line was longer than the row limit and `text` is cut. */
  truncated: z.boolean(),
  /** The Source's own timestamp text, or null. Never used for ordering. */
  timestamp: z.string().max(64).nullable(),
  /** True when this row's timestamp is earlier than the previous row's in file-then-line order. The row is not moved. */
  timeReversal: z.boolean(),
  synthetic: z.boolean(),
});

export const sourceLimitsSchema = z.strictObject({
  maxRows: z.int().min(1).max(SOURCE_READ_ROWS_MAX),
  maxRowChars: z.int().min(1).max(SOURCE_READ_ROW_CHARS_MAX),
  maxWindow: z.int().min(0).max(SOURCE_READ_WINDOW_MAX),
  timeBudgetMs: z.int().min(1).max(SOURCE_READ_TIME_BUDGET_MS),
});

/** Why a capability is not offered. A reason is a code, never a free text from the Source. */
export const SOURCE_UNSUPPORTED_REASONS = ['parser_not_connected', 'periods_not_supported', 'top_view_not_connected', 'capability_missing'] as const;
export const sourceUnsupportedReasonSchema = z.enum(SOURCE_UNSUPPORTED_REASONS);

/** Non-`ok` answers of every call. `unsupported` is a stated state, not an error; the others carry no data. */
const unsupported = z.strictObject({ status: z.literal('unsupported'), reason: sourceUnsupportedReasonSchema });
const permissionDenied = z.strictObject({ status: z.literal('permission_denied') });
const sourceAbsent = z.strictObject({ status: z.literal('source_absent') });
const outcomes = [unsupported, permissionDenied, sourceAbsent] as const;

export const sourceDescribeResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ok'),
    available: z.boolean(),
    capabilities: z
      .array(sourceReadCapabilitySchema)
      .max(SOURCE_READ_CAPABILITIES.length)
      .refine((values) => new Set(values).size === values.length, { message: 'capabilities must be distinct' })
      .meta({ uniqueItems: true }),
    limits: sourceLimitsSchema,
    synthetic: z.boolean(),
  }),
  permissionDenied,
  sourceAbsent,
]);

export const sourceSearchResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ok'),
    rows: z.array(sourceRowSchema).max(SOURCE_READ_ROWS_MAX),
    nextCursor: z.string().min(1).max(SOURCE_READ_CURSOR_MAX).nullable(),
    /** True when the Source answered only part of the range (budget, cap or a missing file). */
    partial: z.boolean(),
  }),
  ...outcomes,
]);

export const sourceWindowResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ok'),
    rows: z.array(sourceRowSchema).max(SOURCE_READ_ROWS_MAX),
    /** True when a row of the window was cut to the row limit. */
    truncated: z.boolean(),
  }),
  ...outcomes,
]);

export const sourceParsedResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ok'),
    extractedFields: z.record(z.string().max(100), z.string().max(SOURCE_READ_ROW_CHARS_MAX)),
    parserIn: text,
    parserOut: text,
    truncated: z.boolean(),
    synthetic: z.boolean(),
  }),
  ...outcomes,
]);

export const sourcePeriodRowSchema = z.strictObject({
  fileRef,
  startLine: line,
  endLine: line.nullable(),
  state: z.string().min(1).max(100),
  /** An open start at a file boundary (carryover) stays `incomplete`; it is never an error. */
  incomplete: z.boolean(),
  synthetic: z.boolean(),
});

export const sourcePeriodsResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ok'),
    rows: z.array(sourcePeriodRowSchema).max(SOURCE_READ_ROWS_MAX),
    nextCursor: z.string().min(1).max(SOURCE_READ_CURSOR_MAX).nullable(),
  }),
  ...outcomes,
]);

export const sourceTopViewResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ok'), url: z.string().max(2048).regex(/^https?:\/\/\S+$/), synthetic: z.boolean() }),
  ...outcomes,
]);

export type SourceSampleSet = z.infer<typeof sourceSampleSetSchema>;
export type SourceRecordQuery = z.infer<typeof sourceRecordQuerySchema>;
export type SourceRow = z.infer<typeof sourceRowSchema>;
export type SourceLimits = z.infer<typeof sourceLimitsSchema>;
export type SourceReadCapability = z.infer<typeof sourceReadCapabilitySchema>;
export type SourceUnsupportedReason = z.infer<typeof sourceUnsupportedReasonSchema>;
export type SourceDescribeRequest = z.infer<typeof sourceDescribeRequestSchema>;
export type SourceDescribeResponse = z.infer<typeof sourceDescribeResponseSchema>;
export type SourceSearchRequest = z.infer<typeof sourceSearchRequestSchema>;
export type SourceSearchResponse = z.infer<typeof sourceSearchResponseSchema>;
export type SourceWindowRequest = z.infer<typeof sourceWindowRequestSchema>;
export type SourceWindowResponse = z.infer<typeof sourceWindowResponseSchema>;
export type SourceParsedRequest = z.infer<typeof sourceParsedRequestSchema>;
export type SourceParsedResponse = z.infer<typeof sourceParsedResponseSchema>;
export type SourcePeriodsRequest = z.infer<typeof sourcePeriodsRequestSchema>;
export type SourcePeriodsResponse = z.infer<typeof sourcePeriodsResponseSchema>;
export type SourceTopViewRequest = z.infer<typeof sourceTopViewRequestSchema>;
export type SourceTopViewResponse = z.infer<typeof sourceTopViewResponseSchema>;
