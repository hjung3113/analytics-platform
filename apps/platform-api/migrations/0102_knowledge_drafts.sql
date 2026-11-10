CREATE TABLE "knowledge"."draft_revision" (
	"workspace_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"draft_rev_no" integer NOT NULL,
	"proposal_json" jsonb NOT NULL,
	"payload_digest" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"author_actor_id" uuid NOT NULL,
	"author_auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_revision_pk" PRIMARY KEY("workspace_id","draft_id","draft_rev_no"),
	CONSTRAINT "draft_revision_rev_no_check" CHECK ("knowledge"."draft_revision"."draft_rev_no" >= 1),
	CONSTRAINT "draft_revision_proposal_check" CHECK (jsonb_typeof("knowledge"."draft_revision"."proposal_json") = 'object'),
	CONSTRAINT "draft_revision_digest_check" CHECK ("knowledge"."draft_revision"."payload_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "draft_revision_schema_version_check" CHECK ("knowledge"."draft_revision"."schema_version" >= 1),
	CONSTRAINT "draft_revision_author_auth_check" CHECK ("knowledge"."draft_revision"."author_auth" in ('session','token'))
);
--> statement-breakpoint
CREATE TABLE "knowledge"."draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"proposal_type" text NOT NULL,
	"target_item_id" uuid,
	"base_revision_no" integer,
	"owner_model_id" uuid,
	"owner_software_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"latest_draft_rev" integer DEFAULT 1 NOT NULL,
	"submitter_actor_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"close_reason" text,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "draft_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "draft_origin_check" CHECK ("knowledge"."draft"."origin" in ('human','ai','validator')),
	CONSTRAINT "draft_proposal_type_check" CHECK ("knowledge"."draft"."proposal_type" in ('create','revise')),
	CONSTRAINT "draft_proposal_pairing_check" CHECK (("knowledge"."draft"."proposal_type" = 'create' and "knowledge"."draft"."target_item_id" is null and "knowledge"."draft"."base_revision_no" is null) or ("knowledge"."draft"."proposal_type" = 'revise' and "knowledge"."draft"."target_item_id" is not null and "knowledge"."draft"."base_revision_no" is not null and "knowledge"."draft"."base_revision_no" >= 1)),
	CONSTRAINT "draft_owner_xor" CHECK (num_nonnulls("knowledge"."draft"."owner_model_id", "knowledge"."draft"."owner_software_id") = 1),
	CONSTRAINT "draft_status_check" CHECK ("knowledge"."draft"."status" in ('draft','submitted','changes_requested','approved','rejected','withdrawn')),
	CONSTRAINT "draft_latest_draft_rev_check" CHECK ("knowledge"."draft"."latest_draft_rev" >= 1),
	CONSTRAINT "draft_row_version_check" CHECK ("knowledge"."draft"."row_version" >= 1),
	CONSTRAINT "draft_close_reason_check" CHECK (coalesce(char_length("knowledge"."draft"."close_reason"), 0) <= 500),
	CONSTRAINT "draft_closed_check" CHECK (("knowledge"."draft"."status" in ('approved','rejected','withdrawn')) = ("knowledge"."draft"."closed_at" is not null and "knowledge"."draft"."closed_by" is not null))
);
--> statement-breakpoint
ALTER TABLE "knowledge"."draft_revision" ADD CONSTRAINT "draft_revision_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft_revision" ADD CONSTRAINT "draft_revision_author_actor_id_actors_id_fk" FOREIGN KEY ("author_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft_revision" ADD CONSTRAINT "draft_revision_draft_fk" FOREIGN KEY ("workspace_id","draft_id") REFERENCES "knowledge"."draft"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft" ADD CONSTRAINT "draft_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft" ADD CONSTRAINT "draft_submitter_actor_id_actors_id_fk" FOREIGN KEY ("submitter_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft" ADD CONSTRAINT "draft_closed_by_actors_id_fk" FOREIGN KEY ("closed_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft" ADD CONSTRAINT "draft_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft" ADD CONSTRAINT "draft_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft" ADD CONSTRAINT "draft_target_item_fk" FOREIGN KEY ("workspace_id","target_item_id") REFERENCES "knowledge"."knowledge_item"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft" ADD CONSTRAINT "draft_owner_model_fk" FOREIGN KEY ("workspace_id","owner_model_id") REFERENCES "knowledge"."equipment_model"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft" ADD CONSTRAINT "draft_owner_software_fk" FOREIGN KEY ("workspace_id","owner_software_id") REFERENCES "knowledge"."software_version"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_submitter_idx" ON "knowledge"."draft" USING btree ("workspace_id","submitter_actor_id","updated_at");--> statement-breakpoint
CREATE INDEX "draft_status_idx" ON "knowledge"."draft" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "draft_target_item_idx" ON "knowledge"."draft" USING btree ("workspace_id","target_item_id");
--> statement-breakpoint
-- #1198 a: knowledge drafts. The runtime role (platform_app) gets SELECT, INSERT on both tables and a column-limited
-- UPDATE on draft (status, revision counter, submit/close columns, row_version, audit columns). Never DELETE, and never
-- UPDATE on draft_revision. Roles are not touched. USAGE on schema knowledge already exists.
GRANT ALL ON knowledge.draft, knowledge.draft_revision TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON knowledge.draft, knowledge.draft_revision TO platform_app;
--> statement-breakpoint
GRANT UPDATE (status, latest_draft_rev, submitted_at, closed_at, closed_by, close_reason, row_version, updated_at, updated_by) ON knowledge.draft TO platform_app;
--> statement-breakpoint
-- The wall behind the column grant (the migrate role is not limited by it): identity and proposal-shape columns never
-- change, row_version rises by exactly 1 on EVERY update, latest_draft_rev only stays or rises by 1, a final draft
-- (approved, rejected, withdrawn) is frozen, and a status only moves along a legal pair. The list is kept textually
-- identical to LEGAL_DRAFT_STATUS_PAIRS (log-knowledge/domain/draft-transitions.ts, drift test). The pairs out of
-- `submitted` are the review decisions of node b; no service caller exists in node a.
CREATE FUNCTION knowledge.draft_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.origin IS DISTINCT FROM OLD.origin
		OR NEW.proposal_type IS DISTINCT FROM OLD.proposal_type OR NEW.target_item_id IS DISTINCT FROM OLD.target_item_id
		OR NEW.base_revision_no IS DISTINCT FROM OLD.base_revision_no OR NEW.owner_model_id IS DISTINCT FROM OLD.owner_model_id
		OR NEW.owner_software_id IS DISTINCT FROM OLD.owner_software_id OR NEW.submitter_actor_id IS DISTINCT FROM OLD.submitter_actor_id
		OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
		RAISE EXCEPTION 'knowledge draft % identity columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF OLD.status IN ('approved', 'rejected', 'withdrawn') THEN
		RAISE EXCEPTION 'knowledge draft % is % and final', OLD.id, OLD.status USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'knowledge draft % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.latest_draft_rev < OLD.latest_draft_rev OR NEW.latest_draft_rev > OLD.latest_draft_rev + 1 THEN
		RAISE EXCEPTION 'knowledge draft % latest_draft_rev can only stay or rise by 1', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
		-- LEGAL_DRAFT_STATUS_PAIRS begin
		(OLD.status = 'draft' AND NEW.status IN ('submitted', 'withdrawn'))
		OR (OLD.status = 'submitted' AND NEW.status IN ('approved', 'rejected', 'changes_requested', 'withdrawn'))
		OR (OLD.status = 'changes_requested' AND NEW.status IN ('submitted', 'withdrawn'))
		-- LEGAL_DRAFT_STATUS_PAIRS end
	) THEN
		RAISE EXCEPTION 'knowledge draft % cannot move from % to %', OLD.id, OLD.status, NEW.status USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER draft_guard BEFORE UPDATE ON knowledge.draft FOR EACH ROW EXECUTE FUNCTION knowledge.draft_guard();
--> statement-breakpoint
-- draft_revision is append-only: no UPDATE and no DELETE, for any role (the migrate role included).
CREATE FUNCTION knowledge.draft_revision_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION 'draft_revision is append-only (% refused)', TG_OP USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER draft_revision_append_only BEFORE UPDATE OR DELETE ON knowledge.draft_revision FOR EACH ROW EXECUTE FUNCTION knowledge.draft_revision_append_only();
--> statement-breakpoint
-- Audit projection: 0100 body + the subject type `knowledge_draft` and the capability `knowledge.draft.create`.
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
        'development_project','validation_round','knowledge_draft'])
      AND left(l.event_type, 15) <> 'survey_response'
      AND (l.detail ->> 'sensitive') IS DISTINCT FROM 'true'
      -- Permission rows: only the non-sensitive capabilities (CAPABILITY_META.sensitive = false in
      -- packages/shared); later lifecycle events carry no `sensitive` marker. No capability = excluded.
      AND (left(l.subject_type, 11) <> 'permission_' AND left(l.event_type, 11) <> 'permission_'
        OR (l.detail ->> 'capability') = ANY (ARRAY['workspace.read','voc.triage','voc.read',
          'finding.read','finding.manage','survey.read',
          'knowledge.catalog.manage','knowledge.catalog.import','knowledge.item.publish',
          'knowledge.spec.publish','voc.read_public','improvement.manage','voc.create',
          'lifecycle.project.manage','lifecycle.round.manage','knowledge.draft.create']))
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
