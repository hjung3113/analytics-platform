CREATE TABLE "permission"."permission_group_capabilities" (
	"group_id" uuid NOT NULL,
	"capability" text NOT NULL,
	CONSTRAINT "permission_group_capabilities_group_id_capability_pk" PRIMARY KEY("group_id","capability")
);
--> statement-breakpoint
CREATE TABLE "permission"."permission_group_shares" (
	"group_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	CONSTRAINT "permission_group_shares_group_id_actor_id_pk" PRIMARY KEY("group_id","actor_id")
);
--> statement-breakpoint
CREATE TABLE "permission"."permission_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"owner_actor_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "permission_groups_kind_check" CHECK ("permission"."permission_groups"."kind" IN ('operator', 'personal'))
);
--> statement-breakpoint
ALTER TABLE "permission"."permission_grants" ADD COLUMN "permission_group_id" uuid;--> statement-breakpoint
ALTER TABLE "permission"."permission_requests" ADD COLUMN "permission_group_id" uuid;--> statement-breakpoint
ALTER TABLE "permission"."permission_requests" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "permission"."permission_group_capabilities" ADD CONSTRAINT "permission_group_capabilities_group_id_permission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "permission"."permission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission"."permission_group_shares" ADD CONSTRAINT "permission_group_shares_group_id_permission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "permission"."permission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_groups_operator_name_uq" ON "permission"."permission_groups" USING btree ("workspace_id","name") WHERE "permission"."permission_groups"."archived_at" IS NULL AND "permission"."permission_groups"."kind" = 'operator';--> statement-breakpoint
CREATE UNIQUE INDEX "permission_groups_personal_name_uq" ON "permission"."permission_groups" USING btree ("workspace_id","owner_actor_id","name") WHERE "permission"."permission_groups"."archived_at" IS NULL AND "permission"."permission_groups"."kind" = 'personal';--> statement-breakpoint
ALTER TABLE "permission"."permission_grants" ADD CONSTRAINT "permission_grants_permission_group_id_permission_groups_id_fk" FOREIGN KEY ("permission_group_id") REFERENCES "permission"."permission_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission"."permission_requests" ADD CONSTRAINT "permission_requests_permission_group_id_permission_groups_id_fk" FOREIGN KEY ("permission_group_id") REFERENCES "permission"."permission_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "permission_requests_workspace_batch_idx" ON "permission"."permission_requests" USING btree ("workspace_id","batch_id") WHERE "permission"."permission_requests"."batch_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE permission.permission_groups ADD CONSTRAINT permission_groups_workspace_fk FOREIGN KEY (workspace_id) REFERENCES core.workspaces(id);
--> statement-breakpoint
ALTER TABLE permission.permission_groups ADD CONSTRAINT permission_groups_owner_fk FOREIGN KEY (owner_actor_id) REFERENCES core.actors(id);
--> statement-breakpoint
ALTER TABLE permission.permission_group_shares ADD CONSTRAINT permission_group_shares_actor_fk FOREIGN KEY (actor_id) REFERENCES core.actors(id);
--> statement-breakpoint
GRANT ALL ON permission.permission_groups, permission.permission_group_capabilities, permission.permission_group_shares TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON permission.permission_groups TO platform_app;
--> statement-breakpoint
GRANT UPDATE (name, description, updated_at, archived_at) ON permission.permission_groups TO platform_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON permission.permission_group_capabilities, permission.permission_group_shares TO platform_app;
