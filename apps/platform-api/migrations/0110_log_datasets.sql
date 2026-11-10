CREATE SCHEMA "log_datasets";
--> statement-breakpoint
CREATE TABLE "log_datasets"."dataset_candidate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"source_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proposal" jsonb NOT NULL,
	"proposed_by" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewer_actor_id" uuid,
	"reason" text,
	"dataset_id" uuid,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "dataset_candidate_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "dataset_candidate_origin_check" CHECK ("log_datasets"."dataset_candidate"."origin" in ('manual','round_evidence')),
	CONSTRAINT "dataset_candidate_status_check" CHECK ("log_datasets"."dataset_candidate"."status" in ('draft','approved','rejected')),
	CONSTRAINT "dataset_candidate_source_ref_check" CHECK (jsonb_typeof("log_datasets"."dataset_candidate"."source_ref") = 'object'),
	CONSTRAINT "dataset_candidate_proposal_check" CHECK (jsonb_typeof("log_datasets"."dataset_candidate"."proposal") = 'object'),
	CONSTRAINT "dataset_candidate_reason_check" CHECK (coalesce(char_length("log_datasets"."dataset_candidate"."reason"), 0) <= 2000),
	CONSTRAINT "dataset_candidate_row_version_check" CHECK ("log_datasets"."dataset_candidate"."row_version" >= 1),
	CONSTRAINT "dataset_candidate_decided_check" CHECK (("log_datasets"."dataset_candidate"."status" = 'draft') = ("log_datasets"."dataset_candidate"."decided_at" is null and "log_datasets"."dataset_candidate"."reviewer_actor_id" is null))
);
--> statement-breakpoint
CREATE TABLE "log_datasets"."dataset_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"sample_set" jsonb NOT NULL,
	"sample_manifest_digest" text NOT NULL,
	"input_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "dataset_revision_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "dataset_revision_dataset_seq_uq" UNIQUE("workspace_id","dataset_id","seq"),
	CONSTRAINT "dataset_revision_seq_check" CHECK ("log_datasets"."dataset_revision"."seq" >= 1),
	CONSTRAINT "dataset_revision_sample_set_check" CHECK (jsonb_typeof("log_datasets"."dataset_revision"."sample_set") = 'object'),
	CONSTRAINT "dataset_revision_digest_check" CHECK ("log_datasets"."dataset_revision"."sample_manifest_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "dataset_revision_input_meta_check" CHECK (jsonb_typeof("log_datasets"."dataset_revision"."input_meta") = 'object'),
	CONSTRAINT "dataset_revision_note_check" CHECK (coalesce(char_length("log_datasets"."dataset_revision"."note"), 0) <= 2000)
);
--> statement-breakpoint
CREATE TABLE "log_datasets"."dataset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"owner_actor_id" uuid NOT NULL,
	"share_scope" text DEFAULT 'private' NOT NULL,
	"model_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"scenario_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "dataset_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "dataset_name_check" CHECK (char_length("log_datasets"."dataset"."name") between 1 and 200),
	CONSTRAINT "dataset_purpose_check" CHECK (char_length("log_datasets"."dataset"."purpose") <= 2000),
	CONSTRAINT "dataset_share_scope_check" CHECK ("log_datasets"."dataset"."share_scope" in ('private','workspace')),
	CONSTRAINT "dataset_status_check" CHECK ("log_datasets"."dataset"."status" in ('active','archived')),
	CONSTRAINT "dataset_scenario_tags_check" CHECK ("log_datasets"."dataset"."scenario_tags" <@ array['normal','exception','boundary','regression','file_boundary','carryover','partial_support']::text[]),
	CONSTRAINT "dataset_row_version_check" CHECK ("log_datasets"."dataset"."row_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "log_datasets"."dataset_candidate" ADD CONSTRAINT "dataset_candidate_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."dataset_candidate" ADD CONSTRAINT "dataset_candidate_proposed_by_actors_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."dataset_candidate" ADD CONSTRAINT "dataset_candidate_reviewer_actor_id_actors_id_fk" FOREIGN KEY ("reviewer_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."dataset_candidate" ADD CONSTRAINT "dataset_candidate_dataset_fk" FOREIGN KEY ("workspace_id","dataset_id") REFERENCES "log_datasets"."dataset"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."dataset_revision" ADD CONSTRAINT "dataset_revision_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."dataset_revision" ADD CONSTRAINT "dataset_revision_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."dataset_revision" ADD CONSTRAINT "dataset_revision_dataset_fk" FOREIGN KEY ("workspace_id","dataset_id") REFERENCES "log_datasets"."dataset"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."dataset" ADD CONSTRAINT "dataset_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."dataset" ADD CONSTRAINT "dataset_owner_actor_id_actors_id_fk" FOREIGN KEY ("owner_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."dataset" ADD CONSTRAINT "dataset_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_datasets"."dataset" ADD CONSTRAINT "dataset_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dataset_candidate_status_idx" ON "log_datasets"."dataset_candidate" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_revision_dataset_digest_uq" ON "log_datasets"."dataset_revision" USING btree ("workspace_id","dataset_id","sample_manifest_digest");--> statement-breakpoint
CREATE INDEX "dataset_workspace_status_idx" ON "log_datasets"."dataset" USING btree ("workspace_id","status","updated_at");
--> statement-breakpoint
-- #1477 D-a: log test datasets. Grants, guard triggers and the audit projection. The runtime role (platform_app) gets INSERT on
-- the three tables, a column-limited UPDATE on dataset and dataset_candidate, and never DELETE anywhere and never UPDATE on
-- dataset_revision. Roles are not touched.
GRANT USAGE ON SCHEMA log_datasets TO platform_app, platform_migrate;
--> statement-breakpoint
GRANT ALL ON log_datasets.dataset, log_datasets.dataset_revision, log_datasets.dataset_candidate TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_datasets.dataset, log_datasets.dataset_revision, log_datasets.dataset_candidate TO platform_app;
--> statement-breakpoint
GRANT UPDATE (name, purpose, share_scope, model_ids, scenario_tags, status, row_version, updated_at, updated_by) ON log_datasets.dataset TO platform_app;
--> statement-breakpoint
GRANT UPDATE (status, reviewer_actor_id, reason, dataset_id, decided_at, row_version) ON log_datasets.dataset_candidate TO platform_app;
--> statement-breakpoint
-- The wall behind the column grant (the migrate role is not limited by it): identity columns never change, row_version rises by
-- exactly 1 on EVERY update, and an archived dataset is final.
CREATE FUNCTION log_datasets.dataset_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.owner_actor_id IS DISTINCT FROM OLD.owner_actor_id
		OR NEW.synthetic IS DISTINCT FROM OLD.synthetic OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
		RAISE EXCEPTION 'dataset % identity columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF OLD.status = 'archived' THEN
		RAISE EXCEPTION 'dataset % is archived and final', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'dataset % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER dataset_guard BEFORE UPDATE ON log_datasets.dataset FOR EACH ROW EXECUTE FUNCTION log_datasets.dataset_guard();
--> statement-breakpoint
-- dataset_revision is immutable: no UPDATE and no DELETE, for any role (the migrate role included). A different file list is a new revision.
CREATE FUNCTION log_datasets.revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION 'dataset_revision is immutable (% refused)', TG_OP USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER dataset_revision_immutable BEFORE UPDATE OR DELETE ON log_datasets.dataset_revision FOR EACH ROW EXECUTE FUNCTION log_datasets.revision_immutable();
--> statement-breakpoint
-- A candidate keeps its origin, source reference and proposal from insert; only draft -> approved | rejected (with reviewer, reason,
-- decided_at, the created dataset and row_version + 1) may change, and a decided candidate is final.
CREATE FUNCTION log_datasets.candidate_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.origin IS DISTINCT FROM OLD.origin
		OR NEW.source_ref IS DISTINCT FROM OLD.source_ref OR NEW.proposal IS DISTINCT FROM OLD.proposal
		OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'dataset candidate % input columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF OLD.status <> 'draft' THEN
		RAISE EXCEPTION 'dataset candidate % is decided and final', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'dataset candidate % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER dataset_candidate_guard BEFORE UPDATE ON log_datasets.dataset_candidate FOR EACH ROW EXECUTE FUNCTION log_datasets.candidate_guard();
--> statement-breakpoint
-- #1477 D-a audit projection: the 0109 body + the capability `dataset.manage` (non-sensitive) in the permission-row allow-list ONLY. The dataset subject types (`dataset`, `dataset_revision`, `dataset_candidate`) are deliberately NOT projected: a private dataset's ids must not reach `console:access` Admins; its events stay in `core.audit_log` until a caller-aware projection exists.
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
          'lifecycle.project.manage','lifecycle.round.manage','knowledge.draft.create','validation.catalog.report','dataset.manage']))
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

