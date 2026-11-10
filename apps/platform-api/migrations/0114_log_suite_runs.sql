CREATE TABLE "log_datasets"."regression_suite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"items" jsonb NOT NULL,
	"engine_profile_ref" text,
	"required_pin" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "regression_suite_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "regression_suite_name_check" CHECK (char_length("log_datasets"."regression_suite"."name") between 1 and 200),
	CONSTRAINT "regression_suite_items_check" CHECK (jsonb_typeof("log_datasets"."regression_suite"."items") = 'array' and jsonb_array_length("log_datasets"."regression_suite"."items") between 1 and 20),
	CONSTRAINT "regression_suite_profile_check" CHECK (coalesce(char_length("log_datasets"."regression_suite"."engine_profile_ref"), 0) <= 200),
	CONSTRAINT "regression_suite_required_pin_check" CHECK (jsonb_typeof("log_datasets"."regression_suite"."required_pin") = 'object'),
	CONSTRAINT "regression_suite_row_version_check" CHECK ("log_datasets"."regression_suite"."row_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "log_datasets"."suite_run_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"suite_run_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"dataset_id" uuid NOT NULL,
	"dataset_revision_id" uuid NOT NULL,
	"baseline_id" uuid NOT NULL,
	"sample_manifest_digest" text NOT NULL,
	"baseline_digest" text NOT NULL,
	"baseline_stale" jsonb NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suite_run_item_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "suite_run_item_run_ordinal_uq" UNIQUE("workspace_id","suite_run_id","ordinal"),
	CONSTRAINT "suite_run_item_request_uq" UNIQUE("workspace_id","request_id"),
	CONSTRAINT "suite_run_item_ordinal_check" CHECK ("log_datasets"."suite_run_item"."ordinal" >= 1),
	CONSTRAINT "suite_run_item_digest_check" CHECK ("log_datasets"."suite_run_item"."sample_manifest_digest" ~ '^[0-9a-f]{64}$' and "log_datasets"."suite_run_item"."baseline_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "suite_run_item_stale_check" CHECK (jsonb_typeof("log_datasets"."suite_run_item"."baseline_stale") = 'object')
);
--> statement-breakpoint
CREATE TABLE "log_datasets"."suite_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"suite_id" uuid NOT NULL,
	"requested_by_actor_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"engine_profile_ref" text,
	"required_pin" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suite_run_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "suite_run_idempotency_uq" UNIQUE("workspace_id","suite_id","requested_by_actor_id","idempotency_key"),
	CONSTRAINT "suite_run_idempotency_key_check" CHECK (char_length("log_datasets"."suite_run"."idempotency_key") between 1 and 200),
	CONSTRAINT "suite_run_profile_check" CHECK (coalesce(char_length("log_datasets"."suite_run"."engine_profile_ref"), 0) <= 200),
	CONSTRAINT "suite_run_required_pin_check" CHECK (jsonb_typeof("log_datasets"."suite_run"."required_pin") = 'object')
);
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ALTER COLUMN "round_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ADD COLUMN "suite_run_item_id" uuid;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ADD COLUMN "suite_run_id" uuid;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ADD COLUMN "subject_sample_set" jsonb;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ADD COLUMN "subject_sample_manifest_digest" text;--> statement-breakpoint
ALTER TABLE "log_datasets"."regression_suite" ADD CONSTRAINT "regression_suite_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."regression_suite" ADD CONSTRAINT "regression_suite_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."regression_suite" ADD CONSTRAINT "regression_suite_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_run_item" ADD CONSTRAINT "suite_run_item_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_run_item" ADD CONSTRAINT "suite_run_item_run_fk" FOREIGN KEY ("workspace_id","suite_run_id") REFERENCES "log_datasets"."suite_run"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_run_item" ADD CONSTRAINT "suite_run_item_dataset_fk" FOREIGN KEY ("workspace_id","dataset_id") REFERENCES "log_datasets"."dataset"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_run_item" ADD CONSTRAINT "suite_run_item_revision_fk" FOREIGN KEY ("workspace_id","dataset_revision_id") REFERENCES "log_datasets"."dataset_revision"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_run_item" ADD CONSTRAINT "suite_run_item_baseline_fk" FOREIGN KEY ("workspace_id","baseline_id") REFERENCES "log_datasets"."expected_baseline"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_run" ADD CONSTRAINT "suite_run_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_run" ADD CONSTRAINT "suite_run_requested_by_actor_id_actors_id_fk" FOREIGN KEY ("requested_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."suite_run" ADD CONSTRAINT "suite_run_suite_fk" FOREIGN KEY ("workspace_id","suite_id") REFERENCES "log_datasets"."regression_suite"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "regression_suite_name_idx" ON "log_datasets"."regression_suite" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "suite_run_item_dataset_idx" ON "log_datasets"."suite_run_item" USING btree ("workspace_id","dataset_id");--> statement-breakpoint
CREATE INDEX "suite_run_suite_idx" ON "log_datasets"."suite_run" USING btree ("workspace_id","suite_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_request_suite_item_uq" ON "log_lifecycle"."execution_request" USING btree ("workspace_id","suite_run_item_id") WHERE "log_lifecycle"."execution_request"."suite_run_item_id" is not null;--> statement-breakpoint
CREATE INDEX "execution_request_suite_run_idx" ON "log_lifecycle"."execution_request" USING btree ("workspace_id","suite_run_id","state") WHERE "log_lifecycle"."execution_request"."suite_run_id" is not null;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ADD CONSTRAINT "execution_request_subject_check" CHECK (("log_lifecycle"."execution_request"."round_id" is not null) <> ("log_lifecycle"."execution_request"."suite_run_item_id" is not null) and ("log_lifecycle"."execution_request"."suite_run_item_id" is not null) = ("log_lifecycle"."execution_request"."suite_run_id" is not null) and ("log_lifecycle"."execution_request"."suite_run_item_id" is not null) = ("log_lifecycle"."execution_request"."subject_sample_set" is not null) and ("log_lifecycle"."execution_request"."suite_run_item_id" is not null) = ("log_lifecycle"."execution_request"."subject_sample_manifest_digest" is not null));--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ADD CONSTRAINT "execution_request_subject_digest_check" CHECK ("log_lifecycle"."execution_request"."subject_sample_manifest_digest" is null or "log_lifecycle"."execution_request"."subject_sample_manifest_digest" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
-- #1479 D-c: request subject extension (ADR-0117 amendment) and regression suites. A request is for a Round XOR a suite run item
-- (execution_request_subject_check); a suite subject carries its run id and the sample list pinned at registration, so the claim
-- response never reads log-datasets. platform_app keeps its existing INSERT / column-limited UPDATE on execution_request (the new
-- columns are insert-only: the guard below refuses any change). Roles are not touched; no DELETE for any role.
CREATE OR REPLACE FUNCTION log_lifecycle.request_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.round_id IS DISTINCT FROM OLD.round_id
		OR NEW.suite_run_item_id IS DISTINCT FROM OLD.suite_run_item_id OR NEW.suite_run_id IS DISTINCT FROM OLD.suite_run_id
		OR NEW.subject_sample_set IS DISTINCT FROM OLD.subject_sample_set OR NEW.subject_sample_manifest_digest IS DISTINCT FROM OLD.subject_sample_manifest_digest
		OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.immediate IS DISTINCT FROM OLD.immediate
		OR NEW.request_digest IS DISTINCT FROM OLD.request_digest OR NEW.engine_profile_ref IS DISTINCT FROM OLD.engine_profile_ref
		OR NEW.requested_by_actor_id IS DISTINCT FROM OLD.requested_by_actor_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
		OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts OR NEW.not_before IS DISTINCT FROM OLD.not_before
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'execution request % identity columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'execution request % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.attempt_count < OLD.attempt_count OR NEW.attempt_count > OLD.attempt_count + 1 THEN
		RAISE EXCEPTION 'execution request % attempt_count can only stay or rise by 1', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
		-- LEGAL_REQUEST_PAIRS begin
		(OLD.state = 'queued' AND NEW.state IN ('claimed', 'cancelled', 'succeeded', 'failed'))
		OR (OLD.state = 'claimed' AND NEW.state IN ('succeeded', 'failed', 'queued', 'expired', 'cancelled'))
		-- LEGAL_REQUEST_PAIRS end
	) THEN
		RAISE EXCEPTION 'execution request % cannot move from % to %', OLD.id, OLD.state, NEW.state USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
-- Excerpt retention for a suite subject: the clock is the finish of its suite run (see the comment inside); a Round subject is as before.
CREATE OR REPLACE FUNCTION log_lifecycle.erase_excerpts(
	p_workspace uuid, p_round uuid, p_attempt uuid, p_closed_before timestamptz, p_reason text, p_limit integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
	erased integer;
BEGIN
	IF p_workspace IS NULL OR p_reason IS NULL OR p_limit IS NULL OR p_limit < 1
		OR (p_round IS NOT NULL)::int + (p_attempt IS NOT NULL)::int + (p_closed_before IS NOT NULL)::int <> 1 THEN
		RAISE EXCEPTION 'erase_excerpts needs a workspace, a reason, a limit and exactly one scope' USING ERRCODE = '22023';
	END IF;
	WITH due AS (
		SELECT e.id
		FROM log_lifecycle.rule_result_excerpt e
		JOIN log_lifecycle.rule_result rr ON rr.workspace_id = e.workspace_id AND rr.id = e.rule_result_id
		JOIN log_lifecycle.execution_attempt att ON att.workspace_id = rr.workspace_id AND att.id = rr.attempt_id
		JOIN log_lifecycle.execution_request rq ON rq.workspace_id = att.workspace_id AND rq.id = att.request_id
		LEFT JOIN log_lifecycle.validation_round vr ON vr.workspace_id = rq.workspace_id AND vr.id = rq.round_id
		WHERE e.workspace_id = p_workspace AND e.deleted_at IS NULL
			AND (p_round IS NULL OR vr.id = p_round)
			AND (p_attempt IS NULL OR att.id = p_attempt)
			AND (p_closed_before IS NULL
				OR (rq.round_id IS NOT NULL AND vr.status = 'closed' AND vr.closed_at < p_closed_before)
				-- A suite subject has no Round close event: its clock is the FINISH of its suite run (every item request ended, the latest ended_at).
				OR (rq.suite_run_id IS NOT NULL
					AND NOT EXISTS (SELECT 1 FROM log_lifecycle.execution_request s WHERE s.workspace_id = rq.workspace_id AND s.suite_run_id = rq.suite_run_id AND s.state IN ('queued', 'claimed'))
					AND (SELECT max(s.ended_at) FROM log_lifecycle.execution_request s WHERE s.workspace_id = rq.workspace_id AND s.suite_run_id = rq.suite_run_id) < p_closed_before))
		ORDER BY e.id
		LIMIT p_limit
		FOR UPDATE OF e SKIP LOCKED
	)
	UPDATE log_lifecycle.rule_result_excerpt x
	SET excerpt = '', deleted_at = now(), deleted_reason = p_reason
	FROM due WHERE x.id = due.id;
	GET DIAGNOSTICS erased = ROW_COUNT;
	RETURN erased;
END
$fn$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA log_datasets TO platform_app, platform_migrate;
--> statement-breakpoint
GRANT ALL ON log_datasets.regression_suite, log_datasets.suite_run, log_datasets.suite_run_item TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_datasets.regression_suite, log_datasets.suite_run, log_datasets.suite_run_item TO platform_app;
--> statement-breakpoint
GRANT UPDATE (name, items, engine_profile_ref, required_pin, row_version, updated_at, updated_by) ON log_datasets.regression_suite TO platform_app;
--> statement-breakpoint
-- The wall behind the column grant: a suite keeps its identity columns and row_version rises by exactly 1 on every update.
CREATE FUNCTION log_datasets.regression_suite_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
		OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
		RAISE EXCEPTION 'regression suite % identity columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'regression suite % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER regression_suite_guard BEFORE UPDATE ON log_datasets.regression_suite FOR EACH ROW EXECUTE FUNCTION log_datasets.regression_suite_guard();
--> statement-breakpoint
-- A suite run and its items are immutable after creation: no UPDATE and no DELETE, for any role (the migrate role included). A run has no
-- stored state; it is derived from the states of its items' execution requests.
CREATE FUNCTION log_datasets.suite_run_immutable() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION '% is immutable (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER suite_run_immutable BEFORE UPDATE OR DELETE ON log_datasets.suite_run FOR EACH ROW EXECUTE FUNCTION log_datasets.suite_run_immutable();
--> statement-breakpoint
CREATE TRIGGER suite_run_item_immutable BEFORE UPDATE OR DELETE ON log_datasets.suite_run_item FOR EACH ROW EXECUTE FUNCTION log_datasets.suite_run_immutable();
--> statement-breakpoint
-- #1479 D-c audit projection: the 0110 body + the capability `dataset.suite.run` (non-sensitive) in the permission-row allow-list ONLY. The dataset and
-- suite subject types are deliberately NOT projected (a private dataset's ids must not reach `console:access` Admins).
GRANT CREATE ON SCHEMA core TO platform_core_audit_reader_owner;
--> statement-breakpoint
SET ROLE platform_core_audit_reader_owner;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION core.platform_audit_events(
  p_workspace uuid, p_subject_type text, p_subject_id uuid, p_actor text, p_action text,
  p_source text, p_from timestamptz, p_to timestamptz, p_actions jsonb,
  p_sort text, p_desc boolean, p_limit integer, p_offset bigint
)
RETURNS TABLE (
  audit_id uuid, occurred_at timestamptz, actor_external_id text, actor_kind text,
  event_type text, subject_type text, subject_id uuid, total bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH base AS (
    SELECT l.id AS id, l.created_at AS at, ac.external_id AS actor, ac.actor_type AS actor_type,
      l.event_type AS event_type, l.subject_type AS subject_type, l.subject_id AS subject_id,
      (p_actions ->> l.event_type) AS action,
      (CASE WHEN ac.actor_type = 'system' THEN 'system' ELSE 'user' END) AS source
    FROM core.audit_log l
    JOIN core.actors ac ON ac.id = l.actor_id
    WHERE l.workspace_id = p_workspace
      AND l.subject_type = ANY (ARRAY['voc','finding','task','task_request','entity_link','voc_cluster',
        'permission_request','permission_grant','permission_deny','survey','survey_question',
        'managed_system','analytics_area','milestone','attachment','public_update_review_candidate',
        'voc_cluster_suggestion','workspace','knowledge_vendor','knowledge_process',
        'knowledge_model','knowledge_software','knowledge_item','knowledge_model_spec','improvement_item',
        'development_project','validation_round','knowledge_draft','catalog_report','execution_request','queue_settings','excerpt_reader','investigation'])
      AND left(l.event_type, 15) <> 'survey_response'
      AND (l.detail ->> 'sensitive') IS DISTINCT FROM 'true'
      -- Permission rows: only the non-sensitive capabilities (CAPABILITY_META.sensitive = false in
      -- packages/shared); later lifecycle events carry no `sensitive` marker. No capability = excluded.
      AND (left(l.subject_type, 11) <> 'permission_' AND left(l.event_type, 11) <> 'permission_'
        OR (l.detail ->> 'capability') = ANY (ARRAY['workspace.read','voc.triage','voc.read',
          'finding.read','finding.manage','survey.read',
          'knowledge.catalog.manage','knowledge.catalog.import','knowledge.item.publish',
          'knowledge.spec.publish','voc.read_public','improvement.manage','voc.create',
          'lifecycle.project.manage','lifecycle.round.manage','knowledge.draft.create','validation.catalog.report','dataset.manage','dataset.suite.run']))
      -- Entity links: both endpoint types must be present and neither a survey response (ADR-0064).
      AND (l.subject_type <> 'entity_link' AND left(l.event_type, 12) <> 'entity_link.'
        OR (l.detail -> 'source' ->> 'type' IS NOT NULL AND l.detail -> 'target' ->> 'type' IS NOT NULL
          AND l.detail -> 'source' ->> 'type' <> 'survey_response'
          AND l.detail -> 'target' ->> 'type' <> 'survey_response'))
  ), filt AS (
    SELECT * FROM base b
    WHERE b.action IS NOT NULL
      AND (p_subject_type IS NULL OR b.subject_type = p_subject_type)
      AND (p_subject_id IS NULL OR b.subject_id = p_subject_id)
      AND (p_actor IS NULL OR b.actor = p_actor)
      AND (p_action IS NULL OR b.action = p_action)
      AND (p_source IS NULL OR b.source = p_source)
      AND (p_from IS NULL OR b.at >= p_from)
      AND (p_to IS NULL OR b.at < p_to)
  ), counted AS (
    SELECT count(*) AS n FROM filt
  ), page AS (
    SELECT f.*, row_number() OVER (ORDER BY
      (CASE WHEN p_sort = 'at' AND NOT p_desc THEN f.at END) ASC,
      (CASE WHEN p_sort = 'at' AND p_desc THEN f.at END) DESC,
      (CASE WHEN p_sort = 'actor' AND NOT p_desc THEN f.actor END) COLLATE "C" ASC,
      (CASE WHEN p_sort = 'actor' AND p_desc THEN f.actor END) COLLATE "C" DESC,
      (CASE WHEN p_sort = 'action' AND NOT p_desc THEN f.action END) COLLATE "C" ASC,
      (CASE WHEN p_sort = 'action' AND p_desc THEN f.action END) COLLATE "C" DESC,
      (CASE WHEN p_sort = 'source' AND NOT p_desc THEN f.source END) COLLATE "C" ASC,
      (CASE WHEN p_sort = 'source' AND p_desc THEN f.source END) COLLATE "C" DESC,
      (CASE WHEN p_sort = 'targetType' AND NOT p_desc THEN f.subject_type END) COLLATE "C" ASC,
      (CASE WHEN p_sort = 'targetType' AND p_desc THEN f.subject_type END) COLLATE "C" DESC,
      f.id ASC
    ) AS rn
    FROM filt f
    ORDER BY rn
    LIMIT p_limit OFFSET p_offset
  )
  -- LEFT JOIN: a page past the end still returns one row (NULL item) carrying the true total.
  SELECT page.id, page.at, page.actor, page.actor_type, page.event_type, page.subject_type,
    page.subject_id, counted.n
  FROM counted LEFT JOIN page ON true
  ORDER BY page.rn
$$;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA core FROM platform_core_audit_reader_owner;

