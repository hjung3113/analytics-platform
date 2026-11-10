CREATE SCHEMA "log_lifecycle";
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."development_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"before" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text,
	"actor_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "development_event_project_seq_uq" UNIQUE("workspace_id","project_id","seq"),
	CONSTRAINT "development_event_seq_check" CHECK ("log_lifecycle"."development_event"."seq" >= 1),
	CONSTRAINT "development_event_kind_check" CHECK ("log_lifecycle"."development_event"."kind" in ('created','stage_changed','owner_changed','target_changed','cancelled','reopened','gate_decided')),
	CONSTRAINT "development_event_before_check" CHECK (jsonb_typeof("log_lifecycle"."development_event"."before") = 'object'),
	CONSTRAINT "development_event_after_check" CHECK (jsonb_typeof("log_lifecycle"."development_event"."after") = 'object'),
	CONSTRAINT "development_event_reason_check" CHECK (coalesce(char_length("log_lifecycle"."development_event"."reason"), 0) <= 2000)
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."development_project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"software_id" uuid,
	"kind" text NOT NULL,
	"stage" text DEFAULT 'registered' NOT NULL,
	"owner_actor_id" uuid NOT NULL,
	"target_date" date,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "development_project_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "development_project_kind_check" CHECK ("log_lifecycle"."development_project"."kind" in ('new','redevelopment')),
	CONSTRAINT "development_project_stage_check" CHECK ("log_lifecycle"."development_project"."stage" in ('registered','kickoff','alpha','beta','completed','cancelled')),
	CONSTRAINT "development_project_row_version_check" CHECK ("log_lifecycle"."development_project"."row_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."validation_round" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"stage" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"sample_set" jsonb NOT NULL,
	"sample_manifest_digest" text NOT NULL,
	"spec_pin" jsonb,
	"note" text,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	CONSTRAINT "validation_round_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "validation_round_project_seq_uq" UNIQUE("workspace_id","project_id","seq"),
	CONSTRAINT "validation_round_seq_check" CHECK ("log_lifecycle"."validation_round"."seq" >= 1),
	CONSTRAINT "validation_round_stage_check" CHECK ("log_lifecycle"."validation_round"."stage" in ('registered','kickoff','alpha','beta')),
	CONSTRAINT "validation_round_status_check" CHECK ("log_lifecycle"."validation_round"."status" in ('open','closed')),
	CONSTRAINT "validation_round_sample_set_check" CHECK (jsonb_typeof("log_lifecycle"."validation_round"."sample_set") = 'object'),
	CONSTRAINT "validation_round_digest_check" CHECK ("log_lifecycle"."validation_round"."sample_manifest_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "validation_round_spec_pin_check" CHECK ("log_lifecycle"."validation_round"."spec_pin" is null or jsonb_typeof("log_lifecycle"."validation_round"."spec_pin") = 'object'),
	CONSTRAINT "validation_round_note_check" CHECK (coalesce(char_length("log_lifecycle"."validation_round"."note"), 0) <= 2000),
	CONSTRAINT "validation_round_row_version_check" CHECK ("log_lifecycle"."validation_round"."row_version" >= 1),
	CONSTRAINT "validation_round_closed_check" CHECK (("log_lifecycle"."validation_round"."status" = 'closed') = ("log_lifecycle"."validation_round"."closed_at" is not null and "log_lifecycle"."validation_round"."closed_by" is not null))
);
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."development_event" ADD CONSTRAINT "development_event_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."development_event" ADD CONSTRAINT "development_event_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."development_event" ADD CONSTRAINT "development_event_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "log_lifecycle"."development_project"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."development_project" ADD CONSTRAINT "development_project_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."development_project" ADD CONSTRAINT "development_project_owner_actor_id_actors_id_fk" FOREIGN KEY ("owner_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."development_project" ADD CONSTRAINT "development_project_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."development_project" ADD CONSTRAINT "development_project_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_round" ADD CONSTRAINT "validation_round_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_round" ADD CONSTRAINT "validation_round_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_round" ADD CONSTRAINT "validation_round_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_round" ADD CONSTRAINT "validation_round_closed_by_actors_id_fk" FOREIGN KEY ("closed_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_round" ADD CONSTRAINT "validation_round_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "log_lifecycle"."development_project"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "development_project_open_model_uq" ON "log_lifecycle"."development_project" USING btree ("workspace_id","model_id") WHERE "log_lifecycle"."development_project"."stage" not in ('completed','cancelled');--> statement-breakpoint
CREATE INDEX "development_project_model_idx" ON "log_lifecycle"."development_project" USING btree ("workspace_id","model_id");--> statement-breakpoint
CREATE INDEX "development_project_stage_idx" ON "log_lifecycle"."development_project" USING btree ("workspace_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "validation_round_open_project_uq" ON "log_lifecycle"."validation_round" USING btree ("workspace_id","project_id") WHERE "log_lifecycle"."validation_round"."status" = 'open';--> statement-breakpoint
CREATE INDEX "validation_round_project_idx" ON "log_lifecycle"."validation_round" USING btree ("workspace_id","project_id","seq");
--> statement-breakpoint
-- #1444 c: log lifecycle. Grants, guard triggers and the audit projection. The runtime role (platform_app) gets INSERT on
-- the three tables, a column-limited UPDATE on development_project and validation_round, and never DELETE anywhere and
-- never UPDATE on development_event. Roles are not touched.
GRANT USAGE ON SCHEMA log_lifecycle TO platform_app, platform_migrate;
--> statement-breakpoint
GRANT ALL ON log_lifecycle.development_project, log_lifecycle.development_event, log_lifecycle.validation_round TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.development_project, log_lifecycle.development_event, log_lifecycle.validation_round TO platform_app;
--> statement-breakpoint
GRANT UPDATE (software_id, stage, owner_actor_id, target_date, row_version, updated_at, updated_by) ON log_lifecycle.development_project TO platform_app;
--> statement-breakpoint
GRANT UPDATE (status, closed_at, closed_by, row_version, updated_at, updated_by) ON log_lifecycle.validation_round TO platform_app;
--> statement-breakpoint
-- The wall behind the column grant (the migrate role is not limited by it): identity columns never change, row_version
-- rises by exactly 1 on EVERY update, and a stage only moves along a legal pair. The pairs are the union of
-- `projectSetStage` (forward one step, `* -> cancelled`) and `projectReopen` (`cancelled -> an open stage`,
-- `completed -> beta`); `beta -> completed` is allowed here because only the Gate (node e) may call it, which the
-- service enforces. The list is kept textually identical to LEGAL_STAGE_PAIRS (domain/stage-transitions.ts, drift test).
CREATE FUNCTION log_lifecycle.project_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.model_id IS DISTINCT FROM OLD.model_id
		OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
		RAISE EXCEPTION 'development project % identity columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'development project % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.stage IS DISTINCT FROM OLD.stage AND NOT (
		-- LEGAL_STAGE_PAIRS begin
		(OLD.stage = 'registered' AND NEW.stage IN ('kickoff', 'cancelled'))
		OR (OLD.stage = 'kickoff' AND NEW.stage IN ('alpha', 'cancelled'))
		OR (OLD.stage = 'alpha' AND NEW.stage IN ('beta', 'cancelled'))
		OR (OLD.stage = 'beta' AND NEW.stage IN ('completed', 'cancelled'))
		OR (OLD.stage = 'cancelled' AND NEW.stage IN ('registered', 'kickoff', 'alpha', 'beta'))
		OR (OLD.stage = 'completed' AND NEW.stage IN ('beta'))
		-- LEGAL_STAGE_PAIRS end
	) THEN
		RAISE EXCEPTION 'development project % cannot move from % to %', OLD.id, OLD.stage, NEW.stage USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER development_project_guard BEFORE UPDATE ON log_lifecycle.development_project FOR EACH ROW EXECUTE FUNCTION log_lifecycle.project_guard();
--> statement-breakpoint
-- development_event is append-only: no UPDATE and no DELETE, for any role (the migrate role included).
CREATE FUNCTION log_lifecycle.event_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION 'development_event is append-only (% refused)', TG_OP USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER development_event_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.development_event FOR EACH ROW EXECUTE FUNCTION log_lifecycle.event_append_only();
--> statement-breakpoint
-- A round keeps its sample set, spec pin, digest, stage, seq and note from insert; only status open -> closed (with
-- closed_*, updated_*, row_version + 1) may change, and a closed round is final.
CREATE FUNCTION log_lifecycle.round_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
		OR NEW.seq IS DISTINCT FROM OLD.seq OR NEW.stage IS DISTINCT FROM OLD.stage
		OR NEW.sample_set IS DISTINCT FROM OLD.sample_set OR NEW.sample_manifest_digest IS DISTINCT FROM OLD.sample_manifest_digest
		OR NEW.spec_pin IS DISTINCT FROM OLD.spec_pin OR NEW.note IS DISTINCT FROM OLD.note
		OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
		RAISE EXCEPTION 'validation round % input columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF OLD.status = 'closed' THEN
		RAISE EXCEPTION 'validation round % is closed and final', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'validation round % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER validation_round_guard BEFORE UPDATE ON log_lifecycle.validation_round FOR EACH ROW EXECUTE FUNCTION log_lifecycle.round_guard();
--> statement-breakpoint
-- Audit projection: 0097 body + the subject types `development_project` / `validation_round` and the capabilities
-- `lifecycle.project.manage` / `lifecycle.round.manage`.
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
        'development_project','validation_round'])
      AND left(l.event_type, 15) <> 'survey_response'
      AND (l.detail ->> 'sensitive') IS DISTINCT FROM 'true'
      -- Permission rows: only the non-sensitive capabilities (CAPABILITY_META.sensitive = false in
      -- packages/shared); later lifecycle events carry no `sensitive` marker. No capability = excluded.
      AND (left(l.subject_type, 11) <> 'permission_' AND left(l.event_type, 11) <> 'permission_'
        OR (l.detail ->> 'capability') = ANY (ARRAY['workspace.read','voc.triage','voc.read',
          'finding.read','finding.manage','survey.read',
          'knowledge.catalog.manage','knowledge.catalog.import','knowledge.item.publish',
          'knowledge.spec.publish','voc.read_public','improvement.manage','voc.create',
          'lifecycle.project.manage','lifecycle.round.manage']))
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
