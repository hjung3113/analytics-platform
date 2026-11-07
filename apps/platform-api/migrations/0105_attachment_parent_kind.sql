ALTER TABLE "voc"."voc_attachments" ADD COLUMN "parent_kind" text;--> statement-breakpoint
ALTER TABLE "voc"."voc_attachments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
CREATE INDEX "voc_attachments_parent_idx" ON "voc"."voc_attachments" USING btree ("parent_kind","parent_id") WHERE "voc"."voc_attachments"."parent_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "voc"."voc_attachments" ADD CONSTRAINT "voc_attachments_parent_kind_check" CHECK ((("voc"."voc_attachments"."parent_kind" is null and "voc"."voc_attachments"."parent_id" is null)
        or ("voc"."voc_attachments"."parent_kind" = 'voc' and "voc"."voc_attachments"."parent_id" is null)
        or ("voc"."voc_attachments"."parent_kind" = 'validation_round' and "voc"."voc_attachments"."parent_id" is not null
            and "voc"."voc_attachments"."voc_id" is null and "voc"."voc_attachments"."comment_id" is null)) is true);--> statement-breakpoint
-- Backfill (#1451): every already-linked VOC / comment attachment is parent kind 'voc'. Unlinked rows stay NULL.
-- Additive and backward compatible: the read path also treats NULL parent_kind with voc_id / comment_id as 'voc',
-- so a row written by an older instance during rollout stays readable.
UPDATE "voc"."voc_attachments" SET "parent_kind" = 'voc' WHERE "parent_kind" IS NULL AND ("voc_id" IS NOT NULL OR "comment_id" IS NOT NULL);
