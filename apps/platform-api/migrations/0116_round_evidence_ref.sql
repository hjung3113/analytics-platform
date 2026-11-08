CREATE TABLE "log_lifecycle"."round_evidence_ref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"file_ref" text NOT NULL,
	"line" bigint NOT NULL,
	"file_sha256" text NOT NULL,
	"note" text,
	"status" text NOT NULL,
	"origin_kind" text NOT NULL,
	"origin_id" uuid NOT NULL,
	"handed_off_by" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_evidence_ref_round_seq_uq" UNIQUE("workspace_id","round_id","seq"),
	CONSTRAINT "round_evidence_ref_round_triple_uq" UNIQUE("workspace_id","round_id","file_ref","line","file_sha256"),
	CONSTRAINT "round_evidence_ref_seq_check" CHECK ("log_lifecycle"."round_evidence_ref"."seq" between 1 and 1000),
	CONSTRAINT "round_evidence_ref_file_ref_check" CHECK (char_length("log_lifecycle"."round_evidence_ref"."file_ref") between 1 and 1024),
	CONSTRAINT "round_evidence_ref_line_check" CHECK ("log_lifecycle"."round_evidence_ref"."line" >= 1),
	CONSTRAINT "round_evidence_ref_sha_check" CHECK ("log_lifecycle"."round_evidence_ref"."file_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "round_evidence_ref_note_check" CHECK (coalesce(char_length("log_lifecycle"."round_evidence_ref"."note"), 0) <= 500),
	CONSTRAINT "round_evidence_ref_status_check" CHECK ("log_lifecycle"."round_evidence_ref"."status" in ('match','hash_mismatch','unresolved')),
	CONSTRAINT "round_evidence_ref_origin_check" CHECK ("log_lifecycle"."round_evidence_ref"."origin_kind" in ('log_explorer'))
);
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."round_evidence_ref" ADD CONSTRAINT "round_evidence_ref_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."round_evidence_ref" ADD CONSTRAINT "round_evidence_ref_handed_off_by_actors_id_fk" FOREIGN KEY ("handed_off_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."round_evidence_ref" ADD CONSTRAINT "round_evidence_ref_round_fk" FOREIGN KEY ("workspace_id","round_id") REFERENCES "log_lifecycle"."validation_round"("workspace_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- #1474 X-h: evidence locations handed to a round. The runtime role gets SELECT and INSERT only; a trigger refuses UPDATE
-- and DELETE for every role (the migrate role included). Roles are not touched. The audit projection
-- `core.platform_audit_events` needs no redefinition: `validation_round` is already a listed subject type and the new
-- event type maps through the `p_actions` vocabulary passed by the application.
GRANT ALL ON log_lifecycle.round_evidence_ref TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.round_evidence_ref TO platform_app;
--> statement-breakpoint
CREATE FUNCTION log_lifecycle.round_evidence_ref_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION 'round_evidence_ref is append-only (% refused)', TG_OP USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER round_evidence_ref_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.round_evidence_ref FOR EACH ROW EXECUTE FUNCTION log_lifecycle.round_evidence_ref_append_only();
