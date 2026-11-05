CREATE TABLE "knowledge"."spec_sw_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"software_id" uuid NOT NULL,
	"ends_before_software_id" uuid,
	"target_kind" text NOT NULL,
	"target_key" text NOT NULL,
	"change_kind" text NOT NULL,
	"change_json" jsonb NOT NULL,
	"note" text,
	"based_on_rev_no" integer NOT NULL,
	"evidence_ref" text,
	"needs_revalidation" boolean DEFAULT false NOT NULL,
	"revalidation_rev_no" integer,
	"retired_at" timestamp with time zone,
	"retired_by" uuid,
	"retired_by_change_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "spec_sw_change_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "spec_sw_change_workspace_model_id_uq" UNIQUE("workspace_id","model_id","id"),
	CONSTRAINT "spec_sw_change_target_kind_check" CHECK ("knowledge"."spec_sw_change"."target_kind" in ('module','event','field','relation')),
	CONSTRAINT "spec_sw_change_change_kind_check" CHECK ("knowledge"."spec_sw_change"."change_kind" in ('added','removed','changed','behavior')),
	CONSTRAINT "spec_sw_change_target_key_check" CHECK (char_length("knowledge"."spec_sw_change"."target_key") between 1 and 1200),
	CONSTRAINT "spec_sw_change_change_json_check" CHECK (jsonb_typeof("knowledge"."spec_sw_change"."change_json") = 'object' and octet_length("knowledge"."spec_sw_change"."change_json"::text) <= 16384),
	CONSTRAINT "spec_sw_change_note_check" CHECK ("knowledge"."spec_sw_change"."note" is null or char_length("knowledge"."spec_sw_change"."note") <= 1000),
	CONSTRAINT "spec_sw_change_evidence_ref_check" CHECK ("knowledge"."spec_sw_change"."evidence_ref" is null or char_length("knowledge"."spec_sw_change"."evidence_ref") <= 500),
	CONSTRAINT "spec_sw_change_based_on_check" CHECK ("knowledge"."spec_sw_change"."based_on_rev_no" >= 1),
	CONSTRAINT "spec_sw_change_revalidation_check" CHECK (("knowledge"."spec_sw_change"."revalidation_rev_no" is null or "knowledge"."spec_sw_change"."revalidation_rev_no" >= 1) and (not "knowledge"."spec_sw_change"."needs_revalidation" or "knowledge"."spec_sw_change"."revalidation_rev_no" is not null)),
	CONSTRAINT "spec_sw_change_retired_check" CHECK ((("knowledge"."spec_sw_change"."retired_at" is null) = ("knowledge"."spec_sw_change"."retired_by" is null)) and ("knowledge"."spec_sw_change"."retired_by_change_id" is null or "knowledge"."spec_sw_change"."retired_at" is not null) and ("knowledge"."spec_sw_change"."retired_at" is null or not "knowledge"."spec_sw_change"."needs_revalidation")),
	CONSTRAINT "spec_sw_change_row_version_check" CHECK ("knowledge"."spec_sw_change"."row_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "knowledge"."spec_sw_change" ADD CONSTRAINT "spec_sw_change_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_sw_change" ADD CONSTRAINT "spec_sw_change_retired_by_actors_id_fk" FOREIGN KEY ("retired_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."software_version" ADD CONSTRAINT "software_version_workspace_model_id_uq" UNIQUE("workspace_id","model_id","id");
--> statement-breakpoint
ALTER TABLE "knowledge"."spec_sw_change" ADD CONSTRAINT "spec_sw_change_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_sw_change" ADD CONSTRAINT "spec_sw_change_model_fk" FOREIGN KEY ("workspace_id","model_id") REFERENCES "knowledge"."equipment_model"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_sw_change" ADD CONSTRAINT "spec_sw_change_software_fk" FOREIGN KEY ("workspace_id","model_id","software_id") REFERENCES "knowledge"."software_version"("workspace_id","model_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_sw_change" ADD CONSTRAINT "spec_sw_change_ends_before_fk" FOREIGN KEY ("workspace_id","model_id","ends_before_software_id") REFERENCES "knowledge"."software_version"("workspace_id","model_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."spec_sw_change" ADD CONSTRAINT "spec_sw_change_retired_by_change_fk" FOREIGN KEY ("workspace_id","model_id","retired_by_change_id") REFERENCES "knowledge"."spec_sw_change"("workspace_id","model_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spec_sw_change_open_key_idx" ON "knowledge"."spec_sw_change" USING btree ("workspace_id","model_id","target_key") WHERE "knowledge"."spec_sw_change"."retired_at" is null;--> statement-breakpoint
CREATE INDEX "spec_sw_change_model_created_idx" ON "knowledge"."spec_sw_change" USING btree ("workspace_id","model_id","created_at","id");--> statement-breakpoint
--> statement-breakpoint
-- #1196 c (design v0.6 §15.2): SW change rows are append-only for the runtime role. INSERT, and UPDATE of exactly the
-- flag / retire / version columns; no DELETE. The trigger below is the wall behind the column grant (the migrate role is
-- not limited by it): content and identity columns never change, row_version rises by exactly 1 on every update, a
-- retired row never changes again (no un-retire, no re-point) and carries no flag. Publish sets the flag set-based.
GRANT ALL ON knowledge.spec_sw_change TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON knowledge.spec_sw_change TO platform_app;
--> statement-breakpoint
GRANT UPDATE (needs_revalidation, revalidation_rev_no, retired_at, retired_by, retired_by_change_id, row_version) ON knowledge.spec_sw_change TO platform_app;
--> statement-breakpoint
CREATE FUNCTION knowledge.spec_sw_change_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.model_id IS DISTINCT FROM OLD.model_id
		OR NEW.software_id IS DISTINCT FROM OLD.software_id OR NEW.ends_before_software_id IS DISTINCT FROM OLD.ends_before_software_id
		OR NEW.target_kind IS DISTINCT FROM OLD.target_kind OR NEW.target_key IS DISTINCT FROM OLD.target_key
		OR NEW.change_kind IS DISTINCT FROM OLD.change_kind OR NEW.change_json IS DISTINCT FROM OLD.change_json
		OR NEW.note IS DISTINCT FROM OLD.note OR NEW.based_on_rev_no IS DISTINCT FROM OLD.based_on_rev_no
		OR NEW.evidence_ref IS DISTINCT FROM OLD.evidence_ref OR NEW.created_by IS DISTINCT FROM OLD.created_by
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'spec change % content and identity columns cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	IF NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
		RAISE EXCEPTION 'spec change % update must raise row_version by exactly 1', OLD.id USING ERRCODE = '23514';
	END IF;
	IF OLD.retired_at IS NOT NULL AND (NEW.retired_at IS DISTINCT FROM OLD.retired_at OR NEW.retired_by IS DISTINCT FROM OLD.retired_by
		OR NEW.retired_by_change_id IS DISTINCT FROM OLD.retired_by_change_id OR NEW.needs_revalidation IS DISTINCT FROM OLD.needs_revalidation
		OR NEW.revalidation_rev_no IS DISTINCT FROM OLD.revalidation_rev_no) THEN
		RAISE EXCEPTION 'spec change % is retired and cannot change', OLD.id USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER spec_sw_change_guard BEFORE UPDATE ON knowledge.spec_sw_change FOR EACH ROW EXECUTE FUNCTION knowledge.spec_sw_change_guard();
