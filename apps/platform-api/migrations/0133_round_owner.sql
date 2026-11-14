ALTER TABLE "log_lifecycle"."validation_round" ADD COLUMN "owner_model_id" uuid;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."validation_round" ADD COLUMN "owner_software_id" uuid;
--> statement-breakpoint
-- Legacy spec pins contain a model revision and digest, not an SW identity. Project events do not
-- serialize round creation, so current project ownership/timestamps cannot prove the old SW.
-- Leave legacy owner_model_id NULL: admin-only history, never approval evidence.
CREATE FUNCTION log_lifecycle.round_owner_insert() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  SELECT p.model_id, p.software_id INTO NEW.owner_model_id, NEW.owner_software_id
  FROM log_lifecycle.development_project p
  WHERE p.workspace_id = NEW.workspace_id AND p.id = NEW.project_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'validation round project not found' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER validation_round_owner_insert BEFORE INSERT ON log_lifecycle.validation_round
FOR EACH ROW EXECUTE FUNCTION log_lifecycle.round_owner_insert();
--> statement-breakpoint
CREATE FUNCTION log_lifecycle.round_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.owner_model_id IS DISTINCT FROM OLD.owner_model_id
    OR NEW.owner_software_id IS DISTINCT FROM OLD.owner_software_id THEN
    RAISE EXCEPTION 'validation round owner is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER validation_round_owner_guard BEFORE UPDATE ON log_lifecycle.validation_round
FOR EACH ROW EXECUTE FUNCTION log_lifecycle.round_owner_guard();
