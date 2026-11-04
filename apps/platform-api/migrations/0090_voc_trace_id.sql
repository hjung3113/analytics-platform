ALTER TABLE "voc"."vocs" ADD COLUMN "trace_id" text;--> statement-breakpoint
CREATE INDEX "client_errors_workspace_correlation_idx" ON "platform"."client_errors" USING btree ("workspace_id","correlation_id");--> statement-breakpoint
CREATE INDEX "vocs_trace_id_idx" ON "voc"."vocs" USING btree ("workspace_id","trace_id");--> statement-breakpoint
-- #606: the VOC operational read looks up the report identity for a trace id. Column-level SELECT on
-- the identity columns only (never actor_id / request_id); client_errors stays insert-only otherwise.
GRANT SELECT ("workspace_id", "correlation_id", "menu_id", "path", "name", "received_at") ON "platform"."client_errors" TO platform_app;
