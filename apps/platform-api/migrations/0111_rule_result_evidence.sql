CREATE TABLE "log_lifecycle"."rule_result_evidence" (
	"rule_result_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_ref" text NOT NULL,
	"line" bigint NOT NULL,
	"file_sha256" text NOT NULL,
	CONSTRAINT "rule_result_evidence_pk" PRIMARY KEY("rule_result_id","file_ref","line","file_sha256"),
	CONSTRAINT "rule_result_evidence_line_check" CHECK ("log_lifecycle"."rule_result_evidence"."line" >= 1),
	CONSTRAINT "rule_result_evidence_sha_check" CHECK ("log_lifecycle"."rule_result_evidence"."file_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rule_result_evidence_ref_check" CHECK (char_length("log_lifecycle"."rule_result_evidence"."file_ref") between 1 and 1024)
);
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."rule_result_evidence" ADD CONSTRAINT "rule_result_evidence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."rule_result_evidence" ADD CONSTRAINT "rule_result_evidence_rule_result_fk" FOREIGN KEY ("workspace_id","rule_result_id") REFERENCES "log_lifecycle"."rule_result"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rule_result_evidence_reverse_idx" ON "log_lifecycle"."rule_result_evidence" USING btree ("workspace_id","file_ref","line","file_sha256");--> statement-breakpoint
-- #1470 X-d: normalized evidence locations of a rule result (log-explorer D4). Insert-only for the runtime role (SELECT + INSERT,
-- no UPDATE/DELETE grant) and for everyone else through the guard trigger below; rows are removed only with the trigger disabled
-- (test teardown). Roles are not touched. Body-free: a location, never log text.
GRANT ALL ON log_lifecycle.rule_result_evidence TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.rule_result_evidence TO platform_app;
--> statement-breakpoint
CREATE FUNCTION log_lifecycle.rule_result_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION 'rule result evidence is append-only' USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER rule_result_evidence_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.rule_result_evidence FOR EACH ROW EXECUTE FUNCTION log_lifecycle.rule_result_evidence_guard();
--> statement-breakpoint
-- Backfill from the jsonb array of every existing rule result: one row per distinct (file_ref, line, file_sha256). Idempotent
-- (ON CONFLICT DO NOTHING on the primary key); additive; the evidence elements carry fileRef / line / fileSha256 / hasExcerpt only.
INSERT INTO log_lifecycle.rule_result_evidence (rule_result_id, workspace_id, file_ref, line, file_sha256)
SELECT DISTINCT rr.id, rr.workspace_id, e.elem->>'fileRef', (e.elem->>'line')::bigint, e.elem->>'fileSha256'
FROM log_lifecycle.rule_result rr
CROSS JOIN LATERAL jsonb_array_elements(rr.evidence) AS e(elem)
WHERE char_length(e.elem->>'fileRef') BETWEEN 1 AND 1024 AND e.elem->>'line' ~ '^[0-9]{1,16}$' AND (e.elem->>'line')::bigint BETWEEN 1 AND 9007199254740991 AND e.elem->>'fileSha256' ~ '^[0-9a-f]{64}$'
ON CONFLICT DO NOTHING;
