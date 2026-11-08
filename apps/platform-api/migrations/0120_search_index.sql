-- #1506 S-c: the derived search index. pg_trgm is installed by bootstrap (scripts/db/init.sql, node S-0), not here: the migration role is
-- not a superuser. Assert instead of creating, so a database without the extension fails with a directive message rather than a bare
-- "operator class gin_trgm_ops does not exist" at the index below (same approach as 0042 for pgvector).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    RAISE EXCEPTION 'pg_trgm is not installed in this database. Install it as a superuser (CREATE EXTENSION pg_trgm) before running migrations; see design log-knowledge-search section 3.2.';
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE "knowledge"."search_backfill_progress" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"generation" integer NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"last_item_id" uuid,
	"total_count" integer DEFAULT 0 NOT NULL,
	"done_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_backfill_progress_state_check" CHECK ("knowledge"."search_backfill_progress"."state" in ('running','done')),
	CONSTRAINT "search_backfill_progress_count_check" CHECK ("knowledge"."search_backfill_progress"."total_count" >= 0 and "knowledge"."search_backfill_progress"."done_count" >= 0),
	CONSTRAINT "search_backfill_progress_generation_check" CHECK ("knowledge"."search_backfill_progress"."generation" >= 1)
);
--> statement-breakpoint
CREATE TABLE "knowledge"."search_document" (
	"workspace_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"index_generation" integer NOT NULL,
	"revision_no" integer NOT NULL,
	"source_row_version" integer NOT NULL,
	"search_text" text NOT NULL,
	"tsv" "tsvector" NOT NULL,
	"term_text" text NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_document_pk" PRIMARY KEY("workspace_id","item_id","index_generation"),
	CONSTRAINT "search_document_generation_check" CHECK ("knowledge"."search_document"."index_generation" >= 1),
	CONSTRAINT "search_document_revision_no_check" CHECK ("knowledge"."search_document"."revision_no" >= 1)
);
--> statement-breakpoint
CREATE TABLE "knowledge"."search_index_pointer" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"active_generation" integer DEFAULT 1 NOT NULL,
	"building_generation" integer,
	"previous_generation" integer,
	"previous_retired_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_index_pointer_active_check" CHECK ("knowledge"."search_index_pointer"."active_generation" >= 1),
	CONSTRAINT "search_index_pointer_generations_check" CHECK (("knowledge"."search_index_pointer"."building_generation" is null or ("knowledge"."search_index_pointer"."building_generation" > "knowledge"."search_index_pointer"."active_generation")) and ("knowledge"."search_index_pointer"."previous_generation" is null or "knowledge"."search_index_pointer"."previous_generation" <> "knowledge"."search_index_pointer"."active_generation") and (("knowledge"."search_index_pointer"."previous_generation" is null) = ("knowledge"."search_index_pointer"."previous_retired_at" is null)))
);
--> statement-breakpoint
CREATE TABLE "knowledge"."search_outbox" (
	"outbox_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knowledge"."search_outbox_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_outbox_reason_check" CHECK ("knowledge"."search_outbox"."reason" in ('published','archived','access_changed','concept_changed','alias_changed','subject_changed','catalog_changed','reindex')),
	CONSTRAINT "search_outbox_state_check" CHECK ("knowledge"."search_outbox"."state" in ('pending','running','done','failed','dead')),
	CONSTRAINT "search_outbox_attempt_count_check" CHECK ("knowledge"."search_outbox"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge"."search_backfill_progress" ADD CONSTRAINT "search_backfill_progress_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."search_document" ADD CONSTRAINT "search_document_item_fk" FOREIGN KEY ("workspace_id","item_id") REFERENCES "knowledge"."knowledge_item"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."search_index_pointer" ADD CONSTRAINT "search_index_pointer_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."search_outbox" ADD CONSTRAINT "search_outbox_item_fk" FOREIGN KEY ("workspace_id","item_id") REFERENCES "knowledge"."knowledge_item"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_document_tsv_idx" ON "knowledge"."search_document" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "search_document_term_trgm_idx" ON "knowledge"."search_document" USING gin ("term_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "search_outbox_pending_uq" ON "knowledge"."search_outbox" USING btree ("workspace_id","item_id") WHERE "knowledge"."search_outbox"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "search_outbox_claim_idx" ON "knowledge"."search_outbox" USING btree ("state","available_at","outbox_id") WHERE "knowledge"."search_outbox"."state" in ('pending','failed');
--> statement-breakpoint
-- Hand-written (drizzle cannot express grants or pgboss rows). The index is derived, so the runtime role gets exactly what the
-- drain consumer and the outbox writers need: documents are upserted and deleted (unpublish, retired generation); the outbox is
-- inserted by the writers and only its processing columns are updated (rows of a finished run are pruned, hence DELETE); the pointer
-- and the backfill progress are one row each and only their mutable columns are updatable. No ACL data exists in any of them.
GRANT ALL ON knowledge.search_document, knowledge.search_outbox, knowledge.search_index_pointer, knowledge.search_backfill_progress TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON knowledge.search_document TO platform_app;
--> statement-breakpoint
GRANT UPDATE (revision_no, source_row_version, search_text, tsv, term_text, indexed_at) ON knowledge.search_document TO platform_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON knowledge.search_outbox TO platform_app;
--> statement-breakpoint
GRANT UPDATE (state, attempt_count, available_at, last_error, updated_at) ON knowledge.search_outbox TO platform_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON knowledge.search_index_pointer TO platform_app;
--> statement-breakpoint
GRANT UPDATE (active_generation, building_generation, previous_generation, previous_retired_at, updated_at) ON knowledge.search_index_pointer TO platform_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON knowledge.search_backfill_progress TO platform_app;
--> statement-breakpoint
GRANT UPDATE (generation, state, last_item_id, total_count, done_count, started_at, finished_at, updated_at) ON knowledge.search_backfill_progress TO platform_app;
--> statement-breakpoint
-- pg-boss queues are pre-created here: the runtime role has no DDL on pgboss.* (pattern of 0051).
INSERT INTO pgboss.queue (
  name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
  expire_seconds, retention_seconds, deletion_seconds, warning_queued,
  dead_letter, partition, table_name, heartbeat_seconds
) VALUES
  ('knowledge.search.drain', 'standard', 0, 30, true, NULL, 900, 86400, 86400, 0, NULL, false, 'job_common', NULL),
  ('knowledge.search.backfill', 'standard', 0, 30, true, NULL, 900, 86400, 86400, 0, NULL, false, 'job_common', NULL)
ON CONFLICT DO NOTHING;
