-- Registry-owned Managed System keys (#1289 node i, ADR-0110 decision 5).
-- `external_key` values `platform` and `space:<space id>` are registry-owned sync keys: the backend startup sync
-- writes them (one 「플랫폼」 system, one system per space that declares feedbackTracking) and finds its rows by them.
-- Every other key stays free metadata (0005, FO ADR-0017). `core.space_links` records which space a registry-owned
-- system belongs to; it is navigation/default metadata only and no permission check reads it (ADR-0068 decision 1).
--
-- Preflight (non-destructive): the unique index cannot be built while two active rows of one workspace carry the same
-- registry-owned key. The migration then stops with the workspace, key and slugs so an operator can clear the extra
-- key by hand (PATCH external_key); it never rewrites or archives data. A single existing row is kept as is: the key
-- was the designation of the 「플랫폼」 system since #1288, and the sync adopts exactly the row that carries the key.
DO $$
DECLARE
  dup record;
BEGIN
  SELECT workspace_id, external_key, array_agg(slug ORDER BY slug) AS slugs INTO dup
  FROM core.managed_systems
  WHERE archived_at IS NULL AND (external_key = 'platform' OR external_key LIKE 'space:%')
  GROUP BY workspace_id, external_key
  HAVING count(*) > 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'migration 0086: workspace % has several active Managed Systems with the registry-owned external_key "%" (slugs: %); clear or change the key on all but one of them, then rerun the migration',
      dup.workspace_id, dup.external_key, dup.slugs;
  END IF;
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
