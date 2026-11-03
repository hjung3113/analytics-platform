# Failed notification jobs: inventory and guarded replay

Operator runbook for `notifications.dispatch` jobs that ended in `failed`
(pg-boss: 5 retries with backoff, then `failed`). The commands run from the
runtime image (production stack: `$P exec backend node dist/cli/<name>.js …`, with
`P='docker compose --env-file .env.production -f docker-compose.production.yml'`) or in a checkout with
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
