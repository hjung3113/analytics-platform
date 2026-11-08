CREATE TABLE "log_datasets"."baseline_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"baseline_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"reason" text,
	"actor_id" uuid NOT NULL,
	"self_approved" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baseline_event_kind_check" CHECK ("log_datasets"."baseline_event"."kind" in ('created','updated','approved','superseded')),
	CONSTRAINT "baseline_event_before_check" CHECK ("log_datasets"."baseline_event"."before" is null or jsonb_typeof("log_datasets"."baseline_event"."before") = 'object'),
	CONSTRAINT "baseline_event_after_check" CHECK (jsonb_typeof("log_datasets"."baseline_event"."after") = 'object'),
	CONSTRAINT "baseline_event_reason_check" CHECK (coalesce(char_length("log_datasets"."baseline_event"."reason"), 0) <= 2000)
);
--> statement-breakpoint
CREATE TABLE "log_datasets"."expected_baseline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"dataset_revision_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"profile_pin" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expected_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expectations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parser_golden_ref" jsonb,
	"author_actor_id" uuid NOT NULL,
	"approved_by_actor_id" uuid,
	"approved_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expected_baseline_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "expected_baseline_revision_seq_uq" UNIQUE("workspace_id","dataset_revision_id","seq"),
	CONSTRAINT "expected_baseline_status_check" CHECK ("log_datasets"."expected_baseline"."status" in ('draft','approved','superseded')),
	CONSTRAINT "expected_baseline_seq_check" CHECK ("log_datasets"."expected_baseline"."seq" >= 1),
	CONSTRAINT "expected_baseline_profile_pin_check" CHECK (jsonb_typeof("log_datasets"."expected_baseline"."profile_pin") = 'object'),
	CONSTRAINT "expected_baseline_scope_check" CHECK (jsonb_typeof("log_datasets"."expected_baseline"."expected_scope") = 'array'),
	CONSTRAINT "expected_baseline_expectations_check" CHECK (jsonb_typeof("log_datasets"."expected_baseline"."expectations") = 'array'),
	CONSTRAINT "expected_baseline_golden_check" CHECK ("log_datasets"."expected_baseline"."parser_golden_ref" is null or jsonb_typeof("log_datasets"."expected_baseline"."parser_golden_ref") = 'object'),
	CONSTRAINT "expected_baseline_row_version_check" CHECK ("log_datasets"."expected_baseline"."row_version" >= 1),
	CONSTRAINT "expected_baseline_approved_check" CHECK (("log_datasets"."expected_baseline"."status" = 'draft') = ("log_datasets"."expected_baseline"."approved_at" is null and "log_datasets"."expected_baseline"."approved_by_actor_id" is null)),
	CONSTRAINT "expected_baseline_superseded_check" CHECK (("log_datasets"."expected_baseline"."status" = 'superseded') = ("log_datasets"."expected_baseline"."superseded_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "log_datasets"."baseline_event" ADD CONSTRAINT "baseline_event_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."baseline_event" ADD CONSTRAINT "baseline_event_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."baseline_event" ADD CONSTRAINT "baseline_event_baseline_fk" FOREIGN KEY ("workspace_id","baseline_id") REFERENCES "log_datasets"."expected_baseline"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."expected_baseline" ADD CONSTRAINT "expected_baseline_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."expected_baseline" ADD CONSTRAINT "expected_baseline_author_actor_id_actors_id_fk" FOREIGN KEY ("author_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."expected_baseline" ADD CONSTRAINT "expected_baseline_approved_by_actor_id_actors_id_fk" FOREIGN KEY ("approved_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."expected_baseline" ADD CONSTRAINT "expected_baseline_revision_fk" FOREIGN KEY ("workspace_id","dataset_revision_id") REFERENCES "log_datasets"."dataset_revision"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "baseline_event_baseline_idx" ON "log_datasets"."baseline_event" USING btree ("workspace_id","baseline_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "expected_baseline_one_approved_uq" ON "log_datasets"."expected_baseline" USING btree ("workspace_id","dataset_revision_id") WHERE "log_datasets"."expected_baseline"."status" = 'approved';
--> statement-breakpoint
-- #1478 D-b: expected baselines. The runtime role (platform_app) gets SELECT + INSERT on both tables and a column-limited UPDATE on
-- expected_baseline (what a draft edit, an approval and a supersede change); never DELETE, never UPDATE on baseline_event. Roles are
-- not touched. The audit projection is NOT touched: the baseline subjects stay out of it (a private dataset's ids), and the new
-- capability is sensitive, so its permission rows stay out of the capability allow-list.
GRANT ALL ON log_datasets.expected_baseline, log_datasets.baseline_event TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_datasets.expected_baseline, log_datasets.baseline_event TO platform_app;
--> statement-breakpoint
GRANT UPDATE (status, profile_pin, expected_scope, expectations, parser_golden_ref, approved_by_actor_id, approved_at, superseded_at, row_version, updated_at) ON log_datasets.expected_baseline TO platform_app;
--> statement-breakpoint
-- The wall behind the column grant (the migrate role is not limited by it): identity columns never change; row_version rises by exactly 1
-- on EVERY update; a draft may edit its content or become `approved` (content unchanged in that update); an `approved` baseline may only
-- become `superseded` (content and approval unchanged); a `superseded` one is final.
CREATE FUNCTION log_datasets.expected_baseline_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.dataset_revision_id IS DISTINCT FROM OLD.dataset_revision_id
		OR NEW.seq IS DISTINCT FROM OLD.seq OR NEW.author_actor_id IS DISTINCT FROM OLD.author_actor_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'expected_baseline % identity columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF OLD.status = 'superseded' THEN
		RAISE EXCEPTION 'expected_baseline % is superseded and final', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'expected_baseline % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'approved') THEN
		RAISE EXCEPTION 'expected_baseline % moves draft -> approved -> superseded only', OLD.id USING ERRCODE = '23514';
	END IF;
	IF OLD.status = 'approved' AND NEW.status <> 'superseded' THEN
		RAISE EXCEPTION 'expected_baseline % is approved: its only change is superseded', OLD.id USING ERRCODE = '23514';
	END IF;
	-- Content is immutable once the baseline leaves draft, and the approving update itself does not edit it.
	IF NEW.status <> 'draft' AND (NEW.profile_pin IS DISTINCT FROM OLD.profile_pin OR NEW.expected_scope IS DISTINCT FROM OLD.expected_scope
		OR NEW.expectations IS DISTINCT FROM OLD.expectations OR NEW.parser_golden_ref IS DISTINCT FROM OLD.parser_golden_ref) THEN
		RAISE EXCEPTION 'expected_baseline % content is immutable once approved', OLD.id USING ERRCODE = '23514';
	END IF;
	IF OLD.status = 'approved' AND (NEW.approved_by_actor_id IS DISTINCT FROM OLD.approved_by_actor_id OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
		RAISE EXCEPTION 'expected_baseline % approval cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER expected_baseline_guard BEFORE UPDATE ON log_datasets.expected_baseline FOR EACH ROW EXECUTE FUNCTION log_datasets.expected_baseline_guard();
--> statement-breakpoint
-- baseline_event is append-only: no UPDATE and no DELETE, for any role (the migrate role included).
CREATE FUNCTION log_datasets.baseline_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION 'baseline_event is append-only (% refused)', TG_OP USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER baseline_event_append_only BEFORE UPDATE OR DELETE ON log_datasets.baseline_event FOR EACH ROW EXECUTE FUNCTION log_datasets.baseline_event_append_only();
