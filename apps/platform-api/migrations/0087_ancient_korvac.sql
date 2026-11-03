CREATE TABLE "knowledge"."catalog_import_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_type" text NOT NULL,
	"file_sha256" text NOT NULL,
	"headers" jsonb NOT NULL,
	"mapping_json" jsonb,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"plan_version" integer DEFAULT 1 NOT NULL,
	"sealed_plan_hash" text,
	"applied_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "catalog_import_job_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "catalog_import_job_entity_type_check" CHECK ("knowledge"."catalog_import_job"."entity_type" in ('vendor','process','model','software')),
	CONSTRAINT "catalog_import_job_file_type_check" CHECK ("knowledge"."catalog_import_job"."file_type" in ('csv','xlsx')),
	CONSTRAINT "catalog_import_job_status_check" CHECK ("knowledge"."catalog_import_job"."status" in ('uploaded','mapped','validated','review_required','applying','completed','partial_failure','failed','cancelled')),
	CONSTRAINT "catalog_import_job_plan_version_check" CHECK ("knowledge"."catalog_import_job"."plan_version" >= 1),
	CONSTRAINT "catalog_import_job_row_version_check" CHECK ("knowledge"."catalog_import_job"."row_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "knowledge"."catalog_import_resolution" (
	"workspace_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"resolution" text NOT NULL,
	"map_target_id" uuid,
	"expected_target_version" integer,
	"resolved_by" uuid NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_import_resolution_pk" PRIMARY KEY("workspace_id","job_id","row_no"),
	CONSTRAINT "catalog_import_resolution_resolution_check" CHECK ("knowledge"."catalog_import_resolution"."resolution" in ('skip','map','create','abort'))
);
--> statement-breakpoint
CREATE TABLE "knowledge"."catalog_import_row" (
	"workspace_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"raw_json" jsonb NOT NULL,
	"parse_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"normalized_json" jsonb,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan_state" text DEFAULT 'pending' NOT NULL,
	"target_id" uuid,
	"target_version" integer,
	"plan_hash" text,
	"apply_status" text,
	"result_target_id" uuid,
	CONSTRAINT "catalog_import_row_pk" PRIMARY KEY("workspace_id","job_id","row_no"),
	CONSTRAINT "catalog_import_row_plan_state_check" CHECK ("knowledge"."catalog_import_row"."plan_state" in ('pending','new','unchanged','update','conflict','error')),
	CONSTRAINT "catalog_import_row_row_no_check" CHECK ("knowledge"."catalog_import_row"."row_no" >= 1)
);
--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_job" ADD CONSTRAINT "catalog_import_job_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_job" ADD CONSTRAINT "catalog_import_job_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_job" ADD CONSTRAINT "catalog_import_job_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_resolution" ADD CONSTRAINT "catalog_import_resolution_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_resolution" ADD CONSTRAINT "catalog_import_resolution_resolved_by_actors_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_resolution" ADD CONSTRAINT "catalog_import_resolution_row_fk" FOREIGN KEY ("workspace_id","job_id","row_no") REFERENCES "knowledge"."catalog_import_row"("workspace_id","job_id","row_no") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_row" ADD CONSTRAINT "catalog_import_row_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_row" ADD CONSTRAINT "catalog_import_row_job_fk" FOREIGN KEY ("workspace_id","job_id") REFERENCES "knowledge"."catalog_import_job"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_import_row_plan_state_idx" ON "knowledge"."catalog_import_row" USING btree ("workspace_id","job_id","plan_state");
--> statement-breakpoint
-- Catalog import staging (#1195 a). Staging only: the runtime role reads, adds and updates import jobs, rows and
-- resolutions; it never deletes them, and the import never writes catalog tables from these statements.
GRANT ALL ON knowledge.catalog_import_job, knowledge.catalog_import_row, knowledge.catalog_import_resolution TO platform_migrate;
GRANT SELECT, INSERT, UPDATE ON knowledge.catalog_import_job, knowledge.catalog_import_row, knowledge.catalog_import_resolution TO platform_app;
