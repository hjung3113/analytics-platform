CREATE TABLE "log_lifecycle"."excerpt_reader" (
	"workspace_id" uuid NOT NULL,
	"source_owner" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "excerpt_reader_uq" UNIQUE("workspace_id","source_owner","actor_id"),
	CONSTRAINT "excerpt_reader_owner_check" CHECK (char_length("log_lifecycle"."excerpt_reader"."source_owner") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."execution_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"worker_actor_id" uuid NOT NULL,
	"token_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"outcome" text DEFAULT 'running' NOT NULL,
	"executor_version" text,
	"executor_digest" text,
	"rule_set_revision" text,
	"input_manifest_digest" text NOT NULL,
	"result_digest" text,
	"verdict" text,
	"worker_summary" jsonb,
	CONSTRAINT "execution_attempt_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "execution_attempt_request_no_uq" UNIQUE("request_id","attempt_no"),
	CONSTRAINT "execution_attempt_outcome_check" CHECK ("log_lifecycle"."execution_attempt"."outcome" in ('running','succeeded','failed','lease_expired')),
	CONSTRAINT "execution_attempt_verdict_check" CHECK ("log_lifecycle"."execution_attempt"."verdict" is null or "log_lifecycle"."execution_attempt"."verdict" in ('pass','fail','incomplete')),
	CONSTRAINT "execution_attempt_no_check" CHECK ("log_lifecycle"."execution_attempt"."attempt_no" >= 1),
	CONSTRAINT "execution_attempt_digest_check" CHECK ("log_lifecycle"."execution_attempt"."input_manifest_digest" ~ '^[0-9a-f]{64}$' and ("log_lifecycle"."execution_attempt"."result_digest" is null or "log_lifecycle"."execution_attempt"."result_digest" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "execution_attempt_summary_check" CHECK ("log_lifecycle"."execution_attempt"."worker_summary" is null or jsonb_typeof("log_lifecycle"."execution_attempt"."worker_summary") = 'object'),
	CONSTRAINT "execution_attempt_result_check" CHECK (("log_lifecycle"."execution_attempt"."outcome" = 'succeeded') = ("log_lifecycle"."execution_attempt"."verdict" is not null and "log_lifecycle"."execution_attempt"."result_digest" is not null))
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."execution_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"priority" integer NOT NULL,
	"immediate" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"request_digest" text NOT NULL,
	"engine_profile_ref" text,
	"requested_by_actor_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"not_before" timestamp with time zone,
	"claimed_by_actor_id" uuid,
	"lease_expires_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"cancel_reason" text,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "execution_request_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "execution_request_idempotency_uq" UNIQUE("workspace_id","requested_by_actor_id","idempotency_key"),
	CONSTRAINT "execution_request_state_check" CHECK ("log_lifecycle"."execution_request"."state" in ('queued','claimed','succeeded','failed','cancelled','expired')),
	CONSTRAINT "execution_request_priority_check" CHECK ("log_lifecycle"."execution_request"."priority" between 0 and 2),
	CONSTRAINT "execution_request_attempts_check" CHECK ("log_lifecycle"."execution_request"."max_attempts" between 1 and 10 and "log_lifecycle"."execution_request"."attempt_count" between 0 and "log_lifecycle"."execution_request"."max_attempts"),
	CONSTRAINT "execution_request_digest_check" CHECK ("log_lifecycle"."execution_request"."request_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "execution_request_profile_check" CHECK (coalesce(char_length("log_lifecycle"."execution_request"."engine_profile_ref"), 0) <= 200 and coalesce(char_length("log_lifecycle"."execution_request"."cancel_reason"), 0) <= 2000),
	CONSTRAINT "execution_request_row_version_check" CHECK ("log_lifecycle"."execution_request"."row_version" >= 1),
	CONSTRAINT "execution_request_lease_check" CHECK (("log_lifecycle"."execution_request"."state" = 'claimed') = ("log_lifecycle"."execution_request"."claimed_by_actor_id" is not null and "log_lifecycle"."execution_request"."lease_expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."queue_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"run_window" jsonb NOT NULL,
	"lease_seconds" integer DEFAULT 300 NOT NULL,
	"immediate_limit" integer DEFAULT 5 NOT NULL,
	"excerpt_retention_days" integer DEFAULT 90 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "queue_settings_run_window_check" CHECK (jsonb_typeof("log_lifecycle"."queue_settings"."run_window") = 'object'),
	CONSTRAINT "queue_settings_lease_check" CHECK ("log_lifecycle"."queue_settings"."lease_seconds" between 30 and 3600),
	CONSTRAINT "queue_settings_immediate_limit_check" CHECK ("log_lifecycle"."queue_settings"."immediate_limit" between 0 and 50),
	CONSTRAINT "queue_settings_retention_check" CHECK ("log_lifecycle"."queue_settings"."excerpt_retention_days" between 1 and 3650)
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."rule_result_excerpt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rule_result_id" uuid NOT NULL,
	"evidence_index" integer NOT NULL,
	"excerpt" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_reason" text,
	CONSTRAINT "rule_result_excerpt_index_uq" UNIQUE("rule_result_id","evidence_index"),
	CONSTRAINT "rule_result_excerpt_index_check" CHECK ("log_lifecycle"."rule_result_excerpt"."evidence_index" between 0 and 19),
	CONSTRAINT "rule_result_excerpt_length_check" CHECK (("log_lifecycle"."rule_result_excerpt"."deleted_at" is null and char_length("log_lifecycle"."rule_result_excerpt"."excerpt") between 1 and 2000) or ("log_lifecycle"."rule_result_excerpt"."deleted_at" is not null and "log_lifecycle"."rule_result_excerpt"."excerpt" = '')),
	CONSTRAINT "rule_result_excerpt_reason_check" CHECK (coalesce(char_length("log_lifecycle"."rule_result_excerpt"."deleted_reason"), 0) <= 2000 and ("log_lifecycle"."rule_result_excerpt"."deleted_reason" is null or "log_lifecycle"."rule_result_excerpt"."deleted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."rule_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"result" text NOT NULL,
	"required" boolean NOT NULL,
	"expected" text,
	"observed" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "rule_result_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "rule_result_attempt_rule_uq" UNIQUE("attempt_id","rule_id"),
	CONSTRAINT "rule_result_result_check" CHECK ("log_lifecycle"."rule_result"."result" in ('PASS','FAIL','WARN','NOT_CHECKED','SKIPPED','NOT_APPLICABLE','ERROR')),
	CONSTRAINT "rule_result_text_check" CHECK (char_length("log_lifecycle"."rule_result"."rule_id") between 1 and 200 and coalesce(char_length("log_lifecycle"."rule_result"."expected"), 0) <= 500 and coalesce(char_length("log_lifecycle"."rule_result"."observed"), 0) <= 500),
	CONSTRAINT "rule_result_evidence_check" CHECK (jsonb_typeof("log_lifecycle"."rule_result"."evidence") = 'array' and jsonb_array_length("log_lifecycle"."rule_result"."evidence") <= 20)
);
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."excerpt_reader" ADD CONSTRAINT "excerpt_reader_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."excerpt_reader" ADD CONSTRAINT "excerpt_reader_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."excerpt_reader" ADD CONSTRAINT "excerpt_reader_granted_by_actors_id_fk" FOREIGN KEY ("granted_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_attempt" ADD CONSTRAINT "execution_attempt_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_attempt" ADD CONSTRAINT "execution_attempt_worker_actor_id_actors_id_fk" FOREIGN KEY ("worker_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_attempt" ADD CONSTRAINT "execution_attempt_request_fk" FOREIGN KEY ("workspace_id","request_id") REFERENCES "log_lifecycle"."execution_request"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ADD CONSTRAINT "execution_request_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ADD CONSTRAINT "execution_request_requested_by_actor_id_actors_id_fk" FOREIGN KEY ("requested_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ADD CONSTRAINT "execution_request_claimed_by_actor_id_actors_id_fk" FOREIGN KEY ("claimed_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ADD CONSTRAINT "execution_request_round_fk" FOREIGN KEY ("workspace_id","round_id") REFERENCES "log_lifecycle"."validation_round"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."queue_settings" ADD CONSTRAINT "queue_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."queue_settings" ADD CONSTRAINT "queue_settings_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."rule_result_excerpt" ADD CONSTRAINT "rule_result_excerpt_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."rule_result_excerpt" ADD CONSTRAINT "rule_result_excerpt_rule_result_fk" FOREIGN KEY ("workspace_id","rule_result_id") REFERENCES "log_lifecycle"."rule_result"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."rule_result" ADD CONSTRAINT "rule_result_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."rule_result" ADD CONSTRAINT "rule_result_attempt_fk" FOREIGN KEY ("workspace_id","attempt_id") REFERENCES "log_lifecycle"."execution_attempt"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "execution_attempt_request_idx" ON "log_lifecycle"."execution_attempt" USING btree ("workspace_id","request_id","attempt_no");--> statement-breakpoint
CREATE INDEX "execution_request_claim_idx" ON "log_lifecycle"."execution_request" USING btree ("workspace_id","state","priority","created_at");--> statement-breakpoint
CREATE INDEX "execution_request_round_idx" ON "log_lifecycle"."execution_request" USING btree ("workspace_id","round_id");--> statement-breakpoint
-- #1445 d: validation request queue (ADR-0117). Grants, guard triggers and the audit projection. The runtime role
-- (platform_app) gets SELECT + INSERT on every new table, a column-limited UPDATE on execution_request,
-- execution_attempt, queue_settings and excerpt_reader, and never DELETE anywhere; rule_result and
-- rule_result_excerpt are append-only for it (no UPDATE). Roles are not touched. The round's sample immutability
-- (design §3: "once a request exists") is already enforced for every round by log_lifecycle.round_guard (#1444 c).
GRANT ALL ON log_lifecycle.execution_request, log_lifecycle.execution_attempt, log_lifecycle.rule_result, log_lifecycle.rule_result_excerpt, log_lifecycle.queue_settings, log_lifecycle.excerpt_reader TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.execution_request, log_lifecycle.execution_attempt, log_lifecycle.rule_result, log_lifecycle.rule_result_excerpt, log_lifecycle.queue_settings, log_lifecycle.excerpt_reader TO platform_app;
--> statement-breakpoint
GRANT UPDATE (state, attempt_count, claimed_by_actor_id, lease_expires_at, last_heartbeat_at, cancel_reason, row_version, updated_at, ended_at) ON log_lifecycle.execution_request TO platform_app;
--> statement-breakpoint
GRANT UPDATE (outcome, ended_at, executor_version, executor_digest, rule_set_revision, input_manifest_digest, result_digest, verdict, worker_summary) ON log_lifecycle.execution_attempt TO platform_app;
--> statement-breakpoint
GRANT UPDATE (run_window, lease_seconds, immediate_limit, excerpt_retention_days, updated_at, updated_by) ON log_lifecycle.queue_settings TO platform_app;
--> statement-breakpoint
GRANT UPDATE (granted_by, granted_at, revoked_at) ON log_lifecycle.excerpt_reader TO platform_app;
--> statement-breakpoint
-- The wall behind the column grant: identity and input columns never change, row_version rises by exactly 1 on EVERY
-- update, attempt_count stays or rises by 1, and a state only moves along a legal pair. The pairs are kept textually
-- identical to LEGAL_REQUEST_PAIRS (domain/request-states.ts, drift test).
CREATE FUNCTION log_lifecycle.request_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.round_id IS DISTINCT FROM OLD.round_id
		OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.immediate IS DISTINCT FROM OLD.immediate
		OR NEW.request_digest IS DISTINCT FROM OLD.request_digest OR NEW.engine_profile_ref IS DISTINCT FROM OLD.engine_profile_ref
		OR NEW.requested_by_actor_id IS DISTINCT FROM OLD.requested_by_actor_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
		OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts OR NEW.not_before IS DISTINCT FROM OLD.not_before
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'execution request % identity columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'execution request % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.attempt_count < OLD.attempt_count OR NEW.attempt_count > OLD.attempt_count + 1 THEN
		RAISE EXCEPTION 'execution request % attempt_count can only stay or rise by 1', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
		-- LEGAL_REQUEST_PAIRS begin
		(OLD.state = 'queued' AND NEW.state IN ('claimed', 'cancelled', 'succeeded', 'failed'))
		OR (OLD.state = 'claimed' AND NEW.state IN ('succeeded', 'failed', 'queued', 'expired', 'cancelled'))
		-- LEGAL_REQUEST_PAIRS end
	) THEN
		RAISE EXCEPTION 'execution request % cannot move from % to %', OLD.id, OLD.state, NEW.state USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER execution_request_guard BEFORE UPDATE ON log_lifecycle.execution_request FOR EACH ROW EXECUTE FUNCTION log_lifecycle.request_guard();
--> statement-breakpoint
-- An attempt keeps its identity columns; its outcome moves running -> succeeded | failed | lease_expired, and a
-- lease_expired attempt may still end succeeded | failed (the late result of decision 4) or, for a heartbeat nobody
-- contested, return to running with ended_at cleared (request.queued -> claimed on the same attempt). Anything else is final.
CREATE FUNCTION log_lifecycle.attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.request_id IS DISTINCT FROM OLD.request_id
		OR NEW.attempt_no IS DISTINCT FROM OLD.attempt_no OR NEW.worker_actor_id IS DISTINCT FROM OLD.worker_actor_id
		OR NEW.token_id IS DISTINCT FROM OLD.token_id OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
		RAISE EXCEPTION 'execution attempt % identity columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.outcome IS DISTINCT FROM OLD.outcome AND NOT (
		(OLD.outcome = 'running' AND NEW.outcome IN ('succeeded', 'failed', 'lease_expired'))
		OR (OLD.outcome = 'lease_expired' AND NEW.outcome IN ('succeeded', 'failed'))
		OR (OLD.outcome = 'lease_expired' AND NEW.outcome = 'running' AND NEW.ended_at IS NULL)
	) THEN
		RAISE EXCEPTION 'execution attempt % cannot move from % to %', OLD.id, OLD.outcome, NEW.outcome USING ERRCODE = '23514';
	END IF;
	IF NEW.outcome = OLD.outcome AND OLD.outcome <> 'running' THEN
		RAISE EXCEPTION 'execution attempt % is % and final', OLD.id, OLD.outcome USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER execution_attempt_guard BEFORE UPDATE ON log_lifecycle.execution_attempt FOR EACH ROW EXECUTE FUNCTION log_lifecycle.attempt_guard();
--> statement-breakpoint
-- Excerpt erasure (ADR-0117 decision 7). platform_app has no UPDATE on rule_result_excerpt; the only way a body goes is
-- log_lifecycle.erase_excerpts, a SECURITY DEFINER function (owner = the table owner, fixed search_path, EXECUTE for
-- platform_app only) with three scopes: one Round, one attempt, or "every Round closed before a cutoff" (retention).
-- The guard trigger allows exactly one UPDATE: a live row becomes erased (deleted_at and deleted_reason set, body
-- empty, identity columns unchanged). Rule results, evidence locations and hashes are untouched.
CREATE FUNCTION log_lifecycle.excerpt_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NEW.excerpt = '' AND NEW.deleted_reason IS NOT NULL
		AND NEW.id = OLD.id AND NEW.workspace_id = OLD.workspace_id AND NEW.rule_result_id = OLD.rule_result_id
		AND NEW.evidence_index = OLD.evidence_index THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'rule result excerpt % can only be erased once (body emptied, deleted_at and deleted_reason set)', OLD.id USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER rule_result_excerpt_guard BEFORE UPDATE ON log_lifecycle.rule_result_excerpt FOR EACH ROW EXECUTE FUNCTION log_lifecycle.excerpt_guard();
--> statement-breakpoint
-- An erased row is the tombstone of the deletion: no role (the migrate role included) removes a row. No foreign key cascades into this table
-- (rule_result_fk is ON DELETE restrict), so only a direct DELETE reaches it; TRUNCATE (test reset) is not a row event.
CREATE FUNCTION log_lifecycle.excerpt_no_delete() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION 'rule result excerpt % cannot be deleted (erase its body instead)', OLD.id USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER rule_result_excerpt_no_delete BEFORE DELETE ON log_lifecycle.rule_result_excerpt FOR EACH ROW EXECUTE FUNCTION log_lifecycle.excerpt_no_delete();
--> statement-breakpoint
CREATE FUNCTION log_lifecycle.erase_excerpts(
	p_workspace uuid, p_round uuid, p_attempt uuid, p_closed_before timestamptz, p_reason text, p_limit integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
	erased integer;
BEGIN
	IF p_workspace IS NULL OR p_reason IS NULL OR p_limit IS NULL OR p_limit < 1
		OR (p_round IS NOT NULL)::int + (p_attempt IS NOT NULL)::int + (p_closed_before IS NOT NULL)::int <> 1 THEN
		RAISE EXCEPTION 'erase_excerpts needs a workspace, a reason, a limit and exactly one scope' USING ERRCODE = '22023';
	END IF;
	WITH due AS (
		SELECT e.id
		FROM log_lifecycle.rule_result_excerpt e
		JOIN log_lifecycle.rule_result rr ON rr.workspace_id = e.workspace_id AND rr.id = e.rule_result_id
		JOIN log_lifecycle.execution_attempt att ON att.workspace_id = rr.workspace_id AND att.id = rr.attempt_id
		JOIN log_lifecycle.execution_request rq ON rq.workspace_id = att.workspace_id AND rq.id = att.request_id
		JOIN log_lifecycle.validation_round vr ON vr.workspace_id = rq.workspace_id AND vr.id = rq.round_id
		WHERE e.workspace_id = p_workspace AND e.deleted_at IS NULL
			AND (p_round IS NULL OR vr.id = p_round)
			AND (p_attempt IS NULL OR att.id = p_attempt)
			AND (p_closed_before IS NULL OR (vr.status = 'closed' AND vr.closed_at < p_closed_before))
		ORDER BY e.id
		LIMIT p_limit
		FOR UPDATE OF e SKIP LOCKED
	)
	UPDATE log_lifecycle.rule_result_excerpt x
	SET excerpt = '', deleted_at = now(), deleted_reason = p_reason
	FROM due WHERE x.id = due.id;
	GET DIAGNOSTICS erased = ROW_COUNT;
	RETURN erased;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION log_lifecycle.erase_excerpts(uuid, uuid, uuid, timestamptz, text, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION log_lifecycle.erase_excerpts(uuid, uuid, uuid, timestamptz, text, integer) TO platform_app;
--> statement-breakpoint
-- The retention job's queue is migration-owned: the runtime role cannot do pg-boss DDL (ADR-0008).
INSERT INTO pgboss.queue (
  name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
  expire_seconds, retention_seconds, deletion_seconds, warning_queued,
  dead_letter, partition, table_name, heartbeat_seconds
) VALUES (
  'lifecycle.excerpt_purge',
  'standard', 5, 30, true, NULL, 900, 1209600, 604800, 0, NULL, false, 'job_common', NULL
) ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Audit projection: 0102 body + the subject types execution_request, queue_settings, excerpt_reader.
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
        'development_project','validation_round','knowledge_draft','catalog_report','execution_request','queue_settings','excerpt_reader'])
      AND left(l.event_type, 15) <> 'survey_response'
      AND (l.detail ->> 'sensitive') IS DISTINCT FROM 'true'
      -- Permission rows: only the non-sensitive capabilities (CAPABILITY_META.sensitive = false in
      -- packages/shared); later lifecycle events carry no `sensitive` marker. No capability = excluded.
      AND (left(l.subject_type, 11) <> 'permission_' AND left(l.event_type, 11) <> 'permission_'
        OR (l.detail ->> 'capability') = ANY (ARRAY['workspace.read','voc.triage','voc.read',
          'finding.read','finding.manage','survey.read',
          'knowledge.catalog.manage','knowledge.catalog.import','knowledge.item.publish',
          'knowledge.spec.publish','voc.read_public','improvement.manage','voc.create',
          'lifecycle.project.manage','lifecycle.round.manage','knowledge.draft.create','validation.catalog.report']))
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

