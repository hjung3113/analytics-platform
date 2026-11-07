ALTER TABLE "knowledge"."draft" ADD COLUMN "validator_source_system" text;--> statement-breakpoint
ALTER TABLE "knowledge"."draft" ADD COLUMN "validator_run_id" text;--> statement-breakpoint
ALTER TABLE "knowledge"."draft" ADD COLUMN "validator_finding_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_validator_ref_uq" ON "knowledge"."draft" USING btree ("workspace_id","validator_source_system","validator_run_id","validator_finding_id") WHERE "knowledge"."draft"."validator_source_system" is not null;--> statement-breakpoint
ALTER TABLE "knowledge"."draft" ADD CONSTRAINT "draft_validator_ref_check" CHECK (num_nonnulls("knowledge"."draft"."validator_source_system", "knowledge"."draft"."validator_run_id", "knowledge"."draft"."validator_finding_id") in (0, 3));
--> statement-breakpoint
-- #1198 c: the validator ref is part of a draft's identity; copy of the 0102 draft_guard body plus the three columns.
CREATE OR REPLACE FUNCTION knowledge.draft_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.origin IS DISTINCT FROM OLD.origin
		OR NEW.proposal_type IS DISTINCT FROM OLD.proposal_type OR NEW.target_item_id IS DISTINCT FROM OLD.target_item_id
		OR NEW.base_revision_no IS DISTINCT FROM OLD.base_revision_no OR NEW.owner_model_id IS DISTINCT FROM OLD.owner_model_id
		OR NEW.owner_software_id IS DISTINCT FROM OLD.owner_software_id OR NEW.submitter_actor_id IS DISTINCT FROM OLD.submitter_actor_id
		OR NEW.validator_source_system IS DISTINCT FROM OLD.validator_source_system OR NEW.validator_run_id IS DISTINCT FROM OLD.validator_run_id
		OR NEW.validator_finding_id IS DISTINCT FROM OLD.validator_finding_id
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
