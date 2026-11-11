CREATE TABLE "eqv"."sample_window" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"equipment_id" text NOT NULL,
	"hash" text NOT NULL,
	"from_at" text NOT NULL,
	"to_at" text NOT NULL,
	"data_generation" text NOT NULL,
	"time_domain" text NOT NULL,
	"occurrences" integer NOT NULL,
	"state" text NOT NULL,
	"counterpart_hash" text,
	"batch" jsonb NOT NULL,
	"inventory" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "sample_window_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "sample_window_workspace_equipment_hash_uq" UNIQUE("workspace_id","equipment_id","hash"),
	CONSTRAINT "sample_window_hash_check" CHECK ("eqv"."sample_window"."hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "sample_window_counterpart_check" CHECK ("eqv"."sample_window"."counterpart_hash" is null or "eqv"."sample_window"."counterpart_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "sample_window_from_check" CHECK ("eqv"."sample_window"."from_at" ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$'),
	CONSTRAINT "sample_window_to_check" CHECK ("eqv"."sample_window"."to_at" ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$' and "eqv"."sample_window"."from_at" < "eqv"."sample_window"."to_at"),
	CONSTRAINT "sample_window_state_check" CHECK ("eqv"."sample_window"."state" in ('active', 'staged', 'replaced', 'retired')),
	CONSTRAINT "sample_window_occurrences_check" CHECK ("eqv"."sample_window"."occurrences" >= 0),
	CONSTRAINT "sample_window_batch_check" CHECK (jsonb_typeof("eqv"."sample_window"."batch") = 'object' and jsonb_typeof("eqv"."sample_window"."inventory") = 'object')
);
--> statement-breakpoint
ALTER TABLE "eqv"."baseline_inventory" ADD COLUMN "window_id" uuid;--> statement-breakpoint
ALTER TABLE "eqv"."sample_window" ADD CONSTRAINT "sample_window_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."sample_window" ADD CONSTRAINT "sample_window_imported_by_actors_id_fk" FOREIGN KEY ("imported_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."sample_window" ADD CONSTRAINT "sample_window_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."sample_window" ADD CONSTRAINT "sample_window_equipment_fk" FOREIGN KEY ("workspace_id","equipment_id") REFERENCES "eqv"."equipment"("workspace_id","equipment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sample_window_workspace_equipment_from_idx" ON "eqv"."sample_window" USING btree ("workspace_id","equipment_id","from_at");--> statement-breakpoint
ALTER TABLE "eqv"."baseline_inventory" ADD CONSTRAINT "baseline_inventory_window_fk" FOREIGN KEY ("workspace_id","window_id") REFERENCES "eqv"."sample_window"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- #1658 (ADR-0139 amendment «Sample Window storage»): runtime walls. sample_window: platform_app SELECT and INSERT, UPDATE of state,
-- counterpart_hash and the audit columns only (replace and retire); never the content, no DELETE. eqv.equipment: INSERT of the four columns
-- `eqv.registerEquipment` writes (decision D2; `created_at` takes its default); still no UPDATE and no DELETE. baseline_inventory.window_id is written on INSERT only (that table keeps
-- SELECT and INSERT). Roles are not touched.
GRANT ALL ON eqv.sample_window TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON eqv.sample_window TO platform_app;
--> statement-breakpoint
GRANT UPDATE (state, counterpart_hash, updated_at, updated_by) ON eqv.sample_window TO platform_app;
--> statement-breakpoint
GRANT INSERT (workspace_id, equipment_id, label, model_id) ON eqv.equipment TO platform_app;
--> statement-breakpoint
-- #1658 (Sample Window·Fleet): the Sample Window and equipment-registration audit subjects and capability `eqv.window.import` join the projection
-- allow-lists; the body is 0124 with exactly those additions
-- (return type unchanged, so OR REPLACE keeps owner and EXECUTE grants; GRANT CREATE → SET ROLE → REVOKE procedure kept). eqv rows stay
-- excluded from the released projection by the `eqv_` prefix filter (ADR-0135 §9).
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
  event_type text, subject_type text, subject_id uuid, total bigint, scopes jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH base AS (
    SELECT l.id AS id, l.created_at AS at, ac.external_id AS actor, ac.actor_type AS actor_type,
      l.event_type AS event_type, l.subject_type AS subject_type, l.subject_id AS subject_id,
      (p_actions ->> l.event_type) AS action,
      -- Scopes (capability names) of an issued or revoked API token; NULL for every other row. Never the value, hash or prefix.
      (CASE WHEN l.subject_type = 'api_token' AND jsonb_typeof(l.detail -> 'scopes') = 'array' THEN l.detail -> 'scopes' END) AS scopes,
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
        'eqv_layout','eqv_layout_revision','eqv_template','eqv_alias_rules','eqv_type_dictionary','eqv_binding','eqv_sample_window','eqv_equipment','api_token'])
      -- No viewer argument: exclude knowledge, eqv and lifecycle owners rather than leaking restricted ids/totals.
      -- eqv subjects stay in the allow-list above but are never released here: a console-only actor holds no `eqv.view`
      -- (ADR-0135); the rows remain in core.audit_log for a future permission-aware eqv audit view.
      AND left(l.subject_type, 10) <> 'knowledge_'
      AND left(l.subject_type, 4) <> 'eqv_'
      AND l.subject_type <> ALL (ARRAY['development_project','validation_round','execution_request'])
      AND (l.subject_type <> 'entity_link' OR (coalesce(l.detail->'source'->>'type','') <> 'validation_round' AND coalesce(l.detail->'target'->>'type','') <> 'validation_round'))
      -- API tokens: only issue and revoke; failed-auth and session-required-denied rows carry prefixes and routes and stay out.
      AND (l.subject_type <> 'api_token' OR l.event_type IN ('api_token.issue','api_token.revoke'))
      AND left(l.event_type, 15) <> 'survey_response'
      AND (l.detail ->> 'sensitive') IS DISTINCT FROM 'true'
      -- Permission rows: only the non-sensitive capabilities (CAPABILITY_META.sensitive = false in
      -- packages/shared); later lifecycle events carry no `sensitive` marker. No capability = excluded.
      AND (left(l.subject_type, 11) <> 'permission_' AND left(l.event_type, 11) <> 'permission_'
        OR (l.detail ->> 'capability') = ANY (ARRAY['workspace.read','voc.triage','voc.read',
          'finding.read','finding.manage','survey.read',
          'knowledge.catalog.manage','knowledge.catalog.import','knowledge.item.publish',
          'knowledge.spec.publish','voc.read_public','improvement.manage','voc.create',
          'lifecycle.project.manage','lifecycle.round.manage','knowledge.draft.create','validation.catalog.report','dataset.manage','dataset.suite.run','eqv.view','eqv.layout.edit','eqv.layout.publish','eqv.rules.edit','eqv.dictionary.global_edit','eqv.mapping.publish','eqv.window.import']))
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
    page.subject_id, counted.n, page.scopes
  FROM counted LEFT JOIN page ON true
  ORDER BY page.rn
$$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION core.platform_audit_events(uuid,text,uuid,text,text,text,timestamptz,timestamptz,jsonb,text,boolean,integer,bigint)
  FROM PUBLIC, platform_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.platform_audit_events(uuid,text,uuid,text,text,text,timestamptz,timestamptz,jsonb,text,boolean,integer,bigint)
  TO platform_app;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA core FROM platform_core_audit_reader_owner;
