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
] as const;

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
      for (const role of ["admin", "developer", "user"] as const) {
        const externalId = `${TAG}-${role}`;
        const { id } = await insertActorRow(dbHandle, {
          workspaceId: WORKSPACE_ID,
          externalId,
          roleLevel: role,
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
        const res = await post("/permission-requests", "user", {
          requested_capability: capability,
          reason: "needs it",
        });
        expect(res.statusCode).toBe(422);
        const open = await migrate.pool.query(
          "select 1 from permission.permission_requests where requester_actor_id = $1",
          [ids.user],
        );
        expect(open.rowCount).toBe(0);
      },
    );

    it.each(CAPABILITIES)(
      "a direct grant of %s to a User is refused",
      async (capability) => {
        const res = await post("/permissions/grants", "admin", {
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
        const res = await post("/permissions/grants", "admin", {
          actor_id: ids.developer,
          capability,
          reason: "test",
        });
        expect(res.statusCode).toBe(201);
      },
    );
  },
);
