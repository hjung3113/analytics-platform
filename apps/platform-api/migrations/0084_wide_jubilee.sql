CREATE INDEX "sessions_expires_at_idx" ON "core"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_revoked_at_idx" ON "core"."sessions" USING btree ("revoked_at") WHERE "core"."sessions"."revoked_at" is not null;--> statement-breakpoint
CREATE INDEX "task_requests_workspace_created_idx" ON "task_request"."task_requests" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tasks_workspace_updated_idx" ON "task"."tasks" USING btree ("workspace_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
-- Daily purge of long-dead sessions (#1266 b5a). The queue is migration-owned: the runtime role cannot do pg-boss DDL.
INSERT INTO pgboss.queue (
  name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
  expire_seconds, retention_seconds, deletion_seconds, warning_queued,
  dead_letter, partition, table_name, heartbeat_seconds
) VALUES (
  'core.sessions_purge',
  'standard', 5, 30, true, NULL, 900, 1209600, 604800, 0, NULL, false, 'job_common', NULL
) ON CONFLICT DO NOTHING;
