-- ADR-0176 (#2765): include Space while preserving the normalized key from 0127.
ALTER TABLE "permission"."permission_grants" DROP CONSTRAINT "permission_grants_scope_kind_check";--> statement-breakpoint
DROP INDEX "permission"."permission_grants_active_uq";--> statement-breakpoint
ALTER TABLE "permission"."permission_grants" ADD COLUMN "scope_space" text;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_active_uq" ON "permission"."permission_grants" USING btree (
  "workspace_id",
  "actor_id",
  "capability",
  "scope_kind",
  coalesce("managed_system_id", '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce("scope_site", ''),
  coalesce("scope_room", ''),
  coalesce("scope_space", ''),
  coalesce("object_type", ''),
  coalesce("object_id", '00000000-0000-0000-0000-000000000000'::uuid)
) WHERE "revoked_at" is null AND "superseded_at" is null;--> statement-breakpoint
ALTER TABLE "permission"."permission_grants" ADD CONSTRAINT "permission_grants_scope_kind_check" CHECK ((
      ("permission"."permission_grants"."scope_kind" = 'managed_system' AND "permission"."permission_grants"."scope_site" IS NULL AND "permission"."permission_grants"."scope_room" IS NULL AND "permission"."permission_grants"."scope_space" IS NULL AND "permission"."permission_grants"."capability" NOT IN ('scope.read', 'saved_view.approve'))
      OR ("permission"."permission_grants"."scope_kind" = 'site' AND "permission"."permission_grants"."scope_space" IS NULL AND "permission"."permission_grants"."capability" = 'scope.read' AND "permission"."permission_grants"."managed_system_id" IS NULL AND "permission"."permission_grants"."scope_room" IS NULL AND "permission"."permission_grants"."scope_site" IS NOT NULL AND btrim("permission"."permission_grants"."scope_site") <> '')
      OR ("permission"."permission_grants"."scope_kind" = 'site_room' AND "permission"."permission_grants"."scope_space" IS NULL AND "permission"."permission_grants"."capability" = 'scope.read' AND "permission"."permission_grants"."managed_system_id" IS NULL AND "permission"."permission_grants"."scope_site" IS NOT NULL AND btrim("permission"."permission_grants"."scope_site") <> '' AND "permission"."permission_grants"."scope_room" IS NOT NULL AND btrim("permission"."permission_grants"."scope_room") <> '')
      OR ("permission"."permission_grants"."scope_kind" = 'space' AND "permission"."permission_grants"."capability" = 'saved_view.approve' AND "permission"."permission_grants"."scope_space" IS NOT NULL AND btrim("permission"."permission_grants"."scope_space") <> ''
        AND "permission"."permission_grants"."managed_system_id" IS NULL AND "permission"."permission_grants"."scope_site" IS NULL AND "permission"."permission_grants"."scope_room" IS NULL AND "permission"."permission_grants"."object_type" IS NULL AND "permission"."permission_grants"."object_id" IS NULL)
    ));
