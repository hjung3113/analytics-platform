// Log explorer source-read audit detail (#1469, design log-explorer §4.1). One event per read of original log text through the
// Source adapter. Body-free by construction: the Source owner, the sample-set digest, counts, the filter KEYS and a result code —
// never a row text, a parser field, a filter value or a file reference. Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_EXPLORER_AUDIT_EVENT_TYPES = ['explorer.source.read'] as const;

/** Subject type of the read events; the subject id is a uuid derived from the Source owner. */
export const LOG_EXPLORER_SUBJECT_TYPES = ['log_explorer_source'] as const;

export const LOG_EXPLORER_READ_ENDPOINTS = ['records', 'window', 'parsed', 'periods'] as const;

/** `ok` and the answered states, plus the failure codes of the read (a code, never a Source message). */
export const LOG_EXPLORER_READ_RESULTS = [
  'ok',
  'partial',
  'truncated',
  'unsupported',
  'permission_denied',
  'source_absent',
  'aborted',
  'time_budget_exceeded',
  'adapter_failed',
  'invalid_response',
  'invalid_request',
  'cursor_invalid',
] as const;

export const logExplorerSourceReadDetailSchema = z
  .object({
    endpoint: z.enum(LOG_EXPLORER_READ_ENDPOINTS),
    /** Same rule as `identifier(200)` of the Source contract: at most 200 code points (not UTF-16 units). */
    sourceOwner: z.string().min(1).refine((value) => [...value].length <= 200, { message: 'at most 200 characters' }),
    /** SHA-256 of the sample-set manifest; null for a read of one line (window, parsed). */
    sampleSetDigest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    fileCount: z.number().int().min(0).max(1000),
    /** Names of the filter fields that were set (`text`, `context.job`), never their values. */
    filterKeys: z.array(z.string().min(1).max(120)).max(40),
    rowCount: z.number().int().min(0).max(200),
    bytes: z.number().int().min(0),
    result: z.enum(LOG_EXPLORER_READ_RESULTS),
  })
  .strict();

export const LOG_EXPLORER_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'explorer.source.read': logExplorerSourceReadDetailSchema,
} as const satisfies Record<(typeof LOG_EXPLORER_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
