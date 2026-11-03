ALTER TABLE "knowledge"."catalog_import_job" ADD COLUMN "validation_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_job" ADD COLUMN "apply_pass" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_resolution" ADD COLUMN "based_on_validation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_row" ADD COLUMN "apply_error" text;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_row" ADD COLUMN "apply_pass" integer;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_row" ADD COLUMN "applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge"."catalog_import_row" ADD CONSTRAINT "catalog_import_row_apply_status_check" CHECK ("knowledge"."catalog_import_row"."apply_status" is null or "knowledge"."catalog_import_row"."apply_status" in ('applied','unchanged','skipped','excluded','unresolved','conflict','failed'));