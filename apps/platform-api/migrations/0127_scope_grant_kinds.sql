-- ADR-0154: defaults backfill existing rows as managed_system; no history or role changes.
-- Rollback: forward fix; dropping kind columns requires an explicit disposition of site/room history.
DROP INDEX "permission"."permission_grants_active_uq";--> statement-breakpoint
DROP INDEX "permission"."permission_requests_active_uq";--> statement-breakpoint
ALTER TABLE "permission"."permission_grants" ADD COLUMN "scope_kind" text DEFAULT 'managed_system' NOT NULL;--> statement-breakpoint
ALTER TABLE "permission"."permission_grants" ADD COLUMN "scope_site" text;--> statement-breakpoint
ALTER TABLE "permission"."permission_grants" ADD COLUMN "scope_room" text;--> statement-breakpoint
ALTER TABLE "permission"."permission_requests" ADD COLUMN "requested_scope_kind" text DEFAULT 'managed_system' NOT NULL;--> statement-breakpoint
ALTER TABLE "permission"."permission_requests" ADD COLUMN "requested_scope_site" text;--> statement-breakpoint
ALTER TABLE "permission"."permission_requests" ADD COLUMN "requested_scope_room" text;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_active_uq" ON "permission"."permission_grants" USING btree (
  "workspace_id",
  "actor_id",
  "capability",
  "scope_kind",
  coalesce("managed_system_id", '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce("scope_site", ''),
  coalesce("scope_room", ''),
  coalesce("object_type", ''),
  coalesce("object_id", '00000000-0000-0000-0000-000000000000'::uuid)
) WHERE "revoked_at" is null AND "superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_requests_active_uq" ON "permission"."permission_requests" USING btree (
  "workspace_id",
  "requester_actor_id",
  "requested_capability",
  "requested_scope_kind",
  coalesce("requested_managed_system_id", '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce("requested_scope_site", ''),
  coalesce("requested_scope_room", ''),
  coalesce("requested_object_type", ''),
  coalesce("requested_object_id", '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce("source_object_type", ''),
  coalesce("source_object_id", '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce("source_action_id", '')
) WHERE "status" in ('pending','needs_more_info');--> statement-breakpoint
ALTER TABLE "permission"."permission_grants" ADD CONSTRAINT "permission_grants_scope_kind_check" CHECK ((
      ("permission"."permission_grants"."scope_kind" = 'managed_system' AND "permission"."permission_grants"."scope_site" IS NULL AND "permission"."permission_grants"."scope_room" IS NULL AND "permission"."permission_grants"."capability" <> 'scope.read')
      OR ("permission"."permission_grants"."scope_kind" = 'site' AND "permission"."permission_grants"."capability" = 'scope.read' AND "permission"."permission_grants"."managed_system_id" IS NULL AND "permission"."permission_grants"."scope_room" IS NULL AND "permission"."permission_grants"."scope_site" IS NOT NULL AND btrim("permission"."permission_grants"."scope_site") <> '')
      OR ("permission"."permission_grants"."scope_kind" = 'site_room' AND "permission"."permission_grants"."capability" = 'scope.read' AND "permission"."permission_grants"."managed_system_id" IS NULL AND "permission"."permission_grants"."scope_site" IS NOT NULL AND btrim("permission"."permission_grants"."scope_site") <> '' AND "permission"."permission_grants"."scope_room" IS NOT NULL AND btrim("permission"."permission_grants"."scope_room") <> '')
    ));--> statement-breakpoint
ALTER TABLE "permission"."permission_requests" ADD CONSTRAINT "permission_requests_scope_kind_check" CHECK ((
      ("permission"."permission_requests"."requested_scope_kind" = 'managed_system' AND "permission"."permission_requests"."requested_scope_site" IS NULL AND "permission"."permission_requests"."requested_scope_room" IS NULL AND "permission"."permission_requests"."requested_capability" <> 'scope.read')
      OR ("permission"."permission_requests"."requested_scope_kind" = 'site' AND "permission"."permission_requests"."requested_capability" = 'scope.read' AND "permission"."permission_requests"."requested_managed_system_id" IS NULL AND "permission"."permission_requests"."requested_scope_room" IS NULL AND "permission"."permission_requests"."requested_scope_site" IS NOT NULL AND btrim("permission"."permission_requests"."requested_scope_site") <> '')
      OR ("permission"."permission_requests"."requested_scope_kind" = 'site_room' AND "permission"."permission_requests"."requested_capability" = 'scope.read' AND "permission"."permission_requests"."requested_managed_system_id" IS NULL AND "permission"."permission_requests"."requested_scope_site" IS NOT NULL AND btrim("permission"."permission_requests"."requested_scope_site") <> '' AND "permission"."permission_requests"."requested_scope_room" IS NOT NULL AND btrim("permission"."permission_requests"."requested_scope_room") <> '')
    ));
--> statement-breakpoint
-- ADR-0154: scope.read lifecycle rows follow the existing non-sensitive audit rule.
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
        OR (l.detail ->> 'capability') = ANY (ARRAY['scope.read','workspace.read','voc.triage','voc.read',
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
