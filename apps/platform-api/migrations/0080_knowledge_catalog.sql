CREATE SCHEMA "knowledge";
--> statement-breakpoint
CREATE TABLE "knowledge"."equipment_model" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"code" text NOT NULL,
	"code_key" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "equipment_model_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "equipment_model_code_check" CHECK (char_length("knowledge"."equipment_model"."code") between 1 and 64),
	CONSTRAINT "equipment_model_name_check" CHECK (char_length("knowledge"."equipment_model"."name") between 1 and 200),
	CONSTRAINT "equipment_model_row_version_check" CHECK ("knowledge"."equipment_model"."row_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "knowledge"."external_identity_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_system" text NOT NULL,
	"source_type" text NOT NULL,
	"external_key" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"mapping_state" text DEFAULT 'proposed' NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "external_identity_map_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "external_identity_map_target_kind_check" CHECK ("knowledge"."external_identity_map"."target_kind" in ('vendor','process','model','software')),
	CONSTRAINT "external_identity_map_mapping_state_check" CHECK ("knowledge"."external_identity_map"."mapping_state" in ('proposed','accepted','rejected')),
	CONSTRAINT "external_identity_map_row_version_check" CHECK ("knowledge"."external_identity_map"."row_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "knowledge"."model_process" (
	"workspace_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid NOT NULL,
	CONSTRAINT "model_process_pk" PRIMARY KEY("workspace_id","model_id","process_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge"."process_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" text NOT NULL,
	"code_key" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "process_category_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "process_category_code_check" CHECK (char_length("knowledge"."process_category"."code") between 1 and 64),
	CONSTRAINT "process_category_name_check" CHECK (char_length("knowledge"."process_category"."name") between 1 and 200),
	CONSTRAINT "process_category_row_version_check" CHECK ("knowledge"."process_category"."row_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "knowledge"."software_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"version_key" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "software_version_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "software_version_label_check" CHECK (char_length("knowledge"."software_version"."version_label") between 1 and 64),
	CONSTRAINT "software_version_name_check" CHECK (char_length("knowledge"."software_version"."name") between 0 and 200),
	CONSTRAINT "software_version_row_version_check" CHECK ("knowledge"."software_version"."row_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "knowledge"."vendor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" text NOT NULL,
	"code_key" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "vendor_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "vendor_code_check" CHECK (char_length("knowledge"."vendor"."code") between 1 and 64),
	CONSTRAINT "vendor_name_check" CHECK (char_length("knowledge"."vendor"."name") between 1 and 200),
	CONSTRAINT "vendor_row_version_check" CHECK ("knowledge"."vendor"."row_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "knowledge"."equipment_model" ADD CONSTRAINT "equipment_model_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."equipment_model" ADD CONSTRAINT "equipment_model_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."equipment_model" ADD CONSTRAINT "equipment_model_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."equipment_model" ADD CONSTRAINT "equipment_model_vendor_fk" FOREIGN KEY ("workspace_id","vendor_id") REFERENCES "knowledge"."vendor"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."external_identity_map" ADD CONSTRAINT "external_identity_map_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."external_identity_map" ADD CONSTRAINT "external_identity_map_accepted_by_actors_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."external_identity_map" ADD CONSTRAINT "external_identity_map_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."external_identity_map" ADD CONSTRAINT "external_identity_map_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."model_process" ADD CONSTRAINT "model_process_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."model_process" ADD CONSTRAINT "model_process_assigned_by_actors_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."model_process" ADD CONSTRAINT "model_process_model_fk" FOREIGN KEY ("workspace_id","model_id") REFERENCES "knowledge"."equipment_model"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."model_process" ADD CONSTRAINT "model_process_process_fk" FOREIGN KEY ("workspace_id","process_id") REFERENCES "knowledge"."process_category"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."process_category" ADD CONSTRAINT "process_category_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."process_category" ADD CONSTRAINT "process_category_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."process_category" ADD CONSTRAINT "process_category_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."software_version" ADD CONSTRAINT "software_version_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."software_version" ADD CONSTRAINT "software_version_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."software_version" ADD CONSTRAINT "software_version_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."software_version" ADD CONSTRAINT "software_version_model_fk" FOREIGN KEY ("workspace_id","model_id") REFERENCES "knowledge"."equipment_model"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."vendor" ADD CONSTRAINT "vendor_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."vendor" ADD CONSTRAINT "vendor_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."vendor" ADD CONSTRAINT "vendor_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_model_workspace_vendor_code_key_uq" ON "knowledge"."equipment_model" USING btree ("workspace_id","vendor_id","code_key");--> statement-breakpoint
CREATE INDEX "equipment_model_vendor_idx" ON "knowledge"."equipment_model" USING btree ("workspace_id","vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_identity_map_source_uq" ON "knowledge"."external_identity_map" USING btree ("workspace_id","source_system","source_type","external_key");--> statement-breakpoint
CREATE INDEX "external_identity_map_target_idx" ON "knowledge"."external_identity_map" USING btree ("workspace_id","target_kind","target_id");--> statement-breakpoint
CREATE INDEX "model_process_process_idx" ON "knowledge"."model_process" USING btree ("workspace_id","process_id");--> statement-breakpoint
CREATE UNIQUE INDEX "process_category_workspace_code_key_uq" ON "knowledge"."process_category" USING btree ("workspace_id","code_key");--> statement-breakpoint
CREATE UNIQUE INDEX "software_version_workspace_model_version_key_uq" ON "knowledge"."software_version" USING btree ("workspace_id","model_id","version_key");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_workspace_code_key_uq" ON "knowledge"."vendor" USING btree ("workspace_id","code_key");
--> statement-breakpoint
-- Log knowledge catalog (ADR-0107, #1193). Catalog objects are deactivated, never deleted: the runtime role gets
-- no DELETE on them. A model–process mapping is not a catalog object and may be removed.
GRANT USAGE ON SCHEMA knowledge TO platform_app, platform_migrate;
--> statement-breakpoint
GRANT ALL ON knowledge.vendor, knowledge.process_category, knowledge.equipment_model, knowledge.model_process, knowledge.software_version, knowledge.external_identity_map TO platform_migrate;
GRANT SELECT, INSERT, UPDATE ON knowledge.vendor, knowledge.process_category, knowledge.equipment_model, knowledge.software_version, knowledge.external_identity_map TO platform_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.model_process TO platform_app;
