// Attachments application service — PLAN-22 C3b.
//
// Owns the upload-then-INSERT contract for POST /attachments:
//   1. Generate storage_key = `{workspace_id}/{uuid}/{sanitized_filename}`.
//   2. Stream bytes to object storage. A StorageUnavailableError raised by
//      the storage lib is mapped to the FO ADR-0012 envelope
//      `{ code: 'storage.unavailable', status: 502 }`.
//   3. INSERT voc_attachments row (voc_id=NULL, comment_id=NULL,
//      linked_at=NULL — C3-link adds the parent later).
//   4. On INSERT failure, best-effort `storage.delete(key)` to keep the
//      bucket free of orphaned bytes. The delete is swallowed; the original
//      INSERT error re-throws.
//   5. Emit `attachment_uploaded` audit row in the SAME transaction
//      (FO ADR-0008). The detail schema in @ap/feature-shared rejects any `filename`
//      field — filenames may carry PII and audit rows are broadly readable.
//   6. Return the response envelope: `{ id, name, size_bytes, mime_type,
//      uploaded_by_actor_id, created_at }`.
//
// Layer rule: `uploadAttachmentCommand` owns the transaction + FO ADR-0015
// idempotency frame the POST /attachments route used to own (#393, same
// shape as the VOC application commands). #1266 b4: the command puts the
// object BEFORE opening the transaction (storage I/O never holds a DB
// connection), so we never persist a row that points at missing bytes; a
// replay, conflict or failed transaction deletes the extra object.

import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { JobLog } from '../../lib/job-log.js';
import type { StorageBackend } from '../../lib/storage/index.js';
import { StorageUnavailableError } from '../../lib/storage/index.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import { runIdempotentCommand } from '../core/idempotency/idempotent-command.js';
import type { VocAttachmentReader, VocPublicAttachmentReader } from '../voc/index.js';
import {
  type AttachmentLinkRow,
  type AttachmentParentReader,
  attachmentParentKindOf,
  createAttachmentParentRegistry,
} from './parent-kinds.js';
import { insertAttachment } from './repo.js';

export interface UploadAttachmentActor {
  actor_id: string;
  workspace_id: string;
}

export interface AttachmentEnvelope {
  id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  uploaded_by_actor_id: string;
  created_at: string;
}

export interface AttachmentsServiceDeps {
  storage: StorageBackend;
  auditService: AuditService;
  db: Db;
  idempotencyService: IdempotencyService;
  vocReadService: VocAttachmentReader;
  /** Public-read arm of the download entitlement (ADR-0110 decision 3); absent = no public arm. */
  vocPublicAttachmentReader?: VocPublicAttachmentReader;
  /**
   * Readers of the parent kinds other than `voc` (which this service builds from `vocReadService`). A linked row whose
   * kind has no reader is denied (#1451).
   */
  parents?: readonly AttachmentParentReader[];
  /** Optional structured log for cleanup warnings (no keys, no filenames). */
  log?: Pick<JobLog, 'warn'>;
}

export interface DownloadAttachmentActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export interface DownloadAttachmentInput {
  actor: DownloadAttachmentActor;
  id: string;
}

export interface DownloadAttachmentResult {
  stream: Readable;
  mimeType: string;
  size: number;
  filename: string;
}

export function createAttachmentsService(deps: AttachmentsServiceDeps) {
  // #1266 b4: object-store I/O never runs inside a DB transaction (a slow put
  // would hold a connection and trip the idle-in-transaction budget). The
  // command puts the object first, then the transaction only touches the DB.
  async function putObject(args: {
    storageKey: string;
    bytes: Buffer;
    mimeType: string;
  }): Promise<void> {
    try {
      await deps.storage.put({ key: args.storageKey, bytes: args.bytes, mimeType: args.mimeType });
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        throw new HttpError('storage.unavailable', err.message);
      }
      throw err;
    }
  }

  // Best-effort: a failed delete leaves an orphan the attachments-orphans CLI
  // inventories; it must never mask the original outcome. Logs carry no key.
  async function discardObject(storageKey: string): Promise<void> {
    try {
      await deps.storage.delete(storageKey);
    } catch (err) {
      deps.log?.warn('attachments: orphan cleanup failed', {
        error: err instanceof Error ? err.name : typeof err,
      });
    }
  }

  // DB-only step, runs in the caller's transaction after the object exists.
  async function insertUploadedAttachment(input: {
    tx: Tx;
    actor: UploadAttachmentActor;
    attachmentId: string;
    storageKey: string;
    bytes: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<AttachmentEnvelope> {
    const { tx, actor, attachmentId, storageKey, bytes, mimeType, filename } = input;
    const row = await insertAttachment(tx, {
      id: attachmentId,
      workspaceId: actor.workspace_id,
      name: filename,
      sizeBytes: bytes.length,
      mimeType,
      storageKey,
      uploadedByActorId: actor.actor_id,
    });

    // Audit (same tx, FO ADR-0008). Detail schema rejects `filename`.
    await deps.auditService.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: 'attachment_uploaded',
      subject_type: 'attachment',
      subject_id: row.id,
      summary: `attachment ${row.id} uploaded`,
      detail: {
        attachment_id: row.id,
        actor_id: actor.actor_id,
        // Filename-free reference: the object key ends in the submitted name, which the audit must never keep.
        storage_key: `${actor.workspace_id}/${attachmentId}`,
        size_bytes: row.size_bytes,
        mime_type: row.mime_type,
      },
    });

    return {
      id: row.id,
      name: row.name,
      size_bytes: row.size_bytes,
      mime_type: row.mime_type,
      uploaded_by_actor_id: row.uploaded_by_actor_id,
      created_at: row.created_at.toISOString(),
    };
  }

  // ── uploadAttachmentCommand (#393, #1266 b4) ────────────────────────────
  //
  // Order: (1) put the object (no transaction open), (2) transaction: advisory
  // lock, idempotency lookup, INSERT + audit, record. A replay, a key
  // conflict or a failure before COMMIT deletes the just-written object
  // best-effort; a failure at/after COMMIT keeps it (outcome unknown). Returns what
  // the route assembles (`{ status, body, replayed }`); replay returns the stored
  // status + envelope with `replayed: true`.
  async function uploadAttachmentCommand(args: {
    actor: UploadAttachmentActor;
    bytes: Buffer;
    mimeType: string;
    filename: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: AttachmentEnvelope; replayed: boolean }> {
    const { actor, bytes, mimeType, filename, idempotencyKey, requestHash } = args;
    const attachmentId = randomUUID();
    const storageKey = `${actor.workspace_id}/${attachmentId}/${filename}`;

    await putObject({ storageKey, bytes, mimeType });

    let inserted = false;
    const commitPhase = { reached: false };
    try {
      const result = await runIdempotentCommand({
        db: deps.db,
        idempotencyService: deps.idempotencyService,
        actorId: actor.actor_id,
        idempotencyKey,
        requestHash,
        status: 201,
        commitPhase,
        work: async (tx) => {
          const envelope = await insertUploadedAttachment({
            tx,
            actor,
            attachmentId,
            storageKey,
            bytes,
            mimeType,
            filename,
          });
          inserted = true;
          return envelope;
        },
      });
      // Replay: the stored response references the first upload's object.
      if (!inserted) await discardObject(storageKey);
      return { ...result, replayed: !inserted };
    } catch (err) {
      // Delete only when the transaction definitely did not commit: the body (or the key/hash check inside it)
      // failed before COMMIT. A failure at or after COMMIT is ambiguous (the server may have committed and lost
      // the acknowledgement), so the object is kept for the reference-aware orphan CLI.
      if (!commitPhase.reached) {
        await discardObject(storageKey);
      } else {
        deps.log?.warn('attachments: upload outcome uncertain, object kept for orphan cleanup', {
          error: err instanceof Error ? err.name : typeof err,
          attachment_id: attachmentId,
        });
      }
      throw err;
    }
  }

  type DownloadRow = AttachmentLinkRow;

  // The `voc` parent reader: the pre-#1451 rules unchanged. The operator / reporter rule decides first; only when it
  // denies does the public-read arm get a say, and a denial there re-raises the original error.
  async function assertVocOperatorOrReporterEntitlement(
    actor: DownloadAttachmentActor,
    row: DownloadRow,
  ): Promise<void> {
    if (row.voc_id) {
      try {
        const detail = await deps.vocReadService.getVocDetail({
          actor,
          vocId: row.voc_id,
        });
        if (detail.kind !== 'full') {
          throw new HttpError(
            'permission.denied',
            'attachment not accessible to caller',
          );
        }
      } catch (err) {
        if (err instanceof HttpError) {
          // not_found.record from getVocDetail means caller has no access at
          // all to the parent VOC. Surface as permission.denied — the row
          // exists inside the workspace; the attachment id was already
          // confirmed reachable above. 403 keeps the access-vs-existence
          // semantics consistent (the row exists, the caller just can't view).
          if (err.code === 'not_found.record') {
            throw new HttpError(
              'permission.denied',
              'attachment not accessible to caller',
            );
          }
          throw err;
        }
        throw err;
      }
    } else if (row.comment_id) {
      const allowed = await deps.vocReadService.canReadConversationEntry({
        actor,
        kind: row.comment_kind ?? '',
        entryId: row.comment_id,
      });
      if (!allowed) {
        throw new HttpError('permission.denied', 'attachment not accessible to caller');
      }
    } else {
      // A `voc` row without voc_id / comment_id has no parent to judge.
      throw new HttpError('permission.denied', 'attachment not accessible to caller');
    }
  }

  async function publicArmAllows(actor: DownloadAttachmentActor, row: DownloadRow): Promise<boolean> {
    if (!deps.vocPublicAttachmentReader) return false;
    if (row.voc_id) {
      return deps.vocPublicAttachmentReader.canReadPublicAttachment({
        actor,
        parent: { vocId: row.voc_id },
      });
    }
    if (row.comment_id) {
      return deps.vocPublicAttachmentReader.canReadPublicAttachment({
        actor,
        parent: { commentKind: row.comment_kind ?? '', commentId: row.comment_id },
      });
    }
    return false;
  }

  const vocParent: AttachmentParentReader = {
    kind: 'voc',
    async assertCanRead({ actor, row }) {
      try {
        await assertVocOperatorOrReporterEntitlement(actor, row);
      } catch (err) {
        if (!(err instanceof HttpError) || err.code !== 'permission.denied') throw err;
        if (!(await publicArmAllows(actor, row))) throw err;
      }
    },
  };

  const parentReaders = createAttachmentParentRegistry([vocParent, ...(deps.parents ?? [])]);

  // Entitlement by parent kind. Unlinked: the uploader only. Linked: the reader registered for the row's kind;
  // none registered = denied (default-deny).
  async function assertCanRead(actor: DownloadAttachmentActor, row: DownloadRow): Promise<void> {
    const kind = attachmentParentKindOf(row);
    if (kind === null) {
      if (row.uploaded_by_actor_id !== actor.actor_id) {
        throw new HttpError('permission.denied', 'attachment not accessible to caller');
      }
      return;
    }
    const reader = parentReaders.get(kind);
    if (!reader) throw new HttpError('permission.denied', 'attachment not accessible to caller');
    await reader.assertCanRead({ actor, row });
  }

  // ── downloadAttachment — PLAN-22 C4a ────────────────────────────────────
  //
  // Streaming GET path: select metadata, gate on entitlement, then hand the
  // route a Readable + headers. Entitlement model:
  //   * Workspace gate: storage_key MUST start with `${ctx.workspace_id}/`.
  //     Cross-workspace returns 404 (not 403) — leaking 403 confirms the row
  //     exists under another workspace.
  //   * Linked to a VOC: reuse vocReadService.getVocDetail. `kind: 'full'`
  //     → permit. `kind: 'summary'` → 403. getVocDetail throwing
  //     not_found.record → 403 (caller cannot see the parent).
  //   * Linked to a comment: VOC's exact-entry conversation read seam owns
  //     both parent resolution and visibility (including deny-aware triage).
  //   * Unlinked (voc_id IS NULL AND comment_id IS NULL): permit only the
  //     original uploader.
  //   * Parent kind (#1451): a linked row is judged by the reader registered for its `parent_kind` (`voc`: built here;
  //     `validation_round`: injected by log-lifecycle); a kind with no reader is denied.
  //   * Public arm (ADR-0110 decision 3): when the rules above deny, a VOC-body or `public_update`
  //     attachment of a VOC that passes the public read rule is permitted; reporter-reply and
  //     internal-comment attachments stay denied.
  async function downloadAttachment(
    input: DownloadAttachmentInput,
  ): Promise<DownloadAttachmentResult> {
    const { actor, id } = input;

    // 1. Fetch attachment metadata.
    const rows = await deps.db.execute<{
      id: string;
      voc_id: string | null;
      comment_id: string | null;
      comment_kind: string | null;
      parent_kind: string | null;
      parent_id: string | null;
      name: string;
      size_bytes: string | number;
      mime_type: string;
      storage_key: string;
      uploaded_by_actor_id: string;
    }>(sql`
      select id, voc_id, comment_id, comment_kind, parent_kind, parent_id, name, size_bytes,
             mime_type, storage_key, uploaded_by_actor_id
        from voc.voc_attachments
       where id = ${id}
       limit 1
    `);
    const row = rows.rows[0];
    if (!row) throw new HttpError('not_found.record', 'attachment not found');

    // 2. Workspace gate via storage_key prefix. The attachments table has no
    //    direct workspace_id column; the prefix is the canonical workspace
    //    binding (per uploadAttachment's `${workspace_id}/${uuid}/${name}`).
    if (!row.storage_key.startsWith(`${actor.workspace_id}/`)) {
      throw new HttpError('not_found.record', 'attachment not found');
    }

    // 3. Entitlement by parent kind (#1451). `voc` keeps the operator/reporter rule first, then the public-read
    //    arm; any other kind is judged by its registered reader only; an unregistered kind is denied.
    await assertCanRead(actor, row);

    // 4. Stream from storage. Surface StorageUnavailableError as 502;
    //    NoSuchKey (stale row whose bytes are missing) as 404.
    let got;
    try {
      got = await deps.storage.get(row.storage_key);
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        throw new HttpError('storage.unavailable', err.message);
      }
      const name = (err as { name?: string } | null | undefined)?.name;
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw new HttpError('not_found.record', 'attachment not found');
      }
      throw err;
    }

    return {
      stream: got.stream,
      mimeType: got.mimeType ?? row.mime_type,
      size: typeof got.size === 'number'
        ? got.size
        : typeof row.size_bytes === 'string'
          ? Number(row.size_bytes)
          : row.size_bytes,
      filename: row.name,
    };
  }

  // ── readUnlinkedUpload (#1658, ADR-0140 §6) ─────────────────────────────
  //
  // The bytes of an upload by id, for the module that consumes it (the eqv Sample Window import) within the upload's 24 h. Only the
  // uploader reads it, only while it is unlinked and not archived, only in the workspace of the storage key. Anything else — unknown,
  // linked, archived, expired, another user's, another workspace's, over `maxBytes`, or bytes gone from storage — is the same `null`,
  // so the caller cannot tell a stranger's upload from a missing one. It never links the row and writes nothing.
  async function readUnlinkedUpload(input: {
    workspaceId: string;
    actorId: string;
    id: string;
    maxBytes: number;
  }): Promise<Buffer | null> {
    const rows = await deps.db.execute<{ storage_key: string; size_bytes: string | number }>(sql`
      select storage_key, size_bytes
        from voc.voc_attachments
       where id = ${input.id}
         and uploaded_by_actor_id = ${input.actorId}
         and voc_id is null and comment_id is null and parent_id is null
         and archived_at is null
         and created_at > now() - interval '24 hours'
       limit 1
    `);
    const row = rows.rows[0];
    if (!row || !row.storage_key.startsWith(`${input.workspaceId}/`) || Number(row.size_bytes) > input.maxBytes) return null;
    let got;
    try {
      got = await deps.storage.get(row.storage_key);
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        throw new HttpError('storage.unavailable', err.message);
      }
      const name = (err as { name?: string } | null | undefined)?.name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw err;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of got.stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buffer.length;
      if (total > input.maxBytes) {
        got.stream.destroy();
        return null;
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  return { uploadAttachmentCommand, downloadAttachment, readUnlinkedUpload };
}

export type AttachmentsService = ReturnType<typeof createAttachmentsService>;
