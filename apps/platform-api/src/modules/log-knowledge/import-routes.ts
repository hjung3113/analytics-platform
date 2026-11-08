import { viewerOf } from './repositories/access-visibility.js';
// Also `POST …/imports/:jobId/apply` and `GET …/imports/:jobId/report.csv` (#1195 b, below the upload).
// `POST /api/v1/log-knowledge/imports` — uploads a catalog import file and stages it (#1195 a, design v0.6 §6.2 ①).
// Multipart: one `file` part and an `entityType` field. Order of judgment: session (401/403) → CSRF (403) →
// `Idempotency-Key` → `knowledge.catalog.import` (Admin bypass; judged BEFORE replay and again inside the
// transaction after the idempotency lock, before the replay lookup) → file read and limits → one transaction (idempotency frame, job, rows). The file bytes are not
// stored, only name, size, type and sha256. File-level refusals answer 400/413 with `{ code }` and create no job.

import { createHash } from 'node:crypto';

import type pg from 'pg';
import type { FastifyPluginAsync, FastifyReply, preHandlerHookHandler } from 'fastify';

import type { Db } from '../../db/client.js';
import { HttpError, sendError } from '../../lib/errors.js';
import { requireIdempotencyKey } from '../../lib/http-headers.js';
import type { SessionService } from '../auth/session-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import { runIdempotentCommand } from '../core/idempotency/idempotent-command.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { CheckService } from '../permissions/check-service.js';
import { requireCsrf } from '../platform-port/csrf.js';
import {
  type LoadedSession,
  createAuthenticator,
  platformActorOf,
} from '../platform-port/transport.js';
import { encodeRfc5987, asciiFallback } from '../attachments/rfc5987.js';
import { UUID_PATTERN, importAuthorizer } from './import-actions.js';
import { IMPORT_APPLY_BUDGET_MS, type ImportApplyHooks, runApply } from './import-apply-service.js';
import { toCsvDocument } from './domain/csv-export.js';
import { readReportRows } from './repositories/import-apply-repo.js';
import {
  IMPORT_MAX_BYTES,
  type ImportFileRefusal,
  parseImportFile,
  sanitizeImportFileName,
} from './domain/import-file.js';
import { isImportEntity } from './domain/import-mapping.js';
import { modelHeaderFailure, recognizeModelHeaders } from './domain/import-headers.js';
import { getVisibleJob, insertJob, insertRows } from './repositories/import-repo.js';
import { applySlots, parseSlots } from './import-admission.js';

export const LOG_KNOWLEDGE_ROUTE_PREFIX = '/api/v1/log-knowledge';

export interface ImportRoutesOptions {
  sessionService: SessionService;
  checkService: CheckService;
  idempotencyService: IdempotencyService;
  db: Db;
  /** The pool behind `db`: the apply holds a session-scoped advisory lock on one of its connections. */
  pool: pg.Pool;
  workspaceId: string;
  /** Time budget of one apply call (default `IMPORT_APPLY_BUDGET_MS`); tests shrink it. */
  applyBudgetMs?: number;
  /** Test seams of the apply (never set in production). */
  applyHooks?: ImportApplyHooks;
}

const refuse = (reply: FastifyReply, status: 400 | 404 | 413 | 503, code: string, message: string, headers?: string[]) =>
  reply.code(status).send({ code, message, ...(headers ? { detail: { headers } } : {}) });

const isTooLarge = (err: unknown): boolean => {
  const code = (err as { code?: string } | null)?.code;
  return code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT';
};

export const importRoutes: FastifyPluginAsync<ImportRoutesOptions> = async (app, opts) => {
  const authenticate = createAuthenticator({ sessionService: opts.sessionService, workspaceId: opts.workspaceId });
  const csrf = requireCsrf(opts.sessionService);
  const authorize = importAuthorizer(opts.checkService);

  const authenticated = new WeakMap<object, LoadedSession>();
  const authenticateFirst: preHandlerHookHandler = async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    authenticated.set(req, loaded);
    return undefined;
  };

  app.post('/imports', { preHandler: [authenticateFirst, csrf] }, async (req, reply) => {
    const loaded = authenticated.get(req);
    if (!loaded) return sendError(reply, 'auth.session_invalid', 'session not active');
    const actor = platformActorOf(loaded);

    // Lowercased once: the DB key is a uuid, so two spellings of it must take the same lock and the same record.
    const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>).toLowerCase();
    if (!(await authorize(actor, opts.db))) {
      return sendError(reply, 'permission.denied', 'No permission knowledge.catalog.import');
    }
    if (!req.isMultipart()) return refuse(reply, 400, 'unsupported_type', 'request must be multipart/form-data');

    // Parses (5 MB, up to 5,000 rows) run a few at a time per process (shared with `importPaste`); a busy server answers 503 at once.
    const releaseParse = parseSlots.tryTake();
    if (!releaseParse) {
      reply.header('Retry-After', '5');
      return refuse(reply, 503, 'busy', 'too many imports in progress; retry shortly');
    }
    try {
      let file: { name: string; bytes: Buffer } | null = null;
      let entityType: unknown;
      try {
        for await (const part of req.parts({ limits: { fileSize: IMPORT_MAX_BYTES, files: 1, fields: 4 } })) {
          if (part.type === 'file') {
            if (part.fieldname !== 'file' || file) {
              await part.toBuffer();
              return refuse(reply, 400, 'unsupported_type', 'send exactly one file field named file');
            }
            file = { name: part.filename ?? '', bytes: await part.toBuffer() };
          } else if (part.fieldname === 'entityType') {
            entityType = part.value;
          }
        }
      } catch (err) {
        if (isTooLarge(err)) return refuse(reply, 413, 'file_too_large', 'file exceeds the 5 MB limit');
        return refuse(reply, 400, 'unreadable', 'malformed multipart request');
      }
      if (!isImportEntity(entityType)) {
        return refuse(reply, 400, 'invalid_entity_type', 'entityType must be vendor, process, model or software');
      }
      if (!file) return refuse(reply, 400, 'empty', 'file part missing');
      const fileName = sanitizeImportFileName(file.name);
      if (fileName === '') return refuse(reply, 400, 'unsupported_type', 'file name missing');

      const parsed = await parseImportFile(file.bytes, fileName, entityType === 'model' ? { recognizeHeaders: modelHeaderFailure } : undefined);
      if (!parsed.ok) {
        return refuse(reply, parsed.status, parsed.code satisfies ImportFileRefusal, `import file refused: ${parsed.code}`, parsed.detail);
      }
      // A model sheet is mapped by its header names (no mapping step); other entities and unrecognized headers wait for importMap.
      const recognized = entityType === 'model' ? recognizeModelHeaders(parsed.headers) : null;
      const mapping = recognized?.kind === 'mapped' ? recognized.mapping : undefined;

      const fileSha256 = createHash('sha256').update(file.bytes).digest('hex');
      const requestHash = hashRequestBody({
        route: 'logKnowledge.importUpload',
        entityType,
        fileName,
        fileSize: file.bytes.byteLength,
        fileSha256,
      });
      const result = await runIdempotentCommand({
        db: opts.db,
        idempotencyService: opts.idempotencyService,
        actorId: actor.actor_id,
        idempotencyKey,
        requestHash,
        status: 201,
        // Judged on the transaction after the lock and before the replay lookup: a revoke while the file was
        // arriving or the request queued refuses a replay as well as a first run.
        async beforeReplay(tx) {
          if (!(await authorize(actor, tx))) throw new HttpError('permission.denied', 'No permission knowledge.catalog.import');
          const hit = await opts.idempotencyService.lookup(tx, actor.actor_id, idempotencyKey, requestHash);
          if (hit.kind === 'match') {
            const saved = hit.body as { jobId?: string };
            if (!saved.jobId || !(await getVisibleJob(tx, viewerOf(actor), saved.jobId))) throw new HttpError('not_found.record', 'import job not found');
          }
        },
        async work(tx) {
          const jobId = await insertJob(tx, {
            workspaceId: actor.workspace_id,
            actorId: actor.actor_id,
            entityType,
            fileName,
            fileSize: file.bytes.byteLength,
            fileType: parsed.fileType,
            fileSha256,
            headers: parsed.headers,
            ...(mapping ? { mapping } : {}),
          });
          await insertRows(
            tx,
            actor.workspace_id,
            jobId,
            parsed.rows.map((row, i) => ({ rowNo: i + 1, raw: row.cells, parseErrors: row.parseErrors })),
          );
          return { jobId, rowCount: parsed.rows.length, status: mapping ? 'mapped' : 'uploaded' };
        },
      });
      return reply.code(result.status).send(result.body);
    } finally {
      releaseParse();
    }
  });
  // ---- ④–⑤ apply (#1195 b): seals on the first call, then applies rows until the time budget is spent. ----------
  app.post('/imports/:jobId/apply', { preHandler: [authenticateFirst, csrf] }, async (req, reply) => {
    const loaded = authenticated.get(req);
    if (!loaded) return sendError(reply, 'auth.session_invalid', 'session not active');
    const actor = platformActorOf(loaded);
    if (!(await authorize(actor, opts.db))) {
      return sendError(reply, 'permission.denied', 'No permission knowledge.catalog.import');
    }
    const jobId = String((req.params as { jobId?: string }).jobId ?? '').toLowerCase();
    if (!UUID_PATTERN.test(jobId)) return refuse(reply, 404, 'not_found', 'import job not found');
    const expected = (req.body as { expectedPlanVersion?: unknown } | null)?.expectedPlanVersion;
    if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 1) {
      return refuse(reply, 400, 'invalid', 'expectedPlanVersion must be a positive integer');
    }
    // At most two apply runs per process, shared with `importApply`; no slot answers 503 at once.
    const releaseApply = applySlots.tryTake();
    if (!releaseApply) {
      reply.header('Retry-After', '5');
      return refuse(reply, 503, 'busy', 'too many imports in progress; retry shortly');
    }
    const result = await runApply(
      {
        db: opts.db,
        pool: opts.pool,
        actor,
        authorize,
        config: { budgetMs: opts.applyBudgetMs ?? IMPORT_APPLY_BUDGET_MS, ...(opts.applyHooks ? { hooks: opts.applyHooks } : {}) },
      },
      jobId,
      expected,
    ).finally(releaseApply);
    if (result.kind === 'not_found') return refuse(reply, 404, 'not_found', 'import job not found');
    if (result.kind === 'busy') {
      reply.header('Retry-After', '5');
      return refuse(reply, 503, 'busy', 'too many imports in progress; retry shortly');
    }
    if (result.kind === 'conflict') return reply.code(409).send({ code: 'conflict', reason: result.code, message: 'the job changed or is not applicable' });
    return reply.code(200).send(result.progress);
  });

  // ---- report: one row per file row with the plan, the resolution and the apply outcome -----------------------
  app.get('/imports/:jobId/report.csv', async (req, reply) => {
    const loaded = await authenticate(req, reply, false);
    if (!loaded) return reply;
    const actor = platformActorOf(loaded);
    if (!(await authorize(actor, opts.db))) {
      return sendError(reply, 'permission.denied', 'No permission knowledge.catalog.import');
    }
    const jobId = String((req.params as { jobId?: string }).jobId ?? '').toLowerCase();
    if (!UUID_PATTERN.test(jobId)) return refuse(reply, 404, 'not_found', 'import job not found');
    const job = await getVisibleJob(opts.db, viewerOf(actor), jobId);
    if (!job) return refuse(reply, 404, 'not_found', 'import job not found');
    const rows = await readReportRows(opts.db, actor.workspace_id, job.id, job.validationGeneration);
    const csv = toCsvDocument(
      ['row_no', 'plan_state', 'resolution', 'apply_status', 'apply_error', 'result_target_id', ...job.headers],
      rows.map((r) => [
        String(r.rowNo),
        r.planState,
        r.resolution ?? '',
        r.applyStatus ?? '',
        r.applyError ?? '',
        r.resultTargetId ?? '',
        ...job.headers.map((h) => r.raw[h] ?? ''),
      ]),
    );
    const base = job.fileName.replace(/\.[^.]*$/, '') || 'import';
    const name = `${base}-report.csv`;
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${asciiFallback(name)}"; filename*=UTF-8''${encodeRfc5987(name)}`)
      .header('Cache-Control', 'no-store')
      .send(csv);
  });
};
