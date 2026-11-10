# Attachments Module Agent Guide

## Ownership

Attachments owns the upload (`POST /attachments`) and download (`GET /attachments/:id/download`) commands, the storage seam, the filename and MIME rules, and the link step that attaches an uploaded file to a parent (`linkAttachments`): a VOC, a VOC comment, or a log-lifecycle validation round (parent kinds below). It writes only `voc.voc_attachments`.

It implements Core's attachment governance (`apps/platform-api/docs/02-domain-module-boundaries.md`) — it is not a second owner. Storage shape and server-proxied transfer are FO ADR-0011. VOC owns the read projections of its own attachment links (`voc/repo-read.ts`).

## Invariants

- The storage `put` runs before the metadata transaction opens (never inside a DB transaction), so no row ever points at missing bytes and no connection is held during object-store I/O.
  - `uploadAttachmentCommand` best-effort `storage.delete`s the just-written object only when the transaction definitely did not commit: a failure before COMMIT, an idempotent replay, or a key/hash conflict (a failed delete is logged without the key and never changes the outcome).
  - A failure at or after COMMIT is ambiguous (the acknowledgement may have been lost after the server committed): the object is kept and logged; a referenced object is never deleted (`commitPhase` in `runIdempotentCommand`). Leftovers are found by `src/cli/attachments-orphans.ts` (`ops/platform-api/docs/release/attachment-orphans.md`).
- `POST /attachments` takes a per-process admission slot (`ATTACHMENT_UPLOAD_CONCURRENCY`, default 4) before buffering the body and releases it in a `finally`; no free slot = 503 `service.unavailable` with `Retry-After: 5`, never queued (`upload-admission.ts`). The S3 client has a 30 s request and 5 s connect deadline (`STORAGE_S3_REQUEST_TIMEOUT_MS`, `STORAGE_S3_CONNECT_TIMEOUT_MS`).
- The `attachment_uploaded` audit detail schema is `.strict()` and must never carry the filename: filenames can hold PII and controlled operator audit history retains attribution (app raw SELECT revoked by FO ADR-0064) (`packages/feature-shared/src/audit/attachments.ts`).
- The MIME allowlist (`mime-allowlist.ts`) is a closed set checked against the declared Content-Type; anything else is `attachment.unsupported_type`. Size cap: `MAX_ATTACHMENT_BYTES` (25 MB).
- Every filename passes `sanitizeFilename` (strips `/`, `\`, control characters; clamps to 255 UTF-8 bytes; an empty result is rejected) before it enters the storage key `{workspace_id}/{uuid}/{filename}`.
- `voc_attachments` has no `workspace_id` column. The storage-key prefix is the workspace gate on download; a cross-workspace id returns 404, not 403.
- **Parent kinds.** A linked row has a `parent_kind` from the closed set `ATTACHMENT_PARENT_KINDS` (`voc`, `validation_round`; the DB check `voc_attachments_parent_kind_check` carries the same set) and, for non-VOC kinds, a `parent_id` with `voc_id` / `comment_id` NULL. `voc` rows keep `voc_id` / `comment_id`; a row with `parent_kind` NULL and `voc_id` / `comment_id` set is read as `voc`.
  - Download asks only the `AttachmentParentReader` registered for the row's kind (`parent-kinds.ts`); **default-deny**: a linked row whose kind has no reader answers 403 `permission.denied`, and a reader of one kind is never consulted for another — a new kind cannot widen VOC access and VOC rights never grant another kind.
  - `voc` is built inside `service.ts`; other kinds arrive through `AttachmentsServiceDeps.parents` (wired in `server.ts`; `validation_round` from log-lifecycle). A new kind needs: the constant, the DB check, a reader, a link caller in the owning module, and tests of allowed, other-workspace and unregistered cases.
- `entity-link-provider.ts` is the `manual_validation_attachment` Entity Link end (ADR-0123): it resolves an active `validation_round` attachment of the workspace (no Managed System), and its `canRead` asks the `AttachmentParentReader` of the row's parent kind — the download path's judge; no reader = denied. It is built from the readers `server.ts` registers and reads only this module's table.
- `linkAttachments` and the purge job treat a row as unlinked only when `voc_id`, `comment_id` and `parent_id` are all NULL; leaving `parent_id` out of the purge predicate deletes linked non-VOC evidence.
- `listAttachmentsByParent` (`repo-read.ts`, barrel) lists a non-VOC parent's active attachments for the workspace; the caller has already judged read access to the parent.
- VOC-level download entitlement requires `getVocDetail` to return `kind: 'full'`. An unlinked upload is readable only by its uploader. Attachments must not query conversation tables for authorization.
  - Comment attachments use VOC's `canReadConversationEntry` seam, which resolves the parent and enforces the exact conversation entry's visibility, including deny-aware triage and Reporter Reply authorship.
- `linkAttachments` runs in the parent's transaction and links only rows that are unlinked, not archived, and uploaded by the caller; any miss throws `LinkAttachmentsRejected` and rolls the parent back.
- `Content-Disposition` carries an ASCII fallback plus RFC 5987 `filename*` (`rfc5987.ts`) so non-ASCII names survive.

## Cross-System Rules

- Other modules use the barrel (`index.ts`), never `repo.ts` (`pnpm --filter @ap/platform-api-ops check:boundaries` rejects cross-module `repo*.js` imports).
- The purge job claims old unlinked rows by locking, re-checking, and setting `archived_at` in a short transaction before deleting storage; the link guard rejects claimed rows; storage failures retain the claim for retry. Only still-claimed, unlinked rows are deleted.
- Unlinked rows older than 24 hours are reclaimed by the hourly `core.attachments_purge` job (`modules/core/jobs/purge-unlinked-attachments.ts`), not by this module.

## Verification

- When touched, test the parent-kind seam (kind derivation, default-deny, no cross-kind reader) and link by kind.
- When touched, test: a failing INSERT after a successful put; a replay deleting its extra object; slot release after success, error and client abort; the audit detail rejecting `filename`; MIME and filename rejection; cross-workspace 404; download entitlement for linked and unlinked rows; the link guard predicates.
