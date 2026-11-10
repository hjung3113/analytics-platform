CREATE TABLE "eqv"."alias_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"level" text NOT NULL,
	"vendor_id" uuid,
	"model_id" uuid,
	"equipment_id" text,
	"document" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "alias_rules_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "alias_rules_workspace_scope_uq" UNIQUE NULLS NOT DISTINCT("workspace_id","level","vendor_id","model_id","equipment_id"),
	CONSTRAINT "alias_rules_level_check" CHECK ("eqv"."alias_rules"."level" in ('global', 'maker', 'model', 'equipment')),
	CONSTRAINT "alias_rules_scope_check" CHECK (("eqv"."alias_rules"."level" = 'global' and "eqv"."alias_rules"."vendor_id" is null and "eqv"."alias_rules"."model_id" is null and "eqv"."alias_rules"."equipment_id" is null)
        or ("eqv"."alias_rules"."level" = 'maker' and "eqv"."alias_rules"."vendor_id" is not null and "eqv"."alias_rules"."model_id" is null and "eqv"."alias_rules"."equipment_id" is null)
        or ("eqv"."alias_rules"."level" = 'model' and "eqv"."alias_rules"."vendor_id" is not null and "eqv"."alias_rules"."model_id" is not null and "eqv"."alias_rules"."equipment_id" is null)
        or ("eqv"."alias_rules"."level" = 'equipment' and "eqv"."alias_rules"."vendor_id" is null and "eqv"."alias_rules"."model_id" is null and "eqv"."alias_rules"."equipment_id" is not null)),
	CONSTRAINT "alias_rules_version_check" CHECK ("eqv"."alias_rules"."version" >= 1),
	CONSTRAINT "alias_rules_document_check" CHECK (jsonb_typeof("eqv"."alias_rules"."document") = 'object')
);
--> statement-breakpoint
CREATE TABLE "eqv"."baseline_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"equipment_id" text NOT NULL,
	"mapping_hash" text NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "baseline_inventory_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "baseline_inventory_workspace_equipment_hash_uq" UNIQUE("workspace_id","equipment_id","mapping_hash"),
	CONSTRAINT "baseline_inventory_document_check" CHECK (jsonb_typeof("eqv"."baseline_inventory"."document") = 'object')
);
--> statement-breakpoint
CREATE TABLE "eqv"."binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"equipment_id" text NOT NULL,
	"layout_id" text NOT NULL,
	"layout_revision" text NOT NULL,
	"mapping_hash" text NOT NULL,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "binding_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "binding_workspace_equipment_from_uq" UNIQUE("workspace_id","equipment_id","effective_from"),
	CONSTRAINT "binding_effective_from_check" CHECK ("eqv"."binding"."effective_from" ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$'),
	CONSTRAINT "binding_effective_to_check" CHECK ("eqv"."binding"."effective_to" is null or ("eqv"."binding"."effective_to" ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$' and "eqv"."binding"."effective_from" < "eqv"."binding"."effective_to")),
	CONSTRAINT "binding_layout_revision_check" CHECK ("eqv"."binding"."layout_revision" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "eqv"."mapping_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"equipment_id" text NOT NULL,
	"layout_id" text NOT NULL,
	"layout_revision" text NOT NULL,
	"hash" text NOT NULL,
	"document" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid NOT NULL,
	CONSTRAINT "mapping_version_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "mapping_version_workspace_equipment_hash_uq" UNIQUE("workspace_id","equipment_id","hash"),
	CONSTRAINT "mapping_version_hash_check" CHECK ("eqv"."mapping_version"."hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "mapping_version_layout_revision_check" CHECK ("eqv"."mapping_version"."layout_revision" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "mapping_version_document_check" CHECK (jsonb_typeof("eqv"."mapping_version"."document") = 'object')
);
--> statement-breakpoint
CREATE TABLE "eqv"."type_dictionary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"level" text NOT NULL,
	"vendor_id" uuid,
	"model_id" uuid,
	"document" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "type_dictionary_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "type_dictionary_workspace_scope_uq" UNIQUE NULLS NOT DISTINCT("workspace_id","level","vendor_id","model_id"),
	CONSTRAINT "type_dictionary_level_check" CHECK ("eqv"."type_dictionary"."level" in ('global', 'maker', 'model')),
	CONSTRAINT "type_dictionary_scope_check" CHECK (("eqv"."type_dictionary"."level" = 'global' and "eqv"."type_dictionary"."vendor_id" is null and "eqv"."type_dictionary"."model_id" is null)
        or ("eqv"."type_dictionary"."level" = 'maker' and "eqv"."type_dictionary"."vendor_id" is not null and "eqv"."type_dictionary"."model_id" is null)
        or ("eqv"."type_dictionary"."level" = 'model' and "eqv"."type_dictionary"."vendor_id" is not null and "eqv"."type_dictionary"."model_id" is not null)),
	CONSTRAINT "type_dictionary_version_check" CHECK ("eqv"."type_dictionary"."version" >= 1),
	CONSTRAINT "type_dictionary_document_check" CHECK (jsonb_typeof("eqv"."type_dictionary"."document") = 'object')
);
--> statement-breakpoint
ALTER TABLE "eqv"."alias_rules" ADD CONSTRAINT "alias_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."alias_rules" ADD CONSTRAINT "alias_rules_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."alias_rules" ADD CONSTRAINT "alias_rules_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."alias_rules" ADD CONSTRAINT "alias_rules_equipment_fk" FOREIGN KEY ("workspace_id","equipment_id") REFERENCES "eqv"."equipment"("workspace_id","equipment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."baseline_inventory" ADD CONSTRAINT "baseline_inventory_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."baseline_inventory" ADD CONSTRAINT "baseline_inventory_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."baseline_inventory" ADD CONSTRAINT "baseline_inventory_mapping_fk" FOREIGN KEY ("workspace_id","equipment_id","mapping_hash") REFERENCES "eqv"."mapping_version"("workspace_id","equipment_id","hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."binding" ADD CONSTRAINT "binding_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."binding" ADD CONSTRAINT "binding_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."binding" ADD CONSTRAINT "binding_equipment_fk" FOREIGN KEY ("workspace_id","equipment_id") REFERENCES "eqv"."equipment"("workspace_id","equipment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."binding" ADD CONSTRAINT "binding_layout_revision_fk" FOREIGN KEY ("workspace_id","layout_id","layout_revision") REFERENCES "eqv"."layout_revision"("workspace_id","layout_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."binding" ADD CONSTRAINT "binding_mapping_fk" FOREIGN KEY ("workspace_id","equipment_id","mapping_hash") REFERENCES "eqv"."mapping_version"("workspace_id","equipment_id","hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."mapping_version" ADD CONSTRAINT "mapping_version_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."mapping_version" ADD CONSTRAINT "mapping_version_published_by_actors_id_fk" FOREIGN KEY ("published_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."mapping_version" ADD CONSTRAINT "mapping_version_equipment_fk" FOREIGN KEY ("workspace_id","equipment_id") REFERENCES "eqv"."equipment"("workspace_id","equipment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."mapping_version" ADD CONSTRAINT "mapping_version_layout_revision_fk" FOREIGN KEY ("workspace_id","layout_id","layout_revision") REFERENCES "eqv"."layout_revision"("workspace_id","layout_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."type_dictionary" ADD CONSTRAINT "type_dictionary_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."type_dictionary" ADD CONSTRAINT "type_dictionary_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eqv"."type_dictionary" ADD CONSTRAINT "type_dictionary_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mapping_version_workspace_equipment_published_idx" ON "eqv"."mapping_version" USING btree ("workspace_id","equipment_id","published_at");--> statement-breakpoint
-- #1658 (ADR-0139): runtime walls of the Onboarding tables. platform_app: SELECT and INSERT everywhere, no DELETE anywhere. mapping_version and
-- baseline_inventory are immutable (no UPDATE). alias_rules and type_dictionary take a column-limited UPDATE (document, version and audit
-- columns; never the scope). binding takes UPDATE on effective_to only (closing the open latest Binding). Roles are not touched.
GRANT ALL ON eqv.alias_rules, eqv.type_dictionary, eqv.mapping_version, eqv.baseline_inventory, eqv.binding TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON eqv.alias_rules, eqv.type_dictionary, eqv.mapping_version, eqv.baseline_inventory, eqv.binding TO platform_app;
--> statement-breakpoint
GRANT UPDATE (document, version, updated_at, updated_by) ON eqv.alias_rules TO platform_app;
--> statement-breakpoint
GRANT UPDATE (document, version, updated_at, updated_by) ON eqv.type_dictionary TO platform_app;
--> statement-breakpoint
GRANT UPDATE (effective_to) ON eqv.binding TO platform_app;
--> statement-breakpoint
-- #1658: the three Onboarding audit subjects and capabilities join the projection allow-lists; the body is 0122 with exactly those additions
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
        'eqv_layout','eqv_layout_revision','eqv_template','eqv_alias_rules','eqv_type_dictionary','eqv_binding','api_token'])
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
          'lifecycle.project.manage','lifecycle.round.manage','knowledge.draft.create','validation.catalog.report','dataset.manage','dataset.suite.run','eqv.view','eqv.layout.edit','eqv.layout.publish','eqv.rules.edit','eqv.dictionary.global_edit','eqv.mapping.publish']))
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
