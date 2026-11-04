CREATE TABLE "knowledge"."model_spec_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"state" text NOT NULL,
	"source_doc_ref" jsonb NOT NULL,
	"content_sha256" text,
	"schema_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	CONSTRAINT "model_spec_revision_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "model_spec_revision_no_check" CHECK ("knowledge"."model_spec_revision"."revision_no" >= 1),
	CONSTRAINT "model_spec_revision_state_check" CHECK ("knowledge"."model_spec_revision"."state" in ('draft','published','rejected')),
	CONSTRAINT "model_spec_revision_schema_version_check" CHECK ("knowledge"."model_spec_revision"."schema_version" >= 1),
	CONSTRAINT "model_spec_revision_source_doc_ref_check" CHECK (jsonb_typeof("knowledge"."model_spec_revision"."source_doc_ref") = 'object' and coalesce(jsonb_typeof("knowledge"."model_spec_revision"."source_doc_ref" -> 'docLabel'), '') = 'string' and coalesce(jsonb_typeof("knowledge"."model_spec_revision"."source_doc_ref" -> 'docVersion'), '') = 'string' and ("knowledge"."model_spec_revision"."source_doc_ref" - 'docLabel' - 'docVersion' - 'link') = '{}'::jsonb and (not ("knowledge"."model_spec_revision"."source_doc_ref" ? 'link') or jsonb_typeof("knowledge"."model_spec_revision"."source_doc_ref" -> 'link') = 'string')),
	CONSTRAINT "model_spec_revision_content_sha256_check" CHECK ("knowledge"."model_spec_revision"."content_sha256" is null or "knowledge"."model_spec_revision"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "model_spec_revision_published_check" CHECK (("knowledge"."model_spec_revision"."state" = 'published') = ("knowledge"."model_spec_revision"."published_at" is not null) and ("knowledge"."model_spec_revision"."state" = 'published') = ("knowledge"."model_spec_revision"."published_by" is not null) and ("knowledge"."model_spec_revision"."state" <> 'published' or "knowledge"."model_spec_revision"."content_sha256" is not null))
);
--> statement-breakpoint
CREATE TABLE "knowledge"."spec_event_relation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"spec_rev_id" uuid NOT NULL,
	"source_event_id" uuid NOT NULL,
	"predicate" text NOT NULL,
	"target_event_id" uuid NOT NULL,
	"rule_ref" text,
	CONSTRAINT "spec_event_relation_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "spec_event_relation_predicate_check" CHECK (char_length("knowledge"."spec_event_relation"."predicate") between 1 and 100 and btrim("knowledge"."spec_event_relation"."predicate") <> ''),
	CONSTRAINT "spec_event_relation_not_self_check" CHECK ("knowledge"."spec_event_relation"."source_event_id" <> "knowledge"."spec_event_relation"."target_event_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge"."spec_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"spec_rev_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"name" text NOT NULL,
	"fields_json" jsonb NOT NULL,
	"trigger_rule" text,
	"detail_doc_ref" text,
	CONSTRAINT "spec_event_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "spec_event_workspace_rev_id_uq" UNIQUE("workspace_id","spec_rev_id","id"),
	CONSTRAINT "spec_event_key_check" CHECK (char_length("knowledge"."spec_event"."event_key") between 1 and 200),
	CONSTRAINT "spec_event_name_check" CHECK (char_length("knowledge"."spec_event"."name") between 1 and 200),
	CONSTRAINT "spec_event_fields_json_check" CHECK (jsonb_typeof("knowledge"."spec_event"."fields_json") = 'array')
);
--> statement-breakpoint
CREATE TABLE "knowledge"."spec_module" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"spec_rev_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"name" text NOT NULL,
	"parent_module_id" uuid,
	CONSTRAINT "spec_module_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "spec_module_workspace_rev_id_uq" UNIQUE("workspace_id","spec_rev_id","id"),
	CONSTRAINT "spec_module_key_check" CHECK (char_length("knowledge"."spec_module"."module_key") between 1 and 200),
	CONSTRAINT "spec_module_name_check" CHECK (char_length("knowledge"."spec_module"."name") between 1 and 200),
	CONSTRAINT "spec_module_not_self_parent_check" CHECK ("knowledge"."spec_module"."parent_module_id" is distinct from "knowledge"."spec_module"."id")
);
--> statement-breakpoint
ALTER TABLE "knowledge"."software_version" ADD COLUMN "release_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- #1196 a: existing rows take 1..n per model in registration order (created_at, id); not unique on purpose.
UPDATE "knowledge"."software_version" AS s SET "release_order" = r.rn FROM (SELECT "workspace_id", "id", (row_number() OVER (PARTITION BY "workspace_id", "model_id" ORDER BY "created_at", "id"))::integer AS rn FROM "knowledge"."software_version") AS r WHERE s."workspace_id" = r."workspace_id" AND s."id" = r."id";--> statement-breakpoint
ALTER TABLE "knowledge"."model_spec_revision" ADD CONSTRAINT "model_spec_revision_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."model_spec_revision" ADD CONSTRAINT "model_spec_revision_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."model_spec_revision" ADD CONSTRAINT "model_spec_revision_published_by_actors_id_fk" FOREIGN KEY ("published_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."model_spec_revision" ADD CONSTRAINT "model_spec_revision_model_fk" FOREIGN KEY ("workspace_id","model_id") REFERENCES "knowledge"."equipment_model"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_event_relation" ADD CONSTRAINT "spec_event_relation_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_event_relation" ADD CONSTRAINT "spec_event_relation_revision_fk" FOREIGN KEY ("workspace_id","spec_rev_id") REFERENCES "knowledge"."model_spec_revision"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_event_relation" ADD CONSTRAINT "spec_event_relation_source_fk" FOREIGN KEY ("workspace_id","spec_rev_id","source_event_id") REFERENCES "knowledge"."spec_event"("workspace_id","spec_rev_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_event_relation" ADD CONSTRAINT "spec_event_relation_target_fk" FOREIGN KEY ("workspace_id","spec_rev_id","target_event_id") REFERENCES "knowledge"."spec_event"("workspace_id","spec_rev_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_event" ADD CONSTRAINT "spec_event_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_event" ADD CONSTRAINT "spec_event_revision_fk" FOREIGN KEY ("workspace_id","spec_rev_id") REFERENCES "knowledge"."model_spec_revision"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_event" ADD CONSTRAINT "spec_event_module_fk" FOREIGN KEY ("workspace_id","spec_rev_id","module_id") REFERENCES "knowledge"."spec_module"("workspace_id","spec_rev_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_module" ADD CONSTRAINT "spec_module_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_module" ADD CONSTRAINT "spec_module_revision_fk" FOREIGN KEY ("workspace_id","spec_rev_id") REFERENCES "knowledge"."model_spec_revision"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_module" ADD CONSTRAINT "spec_module_parent_fk" FOREIGN KEY ("workspace_id","spec_rev_id","parent_module_id") REFERENCES "knowledge"."spec_module"("workspace_id","spec_rev_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_spec_revision_workspace_model_revision_no_uq" ON "knowledge"."model_spec_revision" USING btree ("workspace_id","model_id","revision_no");--> statement-breakpoint
CREATE INDEX "model_spec_revision_model_state_idx" ON "knowledge"."model_spec_revision" USING btree ("workspace_id","model_id","state","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX "spec_event_relation_edge_uq" ON "knowledge"."spec_event_relation" USING btree ("workspace_id","spec_rev_id","source_event_id","predicate","target_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spec_event_workspace_rev_module_event_key_uq" ON "knowledge"."spec_event" USING btree ("workspace_id","spec_rev_id","module_id","event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "spec_module_workspace_rev_module_key_uq" ON "knowledge"."spec_module" USING btree ("workspace_id","spec_rev_id","module_key");--> statement-breakpoint
CREATE INDEX "software_version_model_release_order_idx" ON "knowledge"."software_version" USING btree ("workspace_id","model_id","release_order");--> statement-breakpoint
ALTER TABLE "knowledge"."software_version" ADD CONSTRAINT "software_version_release_order_check" CHECK ("knowledge"."software_version"."release_order" >= 1);
--> statement-breakpoint
-- release_order 0 means "not assigned": a new software version takes max + 1 of its model (explicit values >= 1 are
-- kept, e.g. a later reorder). The advisory lock serialises concurrent inserts of one model. The column is not unique.
CREATE FUNCTION knowledge.software_version_release_order() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.release_order IS NULL OR NEW.release_order = 0 THEN
		PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id::text || ':' || NEW.model_id::text, 0));
		SELECT COALESCE(MAX(s.release_order), 0) + 1 INTO NEW.release_order FROM knowledge.software_version s WHERE s.workspace_id = NEW.workspace_id AND s.model_id = NEW.model_id;
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER software_version_release_order BEFORE INSERT ON knowledge.software_version FOR EACH ROW EXECUTE FUNCTION knowledge.software_version_release_order();
--> statement-breakpoint
-- Model spec (design v0.6 §15, #1196 a; ADR-0109 style). The runtime role holds SELECT and INSERT only on the four
-- tables: no UPDATE and no DELETE, so a published revision's content, hash and state cannot be rewritten by it.
-- The write node (b) will add a column-limited UPDATE for the draft -> published transition columns
-- (state, content_sha256, published_by, published_at) and nothing else. Child rows can only be inserted while their
-- revision is a draft (trigger below), so a published revision never gains modules, events or relations either.
GRANT ALL ON knowledge.model_spec_revision, knowledge.spec_module, knowledge.spec_event, knowledge.spec_event_relation TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON knowledge.model_spec_revision, knowledge.spec_module, knowledge.spec_event, knowledge.spec_event_relation TO platform_app;
--> statement-breakpoint
CREATE FUNCTION knowledge.spec_child_requires_draft() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM knowledge.model_spec_revision r WHERE r.workspace_id = NEW.workspace_id AND r.id = NEW.spec_rev_id AND r.state = 'draft') THEN
		RAISE EXCEPTION 'model spec revision % is not a draft', NEW.spec_rev_id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER spec_module_requires_draft BEFORE INSERT ON knowledge.spec_module FOR EACH ROW EXECUTE FUNCTION knowledge.spec_child_requires_draft();
--> statement-breakpoint
CREATE TRIGGER spec_event_requires_draft BEFORE INSERT ON knowledge.spec_event FOR EACH ROW EXECUTE FUNCTION knowledge.spec_child_requires_draft();
--> statement-breakpoint
CREATE TRIGGER spec_event_relation_requires_draft BEFORE INSERT ON knowledge.spec_event_relation FOR EACH ROW EXECUTE FUNCTION knowledge.spec_child_requires_draft();
