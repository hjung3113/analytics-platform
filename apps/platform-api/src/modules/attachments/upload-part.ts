// The multipart intake shared by every route that stores an upload (`POST /attachments`, `POST /platform/files`):
// parse the one `file` part, check the declared MIME against the closed allowlist, sanitize the filename and buffer
// the bytes under a per-request size cap. It judges and returns a result; each route maps the result to its own
// error body, so the two routes cannot drift apart on what a valid upload is.

import type { FastifyRequest } from 'fastify';

import { FilenameSanitizeError, sanitizeFilename } from './filename-sanitize.js';
import { MIME_ALLOWLIST } from './mime-allowlist.js';

/** Ceiling registered on the multipart plugin; each route passes its own, lower or equal, cap per request. */
export const MULTIPART_CEILING_BYTES = 32 * 1024 * 1024;

/**
 * Parser limits applied to every upload request, beside the per-route `fileSize`. The multipart plugin keeps every
 * field value it parses, so unbounded fields would put memory use outside the per-slot budget even without a file.
 * Exactly one file, and only a handful of tiny text fields (the intake ignores them).
 */
export const UPLOAD_PARSER_LIMITS = { files: 1, fields: 8, fieldSize: 4096, parts: 10 } as const;

/** The multipart field name of the one upload. */
export const UPLOAD_FIELD_NAME = 'file';

export interface MultipartFile {
  fieldname?: string;
  filename?: string;
  mimetype: string;
  file: NodeJS.ReadableStream & AsyncIterable<Buffer | string> & { truncated?: boolean };
}

export type UploadPartResult =
  | { ok: true; bytes: Buffer; mimeType: string; filename: string }
  | { ok: false; reason: 'not_multipart' }
  /** The client had already gone when intake would have started; no reply can reach it. */
  | { ok: false; reason: 'aborted' }
  | { ok: false; reason: 'missing' }
  | { ok: false; reason: 'too_large' }
  /** A second file part (the parser's `files: 1` limit). */
  | { ok: false; reason: 'extra_part' }
  | { ok: false; reason: 'malformed'; err: unknown }
  | { ok: false; reason: 'unsupported_type'; mimeType: string }
  | { ok: false; reason: 'invalid_filename'; sanitizeReason: FilenameSanitizeError['reason'] };

function codeOf(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

async function drainPart(part: MultipartFile): Promise<void> {
  try {
    for await (const chunk of part.file) {
      void chunk;
    }
  } catch {
    // Draining is best-effort; early validation responses must still settle.
  }
}

async function consumeToBuffer(part: MultipartFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of part.file) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (part.file.truncated) {
    throw Object.assign(new Error('file too large'), { code: 'FST_REQ_FILE_TOO_LARGE' });
  }
  return Buffer.concat(chunks);
}

/** Whether the request carries the multipart decoration and a multipart body. */
export function isMultipartRequest(req: FastifyRequest): boolean {
  const r = req as unknown as { isMultipart?: () => boolean; file?: unknown };
  return typeof r.isMultipart === 'function' && typeof r.file === 'function' && r.isMultipart();
}

/** Whether the client connection is already gone before the body was fully received. */
export function requestAborted(req: FastifyRequest): boolean {
  const raw = req.raw as typeof req.raw & { aborted?: boolean };
  if (raw.aborted === true) return true;
  return raw.complete !== true && (raw.destroyed || raw.socket?.destroyed === true);
}

/**
 * Reads the one `file` part under `maxBytes` (enforced while streaming, so a larger file is never fully buffered).
 * Order, cheapest rejection first: multipart shape, part present, MIME allowlist, filename, size.
 */
export async function readUploadPart(
  req: FastifyRequest,
  opts: { maxBytes: number; tolerateTrailingErrors?: boolean },
): Promise<UploadPartResult> {
  if (!isMultipartRequest(req)) return { ok: false, reason: 'not_multipart' };
  // The parser listens for the request's close/error from the moment it starts; a disconnect that already happened
  // would leave it waiting for an event that never comes, holding the caller's admission slot.
  if (requestAborted(req)) return { ok: false, reason: 'aborted' };
  const parts = (req as unknown as {
    parts: (o: {
      limits: { fileSize: number } & typeof UPLOAD_PARSER_LIMITS;
    }) => AsyncIterable<MultipartFile & { type: string }>;
  }).parts.call(req, { limits: { fileSize: opts.maxBytes, ...UPLOAD_PARSER_LIMITS } });

  const classify = (err: unknown): UploadPartResult => {
    const code = codeOf(err);
    if (code === 'FST_REQ_FILE_TOO_LARGE') return { ok: false, reason: 'too_large' };
    if (code === 'FST_FILES_LIMIT') return { ok: false, reason: 'extra_part' };
    return { ok: false, reason: 'malformed', err };
  };

  // The first file part is the upload (fields before it are skipped, like `req.file()`); a second file part is
  // refused, so the outcome does not depend on how far the parser has read when the first part ends.
  let first: UploadPartResult | undefined;
  try {
    for await (const part of parts) {
      if (part.type !== 'file') continue;
      if (part.fieldname !== UPLOAD_FIELD_NAME) {
        await drainPart(part);
        return { ok: false, reason: 'missing' };
      }
      if (first) {
        await drainPart(part);
        return { ok: false, reason: 'extra_part' };
      }
      first = await judgePart(part, opts.maxBytes);
      // A rejected first part ends the request: the remaining parts are not worth reading.
      if (!first.ok) return first;
    }
  } catch (err) {
    // Legacy `POST /attachments` only: a valid first file is the upload and an error raised by an unrelated trailing
    // part (a malformed text field) does not turn it into a refusal, as before the loop existed (its parser never
    // read past the first file). The new route is strict: the parser stops at the error, so a later second file
    // could not be seen, and accepting would make the one-file rule depend on part order.
    if (opts.tolerateTrailingErrors === true && first?.ok && codeOf(err) !== 'FST_FILES_LIMIT') return first;
    return classify(err);
  }
  return first ?? { ok: false, reason: 'missing' };
}

async function judgePart(part: MultipartFile, maxBytes: number): Promise<UploadPartResult> {
  const mimeType = part.mimetype;
  if (!MIME_ALLOWLIST.has(mimeType)) {
    // Drain the upload stream so the connection is not held open.
    await drainPart(part);
    return { ok: false, reason: 'unsupported_type', mimeType };
  }

  let filename: string;
  try {
    filename = sanitizeFilename(part.filename ?? '');
  } catch (err) {
    await drainPart(part);
    if (err instanceof FilenameSanitizeError) {
      return { ok: false, reason: 'invalid_filename', sanitizeReason: err.reason };
    }
    throw err;
  }

  const bytes = await consumeToBuffer(part);
  // Defensive re-check: the streaming limit is the primary gate.
  if (bytes.byteLength > maxBytes) return { ok: false, reason: 'too_large' };
  return { ok: true, bytes, mimeType, filename };
}
