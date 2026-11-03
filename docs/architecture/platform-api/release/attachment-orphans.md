# Attachment orphans: inventory and cleanup

Operator runbook for bucket objects that no `voc.voc_attachments` row points at.

## Why orphans exist

`POST /attachments` writes the object to the bucket first and commits the metadata row afterwards, so no
database transaction is held during object-store I/O. If the transaction fails, or the request is an
idempotent replay, the service deletes the just-written object best-effort. A crash between the two steps,
or a failed delete, leaves an object with no row. The hourly `core.attachments_purge` job only sees rows, so
these objects are invisible to it.

`voc.voc_attachments.storage_key` is the only table column that references bucket objects. (The
`attachment_uploaded` audit detail also records a key, but only for committed uploads and as history.)

## Command

Runs from the runtime image (`node dist/cli/attachments-orphans.js`) or a checkout
(`pnpm --filter @ap/platform-api exec tsx src/cli/attachments-orphans.ts`). Environment: `DATABASE_URL`
(runtime role, read on `voc.voc_attachments`) and the `STORAGE_S3_*` variables the server uses.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--min-age-hours N` | 24 | Only objects last modified at least N hours ago (protects uploads still in flight) |
| `--limit N` | 500 | Orphans handled per run, 1 to 5000 |
| `--apply` | off | Delete the orphans found; without it the run is a dry run |

## Procedure

1. **Dry run**: `node dist/cli/attachments-orphans.js`. The JSON summary has `scanned`, `orphans`, `truncated`
   and `ids`. Each id is `<workspace uuid>/<attachment uuid>`, or `sha256:<16 hex>` for a key of another shape.
2. Check the count is plausible (a few after an incident, not the whole bucket). An id that matches a
   known attachment id means the row is missing: stop and investigate instead of deleting.
3. **Apply**: the same command plus `--apply`. `deleted` and `delete_failures` report the result; re-run
   until `orphans` is 0 (`truncated: true` means more remain).

## Output and safety

- Output, logs and errors carry counts and filename-free ids only, never raw keys, file names or content.
- Every candidate is checked against `voc.voc_attachments` in the same run, immediately before deletion is
  decided. A referenced object (including a row claimed by the purge job) is never deleted.
- Exit codes: 0 ok, 1 failure (error class only), 2 usage error.
