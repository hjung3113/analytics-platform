CREATE SCHEMA "improvement";
--> statement-breakpoint
CREATE TABLE "improvement"."item_counter" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"last_item_no" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "improvement"."item_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "improvement"."item_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text,
	CONSTRAINT "improvement_item_event_seq_uq" UNIQUE("seq"),
	CONSTRAINT "improvement_item_event_type_check" CHECK ("improvement"."item_event"."event_type" in ('created','updated','status_changed','assigned','quest_linked','reopened')),
	CONSTRAINT "improvement_item_event_changes_check" CHECK (jsonb_typeof("improvement"."item_event"."changes") = 'object'),
	CONSTRAINT "improvement_item_event_reason_check" CHECK (coalesce(char_length("improvement"."item_event"."reason"), 0) <= 2000)
);
--> statement-breakpoint
CREATE TABLE "improvement"."item_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"external_key" text NOT NULL,
	"display_name_snapshot" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "improvement_item_target_kind_check" CHECK ("improvement"."item_target"."kind" in ('equipment','process')),
	CONSTRAINT "improvement_item_target_key_check" CHECK (char_length("improvement"."item_target"."external_key") between 1 and 200 and btrim("improvement"."item_target"."external_key") <> ''),
	CONSTRAINT "improvement_item_target_name_check" CHECK (char_length("improvement"."item_target"."display_name_snapshot") <= 200)
);
--> statement-breakpoint
CREATE TABLE "improvement"."item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"item_no" integer NOT NULL,
	"problem" text NOT NULL,
	"action" text,
	"action_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_id" uuid,
	"quest_id" text,
	"quest_title_snapshot" text,
	"origin_menu_id" text,
	"origin_context" jsonb,
	"effect_result" text,
	"effect_note" text,
	"effect_compare_link" text,
	"drop_reason" text,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "improvement_item_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "improvement_item_item_no_check" CHECK ("improvement"."item"."item_no" >= 1),
	CONSTRAINT "improvement_item_problem_check" CHECK (char_length("improvement"."item"."problem") between 1 and 500 and btrim("improvement"."item"."problem") <> ''),
	CONSTRAINT "improvement_item_action_check" CHECK (coalesce(char_length("improvement"."item"."action"), 0) <= 2000),
	CONSTRAINT "improvement_item_status_check" CHECK ("improvement"."item"."status" in ('open','in_progress','done','verified','dropped')),
	CONSTRAINT "improvement_item_quest_pair_check" CHECK (("improvement"."item"."quest_id" is null) = ("improvement"."item"."quest_title_snapshot" is null)),
	CONSTRAINT "improvement_item_quest_text_check" CHECK (coalesce(char_length("improvement"."item"."quest_id"), 0) <= 200 and coalesce(char_length("improvement"."item"."quest_title_snapshot"), 0) <= 200 and btrim(coalesce("improvement"."item"."quest_id", 'x')) <> ''),
	CONSTRAINT "improvement_item_origin_pair_check" CHECK (("improvement"."item"."origin_menu_id" is null) = ("improvement"."item"."origin_context" is null)),
	CONSTRAINT "improvement_item_origin_menu_check" CHECK (coalesce(char_length("improvement"."item"."origin_menu_id"), 0) <= 200 and btrim(coalesce("improvement"."item"."origin_menu_id", 'x')) <> ''),
	CONSTRAINT "improvement_item_origin_context_check" CHECK ("improvement"."item"."origin_context" is null or jsonb_typeof("improvement"."item"."origin_context") = 'object'),
	CONSTRAINT "improvement_item_effect_result_check" CHECK ("improvement"."item"."effect_result" is null or "improvement"."item"."effect_result" in ('effective','ineffective','inconclusive')),
	CONSTRAINT "improvement_item_effect_note_check" CHECK (coalesce(char_length("improvement"."item"."effect_note"), 0) <= 2000),
	CONSTRAINT "improvement_item_effect_compare_link_check" CHECK ("improvement"."item"."effect_compare_link" is null or (char_length("improvement"."item"."effect_compare_link") <= 2000 and "improvement"."item"."effect_compare_link" ~ '^/[^/\\]')),
	CONSTRAINT "improvement_item_drop_reason_check" CHECK (coalesce(char_length("improvement"."item"."drop_reason"), 0) <= 2000),
	CONSTRAINT "improvement_item_row_version_check" CHECK ("improvement"."item"."row_version" >= 1),
	CONSTRAINT "improvement_item_action_required_check" CHECK ("improvement"."item"."status" not in ('in_progress','done','verified') or btrim(coalesce("improvement"."item"."action", '')) <> ''),
	CONSTRAINT "improvement_item_action_date_required_check" CHECK ("improvement"."item"."status" not in ('done','verified') or "improvement"."item"."action_date" is not null),
	CONSTRAINT "improvement_item_verified_effect_check" CHECK ("improvement"."item"."status" <> 'verified' or "improvement"."item"."effect_result" is not null),
	CONSTRAINT "improvement_item_dropped_reason_check" CHECK ("improvement"."item"."status" <> 'dropped' or btrim(coalesce("improvement"."item"."drop_reason", '')) <> ''),
	CONSTRAINT "improvement_item_effect_detail_check" CHECK ("improvement"."item"."effect_result" is not null or ("improvement"."item"."effect_note" is null and "improvement"."item"."effect_compare_link" is null))
);
--> statement-breakpoint
ALTER TABLE "improvement"."item_counter" ADD CONSTRAINT "item_counter_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement"."item_event" ADD CONSTRAINT "item_event_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement"."item_event" ADD CONSTRAINT "item_event_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement"."item_event" ADD CONSTRAINT "improvement_item_event_item_fk" FOREIGN KEY ("workspace_id","item_id") REFERENCES "improvement"."item"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement"."item_target" ADD CONSTRAINT "item_target_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement"."item_target" ADD CONSTRAINT "improvement_item_target_item_fk" FOREIGN KEY ("workspace_id","item_id") REFERENCES "improvement"."item"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement"."item" ADD CONSTRAINT "item_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement"."item" ADD CONSTRAINT "item_assignee_id_actors_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement"."item" ADD CONSTRAINT "item_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement"."item" ADD CONSTRAINT "item_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "improvement_item_event_item_idx" ON "improvement"."item_event" USING btree ("workspace_id","item_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "improvement_item_target_item_kind_key_uq" ON "improvement"."item_target" USING btree ("workspace_id","item_id","kind","external_key");--> statement-breakpoint
CREATE INDEX "improvement_item_target_key_idx" ON "improvement"."item_target" USING btree ("workspace_id","kind","external_key");--> statement-breakpoint
CREATE UNIQUE INDEX "improvement_item_workspace_item_no_uq" ON "improvement"."item" USING btree ("workspace_id","item_no");--> statement-breakpoint
CREATE INDEX "improvement_item_status_idx" ON "improvement"."item" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "improvement_item_assignee_idx" ON "improvement"."item" USING btree ("workspace_id","assignee_id");--> statement-breakpoint
CREATE INDEX "improvement_item_quest_idx" ON "improvement"."item" USING btree ("workspace_id","quest_id");--> statement-breakpoint
CREATE INDEX "improvement_item_created_idx" ON "improvement"."item" USING btree ("workspace_id","created_at");
--> statement-breakpoint
-- Improvement items (#1328 a, ADR-0106 amendment 2). Reads only: the runtime role holds SELECT on the three data
-- tables and no INSERT/UPDATE/DELETE; node b adds the column-limited writes together with the guard triggers, the
-- capability and the audit projection. The number counter is the one writable table (allocation helper, as 0082).
GRANT USAGE ON SCHEMA improvement TO platform_app, platform_migrate;
--> statement-breakpoint
GRANT ALL ON improvement.item, improvement.item_target, improvement.item_event, improvement.item_counter TO platform_migrate;
--> statement-breakpoint
GRANT SELECT ON improvement.item, improvement.item_target, improvement.item_event TO platform_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (last_item_no) ON improvement.item_counter TO platform_app;
