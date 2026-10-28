-- Session-user preferences (ADR-0098, #1104): one row per (workspace, actor) holding the whole key -> JSON map and the
-- one-time browser import acknowledgement (`imported_at`). The runtime role reads, creates and updates its own rows; it never
-- deletes (an acknowledged import must stay acknowledged). Roles follow 0076 (platform_app / platform_migrate).
CREATE TABLE "platform"."preferences" (
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"imported_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_pk" PRIMARY KEY("workspace_id","actor_id"),
	CONSTRAINT "preferences_values_object_check" CHECK (jsonb_typeof("values") = 'object')
);
--> statement-breakpoint
ALTER TABLE "platform"."preferences" ADD CONSTRAINT "preferences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."preferences" ADD CONSTRAINT "preferences_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
GRANT ALL ON platform.preferences TO platform_migrate;
--> statement-breakpoint
GRANT INSERT, SELECT, UPDATE ON platform.preferences TO platform_app;
