// Params of the four log-explorer reads (#1469). The Source wire schemas of @ap/contract-schemas (v0) are the one validator: a request
// that the port would refuse is refused here first, with the field path and the schema's static message — never the offending value
// (a value may be a filter text or a file reference).

import {
  sourceParsedRequestSchema,
  sourcePeriodsRequestSchema,
  sourceSearchRequestSchema,
  sourceWindowRequestSchema,
  type SourceParsedRequest,
  type SourceRecordQuery,
  type SourceSampleSet,
  type SourceWindowRequest,
} from '@ap/contract-schemas';
import type { ParamsJudgment } from '../../menu-dispatch/types.js';
import { WIRE_CURSOR_MAX } from './cursor.js';

export const DEFAULT_PAGE_LIMIT = 50;
export { WIRE_CURSOR_MAX } from './cursor.js';

export const RECORDS_PARAM_KEYS = ['sampleSet', 'query', 'cursor', 'limit'] as const;
export const WINDOW_PARAM_KEYS = ['sourceOwner', 'fileRef', 'line', 'before', 'after', 'roundId'] as const;
export const PARSED_PARAM_KEYS = ['sourceOwner', 'fileRef', 'line'] as const;
export const PERIODS_PARAM_KEYS = RECORDS_PARAM_KEYS;

export interface PagedRead {
  sampleSet: SourceSampleSet;
  query: SourceRecordQuery;
  /** The signed cursor the client sent, or null for the first page. */
  cursor: string | null;
  limit: number;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

function describeIssues(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  const parts = error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.map(String).join('.');
    return `${path === '' ? 'params' : path}: ${issue.message}`;
  });
  return `invalid params: ${parts.join('; ')}`;
}

function parsePaged(
  params: Record<string, unknown>,
  schema: typeof sourceSearchRequestSchema | typeof sourcePeriodsRequestSchema,
): Parsed<PagedRead> {
  const cursor = params.cursor ?? null;
  if (cursor !== null && (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > WIRE_CURSOR_MAX)) {
    return { ok: false, message: `invalid params: cursor: must be a string of 1..${WIRE_CURSOR_MAX} characters or null` };
  }
  // The adapter's own cursor is not known yet: validate the rest against the port schema with a placeholder.
  const candidate = {
    sampleSet: params.sampleSet,
    query: params.query ?? {},
    cursor: null,
    limit: params.limit ?? DEFAULT_PAGE_LIMIT,
  };
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) return { ok: false, message: describeIssues(parsed.error) };
  return { ok: true, value: { sampleSet: parsed.data.sampleSet, query: parsed.data.query, cursor, limit: parsed.data.limit } };
}

export const parseRecordsParams = (params: Record<string, unknown>) => parsePaged(params, sourceSearchRequestSchema);
export const parsePeriodsParams = (params: Record<string, unknown>) => parsePaged(params, sourcePeriodsRequestSchema);

export function parseWindowParams(params: Record<string, unknown>): Parsed<SourceWindowRequest & { roundId?: string }> {
  const { roundId, ...request } = params;
  if (roundId !== undefined && (typeof roundId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roundId))) return { ok: false, message: 'invalid params: roundId: must be a uuid' };
  const parsed = sourceWindowRequestSchema.safeParse({ ...request, before: params.before ?? 0, after: params.after ?? 0 });
  return parsed.success ? { ok: true, value: { ...parsed.data, ...(typeof roundId === 'string' ? { roundId } : {}) } } : { ok: false, message: describeIssues(parsed.error) };
}

export function parseParsedParams(params: Record<string, unknown>): Parsed<SourceParsedRequest> {
  const parsed = sourceParsedRequestSchema.safeParse(params);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: describeIssues(parsed.error) };
}

export const judgmentOf = <T>(parsed: Parsed<T>): ParamsJudgment => (parsed.ok ? { ok: true } : parsed);

/** Names of the filter fields that are set, never their values: `text`, `logType`, …, and `context.<key>` for each context key. */
export function filterKeysOf(query: SourceRecordQuery): string[] {
  const keys: string[] = [];
  for (const name of ['text', 'logType', 'module', 'event'] as const) if (query[name] !== undefined) keys.push(name);
  for (const key of Object.keys(query.context ?? {}).sort()) keys.push(`context.${key}`);
  return keys.slice(0, 40);
}
