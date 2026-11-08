CREATE TABLE "log_lifecycle"."gate_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"from_stage" text NOT NULL,
	"target_stage" text NOT NULL,
	"decision" text NOT NULL,
	"basis" jsonb NOT NULL,
	"reason" text NOT NULL,
	"exception" jsonb,
	"self_approved" boolean NOT NULL,
	"actor_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gate_decision_decision_check" CHECK ("log_lifecycle"."gate_decision"."decision" in ('approved','rejected','exception')),
	CONSTRAINT "gate_decision_stage_check" CHECK ("log_lifecycle"."gate_decision"."target_stage" in ('kickoff','alpha','beta','completed') and "log_lifecycle"."gate_decision"."from_stage" in ('registered','kickoff','alpha','beta')),
	CONSTRAINT "gate_decision_basis_check" CHECK (jsonb_typeof("log_lifecycle"."gate_decision"."basis") = 'object'),
	CONSTRAINT "gate_decision_reason_check" CHECK (char_length("log_lifecycle"."gate_decision"."reason") between 1 and 2000),
	CONSTRAINT "gate_decision_exception_check" CHECK (("log_lifecycle"."gate_decision"."decision" = 'exception') = ("log_lifecycle"."gate_decision"."exception" is not null) and ("log_lifecycle"."gate_decision"."exception" is null or jsonb_typeof("log_lifecycle"."gate_decision"."exception") = 'object'))
);
--> statement-breakpoint
ALTER TABLE "log_lifecycle"."gate_decision" ADD CONSTRAINT "gate_decision_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."gate_decision" ADD CONSTRAINT "gate_decision_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lifecycle"."gate_decision" ADD CONSTRAINT "gate_decision_round_fk" FOREIGN KEY ("workspace_id","round_id") REFERENCES "log_lifecycle"."validation_round"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gate_decision_round_idx" ON "log_lifecycle"."gate_decision" USING btree ("workspace_id","round_id","at");
--> statement-breakpoint
-- #1446 e: Gate decision. Append-only: the runtime role gets SELECT and INSERT only (no UPDATE, no DELETE); the trigger
-- below refuses UPDATE and DELETE for every role, the migrate role and the table owner included (as development_event).
-- Additive: no existing table, grant or trigger changes. The audit projection function is NOT redefined: a Gate decision
-- is audited as `lifecycle.gate.decided` on the existing subject type `validation_round`, and `lifecycle.gate.decide` is
-- sensitive, so it stays out of the permission-row allow-list of core.platform_audit_events (0108 body stays current).
GRANT ALL ON log_lifecycle.gate_decision TO platform_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON log_lifecycle.gate_decision TO platform_app;
--> statement-breakpoint
CREATE FUNCTION log_lifecycle.gate_decision_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	RAISE EXCEPTION 'gate_decision is append-only (% refused)', TG_OP USING ERRCODE = '23514';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER gate_decision_append_only BEFORE UPDATE OR DELETE ON log_lifecycle.gate_decision FOR EACH ROW EXECUTE FUNCTION log_lifecycle.gate_decision_append_only();
