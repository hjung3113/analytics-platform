CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TABLE "platform"."client_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"correlation_id" text NOT NULL,
	"menu_id" text NOT NULL,
	"space_id" text,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"request_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"menu_id" text NOT NULL,
	"space_id" text,
	"path" text NOT NULL,
	"client_at" bigint NOT NULL,
	"session_id" text NOT NULL,
	"dwell_ms" integer,
	"entered_at" bigint,
	"source" text DEFAULT 'main' NOT NULL,
	"stay_id" text,
	"via" text,
	"from_menu_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_name_check" CHECK ("platform"."usage_events"."name" in ('entry', 'dwell')),
	CONSTRAINT "usage_events_source_check" CHECK ("platform"."usage_events"."source" in ('main', 'board')),
	CONSTRAINT "usage_events_via_check" CHECK ("platform"."usage_events"."via" is null or "platform"."usage_events"."via" in ('sidebar', 'switcher', 'palette', 'board', 'return', 'crossLink', 'drill', 'history', 'direct', 'link')),
	CONSTRAINT "usage_events_dwell_ms_check" CHECK ("platform"."usage_events"."dwell_ms" is null or "platform"."usage_events"."dwell_ms" >= 0),
	CONSTRAINT "usage_events_stay_check" CHECK ("platform"."usage_events"."stay_id" is null or "platform"."usage_events"."source" = 'board')
);
--> statement-breakpoint
ALTER TABLE "platform"."client_errors" ADD CONSTRAINT "client_errors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."client_errors" ADD CONSTRAINT "client_errors_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."usage_events" ADD CONSTRAINT "usage_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."usage_events" ADD CONSTRAINT "usage_events_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_summary_time_idx" ON "platform"."usage_events" USING btree ("workspace_id","name","received_at");--> statement-breakpoint
CREATE INDEX "usage_events_summary_menu_idx" ON "platform"."usage_events" USING btree ("workspace_id","name","menu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_dwell_entered_uq" ON "platform"."usage_events" USING btree ("workspace_id","actor_id","session_id","menu_id","entered_at") WHERE "platform"."usage_events"."name" = 'dwell' and "platform"."usage_events"."stay_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_dwell_stay_uq" ON "platform"."usage_events" USING btree ("workspace_id","actor_id","session_id","menu_id","stay_id") WHERE "platform"."usage_events"."name" = 'dwell' and "platform"."usage_events"."stay_id" is not null;--> statement-breakpoint
-- Platform port's own tables (ADR-0069 decision 1). Runtime grants are the narrowest the routes need:
-- usage events are inserted, merged (dwell upsert) and aggregated; client errors are insert-only
-- (no read API, no retention job).
GRANT USAGE ON SCHEMA platform TO fops_app, fops_migrate;
GRANT ALL ON platform.usage_events, platform.client_errors TO fops_migrate;
GRANT INSERT, SELECT, UPDATE ON platform.usage_events TO fops_app;
GRANT INSERT ON platform.client_errors TO fops_app;
