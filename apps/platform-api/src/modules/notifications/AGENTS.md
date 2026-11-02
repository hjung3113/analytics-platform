# Notifications Module Agent Guide

## Ownership

- This module owns the notification catalogue, fan-out dispatch port, delivery
  job, and actor-scoped in-app read model.
- Core owns the notification concept and shared storage contract; this
  directory owns the implementation.
- Notifications are not a second audit log. Audit history remains in
  `core.audit_log` and is never mutated by this module.

## Invariants

- Callers resolve recipient Actor ids in the request transaction and pass
  them to `notify`; this module does not read domain repositories to resolve
  recipients or mutate domain records.
- One pg-boss job is enqueued per recipient in the caller's transaction.
- The Korean summary is rendered by the catalogue and frozen at insertion.
- In-app reads and read/archive mutations are scoped to the session Actor and
  workspace. A row outside either scope is indistinguishable from an absent
  row.
- Application DML may update only `read_at`, `archived_at`, and
  `email_sent_at` on `core.notifications`; there is no hard-delete path.
- The email channel defaults to Pino-backed `MockEmailChannel`; setting
  `NOTIFICATION_EMAIL_CHANNEL=smtp` selects `SmtpEmailChannel` after SMTP config
  validation. `nodemailer` is imported only by `smtp.ts`, which the channel factory loads
  lazily.
- The dispatch handler commits the inbox row in its own transaction first; the
  inbox never depends on SMTP. Email runs outside any transaction (a send held
  inside one is killed by the idle-in-transaction budget): read the row, send
  when `email_sent_at` is null, then stamp it with an `IS NULL` guard. A send
  failure throws so pg-boss retries only the email. Delivery is at-least-once:
  a crash between send and stamp, or concurrent handlers for the same
  deduplication identity that both see a null timestamp, can send twice.
- Logs and CLI output carry ids and counts only; never summaries, recipient
  emails or job payloads (`MockEmailChannel` logs no summary).
- Failed `notifications.dispatch` jobs are inspected and replayed with
  `src/cli/jobs-inventory.ts` and `src/cli/jobs-replay.ts` (allowlist: this
  queue only; dry run by default). Runbook:
  `docs/architecture/platform-api/release/failed-jobs-replay.md`.

## Verification

- Cover transactional enqueue/rollback, handler idempotency, inbox row kept on
  a send failure and a retry that sends once without a duplicate row, no open
  transaction during the send, queue boot validation, actor/workspace isolation, and the database
  grant boundary when changing this module.
