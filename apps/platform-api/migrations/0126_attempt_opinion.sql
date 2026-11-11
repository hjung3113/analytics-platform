CREATE TABLE "log_lifecycle"."attempt_opinion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"rule_result_id" uuid,
	"actor_id" uuid NOT NULL,
	"token_id" uuid,
	"submission_id" text NOT NULL,
	"grade" text NOT NULL,
	"mark" text,
	"note" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_revision" text,
	"producer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_opinion_submission_uq" UNIQUE("attempt_id","actor_id","submission_id","item_key"),
	CONSTRAINT "attempt_opinion_grade_check" CHECK ("log_lifecycle"."attempt_opinion"."grade" ~ '^[a-z0-9_-]{1,32}$' and ("log_lifecycle"."attempt_opinion"."mark" is null or "log_lifecycle"."attempt_opinion"."mark" ~ '^[a-z0-9_-]{1,32}$')),
	CONSTRAINT "attempt_opinion_text_check" CHECK (char_length("log_lifecycle"."attempt_opinion"."item_key") between 1 and 200 and char_length("log_lifecycle"."attempt_opinion"."submission_id") between 1 and 200 and coalesce(char_length("log_lifecycle"."attempt_opinion"."note"), 0) <= 1000 and coalesce(char_length("log_lifecycle"."attempt_opinion"."input_revision"), 0) <= 200 and coalesce(char_length("log_lifecycle"."attempt_opinion"."producer"), 0) <= 200),
	CONSTRAINT "attempt_opinion_evidence_check" CHECK (jsonb_typeof("log_lifecycle"."attempt_opinion"."evidence") = 'array' and jsonb_array_length("log_lifecycle"."attempt_opinion"."evidence") <= 20)
);
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."queue_settings" ADD COLUMN "opinion_scale" jsonb DEFAULT '{"grades":[],"marks":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."attempt_opinion" ADD CONSTRAINT "attempt_opinion_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."attempt_opinion" ADD CONSTRAINT "attempt_opinion_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."attempt_opinion" ADD CONSTRAINT "attempt_opinion_attempt_fk" FOREIGN KEY ("workspace_id","attempt_id") REFERENCES "log_lifecycle"."execution_attempt"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."attempt_opinion" ADD CONSTRAINT "attempt_opinion_rule_result_fk" FOREIGN KEY ("workspace_id","rule_result_id") REFERENCES "log_lifecycle"."rule_result"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_opinion_item_idx" ON "log_lifecycle"."attempt_opinion" USING btree ("workspace_id","attempt_id","item_key","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "attempt_opinion_rule_result_idx" ON "log_lifecycle"."attempt_opinion" USING btree ("rule_result_id") WHERE "log_lifecycle"."attempt_opinion"."rule_result_id" is not null;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."queue_settings" ADD CONSTRAINT "queue_settings_opinion_scale_check" CHECK (jsonb_typeof("log_lifecycle"."queue_settings"."opinion_scale") = 'object' and jsonb_typeof("log_lifecycle"."queue_settings"."opinion_scale" -> 'grades') = 'array' and jsonb_typeof("log_lifecycle"."queue_settings"."opinion_scale" -> 'marks') = 'array' and jsonb_array_length("log_lifecycle"."queue_settings"."opinion_scale" -> 'grades') <= 12 and jsonb_array_length("log_lifecycle"."queue_settings"."opinion_scale" -> 'marks') <= 12);--> statement-breakpoint
-- #1778 (ADR-0117 amendment 2): opinions on the items of a succeeded attempt. Insert-only for the runtime role (SELECT + INSERT, no
-- UPDATE/DELETE grant) and for everyone else through the guard trigger below; rows are removed only with the trigger disabled (test
-- teardown). Neither rule_result nor execution_attempt changes. Roles are not touched; the one grant change is the column list of the
-- existing UPDATE grant on queue_settings, which gains opinion_scale (the administrator's declared scale).
GRANT ALL ON log_lifecycle.attempt_opinion TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.attempt_opinion TO platform_app;
--> statement-breakpoint
GRANT UPDATE (opinion_scale) ON log_lifecycle.queue_settings TO platform_app;
--> statement-breakpoint
CREATE FUNCTION log_lifecycle.attempt_opinion_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION 'attempt opinion is append-only' USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER attempt_opinion_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.attempt_opinion FOR EACH ROW EXECUTE FUNCTION log_lifecycle.attempt_opinion_guard();
