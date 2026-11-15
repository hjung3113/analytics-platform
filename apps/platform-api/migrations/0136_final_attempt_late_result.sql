-- SER-27 / ADR-0117 decision 4: keep the latest lease-expired attempt result even after max_attempts.
-- This existing guard is SECURITY INVOKER; no ownership, role or privilege changes.
CREATE OR REPLACE FUNCTION log_lifecycle.request_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.round_id IS DISTINCT FROM OLD.round_id
		OR NEW.suite_run_item_id IS DISTINCT FROM OLD.suite_run_item_id OR NEW.suite_run_id IS DISTINCT FROM OLD.suite_run_id
		OR NEW.subject_sample_set IS DISTINCT FROM OLD.subject_sample_set OR NEW.subject_sample_manifest_digest IS DISTINCT FROM OLD.subject_sample_manifest_digest
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
		OR (OLD.state = 'expired' AND NEW.state IN ('succeeded', 'failed'))
		-- LEGAL_REQUEST_PAIRS end
	) THEN
		RAISE EXCEPTION 'execution request % cannot move from % to %', OLD.id, OLD.state, NEW.state USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
