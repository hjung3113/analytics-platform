// `POST /api/v1/platform/files` — the generic upload of the platform port (#1741, ADR-0140).
// A sibling plugin of the platform port, registered AFTER the attachments service exists (the port plugin is built
// before it). One `file` part plus an `Idempotency-Key` header go through the attachments module's own intake and
// upload command, so storage, the idempotency frame, the `attachment_uploaded` audit (which never carries the filename),
// the unlinked-row purge and the uploader-only download of an unlinked row apply unchanged.
//
// The server is the authority on size, MIME, name and permission. Every judged failure is HTTP 200 with an
// `ActionResponse` body (like the notice writes); only a missing/stale session (401/403) and a CSRF failure (403)
// are HTTP errors. Permission to *use* the stored file is judged by whoever consumes it, not here.

import { createHash } from 'node:crypto';

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from '../../lib/errors.js';
import { IDEMPOTENCY_KEY_REGEX } from '../../lib/http-headers.js';
import { markAuthGuard } from '../../middleware/route-auth.js';
import {
  type AttachmentsService,
  type UploadAdmission,
  readUploadPart,
} from '../attachments/index.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { SessionService } from '../auth/session-service.js';
import type { CheckService } from '../permissions/check-service.js';
import { requireCsrf } from './csrf.js';
import { holdsPlatformPermission } from './permissions.js';
import {
  type LoadedSession,
  createAuthenticator,
  installPlatformTransport,
  platformActorOf,
} from './transport.js';

/** Largest upload of this route (32 MiB). `UPLOAD_FILE_MAX_BYTES` of `@ap/contracts` is the client's copy for pre-checks. */
export const PLATFORM_FILE_MAX_BYTES = 32 * 1024 * 1024;
export const PLATFORM_FILES_PATH = '/files';
const BUSY_RETRY_AFTER_SECONDS = 5;

/** `ActionResponse<T>` of the port (contracts adapter/action.ts). Never an `ApiResponse`. */
interface FieldError {
  path: string[];
  code: string;
}
interface ActionAnswer<T> {
  outcome: 'ok' | 'invalid' | 'conflict' | 'forbidden' | 'not_found' | 'error';
  data: T | null;
  version: string | null;
  fieldErrors: FieldError[];
  replayed: boolean;
  correlationId: string;
  message?: string;
}

export interface UploadedFileWire {
  id: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface PlatformFilesRoutesOptions {
  sessionService: SessionService;
  checkService: CheckService;
  attachmentsService: AttachmentsService;
  /** The one admission shared with `POST /attachments`: both routes buffer into the same memory budget. */
  uploadAdmission: UploadAdmission;
  workspaceId: string;
  rateLimitConfig?: { attachmentMutation: Record<string, unknown> };
}

export const platformFilesRoutes: FastifyPluginAsync<PlatformFilesRoutesOptions> = async (
  app,
  opts,
) => {
  installPlatformTransport(app, { notFound: false });
  const authenticate = createAuthenticator({
    sessionService: opts.sessionService,
    workspaceId: opts.workspaceId,
  });
  const csrf = requireCsrf(opts.sessionService);
  // The session and the validated key are decided in the pre-parse hook and handed to the handler.
  const authenticated = new WeakMap<FastifyRequest, LoadedSession>();
  const keys = new WeakMap<FastifyRequest, string>();

  const answer = (
    correlationId: string,
    outcome: ActionAnswer<UploadedFileWire>['outcome'],
    over: Partial<ActionAnswer<UploadedFileWire>> = {},
  ): ActionAnswer<UploadedFileWire> => ({
    outcome,
    data: null,
    version: null,
    fieldErrors: [],
    replayed: false,
    correlationId,
    ...over,
  });
  const invalid = (correlationId: string, message: string, fieldErrors: FieldError[]) =>
    answer(correlationId, 'invalid', { message, fieldErrors });

  const isMultipartHeader = (req: FastifyRequest): boolean =>
    String(req.headers['content-type'] ?? '')
      .split(';')[0]
      ?.trim()
      .toLowerCase() === 'multipart/form-data';

  // Every gate runs BEFORE Fastify parses the body (`preParsing`): a JSON or text body never reaches a body parser
  // (the plugin's JSON parser buffers the whole string) before the session, CSRF, permission, key and media-type
  // checks. Order: session (401/403), CSRF of that session (403), permission, key, media type.
  const csrfGate = csrf as unknown as (
    req: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<FastifyReply | undefined>;
  const gates = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    authenticated.set(req, loaded);
    const refused = await csrfGate(req, reply);
    if (refused) return refused;

    const actor = platformActorOf(loaded);
    const cid = req.id;
    const send = (body: ActionAnswer<UploadedFileWire>) => reply.send(body);
    if (!(await holdsPlatformPermission(opts.checkService, actor, 'platform:view'))) {
      return send(answer(cid, 'forbidden', { message: 'No permission platform:view' }));
    }

    const rawKey = req.headers['idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (typeof key !== 'string' || !IDEMPOTENCY_KEY_REGEX.test(key)) {
      return send(
        invalid(cid, 'Idempotency-Key must be a UUIDv4', [
          { path: ['headers', 'idempotency-key'], code: key === undefined ? 'required' : 'invalid' },
        ]),
      );
    }
    // One canonical spelling for the lock, the lookup and the record (the column is a `uuid`).
    keys.set(req, key.toLowerCase());
    if (!isMultipartHeader(req)) {
      return send(
        invalid(cid, 'Request must be multipart/form-data', [
          { path: ['headers', 'content-type'], code: 'invalid_content_type' },
        ]),
      );
    }
    return undefined;
  };

  app.post(
    PLATFORM_FILES_PATH,
    {
      // #1972: the pre-parse gate authenticates first, so it is the route's marked guard.
      preParsing: markAuthGuard(async (req: FastifyRequest, reply: FastifyReply) => {
        const refused = await gates(req, reply);
        return refused ? (reply as never) : undefined;
      }),
      ...(opts.rateLimitConfig
        ? { config: { rateLimit: opts.rateLimitConfig.attachmentMutation as never } }
        : {}),
    },
    async (req, reply) => {
      const loaded = authenticated.get(req);
      const key = keys.get(req);
      if (!loaded || !key) return reply.code(401).send({ code: 'auth.session_invalid' });
      const actor = platformActorOf(loaded);
      const cid = req.id;

      // Admission before any byte is buffered; no free slot is refused at once (never queued).
      const release = opts.uploadAdmission.tryAcquire();
      if (!release) {
        reply.header('Retry-After', String(BUSY_RETRY_AFTER_SECONDS));
        return answer(cid, 'error', { message: 'Too many uploads in progress; retry shortly' });
      }
      try {
        const read = await readUploadPart(req, { maxBytes: PLATFORM_FILE_MAX_BYTES });
        if (!read.ok) {
          switch (read.reason) {
            case 'too_large':
              return invalid(cid, 'File exceeds the size limit', [{ path: ['file'], code: 'too_large' }]);
            case 'extra_part':
              return invalid(cid, 'Exactly one file part is allowed', [
                { path: ['file'], code: 'too_many_parts' },
              ]);
            case 'missing':
              return invalid(cid, 'File part missing', [{ path: ['file'], code: 'required' }]);
            case 'unsupported_type':
              return invalid(cid, 'File type is not allowed', [
                { path: ['file'], code: 'unsupported_type' },
              ]);
            case 'invalid_filename':
              return invalid(cid, 'File name is not usable', [
                { path: ['file', 'name'], code: 'invalid_filename' },
              ]);
            case 'malformed':
              req.log.info({ code: (read.err as { code?: unknown } | null)?.code }, 'malformed multipart request');
              return invalid(cid, 'Malformed request', [{ path: ['file'], code: 'malformed' }]);
            case 'aborted':
              // The client is gone: nothing can read this answer; returning settles the handler and frees the slot.
              return answer(cid, 'error', { message: 'Request was aborted' });
            case 'not_multipart':
              return invalid(cid, 'Request must be multipart/form-data', [
                { path: ['headers', 'content-type'], code: 'invalid_content_type' },
              ]);
          }
        }

        const requestHash = hashRequestBody({
          route: 'platform.file.upload',
          filename: read.filename,
          mime_type: read.mimeType,
          size_bytes: read.bytes.byteLength,
          // Different bytes under the same name, type and length are a different file (conflict, not a replay).
          sha256: createHash('sha256').update(read.bytes).digest('hex'),
        });
        try {
          const result = await opts.attachmentsService.uploadAttachmentCommand({
            actor: { actor_id: actor.actor_id, workspace_id: actor.workspace_id },
            bytes: read.bytes,
            mimeType: read.mimeType,
            filename: read.filename,
            idempotencyKey: key,
            requestHash,
          });
          return answer(cid, 'ok', {
            data: {
              id: result.body.id,
              name: result.body.name,
              size: result.body.size_bytes,
              mimeType: result.body.mime_type,
            },
            replayed: result.replayed,
          });
        } catch (err) {
          if (err instanceof HttpError && err.code === 'conflict.idempotency_key_reuse') {
            return answer(cid, 'conflict', {
              message: 'Idempotency-Key was used with a different file',
            });
          }
          if (err instanceof HttpError && err.code === 'storage.unavailable') {
            return answer(cid, 'error', { message: 'File storage is unavailable; retry shortly' });
          }
          throw err;
        }
      } finally {
        release();
      }
    },
  );
};
