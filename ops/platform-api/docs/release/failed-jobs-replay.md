# Failed notification jobs: inventory and guarded replay

Operator runbook for `notifications.dispatch` jobs that ended in `failed`
(pg-boss: 5 retries with backoff, then `failed`). The commands run from the
runtime image (production stack: `$P exec backend node dist/cli/<name>.js …`, with `P` as defined in
[oidc-and-images.md](oidc-and-images.md) «Production stack», which includes the restore pin file of a restored installation; in the same Bash session) or in a checkout with
`pnpm --filter @ap/platform-api exec tsx src/cli/<name>.ts`. They use
`DATABASE_URL` (the runtime role): migration 0002 grants it `SELECT, UPDATE` on
`pgboss.*`, and `boss.retry` needs nothing more (no DDL). No other role is
needed.

## When to use

- The inbox is unaffected by SMTP outages: the inbox row is committed before any
  email is attempted. A `failed` dispatch job means the **email** step kept
  failing (or the recipient or event type was invalid).
- Replay after the cause is fixed (SMTP relay back, recipient restored).

## Procedure

1. **Inventory** (read-only; ids and counts only, never payloads):
   `node dist/cli/jobs-inventory.js --queue notifications.dispatch --state failed`
   Output: queue, state, count, oldest/newest `created_on`, max `retry_count`.
2. **Export before the window closes** (below) if the oldest failed job is close to 7 days old.
3. **Dry run** (default): `node dist/cli/jobs-replay.js --queue notifications.dispatch --state failed [--since <iso>] [--limit N]`
   Prints the job ids it would retry. `--limit` defaults to 100, maximum 500.
4. **Apply**: the same command plus `--apply` (calls `boss.retry`; jobs go back
   to `retry` and are picked up by the running worker).
5. **Verify**: re-run the inventory (failed count drops, `retry`/`completed`
   rises), then check the inbox rows exist and `core.notifications.email_sent_at`
   is set for the affected recipients.

Only `notifications.dispatch` and `--state failed` are accepted. Any other queue
is refused with exit 2: those queues are not proven replay-safe. Exit codes:
0 ok, 1 failure, 2 usage error or refused queue.

## 7-day deletion window

Failed jobs are deleted 7 days after completion (`deletion_seconds 604800`).
To keep the payloads of jobs you cannot replay yet, export them first with
`psql` (as an operator with `SELECT` on `pgboss.job`):

```sql
\copy (select id, created_on, data from pgboss.job where name = 'notifications.dispatch' and state = 'failed') to 'failed-notifications.csv' csv header
```

The file contains personal data (actor ids, notification summaries). Keep it in
an operator-only location and delete it when the incident is closed.

## Delivery is at least once

The handler sends, then stamps `email_sent_at`. A recipient can receive the same
email twice when (a) the process crashes after the send but before the stamp, or
(b) two handlers for the same deduplication identity both read a null timestamp
before either stamps it (for example a replay racing a pg-boss retry). The inbox
row is never duplicated (conflict target on workspace, actor, event, subject and
correlation id). Replay therefore never creates duplicate inbox rows, but may
resend an email that was sent without being stamped.

## Scheduled-job health and slow queries (#1973)

Run `$P exec backend node dist/cli/jobs-health.js` in the same Bash session as
`P` in [oidc-and-images.md](oidc-and-images.md). In a checkout with the runtime
`DATABASE_URL` exported, run `pnpm --filter @ap/platform-api jobs:health`.
Use `--queue core.sessions_purge` to inspect one queue. The inventory sibling is
also available as `pnpm --filter @ap/platform-api jobs:inventory`.

The read-only command emits a JSON array with `queue`, `cron`, `lastCompletedAt`
(ISO timestamp or null), `failures24h` and `verdict`. It checks all registered
default schedules plus the 12 expected queues below, including missing schedules.
A terminal failed job whose `completed_on` is within 24 hours gives `failing`;
otherwise no completion, no schedule, or a last completion older than twice the
cron period gives `stale`. Only an all-`ok`, nonempty result exits 0; unhealthy
results, unknown queues and database errors exit 1. Invalid arguments exit 2.
No job or schedule payload, error output or connection URL is printed.

| Queue | Cron (UTC) |
| --- | --- |
| `core.attachments_purge` | `30 * * * *` |
| `core.idempotency_purge` | `0 * * * *` |
| `core.rate_limits_purge` | `15 * * * *` |
| `core.sessions_purge` | `30 3 * * *` |
| `dashboard.recovery_reconcile` | `*/5 * * * *` |
| `knowledge.search.backfill` | `*/10 * * * *` |
| `knowledge.search.drain` | `* * * * *` |
| `lifecycle.excerpt_purge` | `45 3 * * *` |
| `voc.cluster_autogen_shadow` | `0 * * * *` |
| `voc.cluster_suggestions` | `0 * * * *` |
| `voc.embedding_backfill` | `*/15 * * * *` |
| `voc.similarity_preview_cleanup` | `*/10 * * * *` |

Periods come from the stored expression, using the largest minute/hour gap in a
day. Current schedules all use fixed, wildcard or stepped minute/hour fields and
wildcard day/month/weekday fields. Other cron forms fail closed with exit 1;
extend the cadence reader when introducing calendar schedules. This command
checks default schedules (`key = ''`); keyed schedules need a separate health
policy. The daily queues already keep completed jobs for seven days
(`deletion_seconds = 604800`, migrations 0084/0108), longer than their 48-hour
staleness threshold, so a healthy daily queue retains evidence between runs.

Both production and local release Postgres log statements taking at least 1 s
and lock waits. Read them with `$P logs postgres | grep -E 'duration: [0-9]{4,}'`
(the unqualified form is `docker compose logs postgres | grep -E 'duration: [0-9]{4,}'`).
`log_parameter_max_length=0` and `log_parameter_max_length_on_error=0` suppress
bind-parameter detail; SQL literals and text in error messages can still appear.
Use prepared statements for values. `set-role-passwords.sh` disables and verifies
statement/duration/error logging in its own session before sending password SQL;
these server defaults do not override its session settings.
