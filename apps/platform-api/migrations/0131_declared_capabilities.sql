-- ADR-0157 (#1902): declared capabilities. A table of the bundle's declared capabilities (`capability`, `sensitive`) owned by
-- the audit-function owner, a SECURITY DEFINER sync function the app executes at boot (it holds no table privilege), and
-- the 0130 audit projection body verbatim apart from one `OR` branch that adds non-sensitive declared capabilities.
-- The platform allow-list stays in the function; the function signature is unchanged.
-- Rollback: re-create the 0130 body of core.platform_audit_events, then DROP FUNCTION core.sync_declared_capabilities(text[],boolean[]) and DROP TABLE core.declared_capabilities. Grant and request rows of declared names are not deleted; judgment never reads them without a declaration.
GRANT CREATE ON SCHEMA core TO platform_core_audit_reader_owner;
--> statement-breakpoint
SET ROLE platform_core_audit_reader_owner;
--> statement-breakpoint
CREATE TABLE core.declared_capabilities (
  capability text PRIMARY KEY CONSTRAINT declared_capabilities_prefix_ck
    CHECK (length(capability) <= 64 AND capability ~ '^ext(\.[a-z0-9_]+){2,}$'),
  sensitive boolean NOT NULL
);
--> statement-breakpoint
REVOKE ALL ON core.declared_capabilities FROM PUBLIC;
--> statement-breakpoint
-- Boot sync (one statement, one transaction): rows the bundle no longer declares are deleted, present rows upserted.
CREATE OR REPLACE FUNCTION core.sync_declared_capabilities(p_capabilities text[], p_sensitive boolean[])
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF coalesce(array_length(p_capabilities, 1), 0) <> coalesce(array_length(p_sensitive, 1), 0) THEN
    RAISE EXCEPTION 'declared capability arrays differ in length';
  END IF;
  DELETE FROM core.declared_capabilities d WHERE d.capability <> ALL (coalesce(p_capabilities, ARRAY[]::text[]));
  INSERT INTO core.declared_capabilities (capability, sensitive)
    SELECT u.c, u.s FROM unnest(p_capabilities, p_sensitive) AS u(c, s)
  ON CONFLICT (capability) DO UPDATE SET sensitive = EXCLUDED.sensitive;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.sync_declared_capabilities(text[],boolean[]) FROM PUBLIC, platform_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.sync_declared_capabilities(text[],boolean[]) TO platform_app;
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
          'lifecycle.project.manage','lifecycle.round.manage','knowledge.draft.create','validation.catalog.report','dataset.manage','dataset.suite.run','eqv.view','eqv.layout.edit','eqv.layout.publish','eqv.rules.edit','eqv.dictionary.global_edit','eqv.mapping.publish','eqv.window.import','lifecycle.issue.contribute','lifecycle.issue.link','lifecycle.issue.triage'])
        -- ADR-0157 decision 8: a non-sensitive capability the deployment bundle declares. The prefix is re-checked here,
        -- so a platform name in the table (barred by its CHECK as well) never releases a row.
        OR (left(l.detail ->> 'capability', 4) = 'ext.' AND EXISTS (SELECT 1 FROM core.declared_capabilities dc
          WHERE dc.capability = (l.detail ->> 'capability') AND dc.sensitive = false)))
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
