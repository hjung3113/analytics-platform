CREATE TABLE "knowledge"."common_concept" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"canonical_label" text NOT NULL,
	"label_key" text NOT NULL,
	"description" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "common_concept_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "common_concept_workspace_id_kind_uq" UNIQUE("workspace_id","id","kind"),
	CONSTRAINT "common_concept_workspace_kind_label_key_uq" UNIQUE("workspace_id","kind","label_key"),
	CONSTRAINT "common_concept_kind_check" CHECK ("knowledge"."common_concept"."kind" in ('module','event')),
	CONSTRAINT "common_concept_label_check" CHECK (char_length("knowledge"."common_concept"."canonical_label") between 1 and 200 and char_length("knowledge"."common_concept"."label_key") between 1 and 200),
	CONSTRAINT "common_concept_description_check" CHECK ("knowledge"."common_concept"."description" is null or char_length("knowledge"."common_concept"."description") <= 1000),
	CONSTRAINT "common_concept_row_version_check" CHECK ("knowledge"."common_concept"."row_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "knowledge"."item_revision_subject" (
	"workspace_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"model_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_key" text NOT NULL,
	"subject_relation" text NOT NULL,
	"spec_rev_no_at_link" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_revision_subject_pk" PRIMARY KEY("workspace_id","item_id","revision_no","model_id","target_kind","target_key"),
	CONSTRAINT "item_revision_subject_target_kind_check" CHECK ("knowledge"."item_revision_subject"."target_kind" in ('module','event')),
	CONSTRAINT "item_revision_subject_target_key_check" CHECK (char_length("knowledge"."item_revision_subject"."target_key") between 1 and 1200),
	CONSTRAINT "item_revision_subject_relation_check" CHECK ("knowledge"."item_revision_subject"."subject_relation" in ('about','context')),
	CONSTRAINT "item_revision_subject_spec_rev_check" CHECK ("knowledge"."item_revision_subject"."spec_rev_no_at_link" is null or "knowledge"."item_revision_subject"."spec_rev_no_at_link" >= 1)
);
--> statement-breakpoint
CREATE TABLE "knowledge"."spec_concept_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_key" text NOT NULL,
	"relation_kind" text NOT NULL,
	"review_state" text DEFAULT 'proposed' NOT NULL,
	"origin" text NOT NULL,
	"similarity_score" double precision,
	"similarity_basis" jsonb,
	"reject_reason" text,
	"proposed_by" uuid NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "spec_concept_mapping_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "spec_concept_mapping_target_kind_check" CHECK ("knowledge"."spec_concept_mapping"."target_kind" in ('module','event')),
	CONSTRAINT "spec_concept_mapping_target_key_check" CHECK (char_length("knowledge"."spec_concept_mapping"."target_key") between 1 and 1200),
	CONSTRAINT "spec_concept_mapping_relation_kind_check" CHECK ("knowledge"."spec_concept_mapping"."relation_kind" in ('equivalent','related')),
	CONSTRAINT "spec_concept_mapping_review_state_check" CHECK ("knowledge"."spec_concept_mapping"."review_state" in ('proposed','confirmed','rejected')),
	CONSTRAINT "spec_concept_mapping_origin_check" CHECK ("knowledge"."spec_concept_mapping"."origin" in ('human','similarity')),
	CONSTRAINT "spec_concept_mapping_similarity_check" CHECK ((("knowledge"."spec_concept_mapping"."origin" = 'similarity' and "knowledge"."spec_concept_mapping"."similarity_score" is not null and "knowledge"."spec_concept_mapping"."similarity_basis" is not null) or ("knowledge"."spec_concept_mapping"."origin" = 'human' and "knowledge"."spec_concept_mapping"."similarity_score" is null and "knowledge"."spec_concept_mapping"."similarity_basis" is null)) and ("knowledge"."spec_concept_mapping"."similarity_score" is null or "knowledge"."spec_concept_mapping"."similarity_score" between 0 and 1) and ("knowledge"."spec_concept_mapping"."similarity_basis" is null or jsonb_typeof("knowledge"."spec_concept_mapping"."similarity_basis") = 'object')),
	CONSTRAINT "spec_concept_mapping_review_check" CHECK ((("knowledge"."spec_concept_mapping"."review_state" = 'proposed') = ("knowledge"."spec_concept_mapping"."reviewed_by" is null and "knowledge"."spec_concept_mapping"."reviewed_at" is null)) and (("knowledge"."spec_concept_mapping"."review_state" = 'rejected') = ("knowledge"."spec_concept_mapping"."reject_reason" is not null)) and ("knowledge"."spec_concept_mapping"."reject_reason" is null or char_length("knowledge"."spec_concept_mapping"."reject_reason") between 1 and 500)),
	CONSTRAINT "spec_concept_mapping_row_version_check" CHECK ("knowledge"."spec_concept_mapping"."row_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "knowledge"."common_concept" ADD CONSTRAINT "common_concept_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."common_concept" ADD CONSTRAINT "common_concept_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_revision_subject" ADD CONSTRAINT "item_revision_subject_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_revision_subject" ADD CONSTRAINT "item_revision_subject_revision_fk" FOREIGN KEY ("workspace_id","item_id","revision_no") REFERENCES "knowledge"."knowledge_item_revision"("workspace_id","item_id","revision_no") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_revision_subject" ADD CONSTRAINT "item_revision_subject_model_fk" FOREIGN KEY ("workspace_id","model_id") REFERENCES "knowledge"."equipment_model"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_concept_mapping" ADD CONSTRAINT "spec_concept_mapping_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_concept_mapping" ADD CONSTRAINT "spec_concept_mapping_proposed_by_actors_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_concept_mapping" ADD CONSTRAINT "spec_concept_mapping_reviewed_by_actors_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_concept_mapping" ADD CONSTRAINT "spec_concept_mapping_concept_fk" FOREIGN KEY ("workspace_id","concept_id","target_kind") REFERENCES "knowledge"."common_concept"("workspace_id","id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_concept_mapping" ADD CONSTRAINT "spec_concept_mapping_model_fk" FOREIGN KEY ("workspace_id","model_id") REFERENCES "knowledge"."equipment_model"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_revision_subject_key_idx" ON "knowledge"."item_revision_subject" USING btree ("workspace_id","model_id","target_key");--> statement-breakpoint
CREATE UNIQUE INDEX "spec_concept_mapping_open_uq" ON "knowledge"."spec_concept_mapping" USING btree ("workspace_id","concept_id","model_id","target_key") WHERE "knowledge"."spec_concept_mapping"."review_state" in ('proposed','confirmed');--> statement-breakpoint
CREATE UNIQUE INDEX "spec_concept_mapping_rejected_uq" ON "knowledge"."spec_concept_mapping" USING btree ("workspace_id","concept_id","model_id","target_key") WHERE "knowledge"."spec_concept_mapping"."review_state" = 'rejected';--> statement-breakpoint
CREATE UNIQUE INDEX "spec_concept_mapping_confirmed_equivalent_uq" ON "knowledge"."spec_concept_mapping" USING btree ("workspace_id","model_id","target_key") WHERE "knowledge"."spec_concept_mapping"."review_state" = 'confirmed' and "knowledge"."spec_concept_mapping"."relation_kind" = 'equivalent';--> statement-breakpoint
CREATE INDEX "spec_concept_mapping_model_idx" ON "knowledge"."spec_concept_mapping" USING btree ("workspace_id","model_id","target_key");--> statement-breakpoint
CREATE INDEX "spec_concept_mapping_concept_idx" ON "knowledge"."spec_concept_mapping" USING btree ("workspace_id","concept_id","review_state");
--> statement-breakpoint
-- #1196 e + f (design v0.6 §15.2): all three tables are append-only for the runtime role.
--   common_concept, item_revision_subject: SELECT, INSERT only (no UPDATE, no DELETE).
--   spec_concept_mapping: INSERT, and UPDATE of exactly the review columns; no DELETE. The trigger below is the wall behind
--   the column grant (the migrate role is not limited by it): identity and similarity evidence never change, row_version
--   rises by exactly 1, and the state only moves proposed -> confirmed, proposed -> rejected or confirmed -> rejected
--   (a rejected row is final: the pair is never proposed again). The reject reason is required by the review CHECK.
GRANT ALL ON knowledge.common_concept, knowledge.spec_concept_mapping, knowledge.item_revision_subject TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON knowledge.common_concept, knowledge.spec_concept_mapping, knowledge.item_revision_subject TO platform_app;
--> statement-breakpoint
GRANT UPDATE (review_state, reject_reason, reviewed_by, reviewed_at, row_version) ON knowledge.spec_concept_mapping TO platform_app;
--> statement-breakpoint
CREATE FUNCTION knowledge.spec_concept_mapping_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.concept_id IS DISTINCT FROM OLD.concept_id
		OR NEW.model_id IS DISTINCT FROM OLD.model_id OR NEW.target_kind IS DISTINCT FROM OLD.target_kind
		OR NEW.target_key IS DISTINCT FROM OLD.target_key OR NEW.relation_kind IS DISTINCT FROM OLD.relation_kind
		OR NEW.origin IS DISTINCT FROM OLD.origin OR NEW.similarity_score IS DISTINCT FROM OLD.similarity_score
		OR NEW.similarity_basis IS DISTINCT FROM OLD.similarity_basis OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
		OR NEW.proposed_at IS DISTINCT FROM OLD.proposed_at THEN
		RAISE EXCEPTION 'concept mapping % identity and proposal columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'concept mapping % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NOT ((OLD.review_state = 'proposed' AND NEW.review_state IN ('confirmed', 'rejected'))
		OR (OLD.review_state = 'confirmed' AND NEW.review_state = 'rejected')) THEN
		RAISE EXCEPTION 'concept mapping % cannot move from % to %', OLD.id, OLD.review_state, NEW.review_state USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER spec_concept_mapping_guard BEFORE UPDATE ON knowledge.spec_concept_mapping FOR EACH ROW EXECUTE FUNCTION knowledge.spec_concept_mapping_guard();
