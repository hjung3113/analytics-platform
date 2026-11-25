import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { defined } from '../../../test-support/defined.js';
import { randomUUID } from '../../../test-support/ids.js';
import { recordStatements } from '../../../test-support/statement-recorder.js';
import { insertVocClusterRow } from '../../../test-support/voc-cluster-fixtures.js';
import { cleanupReadTestTables } from '../../../test-support/voc-fixtures.js';
import { countVocClusters } from '../repo.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = 'it-cluster-count';
const POSTGRES_MAX_BIND_PARAMETERS = 65_535;

// #2807: the badge count binds the Finding scope as one array, so a scope past
// PostgreSQL's bind limit still counts, and an empty scope issues no SQL.
describe.skipIf(!runIntegration)('countVocClusters scope binding (#2807)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let actorId: string;

  async function cleanup() {
    await migrateHandle.pool.query(
      `delete from voc_cluster.voc_clusters where workspace_id = $1 and primary_managed_system_id in (
         select id from core.managed_systems where workspace_id = $1 and slug like $2)`,
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, PREFIX);
  }

  beforeAll(async () => {
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    const actors = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 limit 1`,
      [WORKSPACE_ID],
    );
    actorId = defined(actors.rows[0]).id;
  });
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('counts clusters over the PostgreSQL bind limit and short-circuits an empty scope', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${PREFIX}-large-scope`, 'Large count scope');
    await insertVocClusterRow(dbHandle, {
      workspaceId: WORKSPACE_ID, primaryManagedSystemId: ms, createdBy: actorId,
    });
    const recorder = recordStatements(dbHandle);
    const count = (managedSystemIds: string[]) => recorder.capture(() => countVocClusters(recorder.handle.db, {
      workspaceId: WORKSPACE_ID, scope: { kind: 'scoped', managedSystemIds },
    }));
    const empty = await count([]);
    expect(empty.result).toBe(0);
    expect(empty.statements).toEqual([]);

    const ids = [ms, ...Array.from({ length: POSTGRES_MAX_BIND_PARAMETERS }, () => randomUUID())];
    const result = await count(ids);
    expect(result.result).toBe(1);
    expect(result.statements).toHaveLength(1);
    const statement = defined(result.statements[0]);
    expect(statement.text).toMatch(/ANY\(\$\d+::uuid\[\]\)/);
    expect(statement.params).toHaveLength(2);
    expect(statement.params[1]).toEqual(ids);
  });
});
