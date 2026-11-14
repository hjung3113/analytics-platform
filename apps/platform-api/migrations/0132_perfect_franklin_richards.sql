DROP INDEX "log_datasets"."suite_review_label_rule_idx";--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_review_label" ADD COLUMN "ordinal" integer;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_review_label" ADD CONSTRAINT "suite_review_label_item_fk" FOREIGN KEY ("workspace_id","suite_run_id","ordinal") REFERENCES "log_datasets"."suite_run_item"("workspace_id","suite_run_id","ordinal") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suite_review_label_rule_idx" ON "log_datasets"."suite_review_label" USING btree ("workspace_id","suite_run_id","ordinal","rule_id","at");--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_review_label" ADD CONSTRAINT "suite_review_label_ordinal_check" CHECK ("log_datasets"."suite_review_label"."ordinal" is null or "log_datasets"."suite_review_label"."ordinal" >= 1);
--> statement-breakpoint
-- #2107: NULL preserves labels written before run-item ownership was recorded; never backfill by guessing.
COMMENT ON COLUMN log_datasets.suite_review_label.ordinal IS 'Run item ordinal; NULL means a legacy label written before #2107, with no guessed item ownership.';
