CREATE TABLE "knowledge"."item_assessment_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"based_on_revision_no" integer NOT NULL,
	"dimension" text NOT NULL,
	"prior_state" text NOT NULL,
	"new_state" text NOT NULL,
	"rationale" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_assessment_event_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "item_assessment_event_states_check" CHECK (("knowledge"."item_assessment_event"."dimension" = 'verification' and "knowledge"."item_assessment_event"."prior_state" in ('not_checked','observed','verified','disputed') and "knowledge"."item_assessment_event"."new_state" in ('not_checked','observed','verified','disputed')) or ("knowledge"."item_assessment_event"."dimension" = 'processing' and "knowledge"."item_assessment_event"."prior_state" in ('open','under_investigation','resolved') and "knowledge"."item_assessment_event"."new_state" in ('open','under_investigation','resolved'))),
	CONSTRAINT "item_assessment_event_rationale_check" CHECK (char_length("knowledge"."item_assessment_event"."rationale") between 1 and 2000 and btrim("knowledge"."item_assessment_event"."rationale") <> '')
);
--> statement-breakpoint
CREATE TABLE "knowledge"."item_counter" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"last_item_no" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge"."item_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"target_item_id" uuid NOT NULL,
	"link_kind" text NOT NULL,
	"source_revision_no" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "item_link_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "item_link_kind_check" CHECK ("knowledge"."item_link"."link_kind" in ('derived_from','related')),
	CONSTRAINT "item_link_not_self_check" CHECK ("knowledge"."item_link"."source_item_id" <> "knowledge"."item_link"."target_item_id"),
	CONSTRAINT "item_link_revision_check" CHECK (("knowledge"."item_link"."link_kind" = 'derived_from') = ("knowledge"."item_link"."source_revision_no" is not null))
);
--> statement-breakpoint
CREATE TABLE "knowledge"."item_revision_evidence" (
	"workspace_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"source_kind" text NOT NULL,
	"source_owner" text NOT NULL,
	"source_ref" text NOT NULL,
	"source_version" text,
	"content_hash" text,
	"locator" text,
	"note" text,
	CONSTRAINT "item_revision_evidence_pk" PRIMARY KEY("workspace_id","item_id","revision_no","ordinal"),
	CONSTRAINT "item_revision_evidence_ordinal_check" CHECK ("knowledge"."item_revision_evidence"."ordinal" >= 1),
	CONSTRAINT "item_revision_evidence_source_kind_check" CHECK ("knowledge"."item_revision_evidence"."source_kind" in ('log_file','spec','image','validation_run','other')),
	CONSTRAINT "item_revision_evidence_source_check" CHECK (btrim("knowledge"."item_revision_evidence"."source_owner") <> '' and btrim("knowledge"."item_revision_evidence"."source_ref") <> ''),
	CONSTRAINT "item_revision_evidence_note_check" CHECK (coalesce(char_length("knowledge"."item_revision_evidence"."note"), 0) <= 500)
);
--> statement-breakpoint
CREATE TABLE "knowledge"."knowledge_item_revision" (
	"workspace_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"title" text NOT NULL,
	"type_code" text NOT NULL,
	"observation" text,
	"expected" text,
	"analysis_opinion" text,
	"improvement" text,
	"change_note" text,
	"published_by" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_item_revision_pk" PRIMARY KEY("workspace_id","item_id","revision_no"),
	CONSTRAINT "knowledge_item_revision_no_check" CHECK ("knowledge"."knowledge_item_revision"."revision_no" >= 1),
	CONSTRAINT "knowledge_item_revision_title_check" CHECK (char_length("knowledge"."knowledge_item_revision"."title") between 1 and 200 and btrim("knowledge"."knowledge_item_revision"."title") <> ''),
	CONSTRAINT "knowledge_item_revision_type_code_check" CHECK ("knowledge"."knowledge_item_revision"."type_code" in ('anomaly','needs_check','behavior_note','guideline')),
	CONSTRAINT "knowledge_item_revision_text_check" CHECK (coalesce(char_length("knowledge"."knowledge_item_revision"."observation"), 0) <= 20000 and coalesce(char_length("knowledge"."knowledge_item_revision"."expected"), 0) <= 20000 and coalesce(char_length("knowledge"."knowledge_item_revision"."analysis_opinion"), 0) <= 20000 and coalesce(char_length("knowledge"."knowledge_item_revision"."improvement"), 0) <= 20000),
	CONSTRAINT "knowledge_item_revision_content_check" CHECK (btrim(coalesce("knowledge"."knowledge_item_revision"."observation", '')) <> '' or btrim(coalesce("knowledge"."knowledge_item_revision"."expected", '')) <> '')
);
--> statement-breakpoint
CREATE TABLE "knowledge"."knowledge_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"item_no" integer NOT NULL,
	"owner_model_id" uuid,
	"owner_software_id" uuid,
	"latest_revision_no" integer NOT NULL,
	"publication_state" text NOT NULL,
	"verification_state" text DEFAULT 'not_checked' NOT NULL,
	"processing_state" text DEFAULT 'open' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "knowledge_item_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "knowledge_item_owner_xor" CHECK (num_nonnulls("knowledge"."knowledge_item"."owner_model_id", "knowledge"."knowledge_item"."owner_software_id") = 1),
	CONSTRAINT "knowledge_item_item_no_check" CHECK ("knowledge"."knowledge_item"."item_no" >= 1),
	CONSTRAINT "knowledge_item_latest_revision_no_check" CHECK ("knowledge"."knowledge_item"."latest_revision_no" >= 1),
	CONSTRAINT "knowledge_item_publication_state_check" CHECK ("knowledge"."knowledge_item"."publication_state" in ('published','archived')),
	CONSTRAINT "knowledge_item_verification_state_check" CHECK ("knowledge"."knowledge_item"."verification_state" in ('not_checked','observed','verified','disputed')),
	CONSTRAINT "knowledge_item_processing_state_check" CHECK ("knowledge"."knowledge_item"."processing_state" in ('open','under_investigation','resolved')),
	CONSTRAINT "knowledge_item_row_version_check" CHECK ("knowledge"."knowledge_item"."row_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "knowledge"."item_assessment_event" ADD CONSTRAINT "item_assessment_event_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_assessment_event" ADD CONSTRAINT "item_assessment_event_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_assessment_event" ADD CONSTRAINT "item_assessment_event_item_fk" FOREIGN KEY ("workspace_id","item_id") REFERENCES "knowledge"."knowledge_item"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_assessment_event" ADD CONSTRAINT "item_assessment_event_revision_fk" FOREIGN KEY ("workspace_id","item_id","based_on_revision_no") REFERENCES "knowledge"."knowledge_item_revision"("workspace_id","item_id","revision_no") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_counter" ADD CONSTRAINT "item_counter_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_link" ADD CONSTRAINT "item_link_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_link" ADD CONSTRAINT "item_link_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_link" ADD CONSTRAINT "item_link_source_fk" FOREIGN KEY ("workspace_id","source_item_id") REFERENCES "knowledge"."knowledge_item"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_link" ADD CONSTRAINT "item_link_target_fk" FOREIGN KEY ("workspace_id","target_item_id") REFERENCES "knowledge"."knowledge_item"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_link" ADD CONSTRAINT "item_link_target_revision_fk" FOREIGN KEY ("workspace_id","target_item_id","source_revision_no") REFERENCES "knowledge"."knowledge_item_revision"("workspace_id","item_id","revision_no") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_revision_evidence" ADD CONSTRAINT "item_revision_evidence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_revision_evidence" ADD CONSTRAINT "item_revision_evidence_revision_fk" FOREIGN KEY ("workspace_id","item_id","revision_no") REFERENCES "knowledge"."knowledge_item_revision"("workspace_id","item_id","revision_no") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."knowledge_item_revision" ADD CONSTRAINT "knowledge_item_revision_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."knowledge_item_revision" ADD CONSTRAINT "knowledge_item_revision_published_by_actors_id_fk" FOREIGN KEY ("published_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."knowledge_item_revision" ADD CONSTRAINT "knowledge_item_revision_item_fk" FOREIGN KEY ("workspace_id","item_id") REFERENCES "knowledge"."knowledge_item"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."knowledge_item" ADD CONSTRAINT "knowledge_item_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."knowledge_item" ADD CONSTRAINT "knowledge_item_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."knowledge_item" ADD CONSTRAINT "knowledge_item_updated_by_actors_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."knowledge_item" ADD CONSTRAINT "knowledge_item_owner_model_fk" FOREIGN KEY ("workspace_id","owner_model_id") REFERENCES "knowledge"."equipment_model"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."knowledge_item" ADD CONSTRAINT "knowledge_item_owner_software_fk" FOREIGN KEY ("workspace_id","owner_software_id") REFERENCES "knowledge"."software_version"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_assessment_event_item_idx" ON "knowledge"."item_assessment_event" USING btree ("workspace_id","item_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "item_link_pair_uq" ON "knowledge"."item_link" USING btree ("workspace_id","source_item_id","target_item_id","link_kind");--> statement-breakpoint
CREATE INDEX "item_link_target_idx" ON "knowledge"."item_link" USING btree ("workspace_id","target_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_item_workspace_item_no_uq" ON "knowledge"."knowledge_item" USING btree ("workspace_id","item_no");--> statement-breakpoint
CREATE INDEX "knowledge_item_owner_model_idx" ON "knowledge"."knowledge_item" USING btree ("workspace_id","owner_model_id");--> statement-breakpoint
CREATE INDEX "knowledge_item_owner_software_idx" ON "knowledge"."knowledge_item" USING btree ("workspace_id","owner_software_id");
--> statement-breakpoint
-- Log knowledge items (ADR-0109, #1197 a). The runtime role cannot rewrite history: revisions, evidence,
-- assessment events and links are INSERT-only; an item's owner is immutable (column-level UPDATE excludes
-- owner_model_id / owner_software_id and every identity column); the number counter only moves forward.
GRANT ALL ON knowledge.item_counter, knowledge.knowledge_item, knowledge.knowledge_item_revision, knowledge.item_revision_evidence, knowledge.item_assessment_event, knowledge.item_link TO platform_migrate;
GRANT SELECT, INSERT ON knowledge.knowledge_item, knowledge.knowledge_item_revision, knowledge.item_revision_evidence, knowledge.item_assessment_event, knowledge.item_link TO platform_app;
GRANT SELECT, INSERT, UPDATE (last_item_no) ON knowledge.item_counter TO platform_app;
GRANT UPDATE (latest_revision_no, publication_state, verification_state, processing_state, row_version, updated_by, updated_at) ON knowledge.knowledge_item TO platform_app;
