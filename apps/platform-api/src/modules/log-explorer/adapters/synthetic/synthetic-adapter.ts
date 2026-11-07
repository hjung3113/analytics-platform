// Synthetic SourceReadPort adapter: fixture lines held in memory, for dev and tests only. Everything it answers is flagged synthetic
// ("합성"). It is never imported by the production graph (ADR-0119 §7); `production-graph.test.ts` fails if it is. Nothing here reads a
// real source, so a fixture line is not a real log body.

import {
  SOURCE_READ_ROWS_MAX,
  SOURCE_READ_ROW_CHARS_MAX,
  SOURCE_READ_TIME_BUDGET_MS,
  SOURCE_READ_WINDOW_MAX,
  type SourceReadCapability,
  type SourceRecordQuery,
  type SourceRow,
  type SourceSampleSet,
} from '@ap/contract-schemas';

import { SourceReadError, toSourceReadError } from '../../errors.js';
import { markTimeReversals } from '../../domain/time-reversal.js';
import { truncateRowText } from '../../domain/limits.js';
import type { SourceReadContext, SourceReadPort } from '../../ports/source-read.js';

export const SYNTHETIC_SOURCE_OWNER = 'synthetic-source';
/** The label every screen and PR shows next to synthetic output. */
export const SYNTHETIC_LABEL = '합성';

export interface SyntheticLine {
  text: string;
  timestamp?: string | null;
  logType?: string;
  module?: string;
  event?: string;
  context?: Record<string, string>;
  parsed?: { extractedFields: Record<string, string>; parserIn: string; parserOut: string };
}
export interface SyntheticFile {
  fileRef: string;
  sha256: string;
  lines: SyntheticLine[];
  /** A file the adapter cannot read: a search over it answers the rest and reports `partial`. */
  missing?: boolean;
}
export interface SyntheticPeriod {
  fileRef: string;
  startLine: number;
  endLine: number | null;
  state: string;
  incomplete: boolean;
}
export interface SyntheticFixture {
  sourceOwner: string;
  files: SyntheticFile[];
  periods: SyntheticPeriod[];
  capabilities: SourceReadCapability[];
  mode: 'normal' | 'absent' | 'denied' | 'failing' | 'slow';
  /** Text an internal failure carries. A leak test sets it to a marker and checks it never leaves the adapter. */
  failureText?: string;
}

const SLOW_MS = 5000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new SourceReadError('aborted'));
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new SourceReadError('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function matches(line: SyntheticLine, query: SourceRecordQuery): boolean {
  if (query.text !== undefined && query.text !== '' && !line.text.includes(query.text)) return false;
  if (query.logType !== undefined && line.logType !== query.logType) return false;
  if (query.module !== undefined && line.module !== query.module) return false;
  if (query.event !== undefined && line.event !== query.event) return false;
  for (const [key, value] of Object.entries(query.context ?? {})) if (line.context?.[key] !== value) return false;
  return true;
}

function parseCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  if (!/^\d{1,9}$/.test(cursor)) throw new SourceReadError('invalid_request');
  return Number(cursor);
}

export function createSyntheticSourceReadPort(fixture: SyntheticFixture): SourceReadPort {
  const toRow = (file: SyntheticFile, fileOrder: number, index: number): SourceRow => {
    const line = file.lines[index];
    if (line === undefined) throw new SourceReadError('adapter_failed');
    const cut = truncateRowText(line.text, SOURCE_READ_ROW_CHARS_MAX);
    return { fileRef: file.fileRef, fileOrder, line: index + 1, text: cut.text, truncated: cut.truncated, timestamp: line.timestamp ?? null, timeReversal: false, synthetic: true };
  };

  /** Common gate of every call: abort, failure and slowness modes, then the answered non-ok states. */
  async function gate(ctx: SourceReadContext): Promise<'denied' | 'absent' | 'go'> {
    if (ctx.signal.aborted) throw new SourceReadError('aborted');
    try {
      if (fixture.mode === 'failing') throw new Error(fixture.failureText ?? 'synthetic failure');
      if (fixture.mode === 'slow') {
        if (ctx.timeBudgetMs < SLOW_MS) {
          await sleep(ctx.timeBudgetMs, ctx.signal);
          throw new SourceReadError('time_budget_exceeded');
        }
        await sleep(SLOW_MS, ctx.signal);
      }
    } catch (error) {
      throw toSourceReadError(error);
    }
    if (fixture.mode === 'denied') return 'denied';
    if (fixture.mode === 'absent') return 'absent';
    return 'go';
  }
  const state = (g: 'denied' | 'absent') => (g === 'denied' ? ({ status: 'permission_denied' } as const) : ({ status: 'source_absent' } as const));
  const unsupportedReason = { getParsed: 'parser_not_connected', getPeriods: 'periods_not_supported', getTopViewLink: 'top_view_not_connected' } as const;
  const has = (capability: SourceReadCapability) => fixture.capabilities.includes(capability);
  const ordered = (sampleSet: SourceSampleSet) =>
    [...sampleSet.files]
      .sort((a, b) => a.order - b.order)
      .map((entry) => ({ entry, file: fixture.files.find((f) => f.fileRef === entry.fileRef && f.sha256 === entry.sha256) }));
  const find = (fileRef: string) => {
    const index = fixture.files.findIndex((f) => f.fileRef === fileRef);
    const file = fixture.files[index];
    // File order is 1-based, like a sample set's `order`; the fixture lists its files in that order.
    return file === undefined || file.missing === true ? null : { file, fileOrder: index + 1 };
  };

  return {
    async describe(request, ctx) {
      const g = await gate(ctx);
      if (g !== 'go') return state(g);
      return {
        status: 'ok',
        available: request.sourceOwner === fixture.sourceOwner,
        capabilities: fixture.capabilities,
        limits: { maxRows: SOURCE_READ_ROWS_MAX, maxRowChars: SOURCE_READ_ROW_CHARS_MAX, maxWindow: SOURCE_READ_WINDOW_MAX, timeBudgetMs: SOURCE_READ_TIME_BUDGET_MS },
        synthetic: true,
      };
    },

    async searchRecords(request, ctx) {
      const g = await gate(ctx);
      if (g !== 'go') return state(g);
      if (!has('searchRecords')) return { status: 'unsupported', reason: 'capability_missing' };
      const start = parseCursor(request.cursor);
      const limit = Math.min(request.limit, SOURCE_READ_ROWS_MAX);
      let partial = false;
      const hits: SourceRow[] = [];
      for (const { entry, file } of ordered(request.sampleSet)) {
        if (file === undefined || file.missing === true) {
          partial = true;
          continue;
        }
        file.lines.forEach((line, index) => {
          if (matches(line, request.query)) hits.push(toRow(file, entry.order, index));
        });
      }
      const page = hits.slice(start, start + limit);
      const next = start + limit < hits.length ? String(start + limit) : null;
      return { status: 'ok', rows: markTimeReversals(page), nextCursor: next, partial };
    },

    async getWindow(request, ctx) {
      const g = await gate(ctx);
      if (g !== 'go') return state(g);
      if (!has('getWindow')) return { status: 'unsupported', reason: 'capability_missing' };
      // The answer is capped at 200 rows with the target included; a larger ask is refused, never silently cut.
      if (request.before + request.after + 1 > SOURCE_READ_ROWS_MAX) throw new SourceReadError('invalid_request');
      const found = find(request.fileRef);
      if (found === null || request.line > found.file.lines.length) return { status: 'source_absent' };
      const first = Math.max(1, request.line - Math.min(request.before, SOURCE_READ_WINDOW_MAX));
      const last = Math.min(found.file.lines.length, request.line + Math.min(request.after, SOURCE_READ_WINDOW_MAX));
      const rows: SourceRow[] = [];
      for (let n = first; n <= last; n += 1) rows.push(toRow(found.file, found.fileOrder, n - 1));
      return { status: 'ok', rows: markTimeReversals(rows), truncated: rows.some((row) => row.truncated) };
    },

    async getParsed(request, ctx) {
      const g = await gate(ctx);
      if (g !== 'go') return state(g);
      if (!has('getParsed')) return { status: 'unsupported', reason: unsupportedReason.getParsed };
      const found = find(request.fileRef);
      const parsed = found?.file.lines[request.line - 1]?.parsed;
      if (parsed === undefined) return { status: 'source_absent' };
      const inText = truncateRowText(parsed.parserIn, SOURCE_READ_ROW_CHARS_MAX);
      const outText = truncateRowText(parsed.parserOut, SOURCE_READ_ROW_CHARS_MAX);
      return { status: 'ok', extractedFields: parsed.extractedFields, parserIn: inText.text, parserOut: outText.text, truncated: inText.truncated || outText.truncated, synthetic: true };
    },

    async getPeriods(request, ctx) {
      const g = await gate(ctx);
      if (g !== 'go') return state(g);
      if (!has('getPeriods')) return { status: 'unsupported', reason: unsupportedReason.getPeriods };
      const start = parseCursor(request.cursor);
      const limit = Math.min(request.limit, SOURCE_READ_ROWS_MAX);
      const order = new Map(request.sampleSet.files.map((f) => [f.fileRef, f.order]));
      const all = fixture.periods
        .filter((p) => order.has(p.fileRef))
        .sort((a, b) => (order.get(a.fileRef) ?? 0) - (order.get(b.fileRef) ?? 0) || a.startLine - b.startLine);
      const rows = all.slice(start, start + limit).map((p) => ({ ...p, synthetic: true }));
      return { status: 'ok', rows, nextCursor: start + limit < all.length ? String(start + limit) : null };
    },

    async getTopViewLink(request, ctx) {
      const g = await gate(ctx);
      if (g !== 'go') return state(g);
      if (!has('getTopViewLink')) return { status: 'unsupported', reason: unsupportedReason.getTopViewLink };
      const found = find(request.fileRef);
      if (found === null || request.line > found.file.lines.length) return { status: 'source_absent' };
      return { status: 'ok', url: `https://top-view.synthetic.invalid/view?file=${encodeURIComponent(request.fileRef)}&line=${request.line}`, synthetic: true };
    },
  };
}
