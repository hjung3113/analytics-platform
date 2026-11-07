CREATE TABLE "core"."api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"last_used_ip" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_kind_check" CHECK ("core"."api_tokens"."kind" in ('personal','service'))
);
--> statement-breakpoint
ALTER TABLE "core"."api_tokens" ADD CONSTRAINT "api_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."api_tokens" ADD CONSTRAINT "api_tokens_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."api_tokens" ADD CONSTRAINT "api_tokens_revoked_by_actors_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."api_tokens" ADD CONSTRAINT "api_tokens_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_secret_hash_uq" ON "core"."api_tokens" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "api_tokens_workspace_actor_idx" ON "core"."api_tokens" USING btree ("workspace_id","actor_id");--> statement-breakpoint
CREATE INDEX "api_tokens_workspace_created_idx" ON "core"."api_tokens" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- Roles (ADR-0116, #1442). platform_app: select/insert and column-limited update (use stamps + revoke); no delete.
GRANT ALL ON "core"."api_tokens" TO platform_migrate;--> statement-breakpoint
GRANT SELECT, INSERT ON "core"."api_tokens" TO platform_app;--> statement-breakpoint
GRANT UPDATE ("last_used_at", "last_used_ip", "revoked_at", "revoked_by") ON "core"."api_tokens" TO platform_app;
