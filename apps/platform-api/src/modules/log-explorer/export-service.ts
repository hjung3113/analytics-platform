// The log explorer export (#1472, design log-explorer §4.1/§5): ONE request is ONE export of at most 10,000 rows and 5 MB as CSV or JSONL.
// The server reads the rows from the Source under the client's cancel signal, page by page; each page is judged again (right, token, Source owner).
// Nothing is stored or cached: the file exists only as the bounded in-memory buffer of this request. An over-limit request is refused BEFORE the
// first byte goes out (never a silently cut file); the buffered file is then written in chunks and the right is judged again at every chunk
// boundary, so a revoked token, a reduced permission or a revoked Source-owner grant stops the stream at the next chunk. Every outcome is audited
// (`explorer.export`, body-free). The Fastify route (`export-routes.ts`) only carries the outcome to HTTP.

import { Readable } from 'node:stream';

import {
  EXPORT_BYTES_MAX,
  EXPORT_CONTENT_TYPES,
  EXPORT_DAILY_MAX,
  EXPORT_ROWS_MAX,
  SOURCE_READ_ROWS_MAX,
  SOURCE_READ_TIME_BUDGET_MS,
  exportRequestSchema,
  type SourceRow,
} from '@ap/contract-schemas';
import type { LOG_EXPLORER_EXPORT_RESULTS } from '@ap/feature-shared';

import { type AuthContext, runWithAuthStore } from '../../lib/auth-context.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { budgetSpent, refundBody, reserveBody, subjectsOf } from './domain/budget.js';
import { exportHeader, exportLine } from './domain/export-format.js';
import { filterKeysOf } from './domain/read-params.js';
import { sampleSetDigest } from './domain/sample-digest.js';
import type { LogExplorerExportDeps } from './deps.js';
import type { SourceReadPort } from './ports/source-read.js';
import { subjectIdOf } from './read-service.js';
import { createUsageStore, type UsageSubject } from './usage-store.js';

export const EXPORT_CHUNK_BYTES = 64 * 1024;
export const EXPORT_TOTAL_MS = 120_000;
const EXPORT_EVENT = 'explorer.export' as const;

type ExportResult = (typeof LOG_EXPLORER_EXPORT_RESULTS)[number];
export type ExportRefusal =
  | 'explorer.budget_exceeded'
  | 'explorer.range_too_large'
  | 'explorer.forbidden'
  | 'explorer.source_unavailable'
  | 'explorer.export_busy'
  | 'explorer.export_daily_limit'
  | 'explorer.investigation_unsupported';

const RESULT_OF: Record<ExportRefusal, ExportResult> = {
  'explorer.budget_exceeded': 'budget_exceeded',
  'explorer.range_too_large': 'range_too_large',
  'explorer.forbidden': 'forbidden',
  'explorer.source_unavailable': 'source_unavailable',
  'explorer.export_busy': 'export_busy',
  'explorer.export_daily_limit': 'export_daily_limit',
  'explorer.investigation_unsupported': 'investigation_unsupported',
};

/** What the route sends. `invalid` carries field paths and zod codes only, never a value. */
export type ExportOutcome =
  | { kind: 'invalid'; fields: Array<{ path: Array<string | number>; code: string }> }
  | { kind: 'refused'; code: ExportRefusal }
  | { kind: 'aborted' }
  | { kind: 'stream'; contentType: string; filename: string; byteLength: number; stream: Readable };

export interface ExportCall {
  actor: PlatformActor;
  auth: AuthContext;
  body: unknown;
  /** Fires when the client goes away. */
  signal: AbortSignal;
}

/** A right gone before the first byte: the route answers it as 403 `explorer.forbidden`; after headers went out it only cuts the connection. */
export class StreamStopped extends Error {
  readonly statusCode = 403;
  constructor() {
    super('export_stopped');
    this.name = 'StreamStopped';
  }
}

/** What the audit row of an export names. A request that names no Source owner (malformed body, investigation id) has none of it: null, never a guess. */
interface AuditInfo {
  sourceOwner: string | null;
  sampleSetDigest: string | null;
  fileCount: number;
  filterKeys: string[];
  format: 'csv' | 'jsonl' | null;
}

/** The response deadline passed while a pre-stream step was still awaited. */
class DeadlineExpired extends Error {}

export function createExportService(deps: LogExplorerExportDeps, port: SourceReadPort | null) {
  const usage = deps.usage ?? createUsageStore(deps.db, deps.clock);
  const chunkBytes = deps.exportChunkBytes ?? EXPORT_CHUNK_BYTES;
  const totalMs = deps.exportTotalMs ?? EXPORT_TOTAL_MS;

  /** The right, the token and the Source owner, now. Nothing is cached between calls. */
  async function allowed(call: ExportCall, sourceOwner: string): Promise<boolean> {
    if (call.auth.kind === 'token' && !(await deps.tokenActive(call.auth.tokenId))) return false;
    const decision = await runWithAuthStore({ ctx: call.auth }, () =>
      deps.checkService.checkCapability(call.actor, 'explorer.export', { workspace_id: call.actor.workspace_id }),
    );
    if (!decision.allow) return false;
    return deps.sourceOwnerAccess.allows(call.actor, sourceOwner);
  }

  async function writeAudit(
    call: ExportCall,
    detail: AuditInfo,
    result: ExportResult,
    rowCount: number,
    bytes: number,
  ): Promise<void> {
    await runWithAuthStore({ ctx: call.auth }, () =>
      deps.db.transaction(async (tx) => {
        await deps.audit.record(tx, {
          workspace_id: call.actor.workspace_id,
          actor_id: call.actor.actor_id,
          event_type: EXPORT_EVENT,
          subject_type: 'log_explorer_source',
          subject_id: subjectIdOf(call.actor.workspace_id, detail.sourceOwner ?? ''),
          summary: `log explorer export: ${result}`,
          detail: { ...detail, rowCount, bytes, result, viaToken: call.auth.kind === 'token' },
        });
      }),
    );
  }

  async function run(call: ExportCall): Promise<ExportOutcome> {
    const parsed = exportRequestSchema.safeParse(call.body);
    if (!parsed.success) {
      // Still an attempt: audited with no Source owner, digest, filter key or value (the body is not trusted to name any).
      await writeAudit(call, { sourceOwner: null, sampleSetDigest: null, fileCount: 0, filterKeys: [], format: null }, 'invalid_request', 0, 0);
      return { kind: 'invalid', fields: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.map((p) => (typeof p === 'symbol' ? String(p) : p)), code: i.code })) };
    }
    const request = parsed.data;
    // The investigation is node b (not built): a clear code, audited without a Source owner (there is none to name yet).
    if (request.sampleSet === undefined) {
      await writeAudit(call, { sourceOwner: null, sampleSetDigest: null, fileCount: 0, filterKeys: filterKeysOf(request.query), format: request.format }, 'investigation_unsupported', 0, 0);
      return { kind: 'refused', code: 'explorer.investigation_unsupported' };
    }
    const { sampleSet, query, format } = request;
    const info: AuditInfo = {
      sourceOwner: sampleSet.sourceOwner,
      sampleSetDigest: sampleSetDigest(sampleSet),
      fileCount: sampleSet.files.length,
      filterKeys: filterKeysOf(query),
      format,
    };
    const ws = call.actor.workspace_id;
    const { counted, budgeted } = subjectsOf(call.actor.actor_id, call.auth);
    // One export at a time and 20 a day count per token AND per Actor, whichever way the Actor calls (session or token).
    const actorWide: UsageSubject = { kind: 'actor', id: call.actor.actor_id };
    const limited: UsageSubject[] = call.auth.kind === 'token' ? [{ kind: 'token', id: call.auth.tokenId }, actorWide] : [actorWide];

    const refuse = async (code: ExportRefusal): Promise<ExportOutcome> => {
      await writeAudit(call, info, RESULT_OF[code], 0, 0);
      return { kind: 'refused', code };
    };

    // 1. The right, judged for this request. A non-holder learns nothing about limits, Source or quotas.
    if (!(await allowed(call, sampleSet.sourceOwner))) return refuse('explorer.forbidden');
    // 2. Nothing connected (production today) or a range past the limit.
    if (port === null) return refuse('explorer.source_unavailable');
    if (request.range.rows > EXPORT_ROWS_MAX) return refuse('explorer.range_too_large');
    // 3. Quotas: exports a day (token and Actor, or the session Actor) and the day's body budget of a token call.
    for (const subject of limited) {
      if ((await usage.get(ws, subject, 'exports')) >= EXPORT_DAILY_MAX) return refuse('explorer.export_daily_limit');
    }
    if (budgeted.length > 0 && (await budgetSpent(usage, ws, budgeted))) return refuse('explorer.budget_exceeded');
    // 4. One export at a time per token and per Actor (a lease row that expires by itself).
    // Each lease is released by its own id: a late cleanup after the lease expired and was replaced never frees the replacement.
    // ONE deadline from the first lease to the end of the response; shorter than the lease TTL, so a live export never outlives its lease.
    const lifetime = AbortSignal.timeout(totalMs);
    const expired = new Promise<never>((_resolve, reject) => {
      lifetime.addEventListener('abort', () => reject(new DeadlineExpired()), { once: true });
    });
    expired.catch(() => undefined);
    /** A pre-stream await that can outlive the deadline (permission check, quota writes, start audit) stops waiting when it passes. */
    const within = <T>(work: Promise<T>): Promise<T> => {
      work.catch(() => undefined); // a loser's late failure is not an unhandled rejection
      return Promise.race([work, expired]);
    };
    const leased: Array<{ subject: UsageSubject; id: number }> = [];
    const releaseLeases = async () => {
      for (const lease of leased.splice(0)) await usage.releaseLease(ws, lease.subject, lease.id).catch(() => undefined);
    };
    for (const subject of limited) {
      const id = await usage.acquireLease(ws, subject);
      if (id !== null) leased.push({ subject, id });
      else {
        await releaseLeases();
        return refuse('explorer.export_busy');
      }
    }

    let handedOver = false;
    try {
      // 5. Read the rows, page by page, under the client's signal and the export's own time cap (`lifetime`, above: it covers the Source
      // reads, the pre-stream steps and the stream to a slow reader).
      const signal = AbortSignal.any([call.signal, lifetime]);
      const header = Buffer.from(exportHeader(format), 'utf8');
      const parts: Buffer[] = [header];
      let bytes = header.length;
      let rows = 0;
      let cursor: string | null = null;
      while (rows < request.range.rows) {
        const limit = Math.min(SOURCE_READ_ROWS_MAX, request.range.rows - rows);
        let answer: Awaited<ReturnType<SourceReadPort['searchRecords']>>;
        try {
          answer = await port.searchRecords({ sampleSet, query, cursor, limit }, { signal, timeBudgetMs: SOURCE_READ_TIME_BUDGET_MS });
        } catch {
          if (call.signal.aborted) {
            await writeAudit(call, info, 'aborted', rows, 0);
            return { kind: 'aborted' };
          }
          // Every Source failure (adapter, time budget, invalid answer) is one code on the wire; the Source's own text never exists here.
          return await refuse('explorer.source_unavailable');
        }
        // Judged again after every page: a right revoked while the Source was answering stops the export before any byte leaves.
        if (!(await allowed(call, sampleSet.sourceOwner))) return await refuse('explorer.forbidden');
        if (answer.status === 'permission_denied') return await refuse('explorer.forbidden');
        // A part of the range, a missing Source or an unsupported search cannot be a complete file: refused, never delivered as if whole.
        if (answer.status !== 'ok' || answer.partial) return await refuse('explorer.source_unavailable');
        for (const row of answer.rows as SourceRow[]) {
          const line = Buffer.from(exportLine(format, row), 'utf8');
          bytes += line.length;
          if (bytes > EXPORT_BYTES_MAX) return await refuse('explorer.range_too_large');
          parts.push(line);
          rows += 1;
        }
        if (answer.nextCursor === null || answer.rows.length === 0) break;
        cursor = answer.nextCursor;
      }
      const file = Buffer.concat(parts);
      if (call.signal.aborted) {
        await writeAudit(call, info, 'aborted', rows, 0);
        return { kind: 'aborted' };
      }
      if (!(await within(allowed(call, sampleSet.sourceOwner)))) return await refuse('explorer.forbidden');
      // 6. The file counts against the budget and the daily export count before the first byte; over budget it is refused whole.
      // One UTC day for every counter write and refund of this export (midnight may pass between the writes).
      const day = usage.today();
      const reservation = budgeted.length > 0 ? await within(reserveBody(usage, ws, budgeted, file.length)) : null;
      if (budgeted.length > 0 && reservation === null) return await refuse('explorer.budget_exceeded');
      for (const subject of limited) {
        if (!(await within(usage.add(ws, subject, 'exports', 1, EXPORT_DAILY_MAX, day)))) {
          if (reservation) await refundBody(usage, ws, reservation);
          return await refuse('explorer.export_daily_limit');
        }
      }
      for (const subject of counted) {
        await within(usage.add(ws, subject, 'exportBytes', file.length, undefined, day));
        if (budgeted.length === 0) {
          await within(usage.add(ws, subject, 'bytes', file.length, undefined, day));
          await within(usage.add(ws, subject, 'exports', 1, undefined, day)); // the session row of the admin usage read; the limit above is on the Actor-wide counter
        }
      }
      // 7. The audit row of the start. If it cannot be written nothing is sent.
      await within(writeAudit(call, info, 'ok', rows, file.length));
      // Nothing is handed off after the deadline (the listener below would miss an abort that already happened).
      if (lifetime.aborted) throw new DeadlineExpired();

      let delivered = 0;
      let finished = false;
      const body: Readable = Readable.from(
        (async function* chunks() {
          for (let index = 0, offset = 0; offset < file.length; index += 1, offset += chunkBytes) {
            // The same live check before EVERY chunk, the first included: the quota writes and the audit row above take time, and the
            // consumer may come late. A right revoked in between yields zero Source bytes.
            await deps.beforeExportChunk?.(index);
            if (signal.aborted) return;
            if (!(await allowed(call, sampleSet.sourceOwner))) {
              await writeAudit(call, info, 'revoked', rows, delivered).catch(() => undefined);
              finished = true;
              throw new StreamStopped();
            }
            const chunk = file.subarray(offset, Math.min(offset + chunkBytes, file.length));
            delivered += chunk.length;
            yield chunk;
          }
          finished = true;
        })(),
        { objectMode: false },
      );
      // The response lifetime ends the stream even while a slow reader holds it (the generator is not asked for chunks then).
      const onLifetime = () => body.destroy();
      lifetime.addEventListener('abort', onLifetime, { once: true });
      // Always runs once, whether the stream ended, was stopped or the client left: free the lease; a client that left early is audited.
      (body as NodeJS.EventEmitter).on('close', () => {
        lifetime.removeEventListener('abort', onLifetime);
        void (async () => {
          if (!finished) await writeAudit(call, info, 'aborted', rows, delivered).catch(() => undefined);
          await releaseLeases();
        })();
      });
      handedOver = true;
      return {
        kind: 'stream',
        contentType: EXPORT_CONTENT_TYPES[format],
        filename: `log-explorer-export.${format}`,
        byteLength: file.length,
        stream: body,
      };
    } catch (error) {
      if (!(error instanceof DeadlineExpired)) throw error;
      // The deadline passed before the stream existed: no stream, the lease is freed (fenced by its id) and the caller gets a clean refusal.
      // The audit is best effort and not awaited (the write that held the deadline may still be pending).
      void writeAudit(call, info, RESULT_OF['explorer.source_unavailable'], 0, 0).catch(() => undefined);
      return { kind: 'refused', code: 'explorer.source_unavailable' };
    } finally {
      if (!handedOver) await releaseLeases();
    }
  }

  return { run };
}

export type ExportService = ReturnType<typeof createExportService>;
