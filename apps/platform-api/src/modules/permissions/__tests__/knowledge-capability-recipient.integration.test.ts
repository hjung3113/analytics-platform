// #1193 / ADR-0107 decision 3 — the log knowledge capabilities are for Admin and Developer, never a User:
// an ordinary request and a direct grant to a User are refused, a direct grant to a Developer succeeds.
// Throwaway DB only (run through `pnpm --filter @ap/platform-api test:integration`).

import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../../../config.js";
import { type DbHandle, createDb } from "../../../db/client.js";
import { SESSION_COOKIE_NAME } from "../../../middleware/require-session.js";
import { buildServer } from "../../../server.js";
import { insertActorRow } from "../../../test-support/actor-fixtures.js";
import { loginAs } from "../../../test-support/auth.js";

const APP_URL = process.env.DATABASE_URL ?? "";
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? "";
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? "";
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `KCR${randomUUID().slice(0, 6).toUpperCase()}`;
const CAPABILITIES = [
  "knowledge.catalog.manage",
  "knowledge.catalog.import",
  "knowledge.item.publish",
  "knowledge.spec.publish",
  "improvement.manage",
  "lifecycle.project.manage",
  "lifecycle.round.manage",
  "explorer.investigate",
  "dataset.manage",
  "dataset.baseline.approve",
  "lifecycle.gate.decide",
] as const;
// The sensitive tier is 5/min per actor: split the grant calls over several admins.
const ADMINS = ["admin", "admin2", "admin3", "admin4", "admin5", "admin6"] as const;
const adminFor = (capability: (typeof CAPABILITIES)[number]) =>
  ADMINS[Math.floor(CAPABILITIES.indexOf(capability) / 2)] ?? "admin6";

describe.skipIf(!runIntegration)(
  "log knowledge capability recipients (ADR-0107)",
  () => {
    let app: FastifyInstance;
    let dbHandle: DbHandle;
    let migrate: DbHandle;
    const actorIds: string[] = [];
    const cookies: Record<string, string> = {};
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      process.env.NODE_ENV = "test";
      dbHandle = createDb(APP_URL);
      migrate = createDb(MIGRATE_URL);
      app = await buildServer({ config: loadConfig(), dbHandle });
      await app.ready();
      // `admin2`..`admin5` share (two capabilities each: one refused and one granted call) the grants: the sensitive rate-limit tier is per actor and one admin cannot make them all.
      for (const role of ["admin", "admin2", "admin3", "admin4", "admin5", "admin6", "developer", "user", "user2"] as const) {
        const externalId = `${TAG}-${role}`;
        const { id } = await insertActorRow(dbHandle, {
          workspaceId: WORKSPACE_ID,
          externalId,
          roleLevel: role === "developer" ? role : role === "user" || role === "user2" ? "user" : "admin",
        });
        actorIds.push(id);
        ids[role] = id;
        cookies[role] = await loginAs(app, externalId);
      }
    });

    afterAll(async () => {
      if (actorIds.length > 0) {
        for (const [table, column] of [
          ["core.idempotency_keys", "actor_id"],
          ["core.audit_log", "actor_id"],
          ["permission.permission_requests", "requester_actor_id"],
          ["permission.permission_grants", "actor_id"],
          ["core.sessions", "actor_id"],
          ["core.actors", "id"],
        ]) {
          await migrate.pool.query(
            `delete from ${table} where ${column} = any($1)`,
            [actorIds],
          );
        }
      }
      await app?.close();
      await dbHandle?.close();
      await migrate?.close();
    });

    const post = (
      url: string,
      role: string,
      payload: Record<string, unknown>,
    ) =>
      app.inject({
        method: "POST",
        url,
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${cookies[role]}`,
        },
        payload: JSON.stringify(payload),
      });

    it.each(CAPABILITIES)(
      "a User request for %s is refused",
      async (capability) => {
        // The mutation tier allows 10 requests/min per actor: the second half of the list is requested by `user2`.
        const requester = CAPABILITIES.indexOf(capability) < 6 ? "user" : "user2";
        const res = await post("/permission-requests", requester, {
          requested_capability: capability,
          reason: "needs it",
        });
        expect(res.statusCode).toBe(422);
        const open = await migrate.pool.query(
          "select 1 from permission.permission_requests where requester_actor_id = $1",
          [ids[requester]],
        );
        expect(open.rowCount).toBe(0);
      },
    );

    it.each(CAPABILITIES)(
      "a direct grant of %s to a User is refused",
      async (capability) => {
        const res = await post("/permissions/grants", adminFor(capability), {
          actor_id: ids.user,
          capability,
          reason: "test",
        });
        expect(res.statusCode).toBe(422);
        const grants = await migrate.pool.query(
          "select 1 from permission.permission_grants where actor_id = $1 and capability = $2",
          [ids.user, capability],
        );
        expect(grants.rowCount).toBe(0);
      },
    );

    it.each(CAPABILITIES)(
      "a direct grant of %s to a Developer succeeds",
      async (capability) => {
        const res = await post("/permissions/grants", adminFor(capability), {
          actor_id: ids.developer,
          capability,
          reason: "test",
        });
        expect(res.statusCode).toBe(201);
      },
    );

    // #1198 a (owner answer Q2): knowledge.draft.create is NOT for Admin and Developer only; a User may hold it.
    // The grants route allows 5 calls/min per actor and each admin already made 4 above (9 capabilities x 2 calls over 5 admins),
    // so the two calls below go to different admins (5 each).
    it.each(["user", "developer"] as const)(
      "a direct grant of knowledge.draft.create to a %s succeeds",
      async (role) => {
        const res = await post("/permissions/grants", role === "user" ? "admin3" : "admin4", {
          actor_id: ids[role],
          capability: "knowledge.draft.create",
          reason: "test",
        });
        expect(res.statusCode).toBe(201);
      },
    );
  },
);
