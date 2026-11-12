ALTER TABLE "log_lifecycle"."execution_attempt" ADD CONSTRAINT "execution_attempt_ownership_uq" UNIQUE("workspace_id","request_id","id");
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."execution_request" ADD CONSTRAINT "execution_request_ownership_uq" UNIQUE("workspace_id","round_id","id");
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."rule_result" ADD CONSTRAINT "rule_result_ownership_uq" UNIQUE("workspace_id","attempt_id","id");
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_round" ADD CONSTRAINT "validation_round_ownership_uq" UNIQUE("workspace_id","project_id","id");
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."round_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"author_actor_id" uuid NOT NULL,
	"body" text NOT NULL,
	"corrects_comment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_comment_target_uq" UNIQUE("workspace_id","round_id","id"),
	CONSTRAINT "round_comment_body_check" CHECK (char_length("log_lifecycle"."round_comment"."body") between 1 and 4000),
	CONSTRAINT "round_comment_self_check" CHECK ("log_lifecycle"."round_comment"."corrects_comment_id" is null or "log_lifecycle"."round_comment"."corrects_comment_id" <> "log_lifecycle"."round_comment"."id")
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."validation_issue_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"author_actor_id" uuid NOT NULL,
	"body" text NOT NULL,
	"corrects_comment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_issue_comment_target_uq" UNIQUE("workspace_id","issue_id","id"),
	CONSTRAINT "validation_issue_comment_body_check" CHECK (char_length("log_lifecycle"."validation_issue_comment"."body") between 1 and 4000),
	CONSTRAINT "validation_issue_comment_self_check" CHECK ("log_lifecycle"."validation_issue_comment"."corrects_comment_id" is null or "log_lifecycle"."validation_issue_comment"."corrects_comment_id" <> "log_lifecycle"."validation_issue_comment"."id")
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."validation_issue_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"field" text NOT NULL,
	"body" text NOT NULL,
	"corrects_event_id" uuid,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_issue_event_target_uq" UNIQUE("workspace_id","issue_id","field","id"),
	CONSTRAINT "validation_issue_event_kind_check" CHECK ("log_lifecycle"."validation_issue_event"."kind" = 'field_corrected'),
	CONSTRAINT "validation_issue_event_field_check" CHECK ("log_lifecycle"."validation_issue_event"."field" in ('title','body','expected','actual','repro')),
	CONSTRAINT "validation_issue_event_body_check" CHECK (char_length("log_lifecycle"."validation_issue_event"."body") <= 8000 and ("log_lifecycle"."validation_issue_event"."field" <> 'title' or char_length("log_lifecycle"."validation_issue_event"."body") between 1 and 200) and ("log_lifecycle"."validation_issue_event"."field" <> 'body' or char_length("log_lifecycle"."validation_issue_event"."body") >= 1)),
	CONSTRAINT "validation_issue_event_self_check" CHECK ("log_lifecycle"."validation_issue_event"."corrects_event_id" is null or "log_lifecycle"."validation_issue_event"."corrects_event_id" <> "log_lifecycle"."validation_issue_event"."id")
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."validation_issue_evidence_ref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"file_ref" text NOT NULL,
	"line" bigint NOT NULL,
	"file_sha256" text NOT NULL,
	"linker_actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_issue_evidence_ref_triple_uq" UNIQUE("occurrence_id","file_ref","line","file_sha256"),
	CONSTRAINT "validation_issue_evidence_ref_ref_check" CHECK (char_length("log_lifecycle"."validation_issue_evidence_ref"."file_ref") between 1 and 1024),
	CONSTRAINT "validation_issue_evidence_ref_line_check" CHECK ("log_lifecycle"."validation_issue_evidence_ref"."line" between 1 and 9007199254740991),
	CONSTRAINT "validation_issue_evidence_ref_hash_check" CHECK ("log_lifecycle"."validation_issue_evidence_ref"."file_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."validation_issue_occurrence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"request_id" uuid,
	"attempt_id" uuid,
	"rule_result_id" uuid,
	"linker_actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_issue_occurrence_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "validation_issue_occurrence_location_uq" UNIQUE NULLS NOT DISTINCT("issue_id","round_id","attempt_id","rule_result_id"),
	CONSTRAINT "validation_issue_occurrence_ownership_check" CHECK (("log_lifecycle"."validation_issue_occurrence"."attempt_id" is null) = ("log_lifecycle"."validation_issue_occurrence"."request_id" is null) and ("log_lifecycle"."validation_issue_occurrence"."rule_result_id" is null or "log_lifecycle"."validation_issue_occurrence"."attempt_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "log_lifecycle"."validation_issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"first_round_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"expected" text,
	"actual" text,
	"repro" text,
	"reporter_actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_issue_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "validation_issue_ownership_uq" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "validation_issue_title_check" CHECK (char_length("log_lifecycle"."validation_issue"."title") between 1 and 200),
	CONSTRAINT "validation_issue_body_check" CHECK (char_length("log_lifecycle"."validation_issue"."body") between 1 and 8000 and coalesce(char_length("log_lifecycle"."validation_issue"."expected"), 0) <= 8000 and coalesce(char_length("log_lifecycle"."validation_issue"."actual"), 0) <= 8000 and coalesce(char_length("log_lifecycle"."validation_issue"."repro"), 0) <= 8000)
);
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."round_comment" ADD CONSTRAINT "round_comment_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."round_comment" ADD CONSTRAINT "round_comment_author_actor_id_actors_id_fk" FOREIGN KEY ("author_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."round_comment" ADD CONSTRAINT "round_comment_target_fk" FOREIGN KEY ("workspace_id","round_id") REFERENCES "log_lifecycle"."validation_round"("workspace_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."round_comment" ADD CONSTRAINT "round_comment_correction_fk" FOREIGN KEY ("workspace_id","round_id","corrects_comment_id") REFERENCES "log_lifecycle"."round_comment"("workspace_id","round_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_comment" ADD CONSTRAINT "validation_issue_comment_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_comment" ADD CONSTRAINT "validation_issue_comment_author_actor_id_actors_id_fk" FOREIGN KEY ("author_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_comment" ADD CONSTRAINT "validation_issue_comment_target_fk" FOREIGN KEY ("workspace_id","issue_id") REFERENCES "log_lifecycle"."validation_issue"("workspace_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_comment" ADD CONSTRAINT "validation_issue_comment_correction_fk" FOREIGN KEY ("workspace_id","issue_id","corrects_comment_id") REFERENCES "log_lifecycle"."validation_issue_comment"("workspace_id","issue_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_event" ADD CONSTRAINT "validation_issue_event_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_event" ADD CONSTRAINT "validation_issue_event_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_event" ADD CONSTRAINT "validation_issue_event_issue_fk" FOREIGN KEY ("workspace_id","issue_id") REFERENCES "log_lifecycle"."validation_issue"("workspace_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_event" ADD CONSTRAINT "validation_issue_event_correction_fk" FOREIGN KEY ("workspace_id","issue_id","field","corrects_event_id") REFERENCES "log_lifecycle"."validation_issue_event"("workspace_id","issue_id","field","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_evidence_ref" ADD CONSTRAINT "validation_issue_evidence_ref_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_evidence_ref" ADD CONSTRAINT "validation_issue_evidence_ref_linker_actor_id_actors_id_fk" FOREIGN KEY ("linker_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_evidence_ref" ADD CONSTRAINT "validation_issue_evidence_ref_occurrence_fk" FOREIGN KEY ("workspace_id","occurrence_id") REFERENCES "log_lifecycle"."validation_issue_occurrence"("workspace_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_occurrence" ADD CONSTRAINT "validation_issue_occurrence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_occurrence" ADD CONSTRAINT "validation_issue_occurrence_linker_actor_id_actors_id_fk" FOREIGN KEY ("linker_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_occurrence" ADD CONSTRAINT "validation_issue_occurrence_issue_fk" FOREIGN KEY ("workspace_id","project_id","issue_id") REFERENCES "log_lifecycle"."validation_issue"("workspace_id","project_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_occurrence" ADD CONSTRAINT "validation_issue_occurrence_round_fk" FOREIGN KEY ("workspace_id","project_id","round_id") REFERENCES "log_lifecycle"."validation_round"("workspace_id","project_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_occurrence" ADD CONSTRAINT "validation_issue_occurrence_request_fk" FOREIGN KEY ("workspace_id","round_id","request_id") REFERENCES "log_lifecycle"."execution_request"("workspace_id","round_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_occurrence" ADD CONSTRAINT "validation_issue_occurrence_attempt_fk" FOREIGN KEY ("workspace_id","request_id","attempt_id") REFERENCES "log_lifecycle"."execution_attempt"("workspace_id","request_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue_occurrence" ADD CONSTRAINT "validation_issue_occurrence_result_fk" FOREIGN KEY ("workspace_id","attempt_id","rule_result_id") REFERENCES "log_lifecycle"."rule_result"("workspace_id","attempt_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue" ADD CONSTRAINT "validation_issue_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue" ADD CONSTRAINT "validation_issue_reporter_actor_id_actors_id_fk" FOREIGN KEY ("reporter_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue" ADD CONSTRAINT "validation_issue_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "log_lifecycle"."development_project"("workspace_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_issue" ADD CONSTRAINT "validation_issue_first_round_fk" FOREIGN KEY ("workspace_id","project_id","first_round_id") REFERENCES "log_lifecycle"."validation_round"("workspace_id","project_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "round_comment_page_idx" ON "log_lifecycle"."round_comment" USING btree ("workspace_id","round_id","created_at","id");
--> statement-breakpoint
CREATE INDEX "validation_issue_comment_page_idx" ON "log_lifecycle"."validation_issue_comment" USING btree ("workspace_id","issue_id","created_at","id");
--> statement-breakpoint
CREATE INDEX "validation_issue_event_page_idx" ON "log_lifecycle"."validation_issue_event" USING btree ("workspace_id","issue_id","created_at","id");
--> statement-breakpoint
CREATE INDEX "validation_issue_occurrence_issue_idx" ON "log_lifecycle"."validation_issue_occurrence" USING btree ("workspace_id","issue_id","created_at","id");
--> statement-breakpoint
CREATE INDEX "validation_issue_occurrence_round_idx" ON "log_lifecycle"."validation_issue_occurrence" USING btree ("workspace_id","round_id","issue_id");
--> statement-breakpoint
CREATE INDEX "validation_issue_project_idx" ON "log_lifecycle"."validation_issue" USING btree ("workspace_id","project_id","created_at","id");
--> statement-breakpoint
-- #1808 N1: insert-only human records. No change to existing grants or roles.
CREATE FUNCTION log_lifecycle.validation_issue_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'validation discussion records are append-only' USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
GRANT ALL ON log_lifecycle.validation_issue TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.validation_issue TO platform_app;
--> statement-breakpoint
CREATE TRIGGER validation_issue_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.validation_issue FOR EACH ROW EXECUTE FUNCTION log_lifecycle.validation_issue_append_only_guard();
--> statement-breakpoint
GRANT ALL ON log_lifecycle.validation_issue_occurrence TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.validation_issue_occurrence TO platform_app;
--> statement-breakpoint
CREATE TRIGGER validation_issue_occurrence_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.validation_issue_occurrence FOR EACH ROW EXECUTE FUNCTION log_lifecycle.validation_issue_append_only_guard();
--> statement-breakpoint
GRANT ALL ON log_lifecycle.validation_issue_evidence_ref TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.validation_issue_evidence_ref TO platform_app;
--> statement-breakpoint
CREATE TRIGGER validation_issue_evidence_ref_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.validation_issue_evidence_ref FOR EACH ROW EXECUTE FUNCTION log_lifecycle.validation_issue_append_only_guard();
--> statement-breakpoint
GRANT ALL ON log_lifecycle.validation_issue_comment TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.validation_issue_comment TO platform_app;
--> statement-breakpoint
CREATE TRIGGER validation_issue_comment_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.validation_issue_comment FOR EACH ROW EXECUTE FUNCTION log_lifecycle.validation_issue_append_only_guard();
--> statement-breakpoint
GRANT ALL ON log_lifecycle.round_comment TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.round_comment TO platform_app;
--> statement-breakpoint
CREATE TRIGGER round_comment_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.round_comment FOR EACH ROW EXECUTE FUNCTION log_lifecycle.validation_issue_append_only_guard();
--> statement-breakpoint
GRANT ALL ON log_lifecycle.validation_issue_event TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.validation_issue_event TO platform_app;
--> statement-breakpoint
CREATE TRIGGER validation_issue_event_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.validation_issue_event FOR EACH ROW EXECUTE FUNCTION log_lifecycle.validation_issue_append_only_guard();
