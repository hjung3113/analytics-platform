CREATE TABLE "knowledge"."item_event_relation_record" (
	"workspace_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"source_key" text NOT NULL,
	"predicate" text NOT NULL,
	"target_key" text NOT NULL,
	"resolved" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_event_relation_record_pk" PRIMARY KEY("workspace_id","item_id","revision_no","ordinal"),
	CONSTRAINT "item_event_relation_record_ordinal_check" CHECK ("knowledge"."item_event_relation_record"."ordinal" between 1 and 20),
	CONSTRAINT "item_event_relation_record_kind_check" CHECK ("knowledge"."item_event_relation_record"."kind" in ('observed','expected')),
	CONSTRAINT "item_event_relation_record_predicate_check" CHECK ("knowledge"."item_event_relation_record"."predicate" = 'before'),
	CONSTRAINT "item_event_relation_record_key_check" CHECK (char_length("knowledge"."item_event_relation_record"."source_key") between 1 and 1200 and char_length("knowledge"."item_event_relation_record"."target_key") between 1 and 1200),
	CONSTRAINT "item_event_relation_record_self_check" CHECK ("knowledge"."item_event_relation_record"."source_key" <> "knowledge"."item_event_relation_record"."target_key")
);
--> statement-breakpoint
ALTER TABLE "knowledge"."item_event_relation_record" ADD CONSTRAINT "item_event_relation_record_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."item_event_relation_record" ADD CONSTRAINT "item_event_relation_record_revision_fk" FOREIGN KEY ("workspace_id","item_id","revision_no") REFERENCES "knowledge"."knowledge_item_revision"("workspace_id","item_id","revision_no") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Keys may be 1200 characters of non-compressible Unicode, so the indexes hold md5() of the keys (bounded entries); lookups use md5(source_key) = md5($n).
CREATE UNIQUE INDEX "item_event_relation_record_pair_uq" ON "knowledge"."item_event_relation_record" USING btree ("workspace_id","item_id","revision_no","kind",md5("source_key"),"predicate",md5("target_key"));--> statement-breakpoint
CREATE INDEX "item_event_relation_record_direction_idx" ON "knowledge"."item_event_relation_record" USING btree ("workspace_id",md5("source_key"),"predicate",md5("target_key"),"kind");--> statement-breakpoint
-- #1505 S-b: Event relation records of an immutable item revision are INSERT-only for the runtime role (no UPDATE, no DELETE grant),
-- like item_revision_subject. Roles are not touched beyond the grants this new table needs.
GRANT ALL ON knowledge.item_event_relation_record TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON knowledge.item_event_relation_record TO platform_app;
