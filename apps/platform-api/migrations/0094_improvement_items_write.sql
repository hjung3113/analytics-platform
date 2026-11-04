-- #1328 b: improvement item writes. Grants, guard trigger, the origin-or-target (Q2) constraint triggers and the audit
-- projection. The runtime role (platform_app) gets INSERT on the three data tables, DELETE on item_target only (the
-- history of a target set lives in item_event) and a column-limited UPDATE on item; never DELETE on item/item_event
-- and never UPDATE on item_event/item_target.
GRANT INSERT ON improvement.item, improvement.item_target, improvement.item_event TO platform_app;
--> statement-breakpoint
GRANT DELETE ON improvement.item_target TO platform_app;
--> statement-breakpoint
GRANT UPDATE (problem, action, action_date, status, assignee_id, quest_id, quest_title_snapshot, origin_menu_id, origin_context, effect_result, effect_note, effect_compare_link, drop_reason, row_version, updated_at, updated_by) ON improvement.item TO platform_app;
--> statement-breakpoint
-- The wall behind the column grant (the migrate role is not limited by it, as in 0092): identity columns never change,
-- row_version rises by exactly 1 on EVERY update, and a status only moves along a legal pair (the forward moves, the
-- three reopen pairs and `* -> dropped`). An unchanged status always passes.
CREATE FUNCTION improvement.item_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.item_no IS DISTINCT FROM OLD.item_no
		OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
		RAISE EXCEPTION 'improvement item % identity columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'improvement item % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
		(OLD.status = 'open' AND NEW.status IN ('in_progress', 'dropped'))
		OR (OLD.status = 'in_progress' AND NEW.status IN ('done', 'dropped'))
		OR (OLD.status = 'done' AND NEW.status IN ('verified', 'dropped', 'in_progress'))
		OR (OLD.status = 'verified' AND NEW.status IN ('dropped', 'done'))
		OR (OLD.status = 'dropped' AND NEW.status = 'open')
	) THEN
		RAISE EXCEPTION 'improvement item % cannot move from % to %', OLD.id, OLD.status, NEW.status USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER improvement_item_guard BEFORE UPDATE ON improvement.item FOR EACH ROW EXECUTE FUNCTION improvement.item_guard();
--> statement-breakpoint
-- Q2 (design §1): an item names its origin or at least one target. Two tables, so a DEFERRABLE INITIALLY DEFERRED
-- constraint trigger (named `improvement_item_origin_or_target` on both). The function re-reads the CURRENT state when
-- it fires, never the stale NEW/OLD of its statement, and skips an item row that no longer exists. A refusal carries
-- the constraint name, which the write path maps to the field error `origin:required_or_target`.
CREATE FUNCTION improvement.item_origin_or_target() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $fn$
DECLARE
	v_ws uuid;
	v_item uuid;
	v_origin text;
BEGIN
	IF TG_TABLE_NAME = 'item' THEN
		v_ws := NEW.workspace_id;
		v_item := NEW.id;
	ELSE
		v_ws := OLD.workspace_id;
		v_item := OLD.item_id;
	END IF;
	SELECT i.origin_menu_id INTO v_origin FROM improvement.item i WHERE i.workspace_id = v_ws AND i.id = v_item;
	IF NOT FOUND THEN
		RETURN NULL;
	END IF;
	IF v_origin IS NULL AND NOT EXISTS (SELECT 1 FROM improvement.item_target t WHERE t.workspace_id = v_ws AND t.item_id = v_item) THEN
		RAISE EXCEPTION 'improvement item % needs an origin or at least one target', v_item
			USING ERRCODE = '23514', CONSTRAINT = 'improvement_item_origin_or_target';
	END IF;
	RETURN NULL;
END
$fn$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER improvement_item_origin_or_target AFTER INSERT OR UPDATE OF origin_menu_id ON improvement.item DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION improvement.item_origin_or_target();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER improvement_item_origin_or_target AFTER DELETE ON improvement.item_target DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION improvement.item_origin_or_target();
--> statement-breakpoint
-- Audit projection: 0092 body + the subject type `improvement_item` and the capability `improvement.manage`.
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
        'knowledge_model','knowledge_software','knowledge_item','knowledge_model_spec','improvement_item'])
      AND left(l.event_type, 15) <> 'survey_response'
      AND (l.detail ->> 'sensitive') IS DISTINCT FROM 'true'
      -- Permission rows: only the non-sensitive capabilities (CAPABILITY_META.sensitive = false in
      -- packages/shared); later lifecycle events carry no `sensitive` marker. No capability = excluded.
      AND (left(l.subject_type, 11) <> 'permission_' AND left(l.event_type, 11) <> 'permission_'
        OR (l.detail ->> 'capability') = ANY (ARRAY['workspace.read','voc.triage','voc.read',
          'finding.read','finding.manage','survey.read',
          'knowledge.catalog.manage','knowledge.catalog.import','knowledge.item.publish',
          'knowledge.spec.publish','voc.read_public','improvement.manage']))
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
