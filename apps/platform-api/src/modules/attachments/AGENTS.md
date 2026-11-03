# Attachments Module Agent Guide

## Ownership

Attachments owns the upload (`POST /attachments`) and download (`GET /attachments/:id/download`) commands, the storage seam, the filename and MIME rules, and the link step that attaches an uploaded file to a VOC or VOC comment (`linkAttachments`). It writes only `voc.voc_attachments`.

It is the implementation of Core's attachment governance (`docs/architecture/platform-api/02-domain-module-boundaries.md`), not a second owner. Storage shape and server-proxied transfer are ADR-0011. VOC owns the read projections of its own attachment links (`voc/repo-read.ts`).

## Invariants

- The storage `put` runs before the metadata transaction opens (never inside a DB transaction), so no row ever points at missing bytes and no connection is held during object-store I/O. `uploadAttachmentCommand` makes a best-effort `storage.delete` of the just-written object only when the transaction definitely did not commit: a failure before COMMIT, an idempotent replay, or a key/hash conflict (a failed delete is logged without the key and never changes the outcome). A failure at or after COMMIT is ambiguous (the acknowledgement may have been lost after the server committed), so the object is kept and logged; a referenced object is never deleted (`service.ts`, `commitPhase` in `runIdempotentCommand`). Leftovers are found by `src/cli/attachments-orphans.ts` (`docs/architecture/platform-api/release/attachment-orphans.md`).
- `POST /attachments` takes a per-process admission slot (`ATTACHMENT_UPLOAD_CONCURRENCY`, default 4) before buffering the body and releases it in a `finally`; when none is free it answers 503 `service.unavailable` with `Retry-After: 5` and does not queue (`upload-admission.ts`). The S3 client has a 30 s request and 5 s connect deadline (`STORAGE_S3_REQUEST_TIMEOUT_MS`, `STORAGE_S3_CONNECT_TIMEOUT_MS`).
- The `attachment_uploaded` audit detail schema is `.strict()` and must never carry the filename: filenames can hold PII and controlled operator audit history retains attribution (app raw SELECT is revoked by ADR-0064) (`packages/feature-shared/src/audit/attachments.ts`).
- The MIME allowlist (`mime-allowlist.ts`) is a closed set checked against the declared Content-Type; anything else is `attachment.unsupported_type`. The size cap is `MAX_ATTACHMENT_BYTES` (25 MB).
- Every filename passes `sanitizeFilename` (strips `/`, `\`, and control characters; clamps to 255 UTF-8 bytes; an empty result is rejected) before it enters the storage key `{workspace_id}/{uuid}/{filename}`.
- `voc_attachments` has no `workspace_id` column. The storage-key prefix is the workspace gate on download, and a cross-workspace id returns 404, not 403.
- VOC-level download entitlement requires `getVocDetail` to return `kind: 'full'`. Comment attachments use VOC's `canReadConversationEntry` seam, which resolves the parent and enforces the exact conversation entry's visibility, including deny-aware triage and Reporter Reply authorship. Attachments must not query conversation tables for authorization. An unlinked upload is readable only by its uploader.
- `linkAttachments` runs in the parent's transaction and links only rows that are unlinked, not archived, and uploaded by the caller; any miss throws `LinkAttachmentsRejected` and rolls the parent back.
- `Content-Disposition` carries an ASCII fallback plus RFC 5987 `filename*` (`rfc5987.ts`) so non-ASCII names survive.

## Cross-System Rules

- Other modules use the barrel (`index.ts`), never `repo.ts` (`pnpm check:boundaries` rejects cross-module `repo*.js` imports).
- The purge job claims old unlinked rows by locking, re-checking, and setting `archived_at` in a short transaction before deleting storage. The link guard rejects claimed rows; storage failures retain the claim for retry. Only still-claimed, unlinked rows are deleted.
- Unlinked rows older than 24 hours are reclaimed by the hourly `core.attachments_purge` job (`modules/core/jobs/purge-unlinked-attachments.ts`), not by this module.

## Verification

- Test a failing INSERT after a successful put, a replay deleting its extra object, slot release after success, error and client abort, the audit detail rejecting `filename`, MIME and filename rejection, cross-workspace 404, download entitlement for linked and unlinked rows, and the link guard predicates when touched.
