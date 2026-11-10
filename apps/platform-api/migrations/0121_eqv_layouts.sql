CREATE SCHEMA "eqv";
--> statement-breakpoint
CREATE TABLE "eqv"."equipment" (
	"workspace_id" uuid NOT NULL,
	"equipment_id" text NOT NULL,
	"label" text NOT NULL,
	"model_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_pk" PRIMARY KEY("workspace_id","equipment_id"),
	CONSTRAINT "equipment_label_check" CHECK (char_length(btrim("eqv"."equipment"."label")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "eqv"."layout_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"layout_id" text NOT NULL,
	"document" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "layout_draft_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "layout_draft_workspace_layout_uq" UNIQUE("workspace_id","layout_id"),
	CONSTRAINT "layout_draft_layout_id_check" CHECK ("eqv"."layout_draft"."layout_id" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
	CONSTRAINT "layout_draft_version_check" CHECK ("eqv"."layout_draft"."version" >= 1),
	CONSTRAINT "layout_draft_document_check" CHECK (jsonb_typeof("eqv"."layout_draft"."document") = 'object')
);
--> statement-breakpoint
CREATE TABLE "eqv"."layout_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"layout_id" text NOT NULL,
	"revision" text NOT NULL,
	"document" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid NOT NULL,
	CONSTRAINT "layout_revision_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "layout_revision_workspace_layout_revision_uq" UNIQUE("workspace_id","layout_id","revision"),
	CONSTRAINT "layout_revision_layout_id_check" CHECK ("eqv"."layout_revision"."layout_id" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
	CONSTRAINT "layout_revision_revision_check" CHECK ("eqv"."layout_revision"."revision" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "layout_revision_document_check" CHECK (jsonb_typeof("eqv"."layout_revision"."document") = 'object')
);
--> statement-breakpoint
CREATE TABLE "eqv"."template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_id" text NOT NULL,
	"name" text NOT NULL,
	"document" jsonb NOT NULL,
	"promoted_from_layout_id" text NOT NULL,
	"promoted_from_revision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "template_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "template_workspace_template_uq" UNIQUE("workspace_id","template_id"),
	CONSTRAINT "template_template_id_check" CHECK ("eqv"."template"."template_id" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
	CONSTRAINT "template_name_check" CHECK (char_length(btrim("eqv"."template"."name")) between 1 and 200),
	CONSTRAINT "template_document_check" CHECK (jsonb_typeof("eqv"."template"."document") = 'object')
);
--> statement-breakpoint
ALTER TABLE "eqv"."equipment" ADD CONSTRAINT "equipment_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."layout_draft" ADD CONSTRAINT "layout_draft_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."layout_draft" ADD CONSTRAINT "layout_draft_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."layout_draft" ADD CONSTRAINT "layout_draft_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."layout_revision" ADD CONSTRAINT "layout_revision_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."layout_revision" ADD CONSTRAINT "layout_revision_published_by_actors_id_fk" FOREIGN KEY ("published_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."template" ADD CONSTRAINT "template_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."template" ADD CONSTRAINT "template_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."template" ADD CONSTRAINT "template_promoted_from_fk" FOREIGN KEY ("workspace_id","promoted_from_layout_id","promoted_from_revision") REFERENCES "eqv"."layout_revision"("workspace_id","layout_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_workspace_model_idx" ON "eqv"."equipment" USING btree ("workspace_id","model_id");--> statement-breakpoint
CREATE INDEX "layout_revision_workspace_layout_published_idx" ON "eqv"."layout_revision" USING btree ("workspace_id","layout_id","published_at");--> statement-breakpoint
CREATE INDEX "template_workspace_source_idx" ON "eqv"."template" USING btree ("workspace_id","promoted_from_layout_id","promoted_from_revision");
--> statement-breakpoint
-- #1645: runtime walls of the eqv schema (ADR-0135). platform_app: INSERT-only revisions and templates (no UPDATE, no DELETE: immutable),
-- a column-limited UPDATE on the draft (document, version and audit columns; never the identity), read-only equipment (Onboarding, step 8,
-- adds its write). Roles are not touched.
GRANT USAGE ON SCHEMA eqv TO platform_app, platform_migrate;
--> statement-breakpoint
GRANT ALL ON eqv.layout_draft, eqv.layout_revision, eqv.template, eqv.equipment TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON eqv.layout_revision, eqv.template TO platform_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON eqv.layout_draft TO platform_app;
--> statement-breakpoint
GRANT UPDATE (document, version, updated_at, updated_by) ON eqv.layout_draft TO platform_app;
--> statement-breakpoint
GRANT SELECT ON eqv.equipment TO platform_app;
--> statement-breakpoint
-- #1645: eqv audit subjects and capabilities join the projection allow-lists; the body is 0119 with exactly those two additions (GRANT CREATE → SET ROLE → REVOKE procedure kept).
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
        'development_project','validation_round','knowledge_draft','catalog_report','execution_request','queue_settings','excerpt_reader','investigation',
        'eqv_layout','eqv_layout_revision','eqv_template'])
      -- No viewer argument: exclude knowledge and lifecycle owners rather than leaking restricted ids/totals.
      AND left(l.subject_type, 10) <> 'knowledge_'
      AND l.subject_type <> ALL (ARRAY['development_project','validation_round','execution_request'])
      AND (l.subject_type <> 'entity_link' OR (coalesce(l.detail->'source'->>'type','') <> 'validation_round' AND coalesce(l.detail->'target'->>'type','') <> 'validation_round'))
      AND left(l.event_type, 15) <> 'survey_response'
      AND (l.detail ->> 'sensitive') IS DISTINCT FROM 'true'
      -- Permission rows: only the non-sensitive capabilities (CAPABILITY_META.sensitive = false in
      -- packages/shared); later lifecycle events carry no `sensitive` marker. No capability = excluded.
      AND (left(l.subject_type, 11) <> 'permission_' AND left(l.event_type, 11) <> 'permission_'
        OR (l.detail ->> 'capability') = ANY (ARRAY['workspace.read','voc.triage','voc.read',
          'finding.read','finding.manage','survey.read',
          'knowledge.catalog.manage','knowledge.catalog.import','knowledge.item.publish',
          'knowledge.spec.publish','voc.read_public','improvement.manage','voc.create',
          'lifecycle.project.manage','lifecycle.round.manage','knowledge.draft.create','validation.catalog.report','dataset.manage','dataset.suite.run','eqv.view','eqv.layout.edit','eqv.layout.publish']))
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

