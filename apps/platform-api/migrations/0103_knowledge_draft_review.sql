CREATE TABLE "knowledge"."draft_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"reviewed_draft_rev_no" integer NOT NULL,
	"approved_digest" text,
	"decision" text NOT NULL,
	"self_approval" boolean DEFAULT false NOT NULL,
	"rationale" text,
	"posted_item_id" uuid,
	"posted_revision_no" integer,
	"reviewer_actor_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_review_decision_check" CHECK ("knowledge"."draft_review"."decision" in ('approved','rejected','changes_requested')),
	CONSTRAINT "draft_review_rev_no_check" CHECK ("knowledge"."draft_review"."reviewed_draft_rev_no" >= 1),
	CONSTRAINT "draft_review_digest_check" CHECK (("knowledge"."draft_review"."decision" = 'approved') = ("knowledge"."draft_review"."approved_digest" is not null) and ("knowledge"."draft_review"."approved_digest" is null or "knowledge"."draft_review"."approved_digest" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "draft_review_self_approval_check" CHECK ("knowledge"."draft_review"."self_approval" = false or "knowledge"."draft_review"."decision" = 'approved'),
	CONSTRAINT "draft_review_rationale_check" CHECK (coalesce(char_length("knowledge"."draft_review"."rationale"), 0) <= 2000 and ("knowledge"."draft_review"."decision" = 'approved' or char_length(btrim(coalesce("knowledge"."draft_review"."rationale", ''))) > 0)),
	CONSTRAINT "draft_review_posted_check" CHECK (("knowledge"."draft_review"."decision" = 'approved') = ("knowledge"."draft_review"."posted_item_id" is not null and "knowledge"."draft_review"."posted_revision_no" is not null) and ("knowledge"."draft_review"."posted_item_id" is null) = ("knowledge"."draft_review"."posted_revision_no" is null))
);
--> statement-breakpoint
ALTER TABLE "knowledge"."draft_review" ADD CONSTRAINT "draft_review_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft_review" ADD CONSTRAINT "draft_review_reviewer_actor_id_actors_id_fk" FOREIGN KEY ("reviewer_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft_review" ADD CONSTRAINT "draft_review_draft_fk" FOREIGN KEY ("workspace_id","draft_id") REFERENCES "knowledge"."draft"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft_review" ADD CONSTRAINT "draft_review_posted_item_fk" FOREIGN KEY ("workspace_id","posted_item_id") REFERENCES "knowledge"."knowledge_item"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."draft_review" ADD CONSTRAINT "draft_review_posted_revision_fk" FOREIGN KEY ("workspace_id","posted_item_id","posted_revision_no") REFERENCES "knowledge"."knowledge_item_revision"("workspace_id","item_id","revision_no") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_review_draft_idx" ON "knowledge"."draft_review" USING btree ("workspace_id","draft_id","reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_review_final_uq" ON "knowledge"."draft_review" USING btree ("workspace_id","draft_id") WHERE "knowledge"."draft_review"."decision" in ('approved','rejected');--> statement-breakpoint
-- #1198 b: review decisions on a draft. The runtime role (platform_app) gets SELECT, INSERT only: never UPDATE, never
-- DELETE. A trigger refuses both for every role (the migrate role included). Roles are not touched.
GRANT ALL ON knowledge.draft_review TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON knowledge.draft_review TO platform_app;
--> statement-breakpoint
CREATE FUNCTION knowledge.draft_review_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION 'draft_review is append-only (% refused)', TG_OP USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER draft_review_append_only BEFORE UPDATE OR DELETE ON knowledge.draft_review FOR EACH ROW EXECUTE FUNCTION knowledge.draft_review_append_only();
