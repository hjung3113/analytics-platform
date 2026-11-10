ALTER TABLE "knowledge"."model_spec_revision" ADD COLUMN "row_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge"."model_spec_revision" ADD COLUMN "reject_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "model_spec_revision_open_draft_uq" ON "knowledge"."model_spec_revision" USING btree ("workspace_id","model_id") WHERE "knowledge"."model_spec_revision"."state" = 'draft';--> statement-breakpoint
ALTER TABLE "knowledge"."model_spec_revision" ADD CONSTRAINT "model_spec_revision_reject_reason_check" CHECK ("knowledge"."model_spec_revision"."reject_reason" is null or char_length("knowledge"."model_spec_revision"."reject_reason") <= 500);
--> statement-breakpoint
-- #1196 b1 (ADR-0111 decision 1): the draft -> published | rejected transition and draft saves. The runtime role gets a
-- column-limited UPDATE; the trigger below is the real wall: a published or rejected revision never changes again, the
-- identity columns never change, a draft only moves to published / rejected or stays a draft with a higher row_version.
-- No DELETE grant exists on any of the four tables.
GRANT UPDATE (state, content_sha256, published_by, published_at, row_version, reject_reason, source_doc_ref) ON knowledge.model_spec_revision TO platform_app;
--> statement-breakpoint
CREATE FUNCTION knowledge.model_spec_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF OLD.state <> 'draft' THEN
		RAISE EXCEPTION 'model spec revision % is % and cannot change', OLD.id, OLD.state USING ERRCODE = '23514';
	END IF;
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.model_id IS DISTINCT FROM OLD.model_id
		OR NEW.revision_no IS DISTINCT FROM OLD.revision_no OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
		OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'model spec revision % identity columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.state = 'draft' AND NEW.row_version <= OLD.row_version THEN
		RAISE EXCEPTION 'model spec revision % draft save must raise row_version', OLD.id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER model_spec_revision_guard BEFORE UPDATE ON knowledge.model_spec_revision FOR EACH ROW EXECUTE FUNCTION knowledge.model_spec_revision_guard();
--> statement-breakpoint
-- The child guard now reads the revision FOR SHARE: an insert holds the share lock until it commits, so a publish
-- (UPDATE needs the row lock) cannot seal between an insert and the hash, and an insert after a publish sees
-- state <> 'draft'.
CREATE OR REPLACE FUNCTION knowledge.spec_child_requires_draft() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	PERFORM 1 FROM knowledge.model_spec_revision r WHERE r.workspace_id = NEW.workspace_id AND r.id = NEW.spec_rev_id AND r.state = 'draft' FOR SHARE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'model spec revision % is not a draft', NEW.spec_rev_id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
-- Audit projection: 0085 body + the subject type `knowledge_model_spec` and the capability `knowledge.spec.publish`.
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
        'knowledge_model','knowledge_software','knowledge_item','knowledge_model_spec'])
      AND left(l.event_type, 15) <> 'survey_response'
      AND (l.detail ->> 'sensitive') IS DISTINCT FROM 'true'
      -- Permission rows: only the non-sensitive capabilities (CAPABILITY_META.sensitive = false in
      -- packages/shared); later lifecycle events carry no `sensitive` marker. No capability = excluded.
      AND (left(l.subject_type, 11) <> 'permission_' AND left(l.event_type, 11) <> 'permission_'
        OR (l.detail ->> 'capability') = ANY (ARRAY['workspace.read','voc.triage','voc.read',
          'finding.read','finding.manage','survey.read',
          'knowledge.catalog.manage','knowledge.catalog.import','knowledge.item.publish',
          'knowledge.spec.publish','voc.read_public']))
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
