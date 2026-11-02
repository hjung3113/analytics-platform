import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Job, PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';
import { actors, notifications } from '../../../db/schema/core.js';
import { JOB_WORK_OPTIONS, type JobLog, withJobLogging } from '../../../lib/job-log.js';
import { isNotificationEventType, notificationCatalogue } from '../catalogue.js';
import type { NotificationChannel } from '../channels.js';
import { NOTIFICATION_DISPATCH_QUEUE, type NotificationJobPayload } from '../port.js';

export interface NotificationDispatchDeps {
  db: Db;
  channel: NotificationChannel;
}

/**
 * Delivery order (node b8):
 *   1. Transaction 1 inserts the inbox row and commits. The inbox never
 *      depends on SMTP.
 *   2. Email (only when the catalogue says so) runs OUTSIDE any transaction:
 *      read the row, send when `email_sent_at` is null, then stamp
 *      `email_sent_at` (guarded by `IS NULL`).
 * A send failure throws so pg-boss retries; the retry skips the insert via the
 * conflict target and retries only the email. Delivery is AT LEAST ONCE: a
 * crash between send and stamp, or two handlers for the same deduplication
 * identity that both see a null timestamp, can send twice.
 *
 * Batch semantics: pg-boss fails every job id of a batch when the handler
 * throws (default batchSize is 1, so normally one job per call). Each job's
 * inbox transaction commits on its own, and a failing job does not stop the
 * others: the loop finishes, then rethrows the first error. Already-sent jobs
 * are skipped on the retry because their `email_sent_at` is set.
 */
export function notificationDispatchHandler(deps: NotificationDispatchDeps) {
  return async (jobs: Array<{ data: NotificationJobPayload }>): Promise<void> => {
    let firstError: unknown;
    let failed = false;
    for (const job of jobs) {
      try {
        await dispatchOne(deps, job.data);
      } catch (err) {
        if (!failed) {
          failed = true;
          firstError = err;
        }
      }
    }
    if (failed) throw firstError;
  };
}

async function dispatchOne(
  deps: NotificationDispatchDeps,
  payload: NotificationJobPayload,
): Promise<void> {
  if (!isNotificationEventType(payload.event_type)) {
    throw new Error(`Unknown notification event_type '${String(payload.event_type)}'.`);
  }
  const definition = notificationCatalogue[payload.event_type];

  await deps.db.transaction(async (tx) => {
    await tx
      .insert(notifications)
      .values({
        workspaceId: payload.workspace_id,
        actorId: payload.actor_id,
        eventType: payload.event_type,
        subjectType: payload.subject_type,
        subjectId: payload.subject_id,
        summary: payload.summary,
        detail: payload.detail,
        correlationId: payload.correlation_id,
      })
      .onConflictDoNothing({
        target: [
          notifications.workspaceId,
          notifications.actorId,
          notifications.eventType,
          notifications.subjectId,
          notifications.correlationId,
        ],
      });
  });

  if (!definition.email) return;

  // No transaction from here on: the send may take as long as the SMTP timeouts.
  const rows = await deps.db
    .select({ id: notifications.id, emailSentAt: notifications.emailSentAt })
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, payload.workspace_id),
        eq(notifications.actorId, payload.actor_id),
        eq(notifications.eventType, payload.event_type),
        eq(notifications.subjectId, payload.subject_id),
        eq(notifications.correlationId, payload.correlation_id),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error('Notification inbox row is missing after insert.');
  }
  if (row.emailSentAt !== null) return;

  const recipients = await deps.db
    .select({ email: actors.email })
    .from(actors)
    .where(and(eq(actors.id, payload.actor_id), eq(actors.workspaceId, payload.workspace_id)))
    .limit(1);
  const recipientEmail = recipients[0]?.email;
  if (!recipientEmail) {
    throw new Error(
      `Notification recipient '${payload.actor_id}' is missing from workspace '${payload.workspace_id}'.`,
    );
  }

  await deps.channel.send({
    workspace_id: payload.workspace_id,
    actor_id: payload.actor_id,
    event_type: payload.event_type,
    subject_type: payload.subject_type,
    subject_id: payload.subject_id,
    locale: 'ko-KR',
    summary: payload.summary,
    in_app: true,
    email: true,
    recipient_email: recipientEmail,
  });

  await deps.db
    .update(notifications)
    .set({ emailSentAt: sql`now()` })
    .where(and(eq(notifications.id, row.id), isNull(notifications.emailSentAt)));
}

function notificationJobFields(job: Job<NotificationJobPayload>): Record<string, unknown> {
  return {
    workspace_id: job.data.workspace_id,
    actor_id: job.data.actor_id,
    event_type: job.data.event_type,
    subject_type: job.data.subject_type,
    subject_id: job.data.subject_id,
  };
}

export async function registerNotificationDispatch(
  boss: PgBoss,
  deps: NotificationDispatchDeps & { log: JobLog },
): Promise<void> {
  const queues = await boss.getQueues([NOTIFICATION_DISPATCH_QUEUE]);
  if (queues.length === 0) {
    throw new Error(
      `pg-boss queue '${NOTIFICATION_DISPATCH_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,
    );
  }
  await boss.work<NotificationJobPayload>(
    NOTIFICATION_DISPATCH_QUEUE,
    JOB_WORK_OPTIONS,
    withJobLogging(
      deps.log,
      NOTIFICATION_DISPATCH_QUEUE,
      notificationDispatchHandler(deps),
      notificationJobFields,
    ),
  );
}
