CREATE TABLE "knowledge"."object_access_rule" (
	"rule_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"grantee_kind" text DEFAULT 'actor' NOT NULL,
	"grantee_id" uuid NOT NULL,
	"effect" text NOT NULL,
	"valid_until" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "object_access_rule_workspace_rule_uq" UNIQUE("workspace_id","rule_id"),
	CONSTRAINT "object_access_rule_target_kind_check" CHECK ("knowledge"."object_access_rule"."target_kind" in ('model','software','item')),
	CONSTRAINT "object_access_rule_grantee_kind_check" CHECK ("knowledge"."object_access_rule"."grantee_kind" = 'actor'),
	CONSTRAINT "object_access_rule_effect_check" CHECK ("knowledge"."object_access_rule"."effect" in ('allow','deny')),
	CONSTRAINT "object_access_rule_revoked_check" CHECK (("knowledge"."object_access_rule"."revoked_at" is null) = ("knowledge"."object_access_rule"."revoked_by" is null))
);
--> statement-breakpoint
ALTER TABLE "knowledge"."equipment_model" ADD COLUMN "access_mode" text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge"."knowledge_item" ADD COLUMN "access_mode" text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge"."software_version" ADD COLUMN "access_mode" text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge"."object_access_rule" ADD CONSTRAINT "object_access_rule_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."object_access_rule" ADD CONSTRAINT "object_access_rule_grantee_id_actors_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."object_access_rule" ADD CONSTRAINT "object_access_rule_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."object_access_rule" ADD CONSTRAINT "object_access_rule_revoked_by_actors_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "object_access_rule_lookup_idx" ON "knowledge"."object_access_rule" USING btree ("workspace_id","grantee_id","target_kind","target_id") WHERE "knowledge"."object_access_rule"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "object_access_rule_target_idx" ON "knowledge"."object_access_rule" USING btree ("workspace_id","target_kind","target_id","created_at");--> statement-breakpoint
ALTER TABLE "knowledge"."equipment_model" ADD CONSTRAINT "equipment_model_access_mode_check" CHECK ("knowledge"."equipment_model"."access_mode" in ('internal','restricted'));--> statement-breakpoint
ALTER TABLE "knowledge"."knowledge_item" ADD CONSTRAINT "knowledge_item_access_mode_check" CHECK ("knowledge"."knowledge_item"."access_mode" in ('internal','restricted'));--> statement-breakpoint
ALTER TABLE "knowledge"."software_version" ADD CONSTRAINT "software_version_access_mode_check" CHECK ("knowledge"."software_version"."access_mode" in ('internal','restricted'));--> statement-breakpoint
-- #1504 S-a grants (hand-written, drizzle cannot express them). The rule table is append-friendly: platform_app inserts rows and may only set the revoke columns; no DELETE. The new Item column `access_mode` joins the column-limited UPDATE list of knowledge_item (models and SW versions already hold a table-level UPDATE).
GRANT ALL ON knowledge.object_access_rule TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON knowledge.object_access_rule TO platform_app;
--> statement-breakpoint
GRANT UPDATE (revoked_at, revoked_by) ON knowledge.object_access_rule TO platform_app;
--> statement-breakpoint
GRANT UPDATE (access_mode) ON knowledge.knowledge_item TO platform_app;
