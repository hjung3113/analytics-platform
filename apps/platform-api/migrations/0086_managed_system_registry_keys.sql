-- Registry-owned Managed System keys (#1289 node i, ADR-0110 decision 5).
-- `external_key` values `platform` and `space:<space id>` are registry-owned sync keys: the backend startup sync
-- writes them (one 「플랫폼」 system, one system per space that declares feedbackTracking) and finds its rows by them.
-- Every other key stays free metadata (0005, FO ADR-0017). `core.space_links` records which space a registry-owned
-- system belongs to; it is navigation/default metadata only and no permission check reads it (FO ADR-0068 decision 1).
--
-- Preflight (non-destructive, nothing is rewritten, archived or deleted). Before the unique index is built, every
-- active row of a registry-owned key family is classified per workspace:
--   * the approved conversion: exactly ONE active row with external_key = 'platform' in the workspace. That key has
--     designated the 「플랫폼」 system since #1295 (platformManagedSystemId), so the row is converted in place: it keeps
--     its id, slug and associations, and the startup sync from now on finds it by the key (and sets its name to
--     「플랫폼」). One NOTICE per converted row names it.
--   * anything else is stopped: a second 'platform' row, or ANY active 'space:*' row. Those keys were free metadata
--     (0005, FO ADR-0017) before this migration and are not the registry's to take over silently. The migration fails
--     naming the workspace, key, slug and id of every such row; the operator clears the key on those rows
--     (PATCH /managed-systems/:id with external_key null or another value, or UPDATE core.managed_systems SET
--     external_key = NULL WHERE id = ...) and reruns the migration.
DO $$
DECLARE
  offending text;
  converted record;
BEGIN
  SELECT string_agg(format('workspace %s key "%s" slug "%s" id %s', workspace_id, external_key, slug, id), '; ' ORDER BY workspace_id, external_key, slug)
    INTO offending
  FROM core.managed_systems ms
  WHERE archived_at IS NULL
    AND (
      external_key LIKE 'space:%'
      OR (
        external_key = 'platform'
        AND (SELECT count(*) FROM core.managed_systems o
             WHERE o.workspace_id = ms.workspace_id AND o.archived_at IS NULL AND o.external_key = 'platform') > 1
      )
    );
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'migration 0086: active Managed Systems already carry registry-owned external_key values that are not the single approved "platform" row: %. Clear external_key on these rows (PATCH /managed-systems/:id or UPDATE core.managed_systems SET external_key = NULL WHERE id = ...) and rerun the migration',
      offending;
  END IF;
  FOR converted IN
    SELECT workspace_id, slug, id FROM core.managed_systems
    WHERE archived_at IS NULL AND external_key = 'platform'
  LOOP
    RAISE NOTICE 'migration 0086: Managed System % (slug "%", workspace %) keeps external_key "platform" and becomes the registry-owned 플랫폼 system',
      converted.id, converted.slug, converted.workspace_id;
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE TABLE "core"."space_links" (
	"workspace_id" uuid NOT NULL,
	"space_id" text NOT NULL,
	"managed_system_id" uuid NOT NULL,
	"declared" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_links_pk" PRIMARY KEY("workspace_id","space_id")
);
--> statement-breakpoint
ALTER TABLE "core"."space_links" ADD CONSTRAINT "space_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."space_links" ADD CONSTRAINT "space_links_managed_system_id_managed_systems_id_fk" FOREIGN KEY ("managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "managed_systems_registry_key_active_uq" ON "core"."managed_systems" USING btree ("workspace_id","external_key") WHERE "core"."managed_systems"."archived_at" is null and ("core"."managed_systems"."external_key" = 'platform' or "core"."managed_systems"."external_key" like 'space:%');
--> statement-breakpoint
GRANT ALL ON core.space_links TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON core.space_links TO platform_app;
