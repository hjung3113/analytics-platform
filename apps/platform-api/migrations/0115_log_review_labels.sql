CREATE TABLE "log_datasets"."suite_review_label" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"suite_run_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"dataset_revision_id" uuid NOT NULL,
	"label" text NOT NULL,
	"reason" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suite_review_label_label_check" CHECK ("log_datasets"."suite_review_label"."label" in ('false_positive','false_negative','accepted_change','needs_review')),
	CONSTRAINT "suite_review_label_rule_check" CHECK (char_length("log_datasets"."suite_review_label"."rule_id") between 1 and 200),
	CONSTRAINT "suite_review_label_reason_check" CHECK (char_length("log_datasets"."suite_review_label"."reason") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_review_label" ADD CONSTRAINT "suite_review_label_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_review_label" ADD CONSTRAINT "suite_review_label_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_review_label" ADD CONSTRAINT "suite_review_label_run_fk" FOREIGN KEY ("workspace_id","suite_run_id") REFERENCES "log_datasets"."suite_run"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_review_label" ADD CONSTRAINT "suite_review_label_revision_fk" FOREIGN KEY ("workspace_id","dataset_revision_id") REFERENCES "log_datasets"."dataset_revision"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suite_review_label_rule_idx" ON "log_datasets"."suite_review_label" USING btree ("workspace_id","suite_run_id","dataset_revision_id","rule_id","at");
--> statement-breakpoint
-- #1480 D-d: result review labels. Append-only: the runtime role gets SELECT + INSERT only, and a trigger refuses UPDATE and DELETE for every
-- role (the migrate role included). Roles are not touched. The audit projection is NOT touched: dataset subjects stay out of it (a private
-- dataset's ids must not reach `console:access` Admins), and `reviewLabelAdd` needs no new capability.
GRANT ALL ON log_datasets.suite_review_label TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_datasets.suite_review_label TO platform_app;
--> statement-breakpoint
CREATE FUNCTION log_datasets.suite_review_label_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION 'suite_review_label is append-only (% refused)', TG_OP USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER suite_review_label_append_only BEFORE UPDATE OR DELETE ON log_datasets.suite_review_label FOR EACH ROW EXECUTE FUNCTION log_datasets.suite_review_label_append_only();
