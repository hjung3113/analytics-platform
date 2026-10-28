-- #1100 a: database and role identity transition (ADR-0097). Part 3 of the staged cutover that
-- ops/platform-api/scripts/db/cutover-0076-platform-identity.sh drives (history through 0075 as the
-- old migrate role, admin role + database renames, then this migration as platform_migrate).
--
-- The nine fops_* roles were renamed in place (ALTER ROLE ... RENAME), so every OID-backed owner,
-- membership and ACL already follows the new names. What a rename cannot repair is a role name
-- written as TEXT inside a persisted function body: the three delete guards below compared
-- current_user to 'fops_app'. After the rename that comparison is never true, so the guards would
-- silently stop protecting live rows. This migration rebuilds exactly those three functions.
--
-- Older migrations keep their fops_* SQL byte for byte; they run before the rename on every fresh
-- install, so history replays unchanged.
--
-- 1. Assert the final identity: all nine platform_* roles exist and no fops_* role remains.
DO $$
DECLARE
  expected_roles text[] := ARRAY[
    'platform_migrate', 'platform_app', 'platform_survey_aggregate_owner',
    'platform_survey_evidence_reader_owner', 'platform_survey_provenance_mutator_owner',
    'platform_entity_links_view_owner', 'platform_entity_links_survey_mutator_owner',
    'platform_survey_derived_finding_reader_owner', 'platform_core_audit_reader_owner'
  ];
  missing text;
  leftover text;
BEGIN
  SELECT pg_catalog.string_agg(e.name, ', ' ORDER BY e.name) INTO missing
    FROM pg_catalog.unnest(expected_roles) AS e(name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = e.name);
  SELECT pg_catalog.string_agg(r.rolname, ', ' ORDER BY r.rolname) INTO leftover
    FROM pg_catalog.pg_roles r WHERE r.rolname LIKE 'fops\_%' ESCAPE '\';
  IF missing IS NOT NULL OR leftover IS NOT NULL THEN
    RAISE EXCEPTION '0076 requires the platform identity cutover first (missing roles: %; remaining fops_ roles: %); run ops/platform-api/scripts/db/cutover-0076-platform-identity.sh',
      COALESCE(missing, 'none'), COALESCE(leftover, 'none');
  END IF;
  IF current_user <> 'platform_migrate' THEN
    RAISE EXCEPTION '0076 must run as platform_migrate (running as %)', current_user;
  END IF;
END
$$;
--> statement-breakpoint
-- 2. Replace the three persisted delete guards. CREATE OR REPLACE keeps each function's OID, owner,
--    ACL (EXECUTE revoked from PUBLIC) and trigger bindings. The guard no longer names a role: only
--    the table owner (the migrate role, via pg_class.relowner) may delete rows that are still live,
--    so any other role, including platform_app, fails closed whatever it is called.
CREATE OR REPLACE FUNCTION voc.guard_cluster_suggestion_bucket_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class c
        WHERE c.oid = TG_RELID
          AND c.relowner = (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = current_user)
     )
     AND OLD.window_start + interval '1 hour' > statement_timestamp() THEN
    RAISE EXCEPTION 'only ended suggestion admission buckets may be reclaimed' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION voc.guard_similarity_preview_request_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class c
        WHERE c.oid = TG_RELID
          AND c.relowner = (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = current_user)
     )
     AND OLD.expires_at > statement_timestamp() THEN
    RAISE EXCEPTION 'only expired preview tombstones may be reclaimed' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION voc.guard_similarity_preview_budget_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class c
        WHERE c.oid = TG_RELID
          AND c.relowner = (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = current_user)
     )
     AND OLD.window_start +
      (CASE OLD.period WHEN 'minute' THEN interval '1 minute' ELSE interval '1 day' END) > statement_timestamp() THEN
    RAISE EXCEPTION 'only ended preview budget windows may be reclaimed' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
-- 3. Attestation. The runtime role cannot read the migration ledger, but it can read pg_description
--    and pg_proc. These comments are committed in the same transaction as the function bodies, so
--    the backend readiness check (src/db/identity-readiness.ts) treats them as proof that this
--    migration committed. Keep the marker text identical to MARKER in that file.
COMMENT ON FUNCTION voc.guard_cluster_suggestion_bucket_delete() IS 'platform identity 0076: owner-based delete guard';
--> statement-breakpoint
COMMENT ON FUNCTION voc.guard_similarity_preview_request_delete() IS 'platform identity 0076: owner-based delete guard';
--> statement-breakpoint
COMMENT ON FUNCTION voc.guard_similarity_preview_budget_delete() IS 'platform identity 0076: owner-based delete guard';
--> statement-breakpoint
-- 4. Fail closed on any other persisted function that still names a fops_ role. The only expected
--    hit is the error MESSAGE text of pgboss.create_queue (migrations 0007/0008): it is not a role
--    comparison, and the pgboss schema is intentionally left untouched.
DO $$
DECLARE
  leftover text;
BEGIN
  SELECT pg_catalog.string_agg(n.nspname || '.' || p.proname, ', ' ORDER BY n.nspname, p.proname) INTO leftover
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
     AND p.prosrc LIKE '%fops\_%' ESCAPE '\'
     AND NOT (n.nspname = 'pgboss' AND p.proname = 'create_queue');
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION '0076 found persisted functions that still name a fops_ role: %', leftover;
  END IF;
END
$$;
