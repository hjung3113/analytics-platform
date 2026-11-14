CREATE TABLE "log_lifecycle"."attempt_diagnostic_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"ordinal" integer NOT NULL,
	"origin" text NOT NULL,
	"rule_result_id" uuid,
	"evidence" jsonb NOT NULL,
	"title" text,
	"explanation" text,
	"tables" jsonb NOT NULL,
	"erased_at" timestamp with time zone,
	"erased_cause" text,
	CONSTRAINT "attempt_diagnostic_item_key_uq" UNIQUE("diagnostic_id","item_key"),
	CONSTRAINT "attempt_diagnostic_item_ordinal_uq" UNIQUE("diagnostic_id","ordinal"),
	CONSTRAINT "attempt_diagnostic_item_shape_check" CHECK ("log_lifecycle"."attempt_diagnostic_item"."item_key" ~ '^[A-Za-z0-9._:-]{1,200}$' and "log_lifecycle"."attempt_diagnostic_item"."ordinal" between 0 and 499 and "log_lifecycle"."attempt_diagnostic_item"."origin" in ('rule','analysis') and ("log_lifecycle"."attempt_diagnostic_item"."origin" <> 'rule' or "log_lifecycle"."attempt_diagnostic_item"."rule_result_id" is not null) and jsonb_typeof("log_lifecycle"."attempt_diagnostic_item"."evidence") = 'array' and jsonb_array_length("log_lifecycle"."attempt_diagnostic_item"."evidence") <= 20 and jsonb_typeof("log_lifecycle"."attempt_diagnostic_item"."tables") = 'array' and jsonb_array_length("log_lifecycle"."attempt_diagnostic_item"."tables") <= 4 and coalesce(char_length("log_lifecycle"."attempt_diagnostic_item"."explanation"),0) <= 4000 and (("log_lifecycle"."attempt_diagnostic_item"."erased_at" is null and "log_lifecycle"."attempt_diagnostic_item"."erased_cause" is null and "log_lifecycle"."attempt_diagnostic_item"."title" is not null and char_length("log_lifecycle"."attempt_diagnostic_item"."title") between 1 and 200) or ("log_lifecycle"."attempt_diagnostic_item"."erased_at" is not null and "log_lifecycle"."attempt_diagnostic_item"."erased_cause" is not null and "log_lifecycle"."attempt_diagnostic_item"."erased_cause" in ('retention','admin') and "log_lifecycle"."attempt_diagnostic_item"."title" is null and "log_lifecycle"."attempt_diagnostic_item"."explanation" is null)))
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."attempt_diagnostic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"producer" text NOT NULL,
	"producer_version" text NOT NULL,
	"schema_version" integer NOT NULL,
	"digest" text NOT NULL,
	"byte_count" integer NOT NULL,
	"item_count" integer NOT NULL,
	"actor_id" uuid NOT NULL,
	"token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_diagnostic_workspace_uq" UNIQUE("workspace_id","attempt_id","id"),
	CONSTRAINT "attempt_diagnostic_producer_uq" UNIQUE("attempt_id","producer"),
	CONSTRAINT "attempt_diagnostic_shape_check" CHECK ("log_lifecycle"."attempt_diagnostic"."schema_version" = 1 and "log_lifecycle"."attempt_diagnostic"."producer" ~ '^[a-z0-9][a-z0-9._-]{0,63}$' and "log_lifecycle"."attempt_diagnostic"."producer_version" ~ '^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$' and "log_lifecycle"."attempt_diagnostic"."digest" ~ '^[0-9a-f]{64}$' and "log_lifecycle"."attempt_diagnostic"."byte_count" between 1 and 524288 and "log_lifecycle"."attempt_diagnostic"."item_count" between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."attempt_diagnostic_item" ADD CONSTRAINT "attempt_diagnostic_item_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."attempt_diagnostic_item" ADD CONSTRAINT "attempt_diagnostic_item_document_fk" FOREIGN KEY ("workspace_id","attempt_id","diagnostic_id") REFERENCES "log_lifecycle"."attempt_diagnostic"("workspace_id","attempt_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."attempt_diagnostic_item" ADD CONSTRAINT "attempt_diagnostic_item_result_fk" FOREIGN KEY ("workspace_id","attempt_id","rule_result_id") REFERENCES "log_lifecycle"."rule_result"("workspace_id","attempt_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."attempt_diagnostic" ADD CONSTRAINT "attempt_diagnostic_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."attempt_diagnostic" ADD CONSTRAINT "attempt_diagnostic_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."attempt_diagnostic" ADD CONSTRAINT "attempt_diagnostic_attempt_fk" FOREIGN KEY ("workspace_id","attempt_id") REFERENCES "log_lifecycle"."execution_attempt"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_diagnostic_item_live_idx" ON "log_lifecycle"."attempt_diagnostic_item" USING btree ("workspace_id","attempt_id") WHERE "log_lifecycle"."attempt_diagnostic_item"."erased_at" is null;
--> statement-breakpoint
GRANT ALL ON log_lifecycle.attempt_diagnostic, log_lifecycle.attempt_diagnostic_item TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.attempt_diagnostic, log_lifecycle.attempt_diagnostic_item TO platform_app;
--> statement-breakpoint
CREATE TRIGGER attempt_diagnostic_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.attempt_diagnostic FOR EACH ROW EXECUTE FUNCTION log_lifecycle.attempt_opinion_guard();
--> statement-breakpoint
-- Pure shape-preserving erasure: keys, types, row counts and locations survive; all Source-derived text disappears.
CREATE FUNCTION log_lifecycle.diagnostic_erased_tables(p_tables jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tableKey', t->'tableKey', 'title', null,
    'columns', (SELECT jsonb_agg(c || jsonb_build_object('label', null) ORDER BY ci) FROM jsonb_array_elements(t->'columns') WITH ORDINALITY AS cols(c,ci)),
    'rows', (SELECT coalesce(jsonb_agg((SELECT jsonb_object_agg(k, 'null'::jsonb) FROM jsonb_object_keys(r) AS keys(k)) ORDER BY ri),'[]'::jsonb) FROM jsonb_array_elements(t->'rows') WITH ORDINALITY AS entries(r,ri))
  ) ORDER BY ti),'[]'::jsonb) FROM jsonb_array_elements(p_tables) WITH ORDINALITY AS tables(t,ti)
$fn$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION log_lifecycle.excerpt_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'attempt_diagnostic_item' THEN
    IF OLD.erased_at IS NULL AND NEW.erased_at IS NOT NULL AND NEW.erased_cause IN ('retention','admin')
      AND NEW.title IS NULL AND NEW.explanation IS NULL
      AND NEW.tables = log_lifecycle.diagnostic_erased_tables(OLD.tables)
      AND (to_jsonb(NEW) - ARRAY['erased_at','erased_cause','title','explanation','tables']) = (to_jsonb(OLD) - ARRAY['erased_at','erased_cause','title','explanation','tables']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'diagnostic item can only have its body erased once' USING ERRCODE = '23514';
  END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NEW.excerpt = '' AND NEW.deleted_reason IS NOT NULL
    AND NEW.id = OLD.id AND NEW.workspace_id = OLD.workspace_id AND NEW.rule_result_id = OLD.rule_result_id
    AND NEW.evidence_index = OLD.evidence_index THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'rule result excerpt % can only be erased once (body emptied, deleted_at and deleted_reason set)', OLD.id USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER attempt_diagnostic_item_guard BEFORE UPDATE ON log_lifecycle.attempt_diagnostic_item FOR EACH ROW EXECUTE FUNCTION log_lifecycle.excerpt_guard();
--> statement-breakpoint
CREATE TRIGGER attempt_diagnostic_item_no_delete BEFORE DELETE ON log_lifecycle.attempt_diagnostic_item FOR EACH ROW EXECUTE FUNCTION log_lifecycle.excerpt_no_delete();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION log_lifecycle.erase_excerpts(
	p_workspace uuid, p_round uuid, p_attempt uuid, p_closed_before timestamptz, p_reason text, p_limit integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
	erased integer;
  diagnostic_erased integer;
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
		LEFT JOIN log_lifecycle.validation_round vr ON vr.workspace_id = rq.workspace_id AND vr.id = rq.round_id
		WHERE e.workspace_id = p_workspace AND e.deleted_at IS NULL
			AND (p_round IS NULL OR vr.id = p_round)
			AND (p_attempt IS NULL OR att.id = p_attempt)
			AND (p_closed_before IS NULL
				OR (rq.round_id IS NOT NULL AND vr.status = 'closed' AND vr.closed_at < p_closed_before)
				-- A suite subject has no Round close event: its clock is the FINISH of its suite run (every item request ended, the latest ended_at).
				OR (rq.suite_run_id IS NOT NULL
					AND NOT EXISTS (SELECT 1 FROM log_lifecycle.execution_request s WHERE s.workspace_id = rq.workspace_id AND s.suite_run_id = rq.suite_run_id AND s.state IN ('queued', 'claimed'))
					AND (SELECT max(s.ended_at) FROM log_lifecycle.execution_request s WHERE s.workspace_id = rq.workspace_id AND s.suite_run_id = rq.suite_run_id) < p_closed_before))
		ORDER BY e.id
		LIMIT p_limit
		FOR UPDATE OF e SKIP LOCKED
	)
	UPDATE log_lifecycle.rule_result_excerpt x
	SET excerpt = '', deleted_at = now(), deleted_reason = p_reason
	FROM due WHERE x.id = due.id;
	GET DIAGNOSTICS erased = ROW_COUNT;

  WITH due AS (
    SELECT e.id FROM log_lifecycle.attempt_diagnostic_item e
    JOIN log_lifecycle.execution_attempt att ON att.workspace_id = e.workspace_id AND att.id = e.attempt_id
    JOIN log_lifecycle.execution_request rq ON rq.workspace_id = att.workspace_id AND rq.id = att.request_id
    LEFT JOIN log_lifecycle.validation_round vr ON vr.workspace_id = rq.workspace_id AND vr.id = rq.round_id
    WHERE e.workspace_id = p_workspace AND e.erased_at IS NULL
      AND (p_round IS NULL OR vr.id = p_round) AND (p_attempt IS NULL OR att.id = p_attempt)
      AND (p_closed_before IS NULL
        OR (rq.round_id IS NOT NULL AND vr.status = 'closed' AND vr.closed_at < p_closed_before)
        OR (rq.suite_run_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM log_lifecycle.execution_request s WHERE s.workspace_id = rq.workspace_id AND s.suite_run_id = rq.suite_run_id AND s.state IN ('queued','claimed'))
          AND (SELECT max(s.ended_at) FROM log_lifecycle.execution_request s WHERE s.workspace_id = rq.workspace_id AND s.suite_run_id = rq.suite_run_id) < p_closed_before))
    ORDER BY e.id LIMIT greatest(p_limit - erased, 0) FOR UPDATE OF e SKIP LOCKED
  )
  UPDATE log_lifecycle.attempt_diagnostic_item x SET title = NULL, explanation = NULL,
    tables = log_lifecycle.diagnostic_erased_tables(x.tables), erased_at = now(),
    erased_cause = (CASE WHEN p_closed_before IS NOT NULL THEN 'retention' ELSE 'admin' END)
  FROM due WHERE x.id = due.id;
  GET DIAGNOSTICS diagnostic_erased = ROW_COUNT;

	RETURN erased + diagnostic_erased;
END
$fn$;
