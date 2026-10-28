-- Postgres bootstrap for local dev / CI (fresh installs only).
--
-- IDENTITY NOTE (#1100 a, ADR-0097). The final identity is database `platform` and nine
-- platform_* roles. Migrations 0000..0075 are immutable history and still name the fops_* roles,
-- so a fresh install first creates the nine fops_* roles below ONLY as replay bootstrap, with the
-- FINAL passwords (platform_migrate / platform_app). They are not runtime aliases. Right after
-- this script, run ops/platform-api/scripts/db/cutover-0076-platform-identity.sh: it replays
-- history through 0075 as fops_migrate, renames the nine roles in place, then runs db:migrate as
-- platform_migrate (0076 onward). The database is created directly as `platform` because no
-- historical migration names it.
--
-- Roles (each keeps its fops_ name here and becomes platform_<same suffix> at cutover):
--   * fops_migrate — owns the schema, runs migrations, has ALL privileges.
--   * fops_app     — runtime app role. Migrations retain INSERT only on core.audit_log, plus
--                    INSERT+SELECT+UPDATE+DELETE on every other Slice 1 table.
--   * fops_survey_aggregate_owner — owns only SECURITY DEFINER aggregate
--                    functions and their minimum raw-column reads.
--   * fops_survey_evidence_reader_owner — owns only SECURITY DEFINER
--                    response-evidence readers and their minimum column reads.
--   * fops_survey_provenance_mutator_owner — owns only the narrow protected
--                    Finding/highlight binding writers and consistency triggers.
--   * fops_entity_links_view_owner — owns the ordinary filtered link view.
--   * fops_entity_links_survey_mutator_owner — owns the narrow Survey link writer.
--   * fops_survey_derived_finding_reader_owner — owns only the safe Results Finding reader.
--   * fops_core_audit_reader_owner — owns allowlisted scoped audit projections.
--
-- This file runs once when the Postgres container initialises an empty data directory. Migration
-- SQL (apps/platform-api/migrations/*.sql) does the per-table GRANT/REVOKE work; this file only
-- creates the roles, the database, and ensures the migrate role owns it. The default passwords
-- are local dev/CI values; production sets its own before first use.
-- Existing databases must provision the matching role and one-way membership before applying
-- migrations 0038, 0039, 0046, 0059, or 0064 — installations that predate this file are covered by
-- the cutover script's preflight instead.
--
-- The superuser bootstrap user comes from POSTGRES_USER/POSTGRES_PASSWORD on the container; the
-- Drizzle CLI and the app both connect as the two login roles, never as the superuser.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_migrate') THEN
    CREATE ROLE fops_migrate WITH LOGIN NOINHERIT PASSWORD 'platform_migrate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_app') THEN
    CREATE ROLE fops_app WITH LOGIN NOINHERIT PASSWORD 'platform_app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_survey_aggregate_owner') THEN
    CREATE ROLE fops_survey_aggregate_owner WITH NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_survey_evidence_reader_owner') THEN
    CREATE ROLE fops_survey_evidence_reader_owner WITH NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_survey_provenance_mutator_owner') THEN
    CREATE ROLE fops_survey_provenance_mutator_owner WITH NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_entity_links_view_owner') THEN
    CREATE ROLE fops_entity_links_view_owner WITH NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_entity_links_survey_mutator_owner') THEN
    CREATE ROLE fops_entity_links_survey_mutator_owner WITH NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_survey_derived_finding_reader_owner') THEN
    CREATE ROLE fops_survey_derived_finding_reader_owner WITH NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_core_audit_reader_owner') THEN
    CREATE ROLE fops_core_audit_reader_owner WITH NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- Migrations create the functions as fops_migrate, then transfer ownership to
-- this NOLOGIN role and SET ROLE to set their ACLs. Membership is intentionally
-- one-way: neither definer owner inherits fops_migrate's broad privileges.
GRANT fops_survey_aggregate_owner TO fops_migrate;
GRANT fops_survey_evidence_reader_owner TO fops_migrate;
GRANT fops_survey_provenance_mutator_owner TO fops_migrate;
GRANT fops_entity_links_view_owner TO fops_migrate;
GRANT fops_entity_links_survey_mutator_owner TO fops_migrate;
GRANT fops_core_audit_reader_owner TO fops_migrate;
GRANT fops_survey_derived_finding_reader_owner TO fops_migrate;


-- CREATE DATABASE cannot run inside a DO block; the dollar-quoted shell entry
-- script handles re-entrancy by checking existence before running this file.
CREATE DATABASE platform OWNER fops_migrate;

\connect platform

-- Make sure the migrate role is able to create the schemas the migrations
-- reference. App role gets connect-only at the database level; per-table
-- GRANTs are added by migration SQL.
GRANT CONNECT ON DATABASE platform TO fops_app;
GRANT CONNECT ON DATABASE platform TO fops_migrate;

-- ADR-0034 D1: VOC similarity stores vectors in Postgres. pgvector is not a
-- trusted extension, so CREATE EXTENSION requires superuser — fops_migrate
-- cannot install it, and granting it superuser would collapse the role
-- separation ADR-0008/ADR-0019 depend on. Bootstrap therefore owns the
-- extension and migration 0042 only asserts it is present.
CREATE EXTENSION IF NOT EXISTS vector;
