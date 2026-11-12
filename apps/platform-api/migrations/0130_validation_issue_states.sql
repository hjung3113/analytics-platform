ALTER TABLE "log_lifecycle"."validation_issue_occurrence" ADD CONSTRAINT "validation_issue_occurrence_issue_ownership_uq" UNIQUE("workspace_id","issue_id","id");
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."validation_issue_transition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"duplicate_of_issue_id" uuid,
	"reason" text,
	"assignee_actor_id" uuid,
	"basis_comment_id" uuid,
	"occurrence_id" uuid,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_issue_transition_seq_uq" UNIQUE("issue_id","seq"),
	CONSTRAINT "validation_issue_transition_state_check" CHECK ("log_lifecycle"."validation_issue_transition"."from_state" in ('reported','investigating','fix_requested','vendor_inquiry','on_hold','fix_verified','by_design','waived','dismissed') and "log_lifecycle"."validation_issue_transition"."to_state" in ('reported','investigating','fix_requested','vendor_inquiry','on_hold','fix_verified','by_design','waived','dismissed') and "log_lifecycle"."validation_issue_transition"."from_state" <> "log_lifecycle"."validation_issue_transition"."to_state"),
	CONSTRAINT "validation_issue_transition_seq_check" CHECK ("log_lifecycle"."validation_issue_transition"."seq" >= 1 and ("log_lifecycle"."validation_issue_transition"."seq" <> 1 or "log_lifecycle"."validation_issue_transition"."from_state" = 'reported')),
	CONSTRAINT "validation_issue_transition_reason_check" CHECK (("log_lifecycle"."validation_issue_transition"."reason" is null or char_length("log_lifecycle"."validation_issue_transition"."reason") between 1 and 4000) and ("log_lifecycle"."validation_issue_transition"."reason" is not null or ("log_lifecycle"."validation_issue_transition"."seq" = 1 and "log_lifecycle"."validation_issue_transition"."to_state" <> 'dismissed'))),
	CONSTRAINT "validation_issue_transition_assignee_check" CHECK ("log_lifecycle"."validation_issue_transition"."assignee_actor_id" is not null or ("log_lifecycle"."validation_issue_transition"."to_state" = 'dismissed' and "log_lifecycle"."validation_issue_transition"."from_state" = 'reported')),
	CONSTRAINT "validation_issue_transition_basis_check" CHECK ("log_lifecycle"."validation_issue_transition"."basis_comment_id" is not null or not ("log_lifecycle"."validation_issue_transition"."to_state" in ('on_hold', 'waived') or ("log_lifecycle"."validation_issue_transition"."to_state" = 'by_design' and "log_lifecycle"."validation_issue_transition"."from_state" = 'vendor_inquiry'))),
	CONSTRAINT "validation_issue_transition_occurrence_check" CHECK (("log_lifecycle"."validation_issue_transition"."occurrence_id" is not null) = ("log_lifecycle"."validation_issue_transition"."to_state" = 'fix_verified')),
	CONSTRAINT "validation_issue_transition_duplicate_check" CHECK ("log_lifecycle"."validation_issue_transition"."duplicate_of_issue_id" is null or ("log_lifecycle"."validation_issue_transition"."to_state" = 'dismissed' and "log_lifecycle"."validation_issue_transition"."duplicate_of_issue_id" <> "log_lifecycle"."validation_issue_transition"."issue_id"))
);
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_transition" ADD CONSTRAINT "validation_issue_transition_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_transition" ADD CONSTRAINT "validation_issue_transition_assignee_actor_id_actors_id_fk" FOREIGN KEY ("assignee_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_transition" ADD CONSTRAINT "validation_issue_transition_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_transition" ADD CONSTRAINT "validation_issue_transition_issue_fk" FOREIGN KEY ("workspace_id","project_id","issue_id") REFERENCES "log_lifecycle"."validation_issue"("workspace_id","project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_transition" ADD CONSTRAINT "validation_issue_transition_duplicate_fk" FOREIGN KEY ("workspace_id","project_id","duplicate_of_issue_id") REFERENCES "log_lifecycle"."validation_issue"("workspace_id","project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_transition" ADD CONSTRAINT "validation_issue_transition_basis_fk" FOREIGN KEY ("workspace_id","issue_id","basis_comment_id") REFERENCES "log_lifecycle"."validation_issue_comment"("workspace_id","issue_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_transition" ADD CONSTRAINT "validation_issue_transition_occurrence_fk" FOREIGN KEY ("workspace_id","issue_id","occurrence_id") REFERENCES "log_lifecycle"."validation_issue_occurrence"("workspace_id","issue_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "validation_issue_transition_page_idx" ON "log_lifecycle"."validation_issue_transition" USING btree ("workspace_id","issue_id","seq");
--> statement-breakpoint
-- #1808 H3: transitions are insert-only like the other human records. No change to existing grants or roles.
GRANT ALL ON log_lifecycle.validation_issue_transition TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.validation_issue_transition TO platform_app;
--> statement-breakpoint
CREATE TRIGGER validation_issue_transition_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.validation_issue_transition FOR EACH ROW EXECUTE FUNCTION log_lifecycle.validation_issue_append_only_guard();
--> statement-breakpoint
-- A transition continues the chain of its issue: seq is the previous seq + 1 and from_state is the previous to_state
-- (`reported` for seq 1); the pair is legal; `fix_verified` cites an occurrence whose Round was created after the issue
-- entered `fix_requested` (the previous transition). Never reads a rule result, verdict, opinion or Gate.
CREATE FUNCTION log_lifecycle.validation_issue_transition_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
	prev_state text;
	prev_at timestamptz;
BEGIN
	IF NEW.seq > 1 THEN
		SELECT t.to_state, t.created_at INTO prev_state, prev_at FROM log_lifecycle.validation_issue_transition t
			WHERE t.workspace_id = NEW.workspace_id AND t.issue_id = NEW.issue_id AND t.seq = NEW.seq - 1;
		IF prev_state IS NULL OR prev_state IS DISTINCT FROM NEW.from_state THEN
			RAISE EXCEPTION 'validation issue % transition % does not continue the chain', NEW.issue_id, NEW.seq USING ERRCODE = '23514';
		END IF;
	END IF;
	IF NOT (
		-- LEGAL_ISSUE_PAIRS begin
		(NEW.from_state = 'reported' AND NEW.to_state IN ('investigating', 'dismissed'))
		OR (NEW.from_state = 'investigating' AND NEW.to_state IN ('fix_requested', 'vendor_inquiry', 'on_hold', 'by_design', 'waived', 'dismissed'))
		OR (NEW.from_state = 'fix_requested' AND NEW.to_state IN ('investigating', 'vendor_inquiry', 'on_hold', 'waived', 'fix_verified'))
		OR (NEW.from_state = 'vendor_inquiry' AND NEW.to_state IN ('investigating', 'fix_requested', 'on_hold', 'by_design', 'waived'))
		OR (NEW.from_state = 'on_hold' AND NEW.to_state IN ('investigating'))
		OR (NEW.from_state = 'fix_verified' AND NEW.to_state IN ('investigating'))
		-- LEGAL_ISSUE_PAIRS end
	) THEN
		RAISE EXCEPTION 'validation issue % cannot move from % to %', NEW.issue_id, NEW.from_state, NEW.to_state USING ERRCODE = '23514';
	END IF;
	IF NEW.to_state = 'fix_verified' AND NOT EXISTS (
		SELECT 1 FROM log_lifecycle.validation_issue_occurrence o JOIN log_lifecycle.validation_round r
			ON r.workspace_id = o.workspace_id AND r.id = o.round_id
		WHERE o.workspace_id = NEW.workspace_id AND o.issue_id = NEW.issue_id AND o.id = NEW.occurrence_id AND r.created_at > prev_at
	) THEN
		RAISE EXCEPTION 'validation issue % fix_verified needs an occurrence of a Round opened after fix_requested', NEW.issue_id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER validation_issue_transition_guard BEFORE INSERT ON log_lifecycle.validation_issue_transition FOR EACH ROW EXECUTE FUNCTION log_lifecycle.validation_issue_transition_guard();
--> statement-breakpoint
-- Audit projection: the 0129 body verbatim apart from the non-sensitive capability `lifecycle.issue.triage` appended to
-- the permission-row allow-list. Grants and ownership as in 0129. Rollback: forward fix (re-create the 0129 body).
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
          'lifecycle.project.manage','lifecycle.round.manage','knowledge.draft.create','validation.catalog.report','dataset.manage','dataset.suite.run','eqv.view','eqv.layout.edit','eqv.layout.publish','eqv.rules.edit','eqv.dictionary.global_edit','eqv.mapping.publish','eqv.window.import','lifecycle.issue.contribute','lifecycle.issue.link','lifecycle.issue.triage']))
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
