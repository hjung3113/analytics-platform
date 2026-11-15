-- SER-5 (#2016), owner-approved forced re-login (2026-11-15).
-- Stop old backend processes before applying; new sessions store SHA-256 cookie digests.
-- No schema change or snapshot: this migration invalidates legacy raw credentials only.
-- Rollback: clear sessions again before starting the older backend; never restore live credentials.
DELETE FROM core.sessions;
