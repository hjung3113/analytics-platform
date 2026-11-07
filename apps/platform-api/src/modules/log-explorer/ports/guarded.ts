// The server-side guard around any SourceReadPort adapter (design §3.1, §4). It is the one place that enforces what an adapter might
// get wrong: it validates the request, applies the cancel signal and the time budget, cuts over-long row text, recomputes the
// time-reversal marker, fails closed on a response that breaks the wire contract or names a location the request did not ask for, and
// turns every adapter failure into a code-only SourceReadError. It never logs, audits or stores a request or response.

import {
  sourceDescribeRequestSchema,
  sourceDescribeResponseSchema,
  sourceParsedRequestSchema,
  sourceParsedResponseSchema,
  sourcePeriodsRequestSchema,
  sourcePeriodsResponseSchema,
  sourceSearchRequestSchema,
  sourceSearchResponseSchema,
  sourceTopViewRequestSchema,
  sourceTopViewResponseSchema,
  sourceWindowRequestSchema,
  sourceWindowResponseSchema,
  type SourcePeriodsRequest,
  type SourceRow,
  type SourceSampleSet,
} from '@ap/contract-schemas';

import { SourceReadError, toSourceReadError } from '../errors.js';
import { clampTimeBudgetMs, PLATFORM_SOURCE_LIMITS, truncateRowText } from '../domain/limits.js';
import { isInSourceOrder, markTimeReversals } from '../domain/time-reversal.js';
import type { SourceReadContext, SourceReadPort } from './source-read.js';

function cutRows(rows: readonly SourceRow[]): SourceRow[] {
  return rows.map((row) => {
    if (typeof row.text !== 'string') return row; // the wire schema refuses it afterwards
    const cut = truncateRowText(row.text, PLATFORM_SOURCE_LIMITS.maxRowChars);
    return cut.truncated ? { ...row, text: cut.text, truncated: true } : row;
  });
}

const invalidResponse = () => new SourceReadError('invalid_response');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Runs one adapter call under the signal and the budget, then `finish` (the guard's own validation and transformation of the answer)
 * inside the same boundary. The adapter sees a signal that fires on either. The answer is refused when the call was cancelled or ran
 * past its budget, even if it arrived: before `finish` and again after it, so slow validation cannot extend the budget either.
 * Any failure of the adapter or of `finish` leaves as a fresh code-only SourceReadError; a malformed answer is `invalid_response`.
 */
async function run<T, R>(ctx: SourceReadContext, call: (inner: SourceReadContext) => Promise<T>, finish: (answer: T) => R): Promise<R> {
  if (ctx.signal.aborted) throw new SourceReadError('aborted');
  const budgetMs = clampTimeBudgetMs(ctx.timeBudgetMs);
  const startedAt = performance.now();
  const inner = new AbortController();
  let reason: 'aborted' | 'time_budget_exceeded' | null = null;
  let settle: (error: SourceReadError) => void = () => undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    settle = reject;
  });
  const stop = (code: 'aborted' | 'time_budget_exceeded') => {
    if (reason !== null) return;
    reason = code;
    inner.abort();
    settle(new SourceReadError(code));
  };
  /** Refuses to go on once the call is cancelled or past its deadline, whatever the promise race decided. */
  const ensureLive = () => {
    if (reason !== null) throw new SourceReadError(reason);
    if (ctx.signal.aborted) {
      stop('aborted');
      throw new SourceReadError('aborted');
    }
    if (performance.now() - startedAt >= budgetMs) {
      stop('time_budget_exceeded');
      throw new SourceReadError('time_budget_exceeded');
    }
  };
  const onAbort = () => stop('aborted');
  ctx.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => stop('time_budget_exceeded'), budgetMs);
  try {
    const answer = call({ signal: inner.signal, timeBudgetMs: budgetMs });
    // An adapter that ignores the signal still cannot outlive it; a late rejection of the dropped call is swallowed.
    answer.catch(() => undefined);
    const value = await Promise.race([answer, interrupted]);
    ensureLive();
    let result: R;
    try {
      result = finish(value);
    } catch (error) {
      // Not toSourceReadError: a non-SourceReadError here is a malformed answer (a null field, a throwing getter), not an adapter failure.
      throw error instanceof SourceReadError ? error : invalidResponse();
    }
    ensureLive();
    return result;
  } catch (error) {
    throw reason !== null ? new SourceReadError(reason) : toSourceReadError(error);
  } finally {
    clearTimeout(timer);
    ctx.signal.removeEventListener('abort', onAbort);
  }
}

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

function checked<T>(schema: Parser<T>, value: unknown, code: 'invalid_request' | 'invalid_response'): T {
  const parsed = schema.safeParse(value);
  // The zod issue list can quote input values; it is dropped here, only the code leaves.
  if (!parsed.success) throw new SourceReadError(code);
  return parsed.data;
}

/** `fileRef -> order` of the request's sample set: the only locations an answer may name. */
function orderOf(sampleSet: SourceSampleSet): Map<string, number> {
  return new Map(sampleSet.files.map((file) => [file.fileRef, file.order]));
}

/** Rows must sit in files of the sample set, carry that file's order, and follow file order then line, strictly. */
function rowsMatchSampleSet(rows: readonly SourceRow[], sampleSet: SourceSampleSet): boolean {
  const order = orderOf(sampleSet);
  return rows.every((row) => order.get(row.fileRef) === row.fileOrder) && isInSourceOrder(rows);
}

function periodsMatchSampleSet(rows: readonly { fileRef: string; startLine: number; endLine: number | null }[], request: SourcePeriodsRequest): boolean {
  const order = orderOf(request.sampleSet);
  let previous: [number, number] | null = null;
  for (const row of rows) {
    const fileOrder = order.get(row.fileRef);
    if (fileOrder === undefined) return false;
    if (row.endLine !== null && row.endLine < row.startLine) return false;
    if (previous !== null && (fileOrder < previous[0] || (fileOrder === previous[0] && row.startLine <= previous[1]))) return false;
    previous = [fileOrder, row.startLine];
  }
  return true;
}

export function guardSourceReadPort(port: SourceReadPort): SourceReadPort {
  return {
    describe: async (request, ctx) => {
      const req = checked(sourceDescribeRequestSchema, request, 'invalid_request');
      return run(ctx, (inner) => port.describe(req, inner), (res) => checked(sourceDescribeResponseSchema, res, 'invalid_response'));
    },
    searchRecords: async (request, ctx) => {
      const req = checked(sourceSearchRequestSchema, request, 'invalid_request');
      return run(
        ctx,
        (inner) => port.searchRecords(req, inner),
        (res) => {
          if (!isRecord(res)) throw invalidResponse();
          if (res.status !== 'ok') return checked(sourceSearchResponseSchema, res, 'invalid_response');
          if (!Array.isArray(res.rows)) throw invalidResponse();
          const out = checked(sourceSearchResponseSchema, { ...res, rows: markTimeReversals(cutRows(res.rows)) }, 'invalid_response');
          if (out.status === 'ok' && (out.rows.length > req.limit || !rowsMatchSampleSet(out.rows, req.sampleSet))) throw invalidResponse();
          return out;
        },
      );
    },
    getWindow: async (request, ctx) => {
      const req = checked(sourceWindowRequestSchema, request, 'invalid_request');
      return run(
        ctx,
        (inner) => port.getWindow(req, inner),
        (res) => {
          if (!isRecord(res)) throw invalidResponse();
          if (res.status !== 'ok') return checked(sourceWindowResponseSchema, res, 'invalid_response');
          if (!Array.isArray(res.rows)) throw invalidResponse();
          const rows = markTimeReversals(cutRows(res.rows));
          // The aggregate flag keeps an adapter's own `true` and adds any cut the guard made.
          const out = checked(sourceWindowResponseSchema, { ...res, rows, truncated: res.truncated === true || rows.some((row) => row.truncated) }, 'invalid_response');
          if (out.status !== 'ok') return out;
          const first = req.line - req.before;
          const last = req.line + req.after;
          const fileOrder = out.rows[0]?.fileOrder;
          const inside = out.rows.every((row) => row.fileRef === req.fileRef && row.fileOrder === fileOrder && row.line >= first && row.line <= last);
          if (out.rows.length > req.before + req.after + 1 || !inside || !isInSourceOrder(out.rows)) throw invalidResponse();
          return out;
        },
      );
    },
    getParsed: async (request, ctx) => {
      const req = checked(sourceParsedRequestSchema, request, 'invalid_request');
      return run(
        ctx,
        (inner) => port.getParsed(req, inner),
        (res) => {
          if (!isRecord(res)) throw invalidResponse();
          if (res.status !== 'ok') return checked(sourceParsedResponseSchema, res, 'invalid_response');
          if (!isRecord(res.extractedFields) || typeof res.parserIn !== 'string' || typeof res.parserOut !== 'string') throw invalidResponse();
          const max = PLATFORM_SOURCE_LIMITS.maxRowChars;
          const cutValue = (value: unknown) => (typeof value === 'string' ? truncateRowText(value, max) : { text: value, truncated: false });
          const parserIn = truncateRowText(res.parserIn, max);
          const parserOut = truncateRowText(res.parserOut, max);
          const fields = Object.entries(res.extractedFields).map(([key, value]) => [key, cutValue(value)] as const);
          const truncated = res.truncated === true || parserIn.truncated || parserOut.truncated || fields.some(([, f]) => f.truncated);
          return checked(
            sourceParsedResponseSchema,
            { ...res, parserIn: parserIn.text, parserOut: parserOut.text, extractedFields: Object.fromEntries(fields.map(([key, f]) => [key, f.text])), truncated },
            'invalid_response',
          );
        },
      );
    },
    getPeriods: async (request, ctx) => {
      const req = checked(sourcePeriodsRequestSchema, request, 'invalid_request');
      return run(
        ctx,
        (inner) => port.getPeriods(req, inner),
        (res) => {
          const out = checked(sourcePeriodsResponseSchema, res, 'invalid_response');
          if (out.status === 'ok' && (out.rows.length > req.limit || !periodsMatchSampleSet(out.rows, req))) throw invalidResponse();
          return out;
        },
      );
    },
    getTopViewLink: async (request, ctx) => {
      const req = checked(sourceTopViewRequestSchema, request, 'invalid_request');
      return run(ctx, (inner) => port.getTopViewLink(req, inner), (res) => checked(sourceTopViewResponseSchema, res, 'invalid_response'));
    },
  };
}
