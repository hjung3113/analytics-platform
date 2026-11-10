CREATE SCHEMA "log_rules";
--> statement-breakpoint
CREATE TABLE "log_rules"."catalog_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_system" text,
	"reported_by_actor_id" uuid NOT NULL,
	"validator_version" text,
	"report_digest" text NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL,
	"reject_reason" text,
	"superseded_at" timestamp with time zone,
	"superseded_by_report_id" uuid,
	CONSTRAINT "catalog_report_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "catalog_report_digest_uq" UNIQUE("workspace_id","report_digest"),
	CONSTRAINT "catalog_report_outcome_check" CHECK ("log_rules"."catalog_report"."outcome" in ('accepted','rejected')),
	CONSTRAINT "catalog_report_digest_check" CHECK ("log_rules"."catalog_report"."report_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "catalog_report_shape_check" CHECK (("log_rules"."catalog_report"."outcome" = 'accepted' and "log_rules"."catalog_report"."source_system" is not null and "log_rules"."catalog_report"."validator_version" is not null and "log_rules"."catalog_report"."reject_reason" is null)
        or ("log_rules"."catalog_report"."outcome" = 'rejected' and "log_rules"."catalog_report"."reject_reason" is not null and "log_rules"."catalog_report"."superseded_at" is null)),
	CONSTRAINT "catalog_report_superseded_check" CHECK (("log_rules"."catalog_report"."superseded_at" is null) = ("log_rules"."catalog_report"."superseded_by_report_id" is null))
);
--> statement-breakpoint
CREATE TABLE "log_rules"."rule_set_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"rule_set_key" text NOT NULL,
	"revision" text NOT NULL,
	"result_ref" text NOT NULL,
	"revision_digest" text NOT NULL,
	"released_at" timestamp with time zone,
	"status" text NOT NULL,
	"supersedes" text,
	CONSTRAINT "rule_set_revision_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "rule_set_revision_key_uq" UNIQUE("workspace_id","report_id","rule_set_key","revision"),
	CONSTRAINT "rule_set_revision_result_ref_uq" UNIQUE("workspace_id","report_id","rule_set_key","result_ref"),
	CONSTRAINT "rule_set_revision_status_check" CHECK ("log_rules"."rule_set_revision"."status" in ('active','retired')),
	CONSTRAINT "rule_set_revision_digest_check" CHECK ("log_rules"."rule_set_revision"."revision_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "log_rules"."rule_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"format" text NOT NULL,
	"target" text NOT NULL,
	"requirement_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "rule_target_position_uq" UNIQUE("workspace_id","rule_id","position"),
	CONSTRAINT "rule_target_position_check" CHECK ("log_rules"."rule_target"."position" >= 0),
	CONSTRAINT "rule_target_format_check" CHECK (char_length("log_rules"."rule_target"."format") between 1 and 40),
	CONSTRAINT "rule_target_target_check" CHECK (char_length("log_rules"."rule_target"."target") between 1 and 500),
	CONSTRAINT "rule_target_requirement_ids_check" CHECK (coalesce(array_length("log_rules"."rule_target"."requirement_ids", 1), 0) <= 50)
);
--> statement-breakpoint
CREATE TABLE "log_rules"."rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rule_set_revision_id" uuid NOT NULL,
	"rule_key" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"support" text NOT NULL,
	"scope" jsonb,
	"required_default" boolean,
	"rule_digest" text NOT NULL,
	CONSTRAINT "rule_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "rule_key_uq" UNIQUE("workspace_id","rule_set_revision_id","rule_key"),
	CONSTRAINT "rule_support_check" CHECK ("log_rules"."rule"."support" in ('supported','partial','unsupported','unknown')),
	CONSTRAINT "rule_title_check" CHECK (char_length("log_rules"."rule"."title") between 1 and 120),
	CONSTRAINT "rule_summary_check" CHECK (char_length("log_rules"."rule"."summary") between 1 and 300),
	CONSTRAINT "rule_scope_check" CHECK ("log_rules"."rule"."scope" is null or jsonb_typeof("log_rules"."rule"."scope") = 'object'),
	CONSTRAINT "rule_digest_check" CHECK ("log_rules"."rule"."rule_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "log_rules"."catalog_report" ADD CONSTRAINT "catalog_report_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_rules"."catalog_report" ADD CONSTRAINT "catalog_report_reported_by_actor_id_actors_id_fk" FOREIGN KEY ("reported_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_rules"."catalog_report" ADD CONSTRAINT "catalog_report_superseded_by_fk" FOREIGN KEY ("workspace_id","superseded_by_report_id") REFERENCES "log_rules"."catalog_report"("workspace_id","id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "log_rules"."rule_set_revision" ADD CONSTRAINT "rule_set_revision_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_rules"."rule_set_revision" ADD CONSTRAINT "rule_set_revision_report_fk" FOREIGN KEY ("workspace_id","report_id") REFERENCES "log_rules"."catalog_report"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_rules"."rule_target" ADD CONSTRAINT "rule_target_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_rules"."rule_target" ADD CONSTRAINT "rule_target_rule_fk" FOREIGN KEY ("workspace_id","rule_id") REFERENCES "log_rules"."rule"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_rules"."rule" ADD CONSTRAINT "rule_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_rules"."rule" ADD CONSTRAINT "rule_revision_fk" FOREIGN KEY ("workspace_id","rule_set_revision_id") REFERENCES "log_rules"."rule_set_revision"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_report_current_uq" ON "log_rules"."catalog_report" USING btree ("workspace_id","source_system") WHERE "log_rules"."catalog_report"."outcome" = 'accepted' and "log_rules"."catalog_report"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "catalog_report_reported_idx" ON "log_rules"."catalog_report" USING btree ("workspace_id","reported_at");--> statement-breakpoint
CREATE INDEX "rule_set_revision_result_ref_idx" ON "log_rules"."rule_set_revision" USING btree ("workspace_id","result_ref");--> statement-breakpoint
CREATE INDEX "rule_rule_key_idx" ON "log_rules"."rule" USING btree ("workspace_id","rule_key");--> statement-breakpoint
-- #1491 R-a: log rules. Grants and guard triggers. The runtime role (platform_app) gets INSERT on the four tables and a
-- column-limited UPDATE on catalog_report (the supersede marker only), never DELETE anywhere. Roles are not touched.
GRANT USAGE ON SCHEMA log_rules TO platform_app, platform_migrate;
--> statement-breakpoint
GRANT ALL ON log_rules.catalog_report, log_rules.rule_set_revision, log_rules.rule, log_rules.rule_target TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_rules.catalog_report, log_rules.rule_set_revision, log_rules.rule, log_rules.rule_target TO platform_app;
--> statement-breakpoint
GRANT UPDATE (superseded_at, superseded_by_report_id) ON log_rules.catalog_report TO platform_app;
--> statement-breakpoint
-- The wall behind the column grant (the migrate role is not limited by it): the revision, rule and target rows are
-- insert-only for every role, and a report row may change exactly once, from current to superseded.
CREATE FUNCTION log_rules.append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION '% is insert-only (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER rule_set_revision_append_only BEFORE UPDATE OR DELETE ON log_rules.rule_set_revision FOR EACH ROW EXECUTE FUNCTION log_rules.append_only();
--> statement-breakpoint
CREATE TRIGGER rule_append_only BEFORE UPDATE OR DELETE ON log_rules.rule FOR EACH ROW EXECUTE FUNCTION log_rules.append_only();
--> statement-breakpoint
CREATE TRIGGER rule_target_append_only BEFORE UPDATE OR DELETE ON log_rules.rule_target FOR EACH ROW EXECUTE FUNCTION log_rules.append_only();
--> statement-breakpoint
CREATE TRIGGER catalog_report_no_delete BEFORE DELETE ON log_rules.catalog_report FOR EACH ROW EXECUTE FUNCTION log_rules.append_only();
--> statement-breakpoint
CREATE FUNCTION log_rules.report_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.source_system IS DISTINCT FROM OLD.source_system
		OR NEW.reported_by_actor_id IS DISTINCT FROM OLD.reported_by_actor_id OR NEW.validator_version IS DISTINCT FROM OLD.validator_version
		OR NEW.report_digest IS DISTINCT FROM OLD.report_digest OR NEW.reported_at IS DISTINCT FROM OLD.reported_at
		OR NEW.outcome IS DISTINCT FROM OLD.outcome OR NEW.reject_reason IS DISTINCT FROM OLD.reject_reason THEN
		RAISE EXCEPTION 'catalog report % content columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF OLD.outcome <> 'accepted' OR OLD.superseded_at IS NOT NULL THEN
		RAISE EXCEPTION 'catalog report % is not current and cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.superseded_at IS NULL OR NEW.superseded_by_report_id IS NULL THEN
		RAISE EXCEPTION 'catalog report % can only move to superseded', OLD.id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER catalog_report_guard BEFORE UPDATE ON log_rules.catalog_report FOR EACH ROW EXECUTE FUNCTION log_rules.report_guard();
--> statement-breakpoint
-- #1491 R-a audit projection: 0102 body + the subject type `catalog_report` and the capability `validation.catalog.report`.
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
        'development_project','validation_round','knowledge_draft','catalog_report'])
      AND left(l.event_type, 15) <> 'survey_response'
      AND (l.detail ->> 'sensitive') IS DISTINCT FROM 'true'
      -- Permission rows: only the non-sensitive capabilities (CAPABILITY_META.sensitive = false in
      -- packages/shared); later lifecycle events carry no `sensitive` marker. No capability = excluded.
      AND (left(l.subject_type, 11) <> 'permission_' AND left(l.event_type, 11) <> 'permission_'
        OR (l.detail ->> 'capability') = ANY (ARRAY['workspace.read','voc.triage','voc.read',
          'finding.read','finding.manage','survey.read',
          'knowledge.catalog.manage','knowledge.catalog.import','knowledge.item.publish',
          'knowledge.spec.publish','voc.read_public','improvement.manage','voc.create',
          'lifecycle.project.manage','lifecycle.round.manage','knowledge.draft.create','validation.catalog.report']))
      -- Entity links: both endpoint types must be present and neither a survey response (FO ADR-0064).
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
