// Default 50 / cap 100 on the Task, Task Request and Finding lists (#1266 b5b).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import {
  insertTaskRequestRow,
  insertTaskRow,
} from '../../../test-support/task-fixtures.js';
import { cleanupReadTestTables, insertVocDirectly } from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-list-limit';
const ROWS = 105;

interface Page {
  items: Array<{ id: string }>;
  page: { has_more: boolean; cursor?: string; total?: number };
}

describe.skipIf(!runIntegration)('list default limit 50, cap 100 (#1266 b5b)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let msId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const actors = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('seed actor not found');
  });

  beforeEach(async () => {
    await cleanup();
    msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'List limit MS');
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      adminActorId,
      'List limit source VOC',
    );
    for (let index = 0; index < ROWS; index += 1) {
      await insertTaskRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        title: `Limit task ${index}`,
        createdBy: adminActorId,
      });
      await insertTaskRequestRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        sourceType: 'voc',
        sourceId: voc.id,
        primaryManagedSystemId: msId,
        requesterActorId: adminActorId,
      });
      await insertFindingRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        title: `Limit finding ${index}`,
        sourceId: voc.id,
        status: 'active',
        createdBy: adminActorId,
      });
    }
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanup(): Promise<void> {
    if (!migrateHandle) return;
    const owned = `select id from core.managed_systems where workspace_id = $1 and slug like $2`;
    for (const table of ['task.tasks', 'task_request.task_requests', 'finding.findings']) {
      await migrateHandle.pool.query(
        `delete from ${table} where workspace_id = $1 and primary_managed_system_id in (${owned})`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
    }
    await migrateHandle.pool.query(
      `delete from voc.vocs where workspace_id = $1 and primary_managed_system_id in (${owned})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  function get(path: string, query: string) {
    return app.inject({
      method: 'GET',
      url: `${path}?managed_system_id=${msId}${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
  }

  describe.each(['/tasks', '/task-requests', '/findings'])('GET %s', (path) => {
    it('returns at most 50 rows and a next cursor when no limit is sent', async () => {
      const response = await get(path, '');
      expect(response.statusCode).toBe(200);
      const body = response.json<Page>();
      expect(body.items).toHaveLength(50);
      expect(body.page.has_more).toBe(true);
      expect(body.page.cursor).toEqual(expect.any(String));
      expect(body.page.total).toBe(ROWS);
    });

    it('continues from the cursor without gaps or repeats and ends with has_more=false', async () => {
      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const response = await get(path, cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`);
        expect(response.statusCode).toBe(200);
        const body = response.json<Page>();
        seen.push(...body.items.map((item) => item.id));
        expect(body.page.has_more).toBe(body.page.cursor !== undefined);
        cursor = body.page.cursor;
        pages += 1;
      } while (cursor !== undefined);
      expect(pages).toBe(3);
      expect(seen).toHaveLength(ROWS);
      expect(new Set(seen).size).toBe(ROWS);
    });

    it('accepts limit=100 and rejects limit=101 and limit=0 with a field error', async () => {
      const max = await get(path, '&limit=100');
      expect(max.statusCode).toBe(200);
      expect(max.json<Page>().items).toHaveLength(100);
      for (const limit of ['101', '0']) {
        const rejected = await get(path, `&limit=${limit}`);
        expect(rejected.statusCode).toBe(422);
        expect(rejected.json().detail.fields).toEqual([
          expect.objectContaining({ path: ['limit'] }),
        ]);
      }
    });

    it('returns the paged shape for an empty result too', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${path}?managed_system_id=00000000-0000-4000-8000-000000000000`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<Page>().items).toEqual([]);
      expect(response.json<Page>().page.has_more).toBe(false);
    });
  });
});
