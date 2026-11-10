CREATE TABLE "knowledge"."model_topview_link" (
	"workspace_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"from_software_id" uuid,
	"layout_id" text NOT NULL,
	"layout_revision" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "model_topview_link_revision_check" CHECK ("knowledge"."model_topview_link"."layout_revision" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "model_topview_link_version_check" CHECK ("knowledge"."model_topview_link"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "knowledge"."model_topview_link" ADD CONSTRAINT "model_topview_link_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."model_topview_link" ADD CONSTRAINT "model_topview_link_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."model_topview_link" ADD CONSTRAINT "model_topview_link_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."model_topview_link" ADD CONSTRAINT "model_topview_link_model_fk" FOREIGN KEY ("workspace_id","model_id") REFERENCES "knowledge"."equipment_model"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."model_topview_link" ADD CONSTRAINT "model_topview_link_software_fk" FOREIGN KEY ("workspace_id","model_id","from_software_id") REFERENCES "knowledge"."software_version"("workspace_id","model_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_topview_link_default_uq" ON "knowledge"."model_topview_link" USING btree ("workspace_id","model_id") WHERE "knowledge"."model_topview_link"."from_software_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "model_topview_link_software_uq" ON "knowledge"."model_topview_link" USING btree ("workspace_id","model_id","from_software_id") WHERE "knowledge"."model_topview_link"."from_software_id" is not null;
--> statement-breakpoint
-- #1656: runtime wall of the Hub Top View pointer. platform_app links (INSERT), re-links (column-limited UPDATE: never the identity
-- or the model/start-SW key) and unlinks (DELETE); the audit row of each change carries the history. Roles are not touched.
GRANT ALL ON knowledge.model_topview_link TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON knowledge.model_topview_link TO platform_app;
--> statement-breakpoint
GRANT UPDATE (layout_id, layout_revision, version, updated_at, updated_by) ON knowledge.model_topview_link TO platform_app;
