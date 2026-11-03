// `POST /api/v1/log-knowledge/imports` — uploads a catalog import file and stages it (#1195 a, design v0.6 §6.2 ①).
// Multipart: one `file` part and an `entityType` field. Order of judgment: session (401/403) → CSRF (403) →
// `Idempotency-Key` → `knowledge.catalog.import` (Admin bypass; judged BEFORE replay and again inside the
// transaction after the idempotency lock, before the replay lookup) → file read and limits → one transaction (idempotency frame, job, rows). The file bytes are not
// stored, only name, size, type and sha256. File-level refusals answer 400/413 with `{ code }` and create no job.

import { createHash } from 'node:crypto';

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
import { importAuthorizer } from './import-actions.js';
import {
  IMPORT_MAX_BYTES,
  type ImportFileRefusal,
  parseImportFile,
} from './domain/import-file.js';
import { isImportEntity } from './domain/import-mapping.js';
import { insertJob, insertRows } from './repositories/import-repo.js';

export const LOG_KNOWLEDGE_ROUTE_PREFIX = '/api/v1/log-knowledge';
/** Parses (5 MB, up to 5,000 rows) run a few at a time per process; a busy server answers 503 at once. */
const PARSE_CONCURRENCY = 2;
const FILE_NAME_MAX = 255;

export interface ImportRoutesOptions {
  sessionService: SessionService;
  checkService: CheckService;
  idempotencyService: IdempotencyService;
  db: Db;
  workspaceId: string;
}

const refuse = (reply: FastifyReply, status: 400 | 413 | 503, code: string, message: string) =>
  reply.code(status).send({ code, message });

const isTooLarge = (err: unknown): boolean => {
  const code = (err as { code?: string } | null)?.code;
  return code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT';
};

export const importRoutes: FastifyPluginAsync<ImportRoutesOptions> = async (app, opts) => {
  const authenticate = createAuthenticator({ sessionService: opts.sessionService, workspaceId: opts.workspaceId });
  const csrf = requireCsrf(opts.sessionService);
  const authorize = importAuthorizer(opts.checkService);
  let inFlight = 0;

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

    if (inFlight >= PARSE_CONCURRENCY) {
      reply.header('Retry-After', '5');
      return refuse(reply, 503, 'busy', 'too many imports in progress; retry shortly');
    }
    inFlight += 1;
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
      const fileName = [...file.name]
        .map((ch) => (ch.charCodeAt(0) < 0x20 || ch === '\u007f' || ch === '/' || ch === '\\' ? '_' : ch))
        .join('')
        .slice(0, FILE_NAME_MAX);
      if (fileName === '') return refuse(reply, 400, 'unsupported_type', 'file name missing');

      const parsed = await parseImportFile(file.bytes, fileName);
      if (!parsed.ok) return refuse(reply, parsed.status, parsed.code satisfies ImportFileRefusal, `import file refused: ${parsed.code}`);

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
          });
          await insertRows(
            tx,
            actor.workspace_id,
            jobId,
            parsed.rows.map((row, i) => ({ rowNo: i + 1, raw: row.cells, parseErrors: row.parseErrors })),
          );
          return { jobId, rowCount: parsed.rows.length, status: 'uploaded' };
        },
      });
      return reply.code(result.status).send(result.body);
    } finally {
      inFlight -= 1;
    }
  });
};
