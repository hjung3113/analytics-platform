CREATE SCHEMA "log_explorer";
--> statement-breakpoint
CREATE TABLE "log_explorer"."investigation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"owner_actor_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"round_id" uuid,
	"sample_set" jsonb,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investigation_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "investigation_title_check" CHECK (char_length("log_explorer"."investigation"."title") between 1 and 200),
	CONSTRAINT "investigation_origin_check" CHECK ("log_explorer"."investigation"."origin" in ('standalone','round')),
	CONSTRAINT "investigation_origin_shape_check" CHECK (("log_explorer"."investigation"."origin" = 'round' and "log_explorer"."investigation"."round_id" is not null and "log_explorer"."investigation"."sample_set" is null) or ("log_explorer"."investigation"."origin" = 'standalone' and "log_explorer"."investigation"."round_id" is null and "log_explorer"."investigation"."sample_set" is not null and jsonb_typeof("log_explorer"."investigation"."sample_set") = 'object')),
	CONSTRAINT "investigation_filters_check" CHECK (jsonb_typeof("log_explorer"."investigation"."filters") = 'object'),
	CONSTRAINT "investigation_evidence_check" CHECK (jsonb_typeof("log_explorer"."investigation"."evidence") = 'array' and jsonb_array_length("log_explorer"."investigation"."evidence") <= 100),
	CONSTRAINT "investigation_status_check" CHECK ("log_explorer"."investigation"."status" in ('open','archived')),
	CONSTRAINT "investigation_row_version_check" CHECK ("log_explorer"."investigation"."row_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "log_explorer"."investigation" ADD CONSTRAINT "investigation_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_explorer"."investigation" ADD CONSTRAINT "investigation_owner_actor_id_actors_id_fk" FOREIGN KEY ("owner_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investigation_owner_idx" ON "log_explorer"."investigation" USING btree ("workspace_id","owner_actor_id","updated_at");
--> statement-breakpoint
-- #1468 b: log explorer investigation. Grants and the guard trigger, same shape as 0100 (log lifecycle). The runtime role
-- (platform_app) gets SELECT and INSERT and a column-limited UPDATE; never DELETE (an archived investigation stays).
-- Roles are not touched.
GRANT USAGE ON SCHEMA log_explorer TO platform_app, platform_migrate;
--> statement-breakpoint
GRANT ALL ON log_explorer.investigation TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_explorer.investigation TO platform_app;
--> statement-breakpoint
GRANT UPDATE (title, filters, evidence, status, row_version, updated_at) ON log_explorer.investigation TO platform_app;
--> statement-breakpoint
-- The wall behind the column grant (the migrate role is not limited by it): identity and origin columns never change,
-- row_version rises by exactly 1 on EVERY update, and an archived investigation is final.
CREATE FUNCTION log_explorer.investigation_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
		OR NEW.owner_actor_id IS DISTINCT FROM OLD.owner_actor_id OR NEW.origin IS DISTINCT FROM OLD.origin
		OR NEW.round_id IS DISTINCT FROM OLD.round_id OR NEW.sample_set IS DISTINCT FROM OLD.sample_set
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'investigation % identity and origin columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF OLD.status = 'archived' THEN
		RAISE EXCEPTION 'investigation % is archived and final', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'investigation % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER investigation_guard BEFORE UPDATE ON log_explorer.investigation FOR EACH ROW EXECUTE FUNCTION log_explorer.investigation_guard();
--> statement-breakpoint
-- #1468 b audit projection: the 0108 body + the subject type `investigation`. `explorer.investigate` is sensitive (#1472), so its permission rows stay out of the capability allow-list.
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
          'lifecycle.project.manage','lifecycle.round.manage','knowledge.draft.create','validation.catalog.report']))
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

