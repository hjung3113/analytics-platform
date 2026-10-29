CREATE TABLE "platform"."notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"author_actor_id" uuid NOT NULL,
	"title_ko" text NOT NULL,
	"title_en" text NOT NULL,
	"content_ko" text NOT NULL,
	"content_en" text NOT NULL,
	"scope_id" text,
	"until" timestamp NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notices_revision_check" CHECK ("platform"."notices"."revision" >= 1),
	CONSTRAINT "notices_title_ko_check" CHECK (char_length("platform"."notices"."title_ko") <= 200),
	CONSTRAINT "notices_title_en_check" CHECK (char_length("platform"."notices"."title_en") <= 200),
	CONSTRAINT "notices_content_ko_check" CHECK (char_length("platform"."notices"."content_ko") <= 10000),
	CONSTRAINT "notices_content_en_check" CHECK (char_length("platform"."notices"."content_en") <= 10000)
);
--> statement-breakpoint
ALTER TABLE "platform"."notices" ADD CONSTRAINT "notices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."notices" ADD CONSTRAINT "notices_author_actor_id_actors_id_fk" FOREIGN KEY ("author_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notices_workspace_until_idx" ON "platform"."notices" USING btree ("workspace_id","until");--> statement-breakpoint
-- Notices (ADR-0098 §4, #1106): the runtime role reads and writes rows (hard delete; replay of a
-- delete comes from core.idempotency_keys). Author and timestamps are server-stamped, never returned.
GRANT ALL ON platform.notices TO platform_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.notices TO platform_app;
