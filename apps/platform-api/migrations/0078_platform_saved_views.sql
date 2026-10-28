CREATE TABLE "platform"."saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"menu_id" text,
	"name" text NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	"visibility_kind" text DEFAULT 'private' NOT NULL,
	"approval" text DEFAULT 'none' NOT NULL,
	"approval_note" text,
	"pending" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_views_kind_check" CHECK ("platform"."saved_views"."kind" in ('condition-set', 'menu-view')),
	CONSTRAINT "saved_views_menu_check" CHECK (("platform"."saved_views"."kind" = 'menu-view') = ("platform"."saved_views"."menu_id" is not null)),
	CONSTRAINT "saved_views_visibility_check" CHECK ("platform"."saved_views"."visibility_kind" in ('private', 'people', 'groups', 'official')),
	CONSTRAINT "saved_views_approval_check" CHECK ("platform"."saved_views"."approval" in ('none', 'pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "platform"."saved_view_defaults" (
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"menu_key" text NOT NULL,
	"view_id" uuid NOT NULL,
	CONSTRAINT "saved_view_defaults_workspace_id_actor_id_menu_key_pk" PRIMARY KEY("workspace_id","actor_id","menu_key")
);
--> statement-breakpoint
CREATE TABLE "platform"."saved_view_group_members" (
	"group_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"is_member" boolean DEFAULT true NOT NULL,
	"is_manager" boolean DEFAULT false NOT NULL,
	CONSTRAINT "saved_view_group_members_group_id_actor_id_pk" PRIMARY KEY("group_id","actor_id"),
	CONSTRAINT "saved_view_group_members_any_check" CHECK ("platform"."saved_view_group_members"."is_member" or "platform"."saved_view_group_members"."is_manager")
);
--> statement-breakpoint
CREATE TABLE "platform"."saved_view_group_shares" (
	"view_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "saved_view_group_shares_view_id_group_id_pk" PRIMARY KEY("view_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "platform"."saved_view_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."saved_view_imports" (
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"import_token" text NOT NULL,
	"legacy_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"view_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_view_imports_workspace_id_actor_id_import_token_legacy_key_pk" PRIMARY KEY("workspace_id","actor_id","import_token","legacy_key")
);
--> statement-breakpoint
CREATE TABLE "platform"."saved_view_people" (
	"view_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	CONSTRAINT "saved_view_people_view_id_actor_id_pk" PRIMARY KEY("view_id","actor_id")
);
--> statement-breakpoint
ALTER TABLE "platform"."saved_views" ADD CONSTRAINT "saved_views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_views" ADD CONSTRAINT "saved_views_owner_id_actors_id_fk" FOREIGN KEY ("owner_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_defaults" ADD CONSTRAINT "saved_view_defaults_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_defaults" ADD CONSTRAINT "saved_view_defaults_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_defaults" ADD CONSTRAINT "saved_view_defaults_view_id_saved_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "platform"."saved_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_group_members" ADD CONSTRAINT "saved_view_group_members_group_id_saved_view_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "platform"."saved_view_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_group_members" ADD CONSTRAINT "saved_view_group_members_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_group_shares" ADD CONSTRAINT "saved_view_group_shares_view_id_saved_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "platform"."saved_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_group_shares" ADD CONSTRAINT "saved_view_group_shares_group_id_saved_view_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "platform"."saved_view_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_groups" ADD CONSTRAINT "saved_view_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_groups" ADD CONSTRAINT "saved_view_groups_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_imports" ADD CONSTRAINT "saved_view_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_imports" ADD CONSTRAINT "saved_view_imports_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_people" ADD CONSTRAINT "saved_view_people_view_id_saved_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "platform"."saved_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."saved_view_people" ADD CONSTRAINT "saved_view_people_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_views_list_idx" ON "platform"."saved_views" USING btree ("workspace_id","menu_id");--> statement-breakpoint
CREATE INDEX "saved_views_owner_idx" ON "platform"."saved_views" USING btree ("workspace_id","owner_id");--> statement-breakpoint
CREATE INDEX "saved_view_group_members_actor_idx" ON "platform"."saved_view_group_members" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "saved_view_groups_workspace_idx" ON "platform"."saved_view_groups" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_view_imports_view_uq" ON "platform"."saved_view_imports" USING btree ("view_id");
--> statement-breakpoint
-- Platform saved views (#1105, ADR-0099). Runtime grants are the narrowest the module needs: rows are read, written
-- and deleted by the service; import rows are insert/read only (they are tombstones and are never updated or deleted).
GRANT USAGE ON SCHEMA platform TO platform_app, platform_migrate;
--> statement-breakpoint
GRANT ALL ON platform.saved_views, platform.saved_view_people, platform.saved_view_groups, platform.saved_view_group_members, platform.saved_view_group_shares, platform.saved_view_defaults, platform.saved_view_imports TO platform_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.saved_views, platform.saved_view_people, platform.saved_view_groups, platform.saved_view_group_members, platform.saved_view_group_shares, platform.saved_view_defaults TO platform_app;
GRANT SELECT, INSERT ON platform.saved_view_imports TO platform_app;
